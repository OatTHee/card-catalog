'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

// ----------------------------------------------------------------------------
// หน้านี้คือ "one stop" สำหรับแอดมินดู/แก้ แต้ม, EXP, และสถิติการแข่ง ของผู้เล่นทุกคน
// ไม่ว่าจะ claim บัญชี (login เว็บแล้ว) หรือยังไม่ claim ก็ตาม
//
// ที่มาของข้อมูลจริง (แหล่งเดียวต่อคน อ้างอิงด้วย discord_id):
//   - ยังไม่ claim -> ข้อมูลจริงอยู่ที่ legacy_accounts แถวนั้นเลย แก้ตรงนี้มีผลทันที
//   - claim แล้ว    -> ข้อมูลจริงย้ายไปอยู่ที่ customers (points/exp) + player_stats
//                      (duels/champion/top3/top5/last_active) ตั้งแต่วินาทีที่ claim
//                      ส่วน legacy_accounts แถวเดิมจะถูก "แช่แข็ง" ไว้เป็นประวัติ ไม่อัปเดตอีก
//
// หน้านี้เช็คให้อัตโนมัติว่า discord_id นั้นๆ ควรอ่าน/เขียนที่ไหน แอดมินไม่ต้องรู้เบื้องหลัง
// ----------------------------------------------------------------------------

type PlayerRow = {
  key: string
  source: 'legacy' | 'customer'
  claimed: boolean
  claimedAt?: string | null
  legacyUid?: string
  customerId?: string
  discordId: string | null
  uid: string
  name: string
  realName: string
  points: number
  exp: number
  duels: number
  champion: number
  top3: number
  top5: number
  lastActive: string
}

type EditForm = {
  name: string
  realName: string
  points: string
  exp: string
  duels: string
  champion: string
  top3: string
  top5: string
  lastActive: string
  reason: string
}

export default function AdminPlayersPage() {
  const [rows, setRows] = useState<PlayerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    checkAuthAndLoad()
  }, [])

  async function checkAuthAndLoad() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '/login'; return }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      window.location.href = '/catalog'
      return
    }

    loadPlayers()
  }

  async function loadPlayers() {
    setLoading(true)

    const [{ data: legacy, error: legacyErr }, { data: customers, error: customersErr }] = await Promise.all([
      supabase.from('legacy_accounts').select('*').order('imported_at', { ascending: true }),
      supabase.from('customers').select('*, player_stats(*)').not('discord_id', 'is', null)
    ])

    if (legacyErr) console.error('load legacy_accounts error:', legacyErr)
    if (customersErr) console.error('load customers error:', customersErr)

    const customerById = new Map((customers ?? []).map((c: any) => [c.id, c]))
    const usedCustomerIds = new Set<string>()
    const result: PlayerRow[] = []

    for (const l of legacy ?? []) {
      if (l.claimed_by && customerById.has(l.claimed_by)) {
        const c: any = customerById.get(l.claimed_by)
        usedCustomerIds.add(c.id)
        const stats = Array.isArray(c.player_stats) ? c.player_stats[0] : c.player_stats
        result.push({
          key: c.discord_id || l.uid,
          source: 'customer',
          claimed: true,
          claimedAt: l.claimed_at,
          legacyUid: l.uid,
          customerId: c.id,
          discordId: c.discord_id,
          uid: c.uid || l.uid,
          name: c.display_name || l.name || '',
          realName: c.real_name || l.real_name || '',
          points: c.points ?? 0,
          exp: c.exp ?? 0,
          duels: stats?.duels ?? 0,
          champion: stats?.champion ?? 0,
          top3: stats?.top3 ?? 0,
          top5: stats?.top5 ?? 0,
          lastActive: stats?.last_active ?? ''
        })
      } else if (l.claimed_by) {
        // claim แล้วแต่หา customer แถวจริงไม่เจอ (เคสผิดปกติ) — โชว์ข้อมูลเก่าที่แช่แข็งไว้พร้อมเตือน แก้ไขไม่ได้จากหน้านี้
        result.push({
          key: l.discord_id || l.uid,
          source: 'legacy',
          claimed: true,
          claimedAt: l.claimed_at,
          legacyUid: l.uid,
          discordId: l.discord_id,
          uid: l.uid,
          name: l.name || '',
          realName: l.real_name || '',
          points: l.points,
          exp: l.exp,
          duels: l.duels,
          champion: l.champion,
          top3: l.top3,
          top5: l.top5,
          lastActive: l.last_active || ''
        })
      } else {
        result.push({
          key: l.discord_id || l.uid,
          source: 'legacy',
          claimed: false,
          legacyUid: l.uid,
          discordId: l.discord_id,
          uid: l.uid,
          name: l.name || '',
          realName: l.real_name || '',
          points: l.points,
          exp: l.exp,
          duels: l.duels,
          champion: l.champion,
          top3: l.top3,
          top5: l.top5,
          lastActive: l.last_active || ''
        })
      }
    }

    // customers ที่มี discord_id แต่ไม่เคยผ่าน legacy_accounts เลย (สมัครใหม่ล้วนๆ)
    for (const c of (customers ?? []) as any[]) {
      if (usedCustomerIds.has(c.id)) continue
      const stats = Array.isArray(c.player_stats) ? c.player_stats[0] : c.player_stats
      result.push({
        key: c.discord_id,
        source: 'customer',
        claimed: true,
        customerId: c.id,
        discordId: c.discord_id,
        uid: c.uid || '',
        name: c.display_name || '',
        realName: c.real_name || '',
        points: c.points ?? 0,
        exp: c.exp ?? 0,
        duels: stats?.duels ?? 0,
        champion: stats?.champion ?? 0,
        top3: stats?.top3 ?? 0,
        top5: stats?.top5 ?? 0,
        lastActive: stats?.last_active ?? ''
      })
    }

    result.sort((a, b) => b.points - a.points)
    setRows(result)
    setLoading(false)
  }

  function startEdit(row: PlayerRow) {
    setEditingKey(row.key)
    setEditForm({
      name: row.name,
      realName: row.realName,
      points: String(row.points),
      exp: String(row.exp),
      duels: String(row.duels),
      champion: String(row.champion),
      top3: String(row.top3),
      top5: String(row.top5),
      lastActive: row.lastActive,
      reason: 'ปรับแต้มโดยแอดมิน (หน้า /admin/players)'
    })
  }

  function cancelEdit() {
    setEditingKey(null)
    setEditForm(null)
  }

  async function saveEdit(row: PlayerRow) {
    if (!editForm) return
    setSaving(true)

    const num = (v: string) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : 0
    }

    if (row.source === 'legacy') {
      const { error } = await supabase
        .from('legacy_accounts')
        .update({
          name: editForm.name,
          real_name: editForm.realName,
          points: num(editForm.points),
          exp: num(editForm.exp),
          duels: num(editForm.duels),
          champion: num(editForm.champion),
          top3: num(editForm.top3),
          top5: num(editForm.top5),
          last_active: editForm.lastActive
        })
        .eq('uid', row.legacyUid)

      if (error) {
        alert('บันทึกไม่สำเร็จ: ' + error.message)
        setSaving(false)
        return
      }
    } else {
      const pointsDelta = num(editForm.points) - row.points
      const expDelta = num(editForm.exp) - row.exp

      if (pointsDelta !== 0 || expDelta !== 0) {
        const { data, error } = await supabase.rpc('admin_adjust_wallet', {
          p_discord_id: row.discordId,
          p_points_delta: pointsDelta,
          p_exp_delta: expDelta,
          p_reason: editForm.reason || 'ปรับแต้มโดยแอดมิน (หน้า /admin/players)'
        })

        if (error || data?.success === false) {
          alert('ปรับแต้ม/EXP ไม่สำเร็จ: ' + (error?.message || data?.reason))
          setSaving(false)
          return
        }
      }

      const { error: statsError } = await supabase
        .from('player_stats')
        .upsert({
          user_id: row.customerId,
          duels: num(editForm.duels),
          champion: num(editForm.champion),
          top3: num(editForm.top3),
          top5: num(editForm.top5),
          last_active: editForm.lastActive
        }, { onConflict: 'user_id' })

      if (statsError) {
        alert('บันทึกสถิติไม่สำเร็จ: ' + statsError.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    cancelEdit()
    loadPlayers()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const filtered = rows.filter(r => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      (r.discordId ?? '').toLowerCase().includes(q) ||
      r.uid.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.realName.toLowerCase().includes(q)
    )
  })

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">กำลังโหลด...</div>

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <a href="/admin" className="text-blue-500 text-sm">← จัดการสินค้า</a>
            <a href="/admin/orders" className="text-green-600 text-sm">จัดการ Order</a>
            <a href="/admin/redeems" className="text-amber-500 text-sm">จัดการการแลก</a>
            <h1 className="font-bold text-gray-800">จัดการแต้ม / EXP ผู้เล่น</h1>
          </div>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-500">
            ออกจากระบบ
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาด้วยชื่อ, UID หรือ Discord ID"
            className="border rounded px-3 py-2 text-sm w-full sm:w-80"
          />
          <span className="text-xs text-gray-400">
            ทั้งหมด {rows.length} คน · claim แล้ว {rows.filter(r => r.claimed).length} · ยังไม่ claim {rows.filter(r => !r.claimed).length}
          </span>
        </div>

        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400">ไม่พบผู้เล่น</div>
          )}

          {filtered.map(row => {
            const isEditing = editingKey === row.key
            const isOrphan = row.claimed && row.source === 'legacy'

            return (
              <div key={row.key} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-800">{row.name || '(ไม่มีชื่อ)'}</span>
                      {row.realName && <span className="text-sm text-gray-400">({row.realName})</span>}
                      {row.claimed ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">claim แล้ว</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">ยังไม่ claim</span>
                      )}
                      {isOrphan && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          claim แล้วแต่หา customer ไม่เจอ — แก้ตรงนี้ไม่ได้ ต้องเช็คฐานข้อมูล
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      UID: {row.uid || '-'} · Discord ID: {row.discordId || '-'}
                    </div>
                  </div>

                  {!isOrphan && (
                    isEditing ? (
                      <div className="flex gap-2 shrink-0">
                        <button
                          disabled={saving}
                          onClick={() => saveEdit(row)}
                          className="text-sm bg-blue-500 text-white px-3 py-1.5 rounded hover:bg-blue-600 disabled:opacity-50"
                        >
                          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                        </button>
                        <button
                          disabled={saving}
                          onClick={cancelEdit}
                          className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-200"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(row)}
                        className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-200 shrink-0"
                      >
                        แก้ไข
                      </button>
                    )
                  )}
                </div>

                {isEditing && editForm ? (
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {row.source === 'legacy' && (
                      <>
                        <Field label="ชื่อเล่น">
                          <input className="border rounded px-2 py-1 w-full text-sm" value={editForm.name}
                            onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                        </Field>
                        <Field label="ชื่อจริง">
                          <input className="border rounded px-2 py-1 w-full text-sm" value={editForm.realName}
                            onChange={e => setEditForm({ ...editForm, realName: e.target.value })} />
                        </Field>
                      </>
                    )}
                    <Field label="แต้ม (points)">
                      <input type="number" className="border rounded px-2 py-1 w-full text-sm" value={editForm.points}
                        onChange={e => setEditForm({ ...editForm, points: e.target.value })} />
                    </Field>
                    <Field label="EXP">
                      <input type="number" className="border rounded px-2 py-1 w-full text-sm" value={editForm.exp}
                        onChange={e => setEditForm({ ...editForm, exp: e.target.value })} />
                    </Field>
                    <Field label="ดวล (duels)">
                      <input type="number" className="border rounded px-2 py-1 w-full text-sm" value={editForm.duels}
                        onChange={e => setEditForm({ ...editForm, duels: e.target.value })} />
                    </Field>
                    <Field label="แชมป์">
                      <input type="number" className="border rounded px-2 py-1 w-full text-sm" value={editForm.champion}
                        onChange={e => setEditForm({ ...editForm, champion: e.target.value })} />
                    </Field>
                    <Field label="Top 3">
                      <input type="number" className="border rounded px-2 py-1 w-full text-sm" value={editForm.top3}
                        onChange={e => setEditForm({ ...editForm, top3: e.target.value })} />
                    </Field>
                    <Field label="Top 5">
                      <input type="number" className="border rounded px-2 py-1 w-full text-sm" value={editForm.top5}
                        onChange={e => setEditForm({ ...editForm, top5: e.target.value })} />
                    </Field>
                    <Field label="งานล่าสุด (last active)">
                      <input className="border rounded px-2 py-1 w-full text-sm" value={editForm.lastActive}
                        onChange={e => setEditForm({ ...editForm, lastActive: e.target.value })} />
                    </Field>
                    {row.source === 'customer' && (
                      <Field label="หมายเหตุการปรับแต้ม (ลง log)">
                        <input className="border rounded px-2 py-1 w-full text-sm" value={editForm.reason}
                          onChange={e => setEditForm({ ...editForm, reason: e.target.value })} />
                      </Field>
                    )}
                    {row.source === 'customer' && (
                      <div className="col-span-2 sm:col-span-4 text-xs text-gray-400">
                        คนนี้ claim บัญชีแล้ว: ชื่อ/UID แก้ที่หน้านี้ไม่ได้ (ผูกกับบัญชี login) แต่แต้ม/EXP/สถิติแก้ได้ตามปกติ
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2 text-sm">
                    <Stat label="แต้ม" value={row.points} />
                    <Stat label="EXP" value={row.exp} />
                    <Stat label="ดวล" value={row.duels} />
                    <Stat label="แชมป์" value={row.champion} />
                    <Stat label="Top3" value={row.top3} />
                    <Stat label="Top5" value={row.top5} />
                    <div className="col-span-3 sm:col-span-6 text-xs text-gray-400">
                      งานล่าสุด: {row.lastActive || '-'}
                      {row.claimedAt && <> · claim เมื่อ {new Date(row.claimedAt).toLocaleDateString('th-TH')}</>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}

function Field({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      {children}
    </label>
  )
}

function Stat({ label, value }: { label: string, value: number }) {
  return (
    <div className="bg-gray-50 rounded px-2 py-1.5 text-center">
      <div className="font-bold text-gray-800">{value}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  )
}
