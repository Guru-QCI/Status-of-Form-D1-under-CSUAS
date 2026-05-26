import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Status of Form D1 under CSUAS',
  description: 'Monitor the live status of Form D1 applications under CSUAS',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
