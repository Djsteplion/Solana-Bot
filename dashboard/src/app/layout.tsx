import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Solana AI Bot',
  description: 'Self-learning crypto trading bot — BONK · WIF · POPCAT',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
