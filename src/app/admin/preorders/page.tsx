'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const statusLabel: Record<string, { label: string, color: string }> = {
  pending_payment: { label: 'รอตรวจสอบ', color: 'bg-yellow-100 text-yellow-700' },
  paid: { label: 'ชำระแล้ว', color: 'bg-blue-100 text-blue-700' },
  shipping: { label: 'กำลังจัดส่ง', color: 'bg-purple-100 text-purple-700' },
  delivered: { label: 'ส่งแล้ว', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700' },
}

type PreOrder = {
  id: string
  status: string
  preorder_status: string | null
  tracking_number: string | null
  preorder_tracking_number: string | null
  ship_together: boolean
  total: number
  created_at: string
  slip_url: string | null
  customers?: { display_name?: string, email?: string } | null
  items: any[]
  address: any
  hasPre: boolean
  hasNormal: boolean
  isSplit: boolean
}

export default function AdminPreordersPage() {
  const [orders, setOrders] = useState<PreOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      loadOrders()
    })
  }, [])

  async function loadOrders() {
    const { data: ordersData } = await supabase
      .from('orders').select('*, customers(display_name, email)')
      .order('created_at', { ascending: false })

    const withItems = await Promise.all((ordersData ?? []).map(async order => {
      const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id)
      const { data: addr } = await supabase.from('shipping_addresses').select('*').eq('id', order.shipping_address_id).single()
      const all = items ?? []
      const hasPre = all.some((i: any) => i.is_preorder)
      const hasNormal = all.some((i: any) => !i.is_preorder)
      const isSplit = hasPre && hasNormal && !order.ship_together
      return { ...order, items: all, address: addr, hasPre, hasNormal, isSplit } as PreOrder
    }))

    // หน้านี้ดูแลทุกออเดอร์ที่มีสินค้าพรีออเดอร์
    //   พรีล้วน / ปนกันแล้วลูกค้าติ๊กส่งพร้อมกัน -> คุมทั้งออเดอร์ที่นี่ (ใช้ status ตัวหลัก)
    //   ปนกันแล้วแยกส่ง                        -> คุมเฉพาะรอบพรี (ใช้ preorder_status)
    setOrders(withItems.filter(o => o.hasPre))
    setLoading(false)
  }

  // ออเดอร์ที่แยกส่งจะมีสถานะ/เลขพัสดุคนละชุดกับฝั่งของพร้อมส่ง
  function statusOf(o: PreOrder) {
    return o.isSplit ? (o.preorder_status ?? 'pending_payment') : o.status
  }
  function trackingOf(o: PreOrder) {
    return o.isSplit ? o.preorder_tracking_number : o.tracking_number
  }
  function itemsOf(o: PreOrder) {
    return o.isSplit ? o.items.filter((i: any) => i.is_preorder) : o.items
  }

  async function handleUpdateStatus(o: PreOrder, status: string) {
    const patch = o.isSplit ? { preorder_status: status } : { status }
    await supabase.from('orders').update(patch).eq('id', o.id)
    loadOrders()
  }

  async function handleUpdateTracking(o: PreOrder, tracking: string) {
    const patch = o.isSplit
      ? { preorder_tracking_number: tracking, preorder_status: 'shipping' }
      : { tracking_number: tracking, status: 'shipping' }
    await supabase.from('orders').update(patch).eq('id', o.id)
    loadOrders()
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">กำลังโหลด...</div>

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4 flex-wrap">
            <a href="/admin" className="text-blue-500 text-sm">← จัดการสินค้า</a>
            <a href="/admin/orders" className="text-green-600 text-sm">จัดการ Order</a>
            <a href="/admin/redeems" className="text-amber-500 text-sm">จัดการการแลก</a>
            <a href="/admin/players" className="text-purple-500 text-sm">จัดการแต้ม/EXP</a>
            <a href="/admin/managebag" className="text-teal-600 text-sm">จัดการกระเป๋า</a>
            <h1 className="font-bold text-gray-800">จัดการ Pre-order</h1>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <p className="text-xs text-gray-500 mb-3">
          รวมทุกออเดอร์ที่มีสินค้าพรีออเดอร์ — ออเดอร์ที่แยกส่ง 2 รอบจะคุมเฉพาะรอบพรีที่นี่
          ส่วนของพร้อมส่งอยู่ที่หน้า <a href="/admin/orders" className="text-green-600 underline">จัดการ Order</a>
        </p>

        <div className="space-y-3">
          {orders.length === 0 && (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400">ยังไม่มีคำสั่งซื้อพรีออเดอร์</div>
          )}
          {orders.map(order => {
            const st = statusOf(order)
            const s = statusLabel[st] ?? statusLabel.pending_payment
            const tracking = trackingOf(order)
            const shown = itemsOf(order)
            const shownSubtotal = shown.reduce((sum: number, i: any) => sum + i.price * i.quantity, 0)
            return (
              <div key={order.id} className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-orange-400">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-800">
                      #{order.id.slice(0, 8)}
                      {order.isSplit && (
                        <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">แยกส่ง 2 รอบ</span>
                      )}
                      {order.hasNormal && order.ship_together && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">ลูกค้าขอส่งพร้อมกัน</span>
                      )}
                      {!order.hasNormal && (
                        <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">พรีล้วน</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500">{order.customers?.display_name} | {order.customers?.email}</p>
                    <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleString('th-TH')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-orange-600">฿{shownSubtotal}</p>
                    {order.isSplit && <p className="text-[10px] text-gray-400">ยอดเต็มออเดอร์ ฿{order.total}</p>}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  {shown.map((item: any) => (
                    <p key={item.id} className="text-xs text-gray-500">
                      {item.name} x{item.quantity} — ฿{item.price * item.quantity}
                      {!item.is_preorder && <span className="ml-1 text-blue-500">(ของพร้อมส่ง)</span>}
                    </p>
                  ))}
                </div>

                {order.address && (
                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-500">
                    {order.address.name} | {order.address.phone} | {order.address.address} {order.address.district} {order.address.province} {order.address.postal_code}
                  </div>
                )}

                {order.slip_url && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-1">สลิปการโอน</p>
                    <img src={order.slip_url} className="h-32 object-contain rounded border cursor-pointer"
                      onClick={() => window.open(order.slip_url!, '_blank')} />
                  </div>
                )}

                {tracking && (
                  <div className="mt-2 p-2 bg-orange-50 rounded text-xs">
                    <span className="text-gray-500">เลขพัสดุ (รอบพรีออเดอร์): </span>
                    <span className="font-bold text-orange-700">{tracking}</span>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {st === 'pending_payment' && (
                    <>
                      <button onClick={() => handleUpdateStatus(order, 'paid')}
                        className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600">
                        ✓ ยืนยันรับเงิน
                      </button>
                      <button onClick={() => handleUpdateStatus(order, 'cancelled')}
                        className="text-xs bg-red-100 text-red-600 px-3 py-1 rounded hover:bg-red-200">
                        ✕ ยกเลิก
                      </button>
                    </>
                  )}
                  {st === 'paid' && (
                    <TrackingInput onSave={tracking => handleUpdateTracking(order, tracking)} />
                  )}
                  {st === 'shipping' && (
                    <button onClick={() => handleUpdateStatus(order, 'delivered')}
                      className="text-xs bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600">
                      ✓ ส่งแล้ว
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

function TrackingInput({ onSave }: { onSave: (tracking: string) => void }) {
  const [tracking, setTracking] = useState('')
  return (
    <div className="flex gap-2 items-center">
      <input
        value={tracking}
        onChange={e => setTracking(e.target.value)}
        placeholder="เลขพัสดุรอบพรีออเดอร์"
        className="border rounded px-2 py-1 text-xs"
      />
      <button
        onClick={() => tracking && onSave(tracking)}
        className="text-xs bg-orange-500 text-white px-3 py-1 rounded hover:bg-orange-600"
      >
        บันทึกและจัดส่ง
      </button>
    </div>
  )
}
