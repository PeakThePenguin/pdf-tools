// ── Delimited table parsing / transposing ──────────────────────────
//
// Supports CSV/TSV-style text: pasted straight from Excel/Sheets (tab
// delimited), a .csv/.tsv upload, or hand-typed comma/semicolon lists.
// The parser follows RFC 4180 quoting rules (a "..." field can contain the
// delimiter, newlines, and escaped "" quotes) so real-world spreadsheet
// exports round-trip correctly, not just simple split(',') text.

export type Delimiter = ',' | '\t' | ';'

/** Guess the delimiter from the first line: whichever of , \t ; appears most. */
export function detectDelimiter(text: string): Delimiter {
  const firstLine = text.split(/\r\n|\r|\n/, 1)[0] ?? ''
  const tabCount = (firstLine.match(/\t/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length
  const semiCount = (firstLine.match(/;/g) || []).length
  if (tabCount > 0 && tabCount >= commaCount && tabCount >= semiCount) return '\t'
  if (semiCount > commaCount) return ';'
  return ','
}

/** Parse delimited text into a 2D array of cell strings, honoring RFC 4180 quoting. */
export function parseDelimitedTable(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
        } else {
          inQuotes = false
          i += 1
        }
      } else {
        field += ch
        i += 1
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i += 1
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
      i += 1
    } else if (ch === '\r') {
      i += 1
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
    } else {
      field += ch
      i += 1
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // Drop a trailing blank row left by a final newline.
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === '')) rows.pop()
  return rows
}

/** Swap rows and columns. Ragged input rows are padded with empty cells. */
export function transposeTable(rows: string[][]): string[][] {
  const numCols = rows.reduce((max, r) => Math.max(max, r.length), 0)
  const out: string[][] = Array.from({ length: numCols }, () => [])
  for (let c = 0; c < numCols; c++) {
    for (let r = 0; r < rows.length; r++) {
      out[c].push(rows[r][c] ?? '')
    }
  }
  return out
}

function needsQuoting(field: string, delimiter: Delimiter): boolean {
  return field.includes(delimiter) || field.includes('"') || field.includes('\n') || field.includes('\r')
}

/** Serialize a 2D array back to delimited text, quoting fields that need it. */
export function tableToDelimitedText(rows: string[][], delimiter: Delimiter): string {
  return rows
    .map((row) =>
      row.map((field) => (needsQuoting(field, delimiter) ? `"${field.replace(/"/g, '""')}"` : field)).join(delimiter)
    )
    .join('\r\n')
}

/** A real <table> markup, for the "text/html" clipboard flavor spreadsheets parse into cells. */
export function tableToHtml(rows: string[][]): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`)
    .join('')
  return `<table>${body}</table>`
}
