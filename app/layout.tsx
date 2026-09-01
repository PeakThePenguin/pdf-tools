import type { Metadata, Viewport } from 'next'
import { Lato } from 'next/font/google'
import './globals.css'

const lato = Lato({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-lato',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'PDF Tools',
  description: 'PDF & image tools that run entirely in your browser — nothing is uploaded anywhere.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#6B2D8B',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${lato.variable}`}>
      <body className="h-full bg-gray-50">
        {children}
      </body>
    </html>
  )
}
