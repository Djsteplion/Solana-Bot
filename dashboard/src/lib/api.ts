const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

export const api = {
  status:        ()        => req('/api/status'),
  trades:        ()        => req('/api/trades'),
  patterns:      ()        => req('/api/patterns'),
  prices:        ()        => req('/api/prices'),
  analysis:      ()        => req('/api/analysis'),
  chart:         (t:string)=> req(`/api/chart?token=${t}`),
  toggleBot:     ()        => req('/api/toggle-bot',   { method: 'POST' }),
  setNetwork:    (n:string)=> req('/api/set-network',  { method: 'POST', body: JSON.stringify({ network: n }) }),
  refreshPrices: ()        => req('/api/refresh-prices',{ method: 'POST' }),
}
