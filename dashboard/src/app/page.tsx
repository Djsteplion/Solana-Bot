'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  Activity, TrendingUp, Zap, RefreshCw,
  Power, AlertTriangle, Brain, BarChart2,
  Clock, Shield, ChevronRight,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { BotStatus, Trade, Pattern, TokenAnalysis, PricePoint, PriceData } from '@/types'

const TOKENS = ['BONK', 'WIF', 'POPCAT'] as const
const TOKEN_COLOR: Record<string, string> = {
  BONK: '#f59e0b',
  WIF:  '#7c3aed',
  POPCAT: '#10b981',
}

function fmt(n: number | null | undefined, d = 2) {
  if (n == null) return '—'
  return n.toFixed(d)
}

function pctColor(v: number) {
  return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-gray-400'
}

function signalBadge(s: string) {
  if (s === 'BUY')  return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
  if (s === 'SELL') return 'text-red-400 bg-red-400/10 border-red-400/30'
  return 'text-gray-400 bg-gray-400/10 border-gray-400/30'
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ConfBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono w-7 text-right" style={{ color }}>{pct}%</span>
    </div>
  )
}

function StatCard({ label, value, sub, icon: Icon, color = 'text-white' }: {
  label: string; value: string; sub?: string
  icon: React.ElementType; color?: string
}) {
  return (
    <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">{label}</span>
        <Icon size={13} className="text-gray-600" />
      </div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  )
}

function TokenCard({ token, analysis, price }: {
  token: string
  analysis?: TokenAnalysis
  price?: PriceData
}) {
  const color = TOKEN_COLOR[token]
  const fmtPrice = (p: number) =>
    p < 0.0001 ? p.toExponential(3) : p < 0.01 ? p.toFixed(6) : p.toFixed(4)

  return (
    <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold font-mono"
            style={{ background: `${color}18`, color, border: `1px solid ${color}28` }}>
            {token[0]}
          </div>
          <div>
            <div className="font-bold text-sm">{token}</div>
            <div className="text-xs text-gray-500 font-mono">
              {price ? `$${fmtPrice(price.price)}` : 'Loading...'}
            </div>
          </div>
        </div>
        {analysis && (
          <span className={`text-xs font-mono px-2 py-0.5 rounded border ${signalBadge(analysis.signal)}`}>
            {analysis.signal}
          </span>
        )}
      </div>

      {analysis ? (
        <div className="space-y-3">
          <ConfBar value={analysis.confidence} />
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            {[
              { label: 'RSI', val: fmt(analysis.rsi, 1),
                color: analysis.rsi < 35 ? 'text-emerald-400' : analysis.rsi > 70 ? 'text-red-400' : 'text-white' },
              { label: 'Momentum', val: `${analysis.momentum > 0 ? '+' : ''}${fmt(analysis.momentum, 1)}%`,
                color: pctColor(analysis.momentum) },
              { label: 'Vol spike', val: `${fmt(analysis.volume_spike, 1)}x`,
                color: analysis.volume_spike > 1.8 ? 'text-emerald-400' : 'text-white' },
              { label: 'BB pos', val: `${fmt(analysis.bb_position * 100, 0)}%`,
                color: analysis.bb_position < 0.3 ? 'text-emerald-400' : analysis.bb_position > 0.7 ? 'text-red-400' : 'text-white' },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-[#0a0a0f] rounded-lg p-2">
                <div className="text-gray-500 mb-0.5">{label}</div>
                <div className={`font-bold ${color}`}>{val}</div>
              </div>
            ))}
          </div>
          {analysis.reasons.slice(0, 3).map((r, i) => (
            <div key={i} className="flex items-center gap-1 text-xs text-gray-500">
              <ChevronRight size={10} />{r}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-gray-600 font-mono text-center py-6">
          Waiting for data...
        </div>
      )}
    </div>
  )
}

function TradeRow({ trade }: { trade: Trade }) {
  const isBuy  = trade.action === 'BUY'
  const isOpen = trade.outcome === 'open'
  const profit = trade.profit_pct ?? 0

  return (
    <div className="flex items-center gap-3 py-3 border-b border-[#1e1e2e] last:border-0 animate-fade-in">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isBuy ? 'bg-emerald-400' : 'bg-red-400'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-mono font-bold" style={{ color: TOKEN_COLOR[trade.token] }}>
            {trade.token}
          </span>
          <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${isBuy ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'}`}>
            {trade.action}
          </span>
          {isOpen && <span className="text-xs font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">OPEN</span>}
        </div>
        <div className="text-xs text-gray-600 font-mono mt-0.5">
          ${trade.price < 0.001 ? trade.price.toExponential(3) : fmt(trade.price, 5)}
          {' · '}{new Date(trade.timestamp).toLocaleTimeString()}
          {' · '}<span className={trade.network === 'mainnet' ? 'text-emerald-600' : 'text-purple-600'}>{trade.network}</span>
        </div>
      </div>
      <div className="text-right flex-shrink-0 space-y-0.5">
        <div className="text-xs font-mono text-gray-400">${fmt(trade.amount_usd, 2)}</div>
        {trade.profit_pct != null && (
          <div className={`text-xs font-mono font-bold ${profit > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {profit > 0 ? '+' : ''}{fmt(profit, 2)}%
          </div>
        )}
      </div>
      <div className="w-14 flex-shrink-0">
        <ConfBar value={trade.confidence ?? 0} />
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [status,    setStatus]    = useState<BotStatus | null>(null)
  const [trades,    setTrades]    = useState<Trade[]>([])
  const [patterns,  setPatterns]  = useState<Pattern[]>([])
  const [analysis,  setAnalysis]  = useState<Record<string, TokenAnalysis>>({})
  const [prices,    setPrices]    = useState<Record<string, PriceData>>({})
  const [chartData, setChartData] = useState<PricePoint[]>([])
  const [selToken,  setSelToken]  = useState('BONK')
  const [loading,   setLoading]   = useState(true)
  const [toggling,  setToggling]  = useState(false)
  const [lastUpdate,setLastUpdate]= useState<Date | null>(null)
  const [netConfirm,setNetConfirm]= useState(false)
  const [apiError,  setApiError]  = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [s, t, p, an, pr, ch] = await Promise.all([
        api.status()   as Promise<BotStatus>,
        api.trades()   as Promise<Trade[]>,
        api.patterns() as Promise<Pattern[]>,
        api.analysis() as Promise<Record<string, TokenAnalysis>>,
        api.prices()   as Promise<Record<string, PriceData>>,
        api.chart(selToken) as Promise<PricePoint[]>,
      ])
      setStatus(s); setTrades(t); setPatterns(p)
      setAnalysis(an); setPrices(pr); setChartData(ch)
      setLastUpdate(new Date()); setApiError(false)
    } catch {
      setApiError(true)
    } finally {
      setLoading(false)
    }
  }, [selToken])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 10_000)
    return () => clearInterval(id)
  }, [refresh])

  const toggleBot = async () => {
    setToggling(true)
    try { await api.toggleBot(); await refresh() }
    finally { setToggling(false) }
  }

  const switchNetwork = async (net: string) => {
    if (net === 'mainnet' && !netConfirm) { setNetConfirm(true); return }
    setNetConfirm(false)
    await api.setNetwork(net); await refresh()
  }

  const totalP = patterns.length
  const avgConf = totalP > 0 ? patterns.reduce((a, p) => a + p.confidence, 0) / totalP : 0

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <div className="text-gray-500 font-mono text-sm">Connecting to AI engine...</div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0a0a0f] scanline">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-500/15 border border-purple-500/20 rounded-xl flex items-center justify-center">
              <Brain size={16} className="text-purple-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight">Solana AI Bot</h1>
                <span className="text-xs font-mono text-gray-600 bg-[#1e1e2e] px-2 py-0.5 rounded">
                  v{status?.ai_version ?? '1.0'}
                </span>
              </div>
              <p className="text-xs text-gray-600 font-mono">BONK · WIF · POPCAT · Self-learning</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {lastUpdate && (
              <div className="flex items-center gap-1 text-xs text-gray-600 font-mono">
                <Clock size={10} />{lastUpdate.toLocaleTimeString()}
              </div>
            )}
            <button onClick={refresh} className="text-gray-600 hover:text-white transition-colors" title="Refresh">
              <RefreshCw size={13} />
            </button>

            {/* Network toggle */}
            <button
              onClick={() => switchNetwork(status?.network === 'mainnet' ? 'devnet' : 'mainnet')}
              disabled={toggling}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all
                ${status?.network === 'mainnet'
                  ? 'border-emerald-500/40 bg-emerald-500/8 text-emerald-400 glow-green'
                  : 'border-purple-500/40 bg-purple-500/8 text-purple-400'
                } ${toggling ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80 cursor-pointer'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status?.network === 'mainnet' ? 'bg-emerald-400 animate-pulse' : 'bg-purple-400'}`} />
              {status?.network === 'mainnet' ? 'MAINNET 🟢' : 'DEVNET 🔵'}
              {status?.network === 'mainnet' && (
                <span className="text-amber-400 flex items-center gap-0.5">
                  <AlertTriangle size={9} /> LIVE
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mainnet confirm */}
        {netConfirm && (
          <div className="bg-amber-500/8 border border-amber-500/25 rounded-xl p-4 flex items-center justify-between gap-4 animate-slide-up">
            <div className="flex items-center gap-3">
              <AlertTriangle size={15} className="text-amber-400 flex-shrink-0" />
              <div>
                <div className="text-sm font-bold text-amber-400">Switch to Mainnet?</div>
                <div className="text-xs text-gray-400 mt-0.5">Real money will be used. Only do this after successful devnet testing.</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setNetConfirm(false)}
                className="px-3 py-1.5 text-xs font-mono bg-[#1e1e2e] rounded-lg hover:bg-[#2a2a3e] transition-colors cursor-pointer">
                Cancel
              </button>
              <button onClick={() => switchNetwork('mainnet')}
                className="px-3 py-1.5 text-xs font-mono bg-amber-500/15 text-amber-400 border border-amber-500/25 rounded-lg hover:bg-amber-500/25 transition-colors cursor-pointer">
                Yes, go live
              </button>
            </div>
          </div>
        )}

        {/* API error */}
        {apiError && (
          <div className="bg-red-500/8 border border-red-500/25 rounded-xl p-4 animate-slide-up">
            <div className="text-sm text-red-400 font-bold mb-1">Cannot connect to ML engine</div>
            <div className="text-xs text-gray-500 font-mono">
              Open a terminal and run: <code className="bg-[#0a0a0f] px-2 py-0.5 rounded ml-1">cd ml-engine &amp;&amp; python api_server.py</code>
            </div>
          </div>
        )}

        {/* Bot control */}
        {status && (
          <div className={`border rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all
            ${status.bot_running ? 'border-emerald-500/25 bg-emerald-500/4 glow-green' : 'border-[#1e1e2e] bg-[#111118]'}`}>
            <div className="flex items-center gap-4">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${status.bot_running ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
              <div>
                <div className="font-bold">{status.bot_running ? 'Bot is running' : 'Bot is stopped'}</div>
                <div className="text-xs text-gray-500 font-mono mt-0.5">
                  {status.bot_running
                    ? `Scanning BONK, WIF, POPCAT every 30s on ${status.network}`
                    : 'Press START to begin autonomous AI trading'}
                </div>
              </div>
            </div>
            <button
              onClick={toggleBot} disabled={toggling}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-mono text-sm font-bold transition-all cursor-pointer
                ${status.bot_running
                  ? 'bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25'
                  : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25'
                } ${toggling ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Power size={13} />
              {status.bot_running ? 'STOP BOT' : 'START BOT'}
            </button>
          </div>
        )}

        {/* Stats */}
        {status && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total PnL"
              value={`${status.total_pnl >= 0 ? '+' : ''}$${fmt(status.total_pnl, 4)}`}
              sub="since launch" icon={TrendingUp}
              color={status.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            <StatCard label="Win rate"
              value={`${status.win_rate}%`}
              sub={`${status.profitable_trades}/${status.total_trades} trades`}
              icon={Activity}
              color={status.win_rate >= 50 ? 'text-emerald-400' : 'text-amber-400'} />
            <StatCard label="AI patterns"
              value={totalP.toString()}
              sub={`avg ${Math.round(avgConf * 100)}% confidence`}
              icon={Brain} color="text-purple-400" />
            <StatCard label="Balance"
              value={`$${fmt(status.wallet_balance, 2)}`}
              sub={status.network} icon={Shield} color="text-white" />
          </div>
        )}

        {/* Token analysis */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={12} className="text-gray-500" />
            <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">Live analysis</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TOKENS.map(t => (
              <TokenCard key={t} token={t} analysis={analysis[t]} price={prices[t]} />
            ))}
          </div>
        </div>

        {/* Price chart */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 size={12} className="text-gray-500" />
              <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">Price chart</span>
            </div>
            <div className="flex gap-1.5">
              {TOKENS.map(t => (
                <button key={t}
                  onClick={async () => {
                    setSelToken(t)
                    const ch = await api.chart(t) as PricePoint[]
                    setChartData(ch)
                  }}
                  className={`text-xs font-mono px-2.5 py-1 rounded-lg border transition-all cursor-pointer
                    ${selToken === t ? 'border-current' : 'border-[#1e1e2e] text-gray-600 hover:text-gray-400'}`}
                  style={selToken === t ? { color: TOKEN_COLOR[t], borderColor: `${TOKEN_COLOR[t]}40`, background: `${TOKEN_COLOR[t]}10` } : {}}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="ts" tick={{ fontSize: 10, fill: '#6b7280', fontFamily: 'monospace' }}
                  tickFormatter={v => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280', fontFamily: 'monospace' }}
                  tickFormatter={v => v < 0.001 ? v.toExponential(1) : v.toFixed(5)} width={72} />
                <Tooltip
                  contentStyle={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace' }}
                  labelFormatter={v => new Date(v).toLocaleTimeString()}
                  formatter={(v: number) => [v < 0.001 ? v.toExponential(5) : v.toFixed(6), 'Price']} />
                <Line type="monotone" dataKey="price" stroke={TOKEN_COLOR[selToken]}
                  strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: TOKEN_COLOR[selToken] }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-600 font-mono text-sm text-center">
              No chart data yet.<br />
              <span className="text-xs text-gray-700">Start the bot — prices accumulate every 30s.</span>
            </div>
          )}
        </div>

        {/* Trades + Patterns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={12} className="text-gray-500" />
              <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">Recent trades</span>
            </div>
            {trades.length > 0 ? (
              <div className="max-h-80 overflow-y-auto">
                {trades.slice(0, 25).map(t => <TradeRow key={t.id} trade={t} />)}
              </div>
            ) : (
              <div className="text-center py-10 text-gray-600 font-mono text-sm">
                No trades yet.<br />
                <span className="text-xs">Start the bot to begin.</span>
              </div>
            )}
          </div>

          <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Brain size={12} className="text-gray-500" />
              <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">AI pattern memory</span>
            </div>
            {patterns.length > 0 ? (
              <div className="max-h-80 overflow-y-auto space-y-2">
                {patterns.map(p => (
                  <div key={p.id} className="flex items-center gap-3 py-2.5 border-b border-[#1e1e2e] last:border-0">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: TOKEN_COLOR[p.token] ?? '#6b7280' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-gray-300 truncate">{p.id}</div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {p.success}W / {p.fail}L · avg {p.avg_profit > 0 ? '+' : ''}{fmt(p.avg_profit, 1)}%
                      </div>
                    </div>
                    <div className="w-16 flex-shrink-0"><ConfBar value={p.confidence} /></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-gray-600 font-mono text-sm">
                No patterns yet.<br />
                <span className="text-xs">AI builds memory as it trades.</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-700 font-mono pb-4 space-y-1">
          <div>Stop-loss 8% · Take-profit 18% · Min confidence 62% · Min volume $500k</div>
          <div className="text-gray-800">Not financial advice. Start on devnet. Only invest what you can afford to lose.</div>
        </div>

      </div>
    </div>
  )
}
