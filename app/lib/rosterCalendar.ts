// ── Roster-app calendar screenshot → daily-view JPG ──────────────────
//
// Some crews only have access to a *screenshot* of the scheduling app's
// month-grid "Roster" view (day number top-right, a colored duty badge,
// then a "HH:MM ~ HH:MM" time range — 7 columns, MON..SUN), not the
// Crew Schedule Slip PDF that roster.ts's parser expects. There's no text
// layer to read here, so this reconstructs the grid purely from pixels:
//
//  1. Structural detection (deterministic, color/geometry only): find the
//     week-row and day-column boundaries from the screenshot's own thin
//     gray divider lines, then locate each day's number/badge/time bands
//     as fixed fractions of a row's height (the app always lays cells out
//     the same way, so this generalizes across screenshot resolutions).
//  2. Content extraction (OCR, tesseract.js): once a region is isolated,
//     read the actual text inside it. Mixing these two concerns — trying
//     to OCR the whole image at once — is what makes this kind of colored
//     dashboard UI hard to parse; keeping them separate is what makes it
//     tractable.
//
// Badge colors are sampled directly from the screenshot (not matched
// against a hardcoded palette) and reused when redrawing, so the output
// stays visually faithful without needing to know what each color means.

import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'

export interface CalendarBadge {
  text: string
  color: string // 'rgb(r,g,b)', sampled from the source screenshot
}
export interface CalendarDayCell {
  day: number
  weekday: string // 'Sun' .. 'Sat'
  badges: CalendarBadge[]
  timeRange: string // 'HH:MM ~ HH:MM', or '' if not read
}
export interface CalendarRosterData {
  title: string // e.g. "September2026"
  periodLabel: string // e.g. "01-Sep-2026 ~ 30-Sep-2026"
  days: CalendarDayCell[]
}

const MONTH_NAMES: Record<string, string> = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June',
  jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December',
}
const MONTH_NUMBERS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type ProgressFn = (message: string, frac: number) => void

// ── Pixel helpers ─────────────────────────────────────────────────────

function isGrayish(r: number, g: number, b: number): boolean {
  return Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15 && r > 100 && r < 235
}
function isBackground(r: number, g: number, b: number): boolean {
  return r > 245 && g > 245 && b > 245
}

function clusterAdjacent(values: number[]): number[] {
  const out: number[] = []
  for (const v of values) {
    if (out.length && v - out[out.length - 1] <= 3) continue
    out.push(v)
  }
  return out
}
function medianDiff(values: number[]): number {
  const diffs: number[] = []
  for (let i = 1; i < values.length; i++) diffs.push(values[i] - values[i - 1])
  diffs.sort((a, b) => a - b)
  return diffs[Math.floor(diffs.length / 2)]
}

/** Full-width horizontal gray divider lines — candidate week-row boundaries. */
function detectRowLines(data: Uint8ClampedArray, W: number, H: number): number[] {
  const xStart = Math.round(W * 0.03)
  const xEnd = Math.round(W * 0.98)
  const yStart = Math.round(H * 0.15)
  const yEnd = Math.round(H * 0.97)
  const candidates: number[] = []
  for (let y = yStart; y < yEnd; y++) {
    let cnt = 0
    let total = 0
    for (let x = xStart; x < xEnd; x += 4) {
      total++
      const i = (y * W + x) * 4
      if (isGrayish(data[i], data[i + 1], data[i + 2])) cnt++
    }
    if (cnt / total > 0.95) candidates.push(y)
  }
  return clusterAdjacent(candidates)
}

/** Extend the detected row lines into the full set of week-row boundaries via their common pitch. */
function computeRowBoundaries(lines: number[], H: number): number[] {
  if (lines.length < 2) {
    throw new Error('Could not find the weekly row grid in this screenshot. Is this a Roster calendar view?')
  }
  const pitch = medianDiff(lines)
  const rows = [lines[0]]
  let y = lines[0]
  const bottomLimit = H * 0.99
  while (y + pitch <= bottomLimit) {
    y += pitch
    rows.push(Math.round(y))
  }
  return rows
}

/**
 * Full-height gray divider lines within the table's own y-range — day-column
 * boundaries (always 7 columns, MON..SUN). A trailing/leading week-row can
 * have unpopulated cells (before day 1 or after the month's last day) with
 * no divider drawn between them, and a selected/highlighted day's outline
 * can locally blot out a boundary too — so this only requires *most* rows
 * to show the line, not every single one (unlike the row lines, which must
 * be strict to avoid picking up in-cell text strokes as false positives).
 */
function detectColumnLines(data: Uint8ClampedArray, W: number, tableTop: number, tableBottom: number): number[] {
  const xStart = Math.round(W * 0.02)
  const xEnd = Math.round(W * 0.99)
  const candidates: number[] = []
  for (let x = xStart; x < xEnd; x++) {
    let cnt = 0
    let total = 0
    for (let y = tableTop; y < tableBottom; y += 4) {
      total++
      const i = (y * W + x) * 4
      if (isGrayish(data[i], data[i + 1], data[i + 2])) cnt++
    }
    if (cnt / total > 0.7) candidates.push(x)
  }
  return clusterAdjacent(candidates)
}

function computeColumnBoundaries(lines: number[]): number[] {
  if (lines.length < 2) {
    throw new Error('Could not find the 7-day column grid in this screenshot. Is this a Roster calendar view?')
  }
  const pitch = medianDiff(lines)
  const cols = [lines[0]]
  let x = lines[0]
  for (let i = 0; i < 7; i++) {
    x += pitch
    cols.push(Math.round(x))
  }
  return cols
}

interface Run {
  start: number
  end: number
  color: [number, number, number]
}

/**
 * A leading/trailing week-row shows the adjacent month's day numbers too,
 * faded to a light gray (unlike the bold dark-navy digits of the roster's
 * own month) — and since those numbers can coincide with real day numbers
 * in-range (e.g. "28" leaking in before day 1 of a 31-day month), an
 * upper-bound check on the OCR'd value alone can't tell them apart. This
 * checks the pixel color directly: real day numbers always have at least
 * one genuinely dark pixel; faded ones don't.
 */
function hasDarkText(data: Uint8ClampedArray, W: number, rect: { left: number; top: number; width: number; height: number }): boolean {
  for (let y = rect.top; y < rect.top + rect.height; y++) {
    for (let x = rect.left; x < rect.left + rect.width; x++) {
      const i = (y * W + x) * 4
      if (data[i] + data[i + 1] + data[i + 2] < 300) return true
    }
  }
  return false
}

/** Contiguous non-background runs along one horizontal probe line — one run per duty badge in the cell. */
function findRuns(data: Uint8ClampedArray, W: number, xStart: number, xEnd: number, y: number, minWidth: number): Run[] {
  const raw: { start: number; end: number }[] = []
  let inRun = false
  let start = 0
  for (let x = xStart; x < xEnd; x++) {
    const i = (y * W + x) * 4
    const bg = isBackground(data[i], data[i + 1], data[i + 2])
    if (!bg && !inRun) {
      inRun = true
      start = x
    }
    if (bg && inRun) {
      inRun = false
      if (x - start >= minWidth) raw.push({ start, end: x - 1 })
    }
  }
  if (inRun && xEnd - start >= minWidth) raw.push({ start, end: xEnd - 1 })
  return raw.map((r) => {
    const midX = Math.floor((r.start + r.end) / 2)
    const i = (y * W + midX) * 4
    return { start: r.start, end: r.end, color: [data[i], data[i + 1], data[i + 2]] as [number, number, number] }
  })
}

// ── OCR helpers ────────────────────────────────────────────────────────

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

function cropRegion(source: HTMLCanvasElement, rect: Rect, scale = 3): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(rect.width * scale))
  out.height = Math.max(1, Math.round(rect.height * scale))
  const ctx = out.getContext('2d')!
  ctx.drawImage(source, rect.left, rect.top, rect.width, rect.height, 0, 0, out.width, out.height)
  return out
}

/** Grayscale + contrast-stretch + threshold — needed for low-contrast badges (e.g. black text on a pale-green fill). */
function preprocessForOcr(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  if (w === 0 || h === 0) return
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data
  const n = w * h
  const gray = new Uint8ClampedArray(n)
  let min = 255
  let max = 0
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
    gray[p] = g
    if (g < min) min = g
    if (g > max) max = g
  }
  const range = Math.max(1, max - min)
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const stretched = ((gray[p] - min) * 255) / range
    const v = stretched > 150 ? 255 : 0
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
  }
  ctx.putImageData(imgData, 0, 0)
}

async function ocrRegion(worker: Worker, source: HTMLCanvasElement, rect: Rect, whitelist: string): Promise<string> {
  if (rect.width < 4 || rect.height < 4) return ''
  const crop = cropRegion(source, rect)
  preprocessForOcr(crop)

  for (const psm of [PSM.SINGLE_LINE, PSM.SINGLE_WORD, PSM.SINGLE_CHAR]) {
    await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: whitelist })
    const { data } = await worker.recognize(crop)
    const text = (data.text || '').trim()
    if (text) return text
  }

  // A whitelist measurably increases zero-confidence rejections on short,
  // isolated tokens (verified on a lone "9" day-number that read fine
  // unrestricted but came back empty whitelisted to digits under every PSM
  // mode above) — but dropping it outright regressed *other* cells (it
  // trades that rare full rejection for a higher misread rate), so it's
  // only tried as a last resort once every whitelisted attempt is empty.
  if (whitelist) {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: '' })
    const { data } = await worker.recognize(crop)
    return (data.text || '').trim()
  }
  return ''
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load ${src}`))
    img.src = src
  })
}

async function loadFileAsImage(file: File | Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    return await loadImage(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function weekdayFor(year: number, month: number, day: number): string {
  return WEEKDAY_ABBR[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
}

// ── Main parse entry point ────────────────────────────────────────────

export async function parseRosterCalendarScreenshot(file: File | Blob, onProgress?: ProgressFn): Promise<CalendarRosterData> {
  onProgress?.('Loading image…', 0.02)
  const img = await loadFileAsImage(file)

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const W = canvas.width
  const H = canvas.height
  const { data: buf } = ctx.getImageData(0, 0, W, H)

  onProgress?.('Detecting the calendar grid…', 0.06)
  const rowLines = detectRowLines(buf, W, H)
  const rows = computeRowBoundaries(rowLines, H)
  const cols = computeColumnBoundaries(detectColumnLines(buf, W, rows[0], rows[rows.length - 1]))

  onProgress?.('Starting the OCR engine…', 0.1)
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract/tesseract-core-lstm.wasm.js',
    langPath: '/tessdata',
  })

  try {
    onProgress?.('Reading the roster period…', 0.12)
    const { title, periodLabel, year, month } = await extractPeriod(worker, canvas, rows[0], W)
    // Leading/trailing weeks show the adjacent month's days grayed out
    // (e.g. "31 Aug" before day 1) — a real day number always fits within
    // the roster's own month, so anything past its last day is a leak.
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

    const days: CalendarDayCell[] = []
    const totalCells = (rows.length - 1) * (cols.length - 1)
    let cellIdx = 0

    for (let ri = 0; ri < rows.length - 1; ri++) {
      const rowTop = rows[ri]
      const rowBottom = rows[ri + 1]
      const rowH = rowBottom - rowTop

      for (let ci = 0; ci < cols.length - 1; ci++) {
        cellIdx++
        onProgress?.(`Reading day cells (${cellIdx}/${totalCells})…`, 0.15 + 0.75 * (cellIdx / totalCells))

        const colLeft = cols[ci]
        const colRight = cols[ci + 1]
        const colW = colRight - colLeft

        // Day numbers are right-aligned; cropping tight to that side (rather
        // than the whole cell width) gives OCR a much smaller blank margin
        // to reason about, which noticeably improves reliability.
        const dayRect: Rect = {
          left: colLeft + Math.round(colW * 0.5),
          top: rowTop + 2,
          width: Math.round(colW * 0.46),
          height: Math.round(rowH * 0.32),
        }
        if (!hasDarkText(buf, W, dayRect)) continue // faded adjacent-month day number
        const dayText = await ocrRegion(worker, canvas, dayRect, '0123456789')
        const day = parseInt(dayText.replace(/[^0-9]/g, ''), 10)
        if (!day || day < 1 || day > daysInMonth) continue

        const probeY = rowTop + Math.round(rowH * 0.37)
        const minWidth = Math.max(6, Math.round(colW * 0.03))
        const runs = findRuns(buf, W, colLeft + 2, colRight - 2, probeY, minWidth)
        const badgeBandTop = rowTop + Math.round(rowH * 0.34)
        const badgeBandBottom = rowTop + Math.round(rowH * 0.6)

        const badges: CalendarBadge[] = []
        for (const run of runs) {
          const inset = Math.max(2, Math.round((run.end - run.start) * 0.06))
          const rect: Rect = {
            left: run.start + inset,
            top: badgeBandTop + 2,
            width: Math.max(4, run.end - run.start - 2 * inset),
            height: Math.max(4, badgeBandBottom - badgeBandTop - 4),
          }
          const text = (await ocrRegion(worker, canvas, rect, '')).replace(/\s+/g, ' ').trim()
          if (text) badges.push({ text, color: `rgb(${run.color[0]},${run.color[1]},${run.color[2]})` })
        }

        const timeRect: Rect = {
          left: colLeft + Math.round(colW * 0.04),
          top: rowTop + Math.round(rowH * 0.64),
          width: colW - Math.round(colW * 0.08),
          height: Math.round(rowH * 0.27),
        }
        const timeRaw = await ocrRegion(worker, canvas, timeRect, '0123456789: ~-')
        const timeMatch = timeRaw.match(/(\d{1,2}:\d{2}).*?(\d{1,2}:\d{2})/)
        const timeRange = timeMatch ? `${timeMatch[1]} ~ ${timeMatch[2]}` : ''

        days.push({ day, weekday: weekdayFor(year, month, day), badges, timeRange })
      }
    }

    if (days.length === 0) {
      throw new Error('Could not read any day cells from this screenshot. Is this a Roster calendar view?')
    }

    const seen = new Set<number>()
    const uniqueDays = days
      .sort((a, b) => a.day - b.day)
      .filter((d) => (seen.has(d.day) ? false : (seen.add(d.day), true)))

    onProgress?.('Done.', 0.95)
    return { title, periodLabel, days: uniqueDays }
  } finally {
    await worker.terminate()
  }
}

async function extractPeriod(
  worker: Worker,
  source: HTMLCanvasElement,
  tableTop: number,
  W: number
): Promise<{ title: string; periodLabel: string; year: number; month: number }> {
  // The "Roster Period: DD-Mon-YYYY ~ DD-Mon-YYYY" line sits as one row inside
  // the header panel, roughly 55-75% of the way down to the grid's top edge.
  const rect: Rect = { left: 0, top: Math.round(tableTop * 0.53), width: W, height: Math.round(tableTop * 0.22) }
  const text = await ocrRegion(worker, source, rect, '')
  const m = text.match(/(\d{2})-([A-Za-z]{3})-(\d{4})\s*[~\-–]\s*(\d{2})-([A-Za-z]{3})-(\d{4})/)
  if (!m) {
    throw new Error('Could not read the "Roster Period" date range from this screenshot.')
  }
  const monthAbbr = m[2].toLowerCase()
  const month = MONTH_NUMBERS[monthAbbr]
  const year = parseInt(m[3], 10)
  if (!month) throw new Error(`Unrecognized month "${m[2]}" in the roster period.`)
  return {
    title: `${MONTH_NAMES[monthAbbr]}${year}`,
    periodLabel: m[0].replace(/\s*[~\-–]\s*/, ' ~ '),
    year,
    month,
  }
}

// ── Rendering the parsed calendar to a portrait JPG ───────────────────

const SCALE = 2
const WIDTH = 760
const MARGIN = 24
const DATE_COL_WIDTH = 90
const ROW_HEIGHT = 56
const TABLE_HEADER_HEIGHT = 30
const PURPLE = '#6B2D8B'
const WEEKEND_TINT = '#FDE7F0'
const STRIPE_TINT = '#EAF2FB'

function isWeekend(weekday: string): boolean {
  return weekday === 'Sat' || weekday === 'Sun'
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function badgeLuminance(rgb: string): number {
  const m = rgb.match(/rgb\((\d+),(\d+),(\d+)\)/)
  if (!m) return 1
  const r = parseInt(m[1], 10)
  const g = parseInt(m[2], 10)
  const b = parseInt(m[3], 10)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

export async function renderCalendarRosterToJpeg(data: CalendarRosterData): Promise<Blob> {
  const headerLinesHeight = 64
  const height = MARGIN * 2 + headerLinesHeight + TABLE_HEADER_HEIGHT + data.days.length * ROW_HEIGHT

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, WIDTH, height)

  let y = MARGIN
  const left = MARGIN
  const right = WIDTH - MARGIN

  let logoW = 0
  try {
    const logo = await loadImage('/thai-logo.png')
    const logoH = 26
    logoW = logoH * (logo.width / logo.height)
    ctx.drawImage(logo, left, y, logoW, logoH)
  } catch {
    // Logo is decorative; proceed without it if it fails to load.
  }

  ctx.fillStyle = '#111827'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '700 15px Arial, sans-serif'
  ctx.fillText(data.title, left + logoW + 10, y + 18)
  y += 34

  ctx.font = '400 11px Arial, sans-serif'
  ctx.fillStyle = '#6b7280'
  ctx.fillText(`Period: ${data.periodLabel}`, left, y)
  y += 18

  const tableTop = y
  const dateColRight = left + DATE_COL_WIDTH

  ctx.fillStyle = PURPLE
  ctx.fillRect(left, y, right - left, TABLE_HEADER_HEIGHT)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 12px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Date', left + DATE_COL_WIDTH / 2, y + TABLE_HEADER_HEIGHT / 2 + 4)
  ctx.fillText('Duty', (dateColRight + right) / 2, y + TABLE_HEADER_HEIGHT / 2 + 4)
  y += TABLE_HEADER_HEIGHT

  ctx.textAlign = 'left'
  data.days.forEach((d, i) => {
    const rowTop = y
    ctx.fillStyle = isWeekend(d.weekday) ? WEEKEND_TINT : i % 2 === 1 ? STRIPE_TINT : '#ffffff'
    ctx.fillRect(left, rowTop, right - left, ROW_HEIGHT)

    ctx.fillStyle = '#111827'
    ctx.font = '700 16px Arial, sans-serif'
    ctx.fillText(String(d.day), left + 12, rowTop + 24)
    ctx.font = '400 11px Arial, sans-serif'
    ctx.fillStyle = '#9ca3af'
    ctx.fillText(d.weekday, left + 12, rowTop + 38)

    let bx = dateColRight + 12
    const chipY = rowTop + 10
    const chipH = 22
    ctx.font = '700 12px Arial, sans-serif'
    for (const b of d.badges) {
      const textW = ctx.measureText(b.text).width
      const chipW = textW + 16
      if (bx + chipW > right - 8) break
      ctx.fillStyle = b.color
      roundRect(ctx, bx, chipY, chipW, chipH, 4)
      ctx.fill()
      ctx.fillStyle = badgeLuminance(b.color) > 0.6 ? '#111827' : '#ffffff'
      ctx.textAlign = 'center'
      ctx.fillText(b.text, bx + chipW / 2, chipY + 15)
      ctx.textAlign = 'left'
      bx += chipW + 6
    }

    if (d.timeRange) {
      ctx.font = '400 11px Arial, sans-serif'
      ctx.fillStyle = '#6b7280'
      ctx.fillText(d.timeRange, dateColRight + 12, rowTop + ROW_HEIGHT - 8)
    }
    y += ROW_HEIGHT
  })

  ctx.strokeStyle = '#9ca3af'
  ctx.lineWidth = 0.75
  ctx.strokeRect(left, tableTop, right - left, TABLE_HEADER_HEIGHT + data.days.length * ROW_HEIGHT)
  ctx.beginPath()
  ctx.moveTo(dateColRight, tableTop)
  ctx.lineTo(dateColRight, y)
  ctx.stroke()
  for (let i = 0; i <= data.days.length; i++) {
    const ly = tableTop + TABLE_HEADER_HEIGHT + i * ROW_HEIGHT
    ctx.beginPath()
    ctx.moveTo(left, ly)
    ctx.lineTo(right, ly)
    ctx.stroke()
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/jpeg', 0.92)
  )
}
