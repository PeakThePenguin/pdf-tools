import type { Metadata, Viewport } from 'next'
import { Lato, Charmonman } from 'next/font/google'
import ServiceWorkerRegister from './components/ServiceWorkerRegister'
import './globals.css'

const lato = Lato({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-lato',
  display: 'swap',
})

// Thai-script signature font for the "type your name" tab on the Sign PDF
// tool — Latin-only cursive fonts (Dancing Script etc.) have no Thai
// glyphs, and Charmonman supports both.
const charmonman = Charmonman({
  subsets: ['thai', 'latin'],
  weight: ['700'],
  variable: '--font-signature',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'PDF Tools',
  description: 'PDF & image tools that run entirely in your browser — nothing is uploaded anywhere.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PDF Tools',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
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
    <html lang="en" className={`h-full ${lato.variable} ${charmonman.variable}`}>
      <body className="h-full bg-gray-50">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  )
}
