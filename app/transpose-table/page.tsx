'use client'

import { useMemo, useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { downloadBlob } from '@/app/lib/engine'
import { detectDelimiter, parseDelimitedTable, transposeTable, tableToDelimitedText, tableToHtml, type Delimiter } from '@/app/lib/table'

const DELIMITER_OPTIONS: { label: string; value: Delimiter | 'auto' }[] = [
  { label: 'Auto-detect', value: 'auto' },
  { label: 'Comma (,)', value: ',' },
  { label: 'Tab', value: '\t' },
  { label: 'Semicolon (;)', value: ';' },
]

const DELIMITER_NAMES: Record<Delimiter, string> = { ',': 'comma', '\t': 'tab', ';': 'semicolon' }

export default function TransposeTablePage() {
  const [inputText, setInputText] = useState('')
  const [delimiterChoice, setDelimiterChoice] = useState<Delimiter | 'auto'>('auto')
  const [error, setError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  const detected = useMemo(() => detectDelimiter(inputText), [inputText])
  const delimiter = delimiterChoice === 'auto' ? detected : delimiterChoice
  const rows = useMemo(() => (inputText.trim() ? parseDelimitedTable(inputText, delimiter) : []), [inputText, delimiter])
  const transposed = useMemo(() => transposeTable(rows), [rows])

  async function handleFile(file: File) {
    setError(null)
    setCopyStatus('idle')
    try {
      setInputText(await file.text())
    } catch (e) {
      setError((e as Error).message || 'Failed to read the file.')
    }
  }

  function handleDownload() {
    const csv = tableToDelimitedText(transposed, ',')
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'transposed.csv')
  }

  async function handleCopy() {
    setCopyStatus('idle')
    const tsv = tableToDelimitedText(transposed, '\t')
    try {
      // Offer both flavors: spreadsheets that understand an HTML table
      // (Excel, Sheets) paste it cell-by-cell; anything else falls back to
      // the plain tab-separated text.
      if (typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([tsv], { type: 'text/plain' }),
            'text/html': new Blob([tableToHtml(transposed)], { type: 'text/html' }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(tsv)
      }
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }

  const rowCount = rows.length
  const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0)

  return (
    <ToolShell title="TRANSPOSE TABLE" subtitle="Swap a table's rows and columns">
      <div className="px-3 pt-3 space-y-3">
        <div>
          <label className="field-label">Paste your table</label>
          <textarea
            className="app-input"
            style={{ minHeight: 140, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
            value={inputText}
            onChange={(e) => { setInputText(e.target.value); setCopyStatus('idle') }}
            placeholder={'Paste from Excel/Sheets, or type CSV:\nName, Jan, Feb, Mar\nAlice, 10, 12, 9\nBob, 8, 7, 11'}
          />
        </div>

        <FileDrop accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" label="Or tap to upload a .csv / .tsv file" onFiles={(files) => handleFile(files[0])} />

        <div>
          <label className="field-label">Delimiter</label>
          <select className="app-input" value={delimiterChoice} onChange={(e) => setDelimiterChoice(e.target.value as Delimiter | 'auto')}>
            {DELIMITER_OPTIONS.map((o) => (
              <option key={o.label} value={o.value}>{o.label}</option>
            ))}
          </select>
          {delimiterChoice === 'auto' && inputText.trim() && (
            <p className="text-[11px] text-gray-400 mt-1">Detected: {DELIMITER_NAMES[detected]}-separated</p>
          )}
        </div>

        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

        {rowCount > 0 && (
          <>
            <p className="text-xs text-gray-500">
              {rowCount} row{rowCount === 1 ? '' : 's'} × {colCount} column{colCount === 1 ? '' : 's'} → transposed to {colCount} row{colCount === 1 ? '' : 's'} × {rowCount} column{rowCount === 1 ? '' : 's'}
            </p>

            <div>
              <label className="field-label">Transposed result</label>
              <div className="border border-gray-200" style={{ borderRadius: 4, overflow: 'auto', maxHeight: 320 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
                  <tbody>
                    {transposed.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} style={{ border: '1px solid #e5e7eb', padding: '4px 8px' }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 py-2.5 text-xs font-bold"
                style={{ border: '1px solid var(--purple)', color: 'var(--purple)', borderRadius: 4 }}
              >
                {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'failed' ? 'Copy failed' : 'Copy for spreadsheet'}
              </button>
              <button
                onClick={handleDownload}
                className="flex-1 py-2.5 text-xs font-bold text-white"
                style={{ background: 'var(--purple)', borderRadius: 4 }}
              >
                Download CSV
              </button>
            </div>
          </>
        )}
      </div>
    </ToolShell>
  )
}
