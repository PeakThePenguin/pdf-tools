// ── Crew Schedule Slip → daily-view JPG ──────────────────────────────
//
// Parses a THAI "Crew Schedule Slip" PDF (a landscape grid: one column per
// day of the month, row-groups DUTY / FLT / DEP / ARR × up to 4 legs) and
// reformats it into a portrait day-by-day table, matching the at-a-glance
// style crew are used to seeing in the scheduling app.
//
// The grid has no drawn cell borders in the PDF's text layer, so cells are
// reconstructed purely from glyph positions: day columns from the header
// row's x-positions, row-groups from the DUTY/FLT/DEP/ARR label y-positions.
// See the parsing notes inline — the trickiest part is that the DUTY cell
// stacks a variable number of "code + arrival station" summary lines (one
// per duty that day) directly above leg 1's own content, with no reliable
// gap to tell them apart when 2 duties land the same day.

import { loadPdfJsDocument } from './pdfjs'

interface TextItem {
  str: string
  x: number
  y: number
}

export interface RosterHeader {
  persNoLine: string
  acQual: string
  rank: string
  effective: string
  sysdate: string
  title: string // e.g. "September2026", derived from EFFECTIVE
  year: number | null // parsed from EFFECTIVE's end date, for building real calendar dates
  month: number | null // 1-12
}

export interface RosterDayEntry {
  day: number
  weekday: string // 'Mon' .. 'Sun'
  text: string
}

export interface RosterData {
  header: RosterHeader
  days: RosterDayEntry[]
}

const MONTH_NAMES: Record<string, string> = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June',
  jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December',
}
const MONTH_NUMBERS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** Parse EFFECTIVE's end date ("01Sep26-30Sep26" -> the 30Sep26 half). */
function parseEffectiveEnd(effective: string): { monthAbbr: string; year: number } | null {
  const m = effective.match(/\d{2}[A-Za-z]{3}\d{2}\s*-\s*\d{2}([A-Za-z]{3})(\d{2})/)
  if (!m) return null
  return { monthAbbr: m[1].toLowerCase(), year: 2000 + parseInt(m[2], 10) }
}

function titleFromEffective(effective: string): string {
  const end = parseEffectiveEnd(effective)
  if (!end) return effective
  const month = MONTH_NAMES[end.monthAbbr] ?? end.monthAbbr
  return `${month}${end.year}`
}

function monthNumberFromEffective(effective: string): number | null {
  const end = parseEffectiveEnd(effective)
  if (!end) return null
  return MONTH_NUMBERS[end.monthAbbr] ?? null
}

async function extractPageItems(doc: Awaited<ReturnType<typeof loadPdfJsDocument>>, pageNumber: number): Promise<TextItem[]> {
  const page = await doc.getPage(pageNumber)
  const content = await page.getTextContent()
  return content.items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((it: any) => ({ str: (it.str as string) ?? '', x: it.transform[4] as number, y: it.transform[5] as number }))
    .filter((it: TextItem) => it.str.trim() !== '')
}

const HEADER_LABELS = ['PERS.NO:', 'A/C QUAL:', 'RANK:', 'EFFECTIVE:', 'SYSDATE:']

function findHeaderField(items: TextItem[], label: string): string {
  // Field values sit on the same line as their label, immediately to its
  // right — but another label (e.g. RANK: sharing A/C QUAL:'s line) can
  // follow on that same line, so stop collecting once one appears.
  const labelItem = items.find((it) => it.str.trim() === label)
  if (!labelItem) return ''
  const sameLine = items
    .filter((it) => Math.abs(it.y - labelItem.y) < 3 && it.x >= labelItem.x)
    .sort((a, b) => a.x - b.x)
  const value: string[] = []
  for (const it of sameLine.slice(1)) {
    if (HEADER_LABELS.includes(it.str.trim())) break
    value.push(it.str)
  }
  return value.join(' ').replace(/\s+/g, ' ').trim()
}

const isTime = (s: string) => /^\d{2}:\d{2}$/.test(s)
const mid = (a: number, b: number) => (a + b) / 2

interface LegZone {
  code: string | null
  station: string | null
  time: string | null
}
interface Leg {
  dep: LegZone
  arr: { station: string | null; time: string | null }
}

function parseDayColumns(items: TextItem[]): RosterDayEntry[] {
  const headers = items
    .filter((it) => /^[0-9]{1,2}(MON|TUE|WED|THU|FRI|SAT|SUN)$/.test(it.str))
    .sort((a, b) => a.x - b.x)
  if (headers.length === 0) return []

  const rowLabels = items.filter((it) => ['DUTY', 'FLT', 'DEP', 'ARR'].includes(it.str) && it.x < 100)
  const duty = rowLabels.find((it) => it.str === 'DUTY')
  const flts = rowLabels.filter((it) => it.str === 'FLT').sort((a, b) => b.y - a.y)
  const deps = rowLabels.filter((it) => it.str === 'DEP').sort((a, b) => b.y - a.y)
  const arrs = rowLabels.filter((it) => it.str === 'ARR').sort((a, b) => b.y - a.y)
  const numLegs = flts.length
  if (!duty || numLegs === 0) return []

  const legBands = Array.from({ length: numLegs }, (_, i) => {
    const depTop = i === 0 ? duty.y + 20 : mid(arrs[i - 1].y, flts[i].y)
    const depBottom = mid(deps[i].y, arrs[i].y)
    const arrBottom = i === numLegs - 1 ? arrs[i].y - 40 : mid(arrs[i].y, flts[i + 1].y)
    return { dep: [depBottom, depTop] as const, arr: [arrBottom, depBottom] as const }
  })

  // A footer section (***DUE DATE***, ***NOTE***, Indicator Description)
  // sits directly below the table and can share x-ranges with the day
  // columns — clip it out with a hard y floor.
  const footerMarker = items.find((it) => it.str.includes('DUE DATE') || it.str.includes('Indicator Description'))
  const tableBottomY = footerMarker ? footerMarker.y + 4 : 0
  const GAP_THRESHOLD = 20

  function colRange(i: number): [number, number] {
    const left = i === 0 ? headers[0].x - 20 : mid(headers[i - 1].x, headers[i].x)
    const right = i === headers.length - 1 ? headers[i].x + 25 : mid(headers[i].x, headers[i + 1].x)
    return [left, right]
  }

  function itemsInBand(xLeft: number, xRight: number, yBottom: number, yTop: number): TextItem[] {
    return items
      .filter((it) => it.x >= xLeft && it.x < xRight && it.y > Math.max(yBottom, tableBottomY) && it.y <= yTop && it.x > 100)
      .sort((a, b) => b.y - a.y)
  }

  function trimToBottomCluster(sortedDescByY: TextItem[]): TextItem[] {
    if (sortedDescByY.length <= 1) return sortedDescByY
    let startIdx = sortedDescByY.length - 1
    for (let i = sortedDescByY.length - 1; i > 0; i--) {
      if (sortedDescByY[i - 1].y - sortedDescByY[i].y > GAP_THRESHOLD) break
      startIdx = i - 1
    }
    return sortedDescByY.slice(startIdx)
  }

  function classifyDepZone(strs: string[]): LegZone {
    let time: string | null = null
    let rest = strs
    if (rest.length && isTime(rest[rest.length - 1])) {
      time = rest[rest.length - 1]
      rest = rest.slice(0, -1)
    } else if (rest.length) {
      // A real dep-zone always ends in a time; anything else is DUTY-cell
      // leftover (e.g. a lone arrival-station line with no new duty that day).
      return { code: null, station: null, time: null }
    }
    return { code: rest[0] ?? null, station: rest[1] ?? null, time }
  }
  function classifyArrZone(strs: string[]): { station: string | null; time: string | null } {
    let time: string | null = null
    let rest = strs
    if (rest.length && isTime(rest[rest.length - 1])) {
      time = rest[rest.length - 1]
      rest = rest.slice(0, -1)
    }
    return { station: rest[0] ?? null, time }
  }

  const days: RosterDayEntry[] = []
  for (let d = 0; d < headers.length; d++) {
    const [xLeft, xRight] = colRange(d)

    const rawLegs: { depLines: string[]; arrLines: string[] }[] = [{ depLines: [], arrLines: [] }]
    for (let leg = 1; leg < numLegs; leg++) {
      const depLines = itemsInBand(xLeft, xRight, legBands[leg].dep[0], legBands[leg].dep[1]).map((it) => it.str)
      const arrLines = itemsInBand(xLeft, xRight, legBands[leg].arr[0], legBands[leg].arr[1]).map((it) => it.str)
      rawLegs[leg] = { depLines, arrLines }
    }
    const otherActiveLegs = rawLegs.slice(1).filter((l) => l.depLines.length || l.arrLines.length).length

    let leg1DepLines: string[]
    if (otherActiveLegs === 0) {
      leg1DepLines = trimToBottomCluster(itemsInBand(xLeft, xRight, legBands[0].dep[0], legBands[0].dep[1])).map((it) => it.str)
    } else {
      const skip = 2 * (otherActiveLegs + 1)
      leg1DepLines = itemsInBand(xLeft, xRight, legBands[0].dep[0], legBands[0].dep[1])
        .slice(skip)
        .map((it) => it.str)
    }
    rawLegs[0] = {
      depLines: leg1DepLines,
      arrLines: itemsInBand(xLeft, xRight, legBands[0].arr[0], legBands[0].arr[1]).map((it) => it.str),
    }

    const legs: Leg[] = []
    for (let leg = 0; leg < numLegs; leg++) {
      const { depLines, arrLines } = rawLegs[leg]
      if (depLines.length === 0 && arrLines.length === 0) continue
      legs.push({ dep: classifyDepZone(depLines), arr: classifyArrZone(arrLines) })
    }

    const h = headers[d]
    const dayNum = parseInt(h.str, 10)
    const weekdayAbbr = h.str.replace(/^\d+/, '')
    const weekday = weekdayAbbr.charAt(0) + weekdayAbbr.slice(1).toLowerCase()
    days.push({ day: dayNum, weekday, text: formatDay(legs) })
  }
  return days
}

function formatCode(code: string): string {
  return /^\d+$/.test(code) ? code.padStart(4, '0') : code
}
function compact(t: string): string {
  return t.replace(':', '')
}

/**
 * Reduce one leg's {dep, arr} data to the compact single-line style crew
 * are used to reading:
 *  - a duty that starts and ends at base same day (dep=arr=BKK) shows both
 *    times: "CODE(start)   BKK(end)";
 *  - a real flight landing at base shows only the arrival time: "CODE   BKK(arr)";
 *  - a real flight departing to an outstation shows only the departure
 *    time: "CODE(dep)   STATION";
 *  - a flight whose arrival isn't resolved yet (continues past midnight
 *    into the next day's column) shows just the bare code;
 *  - a day that's purely an overnight arrival (no new duty that day) shows
 *    just "STATION(arr)";
 *  - a no-station ground duty (training, standby, etc.) shows
 *    "CODE start-end", or just the bare code when the time span is the
 *    generic all-day 00:00-23:59 marker.
 */
function formatLeg(leg: Leg): string {
  const { code, station: depStation, time: depTime } = leg.dep
  const { station: arrStation, time: arrTime } = leg.arr

  if (code && !depStation && !arrStation && depTime && arrTime) {
    if (depTime === '00:00' && arrTime === '23:59') return code
    return `${code} ${compact(depTime)}-${compact(arrTime)}`
  }
  if (code && arrStation) {
    const label = formatCode(code)
    if (depStation === 'BKK' && arrStation === 'BKK') {
      return `${label}(${compact(depTime ?? '')})   ${arrStation}(${compact(arrTime ?? '')})`
    }
    if (arrStation === 'BKK') return `${label}   ${arrStation}(${compact(arrTime ?? '')})`
    return `${label}(${compact(depTime ?? '')})   ${arrStation}`
  }
  if (code) return formatCode(code)
  if (arrStation) return `${arrStation}(${compact(arrTime ?? '')})`
  return ''
}

function formatDay(legs: Leg[]): string {
  return legs.map(formatLeg).filter(Boolean).join('   ')
}

/** Parse a Crew Schedule Slip PDF (page 1) into header info + per-day entries. */
export async function parseCrewScheduleSlip(bytes: ArrayBuffer): Promise<RosterData> {
  const doc = await loadPdfJsDocument(bytes)
  const items = await extractPageItems(doc, 1)

  const persNoLine = findHeaderField(items, 'PERS.NO:')
  const acQual = findHeaderField(items, 'A/C QUAL:')
  const rank = findHeaderField(items, 'RANK:')
  const effective = findHeaderField(items, 'EFFECTIVE:')
  const sysdate = findHeaderField(items, 'SYSDATE:')

  const days = parseDayColumns(items)
  if (days.length === 0) {
    throw new Error('Could not find a day-by-day schedule grid in this PDF. Is it a Crew Schedule Slip?')
  }

  const end = parseEffectiveEnd(effective)
  return {
    header: {
      persNoLine, acQual, rank, effective, sysdate,
      title: titleFromEffective(effective),
      year: end?.year ?? null,
      month: monthNumberFromEffective(effective),
    },
    days,
  }
}

// ── Rendering the parsed roster to a portrait JPG ────────────────────

const SCALE = 2 // supersample for crisp text in the exported JPG
const WIDTH = 760
const MARGIN = 24
const DATE_COL_WIDTH = 110
const ROW_HEIGHT = 32
const TABLE_HEADER_HEIGHT = 28
const PURPLE = '#6B2D8B'
const WEEKEND_TINT = '#FDE7F0'
const STRIPE_TINT = '#EAF2FB'

function isWeekend(weekday: string): boolean {
  return weekday === 'Sat' || weekday === 'Sun'
}

/** Draw the parsed roster into a portrait canvas matching the crew-app daily-view style. */
export async function renderRosterToJpeg(data: RosterData): Promise<Blob> {
  const headerLinesHeight = 78
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
  ctx.fillText(data.header.title, left + logoW + 10, y + 18)
  y += 34

  ctx.font = '700 10px Arial, sans-serif'
  const infoLine = (label: string, value: string, x: number) => {
    ctx.fillStyle = '#111827'
    ctx.font = '700 10px Arial, sans-serif'
    ctx.fillText(label, x, y)
    const labelW = ctx.measureText(label).width
    ctx.font = '400 10px Arial, sans-serif'
    ctx.fillText(value, x + labelW + 4, y)
    return x + labelW + 4 + ctx.measureText(value).width
  }
  infoLine('PERS.NO:', data.header.persNoLine, left)
  y += 14
  const afterQual = infoLine('A/C QUAL:', data.header.acQual, left)
  infoLine('RANK:', data.header.rank, afterQual + 24)
  y += 14
  const afterEff = infoLine('EFFECTIVE:', data.header.effective, left)
  infoLine('SYSDATE:', data.header.sysdate, afterEff + 24)
  y += 16

  const tableTop = y
  const dateColRight = left + DATE_COL_WIDTH

  // Table header
  ctx.fillStyle = PURPLE
  ctx.fillRect(left, y, right - left, TABLE_HEADER_HEIGHT)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 11px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Date', left + DATE_COL_WIDTH / 2, y + TABLE_HEADER_HEIGHT / 2 + 4)
  ctx.fillText(data.header.title, (dateColRight + right) / 2, y + TABLE_HEADER_HEIGHT / 2 + 4)
  y += TABLE_HEADER_HEIGHT

  ctx.textAlign = 'left'
  data.days.forEach((d, i) => {
    const rowTop = y
    ctx.fillStyle = isWeekend(d.weekday) ? WEEKEND_TINT : i % 2 === 1 ? STRIPE_TINT : '#ffffff'
    ctx.fillRect(left, rowTop, right - left, ROW_HEIGHT)

    ctx.fillStyle = '#111827'
    ctx.font = '700 13px Arial, sans-serif'
    ctx.fillText(String(d.day), left + 12, rowTop + ROW_HEIGHT / 2 + 5)
    const dayW = ctx.measureText(String(d.day)).width
    ctx.font = '400 10px Arial, sans-serif'
    ctx.fillStyle = '#9ca3af'
    ctx.fillText(d.weekday, left + 12 + dayW + 6, rowTop + ROW_HEIGHT / 2 + 4)

    if (d.text) {
      ctx.fillStyle = '#111827'
      ctx.font = '400 11px Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(d.text, (dateColRight + right) / 2, rowTop + ROW_HEIGHT / 2 + 4, right - dateColRight - 12)
      ctx.textAlign = 'left'
    }
    y += ROW_HEIGHT
  })

  // Grid lines
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load ${src}`))
    img.src = src
  })
}

// ── Exporting the parsed roster to an .ics calendar ──────────────────

const pad2 = (n: number) => String(n).padStart(2, '0')

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function icsDate(year: number, month: number, day: number): string {
  return `${year}${pad2(month)}${pad2(day)}`
}

/** Next calendar day, handling month/year rollover (e.g. day 30 of a 30-day month). */
function nextDay(year: number, month: number, day: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + 1))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/**
 * Build an .ics calendar from the parsed roster: one all-day event per day
 * that has a duty, so it drops straight onto the day cell in any calendar
 * app. Times aren't modeled as event start/end — DEP/ARR times in the
 * source are local to each station, and a leg's arrival can land on the
 * next day's own column, so an all-day marker per day avoids guessing at a
 * single timezone/duration that wouldn't be reliably correct anyway.
 */
export function rosterToIcs(data: RosterData): string {
  const { year, month } = data.header
  if (!year || !month) return ''

  const stamp = new Date()
  const dtstamp = `${stamp.getUTCFullYear()}${pad2(stamp.getUTCMonth() + 1)}${pad2(stamp.getUTCDate())}T${pad2(stamp.getUTCHours())}${pad2(stamp.getUTCMinutes())}${pad2(stamp.getUTCSeconds())}Z`

  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PC Team 4 PDF Tools//Roster to JPG//EN', 'CALSCALE:GREGORIAN']
  for (const d of data.days) {
    if (!d.text) continue
    const end = nextDay(year, month, d.day)
    lines.push(
      'BEGIN:VEVENT',
      `UID:roster-${icsDate(year, month, d.day)}-${Math.random().toString(36).slice(2, 8)}@pdf-tools`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${icsDate(year, month, d.day)}`,
      `DTEND;VALUE=DATE:${icsDate(end.year, end.month, end.day)}`,
      `SUMMARY:${icsEscape(d.text)}`,
      'END:VEVENT'
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
