// Copies the pdfjs-dist worker build into public/ so it can be served
// same-origin (required for the offline-capable PWA — no CDN dependency).
// Run automatically via the "postinstall" npm script.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const src = path.join(__dirname, '../node_modules/pdfjs-dist/build/pdf.worker.min.mjs')
const dest = path.join(__dirname, '../public/pdf.worker.min.mjs')

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest)
  console.log('Copied pdf.worker.min.mjs to public/')
} else {
  console.warn('pdfjs-dist worker not found — skipping copy (run npm install first)')
}
