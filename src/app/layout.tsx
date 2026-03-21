import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ink by Marrow',
  description: 'Local-first markdown notes, PDF editor, and unlimited canvas',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
