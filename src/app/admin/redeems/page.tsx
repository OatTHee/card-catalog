'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const statusLabel: Record<string, { label: string, color: string }> = {
  'กำลังตรวจสอบสลิป': { label: 'รอตรวจสอบสลิป', color: 'bg-yellow-100 text-yellow-700' },
  'กำลังเตรียมของ': { label: 'กำลังเตรียมของ', color: 'bg-blue-100 text-blue-700' },
  'ส่งแล้ว': { label: 'ส่งแล้ว', color: 'bg-green-100 text-green-700' },
  'สลิปไม่ถูกต้อง': { label: 'สลิปไม่ถูกต้อง', color: 'bg-red-100 text-red-700' },
}

export default function AdminRedeemsPage() {
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'active' | 'all'>('active')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      loadHistory()
    })
  }, [])

  async function loadHistory() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('redeem_history')
      .select('*, customers(display_name, real_name, email)')
      .order('created_at', { ascending: false })

    // ดึงชื่อผู้ใช้เก่า (ยังไม่เคลม) จาก legacy_accounts มาแปะเพิ่ม
    const legacyUids = [...new Set((rows ?? []).filter(r => !r.customer_id && r.legacy_uid).map(r => r.legacy_uid))]
    let legacyMap: Record<string, any> = {}
    if (legacyUids.length > 0) {
      const { data: legacyRows } = await supabase
        .from('legacy_accounts')
        .select('uid, name')
        .in('uid', legacyUids)
      legacyMap = Object.fromEntries((legacyRows ?? []).map(l => [l.uid, l]))
    }

    setHistory((rows ?? []).map(r => ({ ...r, legacy: r.legacy_uid ? legacyMap[r.legacy_uid] : null })))
    setLoading(false)
  }

  async function handleUpdateStatus(id: string, status: string) {
    await supabase.from('redeem_history').update({ status }).eq('id', id)
    loadHistory()
  }

  const visibleHistory = filter === 'active'
    ? history.filter(h => h.status !== 'ส่งแล้ว')
    : history

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">กำลังโหลด...</div>

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <a href="/admin" className="text-blue-500 text-sm">← จัดการสินค้า</a>
            <a href="/admin/orders" className="text-blue-500 text-sm">จัดการ Order</a>
            <a href="/admin/players" className="text-purple-500 text-sm">จัดการแต้ม/EXP</a>
            <h1 className="font-bold text-gray-800">จัดการการแลก</h1>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setFilter('active')}
              className={`text-xs px-3 py-1 rounded-md ${filter === 'active' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
            >
              ค้างอยู่
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`text-xs px-3 py-1 rounded-md ${filter === 'all' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
            >
              ทั้งหมด
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="space-y-3">
          {visibleHistory.length === 0 && (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400">
              {filter === 'active' ? 'ไม่มีรายการค้างอยู่' : 'ยังไม่มีประวัติการแลก'}
            </div>
          )}
          {visibleHistory.map(h => {
            const s = statusLabel[h.status] ?? { label: h.status, color: 'bg-gray-100 text-gray-600' }
            const customerName = h.customers?.display_name || h.customers?.real_name
              || h.legacy?.name || (h.legacy_uid ? `(ยังไม่เคลม) ${h.legacy_uid}` : 'ไม่ทราบชื่อ')

            return (
              <div key={h.id} className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-800">#{h.id.slice(0, 8)}</p>
                    <p className="text-sm text-gray-500">
                      {customerName}{h.customers?.email ? ` | ${h.customers.email}` : ''}
                    </p>
                    <p className="text-xs text-gray-400">{new Date(h.created_at).toLocaleString('th-TH')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-amber-600">✨ {h.points_used.toLocaleString()}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                  </div>
                </div>

                {/* รายการที่แลก (รวมผลซองสุ่มที่แปะไว้ในชื่อ) */}
                <div className="mt-3 p-2 bg-gray-50 rounded text-xs text-gray-600 whitespace-pre-line leading-relaxed">
                  {h.item_name}
                </div>

                {h.is_merge_order && (
                  <p className="mt-2 text-xs text-orange-600">📦 ฝากส่งรวมกับออเดอร์ในแชท</p>
                )}

                {/* ที่อยู่จัดส่ง (snapshot ตอนแลก) */}
                {h.shipping_address && (
                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-500">
                    {h.shipping_address}
                  </div>
                )}

                {/* สลิปค่าส่ง */}
                {h.slip_url && h.slip_url !== 'ส่งฟรี' && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-1">สลิปค่าจัดส่ง</p>
                    <img src={h.slip_url} className="h-32 object-contain rounded border cursor-pointer"
                      onClick={() => window.open(h.slip_url, '_blank')} />
                  </div>
                )}
                {h.slip_url === 'ส่งฟรี' && (
                  <p className="mt-2 text-xs text-green-600">🎉 ส่งฟรี (ไม่ต้องแนบสลิปค่าส่ง)</p>
                )}

                {/* Actions */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {h.status === 'กำลังตรวจสอบสลิป' && (
                    <>
                      <button onClick={() => handleUpdateStatus(h.id, 'กำลังเตรียมของ')}
                        className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600">
                        ✓ ยืนยันสลิป / เตรียมของ
                      </button>
                      <button onClick={() => handleUpdateStatus(h.id, 'สลิปไม่ถูกต้อง')}
                        className="text-xs bg-red-100 text-red-600 px-3 py-1 rounded hover:bg-red-200">
                        ✕ สลิปไม่ถูกต้อง
                      </button>
                    </>
                  )}
                  {h.status === 'กำลังเตรียมของ' && (
                    <button onClick={() => handleUpdateStatus(h.id, 'ส่งแล้ว')}
                      className="text-xs bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600">
                      ✓ ส่งของแล้ว
                    </button>
                  )}
                  {h.status === 'สลิปไม่ถูกต้อง' && (
                    <button onClick={() => handleUpdateStatus(h.id, 'กำลังตรวจสอบสลิป')}
                      className="text-xs bg-yellow-100 text-yellow-700 px-3 py-1 rounded hover:bg-yellow-200">
                      ↺ กลับไปรอตรวจสอบ
                    </button>
                  )}
                  {h.status === 'ส่งแล้ว' && (
                    <button onClick={() => handleUpdateStatus(h.id, 'กำลังเตรียมของ')}
                      className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded hover:bg-gray-200">
                      ↺ ย้อนสถานะ
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
