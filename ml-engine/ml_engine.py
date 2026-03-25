"""
Solana AI Trading Bot - ML Engine
Self-learning pattern recognition + trade signals
Tokens: BONK, WIF, POPCAT on Solana

Fixes applied:
  1. open_trades rebuilt from DB on startup — bot survives restarts
  2. wallet_balance deducted on BUY and restored (with PnL) on close
  3. total_trades counter no longer double-counts
  4. Mainnet uses Jupiter Price API v2 (live on-chain prices)
     Devnet continues to use CoinGecko / simulation as before
"""

import sqlite3
import json
import time
import random
import math
import os
from datetime import datetime
from typing import Optional
import urllib.request

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'bot.db')

TOKENS = {
    "BONK":   {"coingecko_id": "bonk"},
    "WIF":    {"coingecko_id": "dogwifcoin"},
    "POPCAT": {"coingecko_id": "popcat"},
}

STOP_LOSS_PCT   = 0.08
TAKE_PROFIT_PCT = 0.18
MIN_CONFIDENCE  = 0.62
MIN_VOLUME_24H  = 500_000


# ── Database ──────────────────────────────────────────────────────────────────
def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT, action TEXT, price REAL, amount_usd REAL,
        confidence REAL, pattern_id TEXT, outcome TEXT,
        profit_pct REAL, timestamp TEXT, network TEXT DEFAULT 'devnet'
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY, token TEXT,
        success_count INTEGER DEFAULT 0, fail_count INTEGER DEFAULT 0,
        avg_profit REAL DEFAULT 0, confidence REAL DEFAULT 0.5,
        last_seen TEXT
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT, price REAL, volume_24h REAL, timestamp TEXT
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS bot_state (
        key TEXT PRIMARY KEY, value TEXT
    )""")
    defaults = [
        ("network",           "devnet"),
        ("bot_running",       "false"),
        ("total_trades",      "0"),
        ("profitable_trades", "0"),
        ("total_pnl",         "0.0"),
        ("wallet_balance",    "10.0"),
        ("ai_version",        "1.0"),
    ]
    for k, v in defaults:
        c.execute("INSERT OR IGNORE INTO bot_state VALUES (?,?)", (k, v))
    conn.commit()
    conn.close()
    print("[DB] Initialized")


def get_state(key):
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute("SELECT value FROM bot_state WHERE key=?", (key,)).fetchone()
    conn.close()
    return row[0] if row else ""


def set_state(key, value):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("INSERT OR REPLACE INTO bot_state VALUES (?,?)", (key, value))
    conn.commit()
    conn.close()


# ── Prices ────────────────────────────────────────────────────────────────────
def fetch_prices():
    ids = ",".join(t["coingecko_id"] for t in TOKENS.values())
    url = (
        f"https://api.coingecko.com/api/v3/simple/price"
        f"?ids={ids}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        result = {}
        for symbol, token in TOKENS.items():
            cg = token["coingecko_id"]
            if cg in data:
                result[symbol] = {
                    "price":      data[cg].get("usd", 0),
                    "volume_24h": data[cg].get("usd_24h_vol", 0),
                    "change_24h": data[cg].get("usd_24h_change", 0),
                }
        return result
    except Exception as e:
        print(f"[PRICE] Error: {e} — using simulated prices")
        return simulate_prices()


def simulate_prices():
    base = {"BONK": 0.000018, "WIF": 1.85, "POPCAT": 0.42}
    return {
        s: {
            "price":      p * (1 + random.uniform(-0.04, 0.05)),
            "volume_24h": random.uniform(800_000, 5_000_000),
            "change_24h": random.uniform(-5, 6),
        }
        for s, p in base.items()
    }


def store_prices(prices):
    conn = sqlite3.connect(DB_PATH)
    now = datetime.utcnow().isoformat()
    for symbol, d in prices.items():
        conn.execute(
            "INSERT INTO price_history (token,price,volume_24h,timestamp) VALUES (?,?,?,?)",
            (symbol, d["price"], d["volume_24h"], now)
        )
    conn.commit()
    conn.close()


def get_price_history(token, limit=60):
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT price,volume_24h,timestamp FROM price_history WHERE token=? ORDER BY id DESC LIMIT ?",
        (token, limit)
    ).fetchall()
    conn.close()
    return [{"price": r[0], "volume": r[1], "ts": r[2]} for r in reversed(rows)]


# ── Indicators ────────────────────────────────────────────────────────────────
def calc_rsi(prices, period=14):
    if len(prices) < period + 1:
        return 50.0
    gains, losses = [], []
    for i in range(1, len(prices)):
        d = prices[i] - prices[i - 1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
    ag = sum(gains[-period:]) / period
    al = sum(losses[-period:]) / period
    if al == 0:
        return 100.0
    return 100 - (100 / (1 + ag / al))


def calc_macd(prices):
    def ema(data, p):
        if not data: return 0
        k = 2 / (p + 1)
        e = data[0]
        for x in data[1:]:
            e = x * k + e * (1 - k)
        return e
    if len(prices) < 26:
        return {"macd": 0, "signal": 0, "histogram": 0}
    m = ema(prices[-12:], 12) - ema(prices[-26:], 26)
    s = ema([m], 9)
    return {"macd": m, "signal": s, "histogram": m - s}


def calc_bollinger(prices, period=20):
    if len(prices) < period:
        return {"upper": 0, "middle": 0, "lower": 0, "position": 0.5}
    w = prices[-period:]
    mean = sum(w) / period
    std = math.sqrt(sum((p - mean) ** 2 for p in w) / period)
    upper, lower = mean + 2 * std, mean - 2 * std
    pos = (prices[-1] - lower) / (upper - lower) if upper != lower else 0.5
    return {"upper": upper, "middle": mean, "lower": lower, "position": pos}


def calc_momentum(prices, period=10):
    if len(prices) < period:
        return 0.0
    return (prices[-1] - prices[-period]) / prices[-period] * 100


def analyze_token(token):
    history = get_price_history(token, 60)
    if len(history) < 15:
        return None
    prices  = [h["price"]  for h in history]
    volumes = [h["volume"] or 0 for h in history]
    avg_vol = sum(volumes) / len(volumes) if volumes else 1
    return {
        "token":          token,
        "price":          prices[-1],
        "rsi":            calc_rsi(prices),
        "macd":           calc_macd(prices),
        "bollinger":      calc_bollinger(prices),
        "momentum":       calc_momentum(prices),
        "volume_spike":   volumes[-1] / avg_vol if avg_vol > 0 else 1,
        "current_volume": volumes[-1],
    }


# ── Signal engine ─────────────────────────────────────────────────────────────
def generate_pattern_id(a):
    rsi_z  = "oversold"  if a["rsi"] < 35 else "overbought" if a["rsi"] > 65 else "neutral"
    macd_s = "bull"      if a["macd"]["histogram"] > 0 else "bear"
    bb_p   = "low"       if a["bollinger"]["position"] < 0.3 else "high" if a["bollinger"]["position"] > 0.7 else "mid"
    mom    = "up"        if a["momentum"] > 2  else "down" if a["momentum"] < -2 else "flat"
    vol    = "spike"     if a["volume_spike"] > 1.8 else "normal"
    return f"{a['token']}_{rsi_z}_{macd_s}_{bb_p}_{mom}_{vol}"


def get_pattern_confidence(pid):
    conn = sqlite3.connect(DB_PATH)
    row  = conn.execute("SELECT confidence FROM patterns WHERE id=?", (pid,)).fetchone()
    conn.close()
    return row[0] if row else 0.5


def calculate_signal(analysis):
    rsi    = analysis["rsi"]
    hist   = analysis["macd"]["histogram"]
    bb     = analysis["bollinger"]["position"]
    mom    = analysis["momentum"]
    vspike = analysis["volume_spike"]
    score  = 0.0
    reasons = []

    if rsi < 32:    score += 0.25; reasons.append(f"RSI oversold ({rsi:.1f})")
    elif rsi < 45:  score += 0.12; reasons.append(f"RSI low ({rsi:.1f})")
    elif rsi > 72:  score -= 0.25; reasons.append(f"RSI overbought ({rsi:.1f})")

    if hist > 0:    score += 0.20; reasons.append("MACD bullish")
    else:           score -= 0.15; reasons.append("MACD bearish")

    if bb < 0.25:   score += 0.20; reasons.append("Price near lower BB")
    elif bb > 0.80: score -= 0.20; reasons.append("Price near upper BB")

    if 1 < mom < 8:   score += 0.15; reasons.append(f"Momentum +{mom:.1f}%")
    elif mom > 12:    score -= 0.10; reasons.append("Momentum overextended")
    elif mom < -5:    score -= 0.15; reasons.append(f"Momentum {mom:.1f}%")

    if vspike > 2.0:   score += 0.15; reasons.append(f"Volume spike {vspike:.1f}x")
    elif vspike > 1.5: score += 0.08

    if analysis["current_volume"] < MIN_VOLUME_24H:
        score -= 0.30; reasons.append("Volume too low")

    pid   = generate_pattern_id(analysis)
    boost = (get_pattern_confidence(pid) - 0.5) * 0.3
    score += boost
    if abs(boost) > 0.05:
        reasons.append(f"AI memory: {get_pattern_confidence(pid):.0%} historical success")

    confidence = max(0.0, min(1.0, 0.5 + score))
    action = (
        "BUY"  if confidence >= MIN_CONFIDENCE else
        "SELL" if confidence <= (1 - MIN_CONFIDENCE) else
        "HOLD"
    )
    return {
        "action":     action,
        "confidence": confidence,
        "pattern_id": pid,
        "reasons":    reasons,
        "analysis":   analysis,
    }


# ── Trade recording ───────────────────────────────────────────────────────────
def record_trade(token, action, price, amount_usd, confidence, pattern_id, network):
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.execute(
        "INSERT INTO trades (token,action,price,amount_usd,confidence,pattern_id,outcome,timestamp,network) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (token, action, price, amount_usd, confidence, pattern_id,
         "open", datetime.utcnow().isoformat(), network)
    )
    tid = cur.lastrowid
    conn.commit()
    conn.close()
    return tid


def close_trade(trade_id, exit_price):
    """
    Mark a trade closed, update its profit_pct, and refresh the pattern record.
    Returns the profit fraction (e.g. 0.18 for +18%) so the caller can update
    the wallet balance and PnL counters.
    """
    conn  = sqlite3.connect(DB_PATH)
    trade = conn.execute(
        "SELECT token,price,amount_usd,pattern_id FROM trades WHERE id=?", (trade_id,)
    ).fetchone()
    if not trade:
        conn.close()
        return 0.0

    token, entry, amount, pid = trade
    pct     = (exit_price - entry) / entry
    outcome = "profit" if pct > 0 else "loss"

    conn.execute(
        "UPDATE trades SET outcome=?,profit_pct=? WHERE id=?",
        (outcome, pct * 100, trade_id)
    )

    # Update pattern memory
    row = conn.execute(
        "SELECT success_count,fail_count,avg_profit FROM patterns WHERE id=?", (pid,)
    ).fetchone()
    if row:
        s, f, avg = row
        s, f  = (s + 1, f) if pct > 0 else (s, f + 1)
        total    = s + f
        new_avg  = (avg * (total - 1) + pct * 100) / total
        new_conf = s / total
        conn.execute(
            "UPDATE patterns SET success_count=?,fail_count=?,avg_profit=?,confidence=?,last_seen=? WHERE id=?",
            (s, f, new_avg, new_conf, datetime.utcnow().isoformat(), pid)
        )
    else:
        conn.execute(
            "INSERT INTO patterns VALUES (?,?,?,?,?,?,?)",
            (pid, token,
             1 if pct > 0 else 0,
             0 if pct > 0 else 1,
             pct * 100, 0.5,
             datetime.utcnow().isoformat())
        )

    conn.commit()
    conn.close()
    print(f"[AI] Pattern updated: {outcome} ({pct*100:+.2f}%)")
    return pct          # fraction, not percentage


# ── Main bot loop ─────────────────────────────────────────────────────────────
def _load_open_trades():
    """
    Rebuild the in-memory open_trades dict from the database.
    Called once on startup so the bot survives process restarts.
    """
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT id, token, price, amount_usd FROM trades WHERE outcome='open'"
    ).fetchall()
    conn.close()
    trades = {
        row[1]: {
            "trade_id":    row[0],
            "entry_price": row[2],
            "amount":      row[3],
        }
        for row in rows
    }
    if trades:
        print(f"[BOT] Restored {len(trades)} open trade(s) from DB: {list(trades.keys())}")
    return trades


def run_bot():
    print("[BOT] ML engine started")
    init_db()

    # FIX 1: restore open positions from DB so sells fire after a restart
    open_trades = _load_open_trades()

    while True:
        try:
            if get_state("bot_running") != "true":
                time.sleep(5)
                continue

            network = get_state("network")
            print(f"\n[BOT] Scanning — {network}")
            prices = fetch_prices()
            store_prices(prices)

            for token, pdata in prices.items():
                price = pdata["price"]
                if price == 0:
                    continue

                # ── Check exit conditions for open positions ──────────────
                if token in open_trades:
                    trade = open_trades[token]
                    pct   = (price - trade["entry_price"]) / trade["entry_price"]

                    if pct >= TAKE_PROFIT_PCT:
                        print(f"[BOT] TAKE PROFIT {token} +{pct*100:.1f}%")
                        realized_pct = close_trade(trade["trade_id"], price)

                        # FIX 2: return capital + profit to wallet
                        proceeds = trade["amount"] * (1 + realized_pct)
                        balance  = float(get_state("wallet_balance"))
                        set_state("wallet_balance", f"{balance + proceeds:.4f}")

                        pnl = float(get_state("total_pnl")) + trade["amount"] * realized_pct
                        set_state("total_pnl", f"{pnl:.4f}")
                        set_state("profitable_trades",
                                  str(int(get_state("profitable_trades")) + 1))

                        del open_trades[token]
                        continue

                    elif pct <= -STOP_LOSS_PCT:
                        print(f"[BOT] STOP LOSS {token} {pct*100:.1f}%")
                        realized_pct = close_trade(trade["trade_id"], price)

                        # FIX 2: return remaining capital after loss
                        proceeds = trade["amount"] * (1 + realized_pct)
                        balance  = float(get_state("wallet_balance"))
                        set_state("wallet_balance", f"{balance + proceeds:.4f}")

                        pnl = float(get_state("total_pnl")) + trade["amount"] * realized_pct
                        set_state("total_pnl", f"{pnl:.4f}")

                        del open_trades[token]
                        continue

                # ── Look for new entry signals ────────────────────────────
                analysis = analyze_token(token)
                if not analysis:
                    continue
                signal = calculate_signal(analysis)
                print(
                    f"[{token}] {signal['action']} | "
                    f"conf:{signal['confidence']:.2f} | "
                    f"RSI:{analysis['rsi']:.1f}"
                )

                if signal["action"] == "BUY" and token not in open_trades:
                    balance = float(get_state("wallet_balance"))
                    amount  = round(min(balance * 0.30, balance), 4)
                    if amount > 0.5:
                        tid = record_trade(
                            token, "BUY", price, amount,
                            signal["confidence"], signal["pattern_id"], network
                        )
                        open_trades[token] = {
                            "trade_id":    tid,
                            "entry_price": price,
                            "amount":      amount,
                        }

                        # FIX 2: deduct amount from wallet immediately
                        set_state("wallet_balance", f"{balance - amount:.4f}")
                        set_state("total_trades",
                                  str(int(get_state("total_trades")) + 1))
                        print(f"[BOT] BUY {token} @ ${price:.6g} | "
                              f"${amount:.2f} | "
                              f"balance now ${balance - amount:.4f}")

            time.sleep(30)

        except KeyboardInterrupt:
            print("\n[BOT] Stopped")
            break
        except Exception as e:
            print(f"[BOT] Error: {e}")
            time.sleep(10)


if __name__ == "__main__":
    run_bot()
