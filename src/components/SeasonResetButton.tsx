'use client'

import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

// ----------------------------------------------------------------------------
// ปุ่ม "รีซีซั่น EXP" สำหรับหน้า /admin/players
// กดแล้วเปิดหน้าต่างเตือนทุกครั้ง: แสดงยอดที่จะถูกล้าง + ต้องพิมพ์ชื่อซีซั่นที่ปิดให้ตรงก่อนถึงจะยืนยันได้
// งานจริงอยู่ที่ RPC admin_season_reset_exp (เช็ค is_admin() ฝั่ง DB) ซึ่งเรียก season_reset_exp:
//   เก็บยอดลง season_archive → customers.exp = 0 → log ใน wallet_transactions เป็น "รีซีซั่น X → Y"
// แตะเฉพาะ EXP — แต้ม/สถิติแข่ง/legacy_accounts ไม่ถูกแก้
// ----------------------------------------------------------------------------

type SeasonStatus = {
  last_archived_season: string | null
  exp_players: number
  exp_total: number
  exp_max: number
  legacy_exp_players: number
  top: { name: string, exp: number }[]
}

type ResetResult = {
  closing_season: string
  new_season: string
  archived_players: number
  archived_exp_total: number
  reset_rows: number
  log_rows_relabeled: number
  legacy_accounts_with_exp: number
}

// SS6 -> SS7 (ซีซั่นปัจจุบัน = ซีซั่นที่จะปิด) และ SS8 (ซีซั่นใหม่)
function suggestSeasons(lastArchived: string | null): { closing: string, next: string } {
  const m = lastArchived?.match(/^(.*?)(\d+)$/)
  if (!m) return { closing: '', next: '' }
  const prefix = m[1]
  const n = Number(m[2])
  return { closing: `${prefix}${n + 1}`, next: `${prefix}${n + 2}` }
}

export default function SeasonResetButton({ supabase, onDone }: { supabase: SupabaseClient, onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<SeasonStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [closing, setClosing] = useState('')
  const [next, setNext] = useState('')
  const [typed, setTyped] = useState('')
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [result, setResult] = useState<ResetResult | null>(null)

  async function openDialog() {
    setOpen(true)
    setLoading(true)
    setStatus(null)
    setLoadError(null)
    setTyped('')
    setRunError(null)
    setResult(null)

    const { data, error } = await supabase.rpc('admin_season_status')
    if (error) {
      setLoadError(error.message)
    } else {
      const s = data as SeasonStatus
      setStatus(s)
      const { closing, next } = suggestSeasons(s.last_archived_season)
      setClosing(closing)
      setNext(next)
    }
    setLoading(false)
  }

  function closeDialog() {
    if (running) return
    setOpen(false)
    if (result) onDone()
  }

  async function runReset() {
    setRunning(true)
    setRunError(null)
    const { data, error } = await supabase.rpc('admin_season_reset_exp', {
      p_closing_season: closing.trim(),
      p_new_season: next.trim()
    })
    if (error) {
      setRunError(error.message)
    } else {
      setResult(data as ResetResult)
    }
    setRunning(false)
  }

  const closingTrim = closing.trim()
  const nextTrim = next.trim()
  const seasonsValid = closingTrim !== '' && nextTrim !== '' && closingTrim !== nextTrim
  const hasExp = (status?.exp_players ?? 0) > 0
  const canConfirm = !!status && seasonsValid && hasExp && typed.trim() === closingTrim && !running

  return (
    <>
      <button
        onClick={openDialog}
        className="text-sm border border-red-300 text-red-600 px-3 py-2 rounded hover:bg-red-50 shrink-0"
      >
        🔄 รีซีซั่น EXP
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={closeDialog}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-lg text-gray-800 mb-3">🔄 รีซีซั่น EXP</h2>

            {loading && <div className="text-sm text-gray-500 py-6 text-center">กำลังโหลดข้อมูล...</div>}

            {loadError && (
              <div className="text-sm bg-red-50 text-red-700 rounded p-3">โหลดข้อมูลไม่สำเร็จ: {loadError}</div>
            )}

            {result ? (
              <div className="space-y-3 text-sm">
                <div className="bg-green-50 text-green-800 rounded p-3">
                  ✅ ปิดซีซั่น <b>{result.closing_season}</b> เข้าสู่ <b>{result.new_season}</b> เรียบร้อย
                </div>
                <ul className="text-gray-700 space-y-1">
                  <li>• เก็บยอดลง archive {result.archived_players} คน รวม {result.archived_exp_total.toLocaleString()} EXP</li>
                  <li>• รีเซ็ต EXP เป็น 0 จำนวน {result.reset_rows} คน</li>
                  <li>• บันทึก log {result.log_rows_relabeled} แถว</li>
                  {result.legacy_accounts_with_exp > 0 && (
                    <li className="text-amber-700">• ผู้เล่นที่ยังไม่ claim มี EXP ค้าง {result.legacy_accounts_with_exp} คน (ไม่ถูกรีเซ็ต)</li>
                  )}
                </ul>
                <div className="flex justify-end">
                  <button onClick={closeDialog} className="text-sm bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-900">
                    ปิด
                  </button>
                </div>
              </div>
            ) : status && (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-gray-500">ซีซั่นที่จะปิด (เก็บยอดลง archive)</span>
                    <input className="border rounded px-2 py-1 w-full" value={closing}
                      onChange={e => { setClosing(e.target.value); setTyped('') }} placeholder="เช่น SS7" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-500">ซีซั่นใหม่</span>
                    <input className="border rounded px-2 py-1 w-full" value={next}
                      onChange={e => setNext(e.target.value)} placeholder="เช่น SS8" />
                  </label>
                </div>
                <div className="text-xs text-gray-400">
                  ซีซั่นล่าสุดที่ archive ไว้: {status.last_archived_season ?? '(ยังไม่เคย)'}
                </div>

                <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 space-y-1">
                  <div className="font-bold">⚠️ คำเตือน — อ่านก่อนกดยืนยัน</div>
                  {hasExp ? (
                    <div>
                      EXP ของผู้เล่น <b>{status.exp_players} คน</b> (รวม <b>{status.exp_total.toLocaleString()}</b> EXP,
                      สูงสุด {status.exp_max}) จะถูกตั้งเป็น <b>0</b> ทันที
                    </div>
                  ) : (
                    <div>ตอนนี้ไม่มีผู้เล่นคนไหนมี EXP — ไม่มีอะไรให้รีเซ็ต</div>
                  )}
                  <div>ย้อนกลับจากหน้าเว็บไม่ได้ ยอดเดิมจะถูกเก็บไว้ใน season_archive เท่านั้น</div>
                  <div>แต้ม (points) และสถิติแข่ง (ดวล/แชมป์/Top3/Top5) จะ<b>ไม่</b>ถูกแตะ</div>
                  <div>งานแข่งที่ยังไม่ปิดจ็อบ ถ้าไปปิดทีหลัง EXP จะนับเข้าซีซั่นใหม่ — ควรปิดจ็อบงานที่จบแล้วให้ครบก่อน</div>
                  {status.legacy_exp_players > 0 && (
                    <div className="text-amber-700">
                      ผู้เล่นที่ยังไม่ claim มี EXP ค้าง {status.legacy_exp_players} คน — ปุ่มนี้จะไม่รีเซ็ตให้
                    </div>
                  )}
                </div>

                {status.top.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Top 3 ของซีซั่นที่กำลังจะปิด</div>
                    <ol className="text-gray-700 space-y-0.5">
                      {status.top.map((t, i) => (
                        <li key={i}>{i + 1}. {t.name} — {t.exp} EXP</li>
                      ))}
                    </ol>
                  </div>
                )}

                {hasExp && seasonsValid && (
                  <label className="block">
                    <span className="text-xs text-gray-500">
                      พิมพ์ <b className="text-gray-800">{closingTrim}</b> เพื่อยืนยันการปิดซีซั่น
                    </span>
                    <input className="border rounded px-2 py-1 w-full" value={typed}
                      onChange={e => setTyped(e.target.value)} placeholder={closingTrim} />
                  </label>
                )}
                {!seasonsValid && (
                  <div className="text-xs text-red-600">ต้องกรอกชื่อซีซั่นทั้งสองช่อง และห้ามซ้ำกัน</div>
                )}

                {runError && (
                  <div className="bg-red-50 text-red-700 rounded p-3">รีซีซั่นไม่สำเร็จ (ไม่มีอะไรถูกเปลี่ยน): {runError}</div>
                )}

                <div className="flex justify-end gap-2">
                  <button disabled={running} onClick={closeDialog}
                    className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 disabled:opacity-50">
                    ยกเลิก
                  </button>
                  <button disabled={!canConfirm} onClick={runReset}
                    className="text-sm bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-40">
                    {running ? 'กำลังรีซีซั่น...' : `ยืนยันปิด ${closingTrim || '...'} → ${nextTrim || '...'}`}
                  </button>
                </div>
              </div>
            )}

            {loadError && (
              <div className="flex justify-end mt-3">
                <button onClick={closeDialog} className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200">ปิด</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
