# 🤖 Solana AI Trading Bot

Self-learning crypto trading bot for **BONK, WIF, POPCAT** on Solana.
The AI learns from every trade and gets smarter over time.

---

## 📁 File Structure

```
solana-ai-bot/
│
├── start.bat                  ← Double-click to start everything (Windows)
│
├── ml-engine/
│   ├── ml_engine.py           ← AI brain (indicators, pattern learning, signals)
│   ├── api_server.py          ← REST API connecting AI to dashboard
│   └── requirements.txt       ← No external packages needed!
│
├── dashboard/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx       ← Main dashboard UI
│   │   │   ├── layout.tsx     ← Root layout
│   │   │   └── globals.css    ← Styles
│   │   ├── lib/
│   │   │   └── api.ts         ← API client
│   │   └── types/
│   │       └── index.ts       ← TypeScript types
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.json
│   └── .env.local             ← Environment variables
│
├── data/                      ← Auto-created (SQLite database lives here)
└── README.md
```

---

## 🔧 Requirements

- **Python 3.8+** — https://python.org/downloads
  - During install: check ✅ "Add Python to PATH"
- **Node.js 18+** — https://nodejs.org
  - Download the LTS version

---

## 🚀 First Time Setup (Windows)

1. Download/unzip this project folder
2. Double-click **`start.bat`**
3. It will automatically install everything and open two terminals
4. Open your browser at **http://localhost:3000**

That's it!

---

## ▶️ Running Manually (if start.bat doesn't work)

Open **two separate Command Prompt windows:**

**Window 1 — ML Engine:**
```
cd ml-engine
python api_server.py
```

**Window 2 — Dashboard:**
```
cd dashboard
npm install
npm run dev
```

Then open http://localhost:3000

---

## 🎮 How to Use the Dashboard

### Step 1 — Make sure you're on DEVNET (default)
The toggle in the top right shows **DEVNET 🔵** — keep it here while testing.
Devnet = fake money, real market conditions. Zero risk.

### Step 2 — Click START BOT
The bot begins scanning BONK, WIF, POPCAT every 30 seconds.
It fetches real prices from CoinGecko and makes simulated trades.

### Step 3 — Watch it learn
- **Token cards** show live RSI, momentum, volume spike, Bollinger Band position
- **Trade history** shows every buy/sell with confidence scores
- **AI pattern memory** grows as the bot learns what works

### Step 4 — Evaluate after 1-2 weeks
- Win rate consistently above 55%? → Ready to go live
- Win rate below 50%? → Keep testing, adjust strategy

### Step 5 — Switch to Mainnet (when ready)
Click **DEVNET 🔵** → A confirmation warning appears → Click "Yes, go live"
The toggle becomes **MAINNET 🟢** with a LIVE indicator.
Now the bot uses real prices and real trades.

---

## 🧠 How the AI Learns

Every 30 seconds the bot:
1. Fetches real prices for BONK, WIF, POPCAT
2. Calculates 4 indicators: RSI, MACD, Bollinger Bands, Momentum
3. Generates a "pattern fingerprint" (e.g. `BONK_oversold_bull_low_up_spike`)
4. Looks up this pattern in its memory database
5. Calculates a confidence score (0-100%)
6. If confidence >= 62% → BUY

After each trade closes (take-profit or stop-loss):
- Pattern confidence is updated based on outcome
- Next time the same pattern appears, the bot makes a better decision

**The more it trades, the smarter it gets.**

---

## 🛡️ Safety Rules

| Rule | Value | Meaning |
|------|-------|---------|
| Stop-loss | 8% | Auto-sells if price drops 8% from buy price |
| Take-profit | 18% | Auto-sells when up 18% to lock in gains |
| Min confidence | 62% | Won't trade if AI isn't confident enough |
| Min 24h volume | $500,000 | Skips tokens with low liquidity |
| Max trade size | 30% of wallet | Never risks more than 30% on one trade |

---

## 📊 Dashboard Explained

| Metric | What it means |
|--------|---------------|
| **Total PnL** | Total profit or loss since bot started |
| **Win rate** | % of closed trades that were profitable |
| **AI patterns** | How many market patterns the AI has memorized |
| **Balance** | Your wallet balance |
| **RSI** | <35 = oversold (potential buy), >70 = overbought (avoid) |
| **Momentum** | Price direction and strength |
| **Vol spike** | Current volume vs average (>1.8x = strong signal) |
| **BB pos** | Position in Bollinger Bands (<30% = near bottom) |
| **Confidence bar** | How confident the AI is (green=high, red=low) |

---

## 💰 Going Live with Real Money

When you're consistently profitable on devnet:

1. Install **Phantom Wallet** browser extension (phantom.app)
2. Create a new Solana wallet
3. Buy SOL on Binance/Coinbase and send to your Phantom wallet
4. Start with only your $3-8
5. Switch dashboard to MAINNET
6. Add more capital only after it's consistently profitable

⚠️ **NEVER invest more than you can afford to lose completely.**

---

## ❓ Troubleshooting

**"Cannot connect to ML engine" error on dashboard**
→ Check that the ML engine terminal is running (python api_server.py)
→ Make sure no other app is using port 8000

**"npm is not recognized" error**
→ Node.js isn't installed. Download from nodejs.org

**"python is not recognized" error**
→ Python isn't installed, or wasn't added to PATH
→ Reinstall Python and check the "Add to PATH" box

**Dashboard shows blank / no data**
→ Start the bot first, then wait 1-2 minutes for price data to accumulate

**Want to reset everything and start fresh**
→ Delete the `data/bot.db` file
→ Restart both terminals

---

## 🔮 You Can Add Later

- Telegram notifications when bot makes a trade
- More tokens (FARTCOIN, MOODENG, etc.)
- Twitter/X sentiment analysis
- Backtesting on historical data
- Auto-compound profits

---

**Start on devnet. Be patient. Let the AI learn. 🚀**
