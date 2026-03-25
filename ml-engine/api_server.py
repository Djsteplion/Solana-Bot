"""
API Server — connects ML engine to Next.js dashboard
Run: python api_server.py
"""

import sqlite3
import json
import os
import sys
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
from ml_engine import (
    init_db, get_state, set_state, fetch_prices, store_prices,
    analyze_token, calculate_signal, DB_PATH, TOKENS, run_bot
)


def get_db():
    return sqlite3.connect(DB_PATH)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass

    def send_json(self, data, status=200):
        body = json.dumps(data, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        p = urlparse(self.path)
        qs = parse_qs(p.query)
        path = p.path

        routes = {
            "/api/status":   self.route_status,
            "/api/trades":   self.route_trades,
            "/api/patterns": self.route_patterns,
            "/api/prices":   self.route_prices,
            "/api/analysis": self.route_analysis,
        }

        if path in routes:
            routes[path]()
        elif path == "/api/chart":
            self.route_chart(qs.get("token", ["BONK"])[0])
        else:
            self.send_json({"error": "Not found"}, 404)

    def do_POST(self):
        p = urlparse(self.path)
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length > 0 else {}

        if p.path == "/api/toggle-bot":
            running = get_state("bot_running") == "true"
            set_state("bot_running", "false" if running else "true")
            self.send_json({"bot_running": not running})

        elif p.path == "/api/set-network":
            net = body.get("network", "devnet")
            if net in ("devnet", "mainnet"):
                set_state("network", net)
                self.send_json({"network": net})
            else:
                self.send_json({"error": "Invalid network"}, 400)

        elif p.path == "/api/refresh-prices":
            prices = fetch_prices()
            store_prices(prices)
            self.send_json({"ok": True})

        else:
            self.send_json({"error": "Not found"}, 404)

    def route_status(self):
        conn = get_db()
        rows = conn.execute("SELECT key,value FROM bot_state").fetchall()
        conn.close()
        s = {r[0]: r[1] for r in rows}
        total = int(s.get("total_trades", 0))
        profitable = int(s.get("profitable_trades", 0))
        self.send_json({
            "bot_running": s.get("bot_running") == "true",
            "network": s.get("network", "devnet"),
            "total_trades": total,
            "profitable_trades": profitable,
            "win_rate": round(profitable / total * 100) if total > 0 else 0,
            "total_pnl": float(s.get("total_pnl", 0)),
            "wallet_balance": float(s.get("wallet_balance", 10)),
            "ai_version": s.get("ai_version", "1.0"),
        })

    def route_trades(self):
        conn = get_db()
        rows = conn.execute(
            "SELECT id,token,action,price,amount_usd,confidence,outcome,profit_pct,timestamp,network FROM trades ORDER BY id DESC LIMIT 50"
        ).fetchall()
        conn.close()
        self.send_json([{
            "id": r[0], "token": r[1], "action": r[2], "price": r[3],
            "amount_usd": r[4], "confidence": r[5], "outcome": r[6],
            "profit_pct": r[7], "timestamp": r[8], "network": r[9]
        } for r in rows])

    def route_patterns(self):
        conn = get_db()
        rows = conn.execute(
            "SELECT id,token,success_count,fail_count,avg_profit,confidence,last_seen FROM patterns ORDER BY confidence DESC LIMIT 30"
        ).fetchall()
        conn.close()
        self.send_json([{
            "id": r[0], "token": r[1], "success": r[2], "fail": r[3],
            "avg_profit": r[4], "confidence": r[5], "last_seen": r[6]
        } for r in rows])

    def route_prices(self):
        conn = get_db()
        result = {}
        for token in TOKENS:
            row = conn.execute(
                "SELECT price,volume_24h,timestamp FROM price_history WHERE token=? ORDER BY id DESC LIMIT 1",
                (token,)
            ).fetchone()
            if row:
                result[token] = {"price": row[0], "volume_24h": row[1], "timestamp": row[2]}
        conn.close()
        self.send_json(result)

    def route_analysis(self):
        result = {}
        for token in TOKENS:
            a = analyze_token(token)
            if a:
                sig = calculate_signal(a)
                result[token] = {
                    "rsi": a["rsi"],
                    "macd_histogram": a["macd"]["histogram"],
                    "bb_position": a["bollinger"]["position"],
                    "momentum": a["momentum"],
                    "volume_spike": a["volume_spike"],
                    "signal": sig["action"],
                    "confidence": sig["confidence"],
                    "reasons": sig["reasons"],
                }
        self.send_json(result)

    def route_chart(self, token):
        conn = get_db()
        rows = conn.execute(
            "SELECT price,volume_24h,timestamp FROM price_history WHERE token=? ORDER BY id DESC LIMIT 100",
            (token,)
        ).fetchall()
        conn.close()
        self.send_json([{"price": r[0], "volume": r[1], "ts": r[2]} for r in reversed(rows)])


def run_server(port=8000):
    init_db()
    bot_thread = threading.Thread(target=run_bot, daemon=True)
    bot_thread.start()
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"[API] Running on http://localhost:{port}")
    print("[BOT] ML engine thread started")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
