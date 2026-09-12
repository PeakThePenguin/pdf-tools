'use client'

import { useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import { generateTimesheetPdf, downloadBytes, type TimesheetRow } from '@/app/lib/engine'

const POSITIONS = ['CC', 'SCC', 'ZSV', 'CIC', 'CSV']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type RemarkKind = 'OFFICE' | 'WFH' | 'OTHER' | ''

interface RowState {
  day: number
  checked: boolean
  timeIn: string
  timeOut: string
  remarkKind: RemarkKind
  remarkOther: string
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate()
}

function isWeekend(month: number, year: number, day: number): boolean {
  const wd = new Date(year, month - 1, day).getDay()
  return wd === 0 || wd === 6
}

function buildRows(month: number, year: number, prev: RowState[]): RowState[] {
  const prevByDay = new Map(prev.map((r) => [r.day, r]))
  const count = daysInMonth(month, year)
  return Array.from({ length: count }, (_, i) => {
    const day = i + 1
    return prevByDay.get(day) ?? { day, checked: false, timeIn: '08:00', timeOut: '17:00', remarkKind: 'OFFICE', remarkOther: '' }
  })
}

function formatTime12(hhmm: string): string {
  if (!hhmm) return ''
  const [hStr, mStr] = hhmm.split(':')
  const h = parseInt(hStr, 10)
  if (Number.isNaN(h)) return ''
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}.${mStr} ${ampm}`
}

function resolveRemark(r: RowState): string {
  if (r.remarkKind === 'OFFICE') return 'OFFICE'
  if (r.remarkKind === 'WFH') return 'Work from Home'
  if (r.remarkKind === 'OTHER') return r.remarkOther.trim()
  return ''
}

export default function TimesheetPage() {
  const now = new Date()
  const [name, setName] = useState('')
  const [persNo, setPersNo] = useState('')
  const [position, setPosition] = useState(POSITIONS[0])
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [approverName, setApproverName] = useState('JITIWAT V.')

  const [rowsKey, setRowsKey] = useState(`${month}-${year}`)
  const [rows, setRows] = useState<RowState[]>(() => buildRows(month, year, []))
  // Regenerate the row list whenever month/year changes, keeping data for
  // days that still exist (adjusting state during render, per React's
  // guidance, rather than in an Effect).
  if (rowsKey !== `${month}-${year}`) {
    setRowsKey(`${month}-${year}`)
    setRows((prev) => buildRows(month, year, prev))
  }

  const [bulkTimeIn, setBulkTimeIn] = useState('08:00')
  const [bulkTimeOut, setBulkTimeOut] = useState('17:00')
  const [bulkRemarkKind, setBulkRemarkKind] = useState<RemarkKind>('OFFICE')
  const [bulkRemarkOther, setBulkRemarkOther] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedCount = rows.filter((r) => r.checked).length

  function updateRow(day: number, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.day === day ? { ...r, ...patch } : r)))
  }
  function toggleRow(day: number) {
    setRows((prev) => prev.map((r) => (r.day === day ? { ...r, checked: !r.checked } : r)))
  }
  function selectAllWeekdays() {
    setRows((prev) => prev.map((r) => ({ ...r, checked: !isWeekend(month, year, r.day) })))
  }
  function clearSelection() {
    setRows((prev) => prev.map((r) => ({ ...r, checked: false })))
  }
  function applyBulk() {
    setRows((prev) =>
      prev.map((r) =>
        r.checked ? { ...r, timeIn: bulkTimeIn, timeOut: bulkTimeOut, remarkKind: bulkRemarkKind, remarkOther: bulkRemarkOther } : r
      )
    )
  }

  async function handleGenerate() {
    setBusy(true)
    setError(null)
    try {
      const pdfRows: TimesheetRow[] = rows.map((r) => ({
        day: r.day,
        timeIn: formatTime12(r.timeIn),
        timeOut: formatTime12(r.timeOut),
        remark: resolveRemark(r),
      }))
      const bytes = await generateTimesheetPdf({
        name: name.trim(),
        persNo: persNo.trim(),
        position,
        month,
        year,
        approverName: approverName.trim(),
        rows: pdfRows,
      })
      const safeName = (name.trim() || 'employee').replace(/[^a-zA-Z0-9]+/g, '_')
      downloadBytes(bytes, `timesheet_${safeName}_${MONTHS[month - 1]}_${year}.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to generate PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="TIME ATTENDANCE FORM" subtitle="Generate the PC Team 4 monthly time record">
      <div className="px-3 pt-3 space-y-3">
        <div className="border border-gray-200 p-3 space-y-2.5" style={{ borderRadius: 4 }}>
          <div>
            <label className="field-label">Name</label>
            <input className="app-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ASE AUKARAPOL D." />
          </div>
          <div>
            <label className="field-label">Pers.No.</label>
            <input className="app-input" value={persNo} onChange={(e) => setPersNo(e.target.value)} placeholder="44889" />
          </div>
          <div>
            <label className="field-label">Position</label>
            <select className="app-input" value={position} onChange={(e) => setPosition(e.target.value)}>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label">Month</label>
              <select className="app-input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Year</label>
              <select className="app-input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 1 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">Approver (ผู้รับรอง)</label>
            <input className="app-input" value={approverName} onChange={(e) => setApproverName(e.target.value)} />
          </div>
        </div>

        <div className="border border-gray-200 p-3 space-y-2" style={{ borderRadius: 4 }}>
          <p className="field-label mb-0.5">Bulk-fill selected days ({selectedCount} selected)</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label">Time in</label>
              <input type="time" className="app-input" value={bulkTimeIn} onChange={(e) => setBulkTimeIn(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Time out</label>
              <input type="time" className="app-input" value={bulkTimeOut} onChange={(e) => setBulkTimeOut(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label">Remarks</label>
            <select className="app-input" value={bulkRemarkKind} onChange={(e) => setBulkRemarkKind(e.target.value as RemarkKind)}>
              <option value="">—</option>
              <option value="OFFICE">OFFICE</option>
              <option value="WFH">Work from Home</option>
              <option value="OTHER">Other…</option>
            </select>
            {bulkRemarkKind === 'OTHER' && (
              <input className="app-input mt-1.5" value={bulkRemarkOther} onChange={(e) => setBulkRemarkOther(e.target.value)} placeholder="Specify" />
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-0.5">
            <button onClick={selectAllWeekdays} className="text-xs font-semibold px-2 py-1" style={{ border: '1px solid #e5e7eb', borderRadius: 4, color: '#666' }}>
              Select all weekdays
            </button>
            <button onClick={clearSelection} className="text-xs font-semibold px-2 py-1" style={{ border: '1px solid #e5e7eb', borderRadius: 4, color: '#666' }}>
              Clear selection
            </button>
            <button
              onClick={applyBulk}
              disabled={selectedCount === 0}
              className="text-xs font-bold px-3 py-1 text-white disabled:opacity-40 ml-auto"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              Apply to selected
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          {rows.map((r) => {
            const weekend = isWeekend(month, year, r.day)
            return (
              <div
                key={r.day}
                className="border p-2 space-y-1.5"
                style={{ borderRadius: 4, borderColor: '#e5e7eb', background: weekend ? '#f9fafb' : '#fff' }}
              >
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={r.checked} onChange={() => toggleRow(r.day)} style={{ width: 16, height: 16 }} />
                  <span className="text-xs font-bold text-gray-800">Day {r.day}</span>
                  <span className="text-[11px] text-gray-400">{WEEKDAY_ABBR[new Date(year, month - 1, r.day).getDay()]}</span>
                  {weekend && <span className="text-[10px] font-semibold" style={{ color: '#9ca3af' }}>weekend</span>}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input type="time" className="app-input" style={{ fontSize: 12, padding: '5px 8px' }} value={r.timeIn} onChange={(e) => updateRow(r.day, { timeIn: e.target.value })} />
                  <input type="time" className="app-input" style={{ fontSize: 12, padding: '5px 8px' }} value={r.timeOut} onChange={(e) => updateRow(r.day, { timeOut: e.target.value })} />
                </div>
                <select
                  className="app-input"
                  style={{ fontSize: 12, padding: '5px 8px' }}
                  value={r.remarkKind}
                  onChange={(e) => updateRow(r.day, { remarkKind: e.target.value as RemarkKind })}
                >
                  <option value="">—</option>
                  <option value="OFFICE">OFFICE</option>
                  <option value="WFH">Work from Home</option>
                  <option value="OTHER">Other…</option>
                </select>
                {r.remarkKind === 'OTHER' && (
                  <input
                    className="app-input"
                    style={{ fontSize: 12, padding: '5px 8px' }}
                    value={r.remarkOther}
                    onChange={(e) => updateRow(r.day, { remarkOther: e.target.value })}
                    placeholder="Specify"
                  />
                )}
              </div>
            )
          })}
        </div>

        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

        <button
          onClick={handleGenerate}
          disabled={busy}
          className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
          style={{ background: 'var(--purple)', borderRadius: 4 }}
        >
          {busy ? 'Generating…' : 'Generate PDF'}
        </button>
      </div>
    </ToolShell>
  )
}
