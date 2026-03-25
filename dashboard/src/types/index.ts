export interface BotStatus {
  bot_running: boolean
  network: 'devnet' | 'mainnet'
  total_trades: number
  profitable_trades: number
  win_rate: number
  total_pnl: number
  wallet_balance: number
  ai_version: string
}

export interface Trade {
  id: number
  token: string
  action: string
  price: number
  amount_usd: number
  confidence: number
  outcome: string
  profit_pct: number | null
  timestamp: string
  network: string
}

export interface Pattern {
  id: string
  token: string
  success: number
  fail: number
  avg_profit: number
  confidence: number
  last_seen: string
}

export interface TokenAnalysis {
  rsi: number
  macd_histogram: number
  bb_position: number
  momentum: number
  volume_spike: number
  signal: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  reasons: string[]
}

export interface PricePoint {
  price: number
  volume: number
  ts: string
}

export interface PriceData {
  price: number
  volume_24h: number
  timestamp: string
}
