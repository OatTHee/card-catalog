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

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [filter, setFilter] = useState<'active' | 'all'>('active')

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

    const ordersWithItems = await Promise.all((ordersData ?? []).map(async order => {
      const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id)
      const { data: addr } = await supabase.from('shipping_addresses').select('*').eq('id', order.shipping_address_id).single()
      const all = items ?? []
      const hasPre = all.some((i: any) => i.is_preorder)
      const hasNormal = all.some((i: any) => !i.is_preorder)
      // แยกส่ง 2 รอบ = มีทั้งของพรีและของพร้อมส่ง และลูกค้าไม่ได้ติ๊กให้ส่งพร้อมกัน
      const isSplit = hasPre && hasNormal && !order.ship_together
      return { ...order, items: all, address: addr, hasPre, hasNormal, isSplit }
    }))

    // หน้านี้ดูแลเฉพาะ "ของพร้อมส่ง"
    //   ออเดอร์ที่เป็นของพรีล้วน -> ไปหน้า /admin/preorders
    //   ออเดอร์ปนกันที่ลูกค้าติ๊กให้ส่งพร้อมของพรี -> ไปหน้า /admin/preorders ทั้งออเดอร์
    const visible = ordersWithItems.filter(o => o.hasNormal && !(o.hasPre && o.ship_together))

    setOrders(visible)
    setLoading(false)
  }

  async function handleUpdateStatus(orderId: string, status: string) {
    await supabase.from('orders').update({ status }).eq('id', orderId)
    loadOrders()
    if (selectedOrder?.id === orderId) {
      setSelectedOrder((prev: any) => ({ ...prev, status }))
    }
  }

  async function handleUpdateTracking(orderId: string, tracking: string) {
    await supabase.from('orders').update({ tracking_number: tracking, status: 'shipping' }).eq('id', orderId)
    loadOrders()
    setSelectedOrder(null)
  }

  // ค้างอยู่ = ยังไม่ได้ส่งถึงมือลูกค้า และไม่ได้ถูกยกเลิก
  const isActive = (o: any) => o.status !== 'delivered' && o.status !== 'cancelled'
  const activeCount = orders.filter(isActive).length
  const visibleOrders = filter === 'active' ? orders.filter(isActive) : orders

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">กำลังโหลด...</div>

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <a href="/admin" className="text-blue-500 text-sm">← จัดการสินค้า</a>
            <a href="/admin/preorders" className="text-orange-500 text-sm">จัดการ Pre-order</a>
            <a href="/admin/redeems" className="text-amber-500 text-sm">จัดการการแลก</a>
            <a href="/admin/players" className="text-purple-500 text-sm">จัดการแต้ม/EXP</a>
            <a href="/admin/managebag" className="text-teal-600 text-sm">จัดการกระเป๋า</a>
            <h1 className="font-bold text-gray-800">จัดการ Order</h1>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setFilter('active')}
              className={`text-xs px-3 py-1 rounded-md ${filter === 'active' ? 'bg-white shadow-sm text-gray-800 font-medium' : 'text-gray-500'}`}
            >
              ค้างอยู่ <span className="text-gray-400">{activeCount}</span>
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`text-xs px-3 py-1 rounded-md ${filter === 'all' ? 'bg-white shadow-sm text-gray-800 font-medium' : 'text-gray-500'}`}
            >
              ทั้งหมด <span className="text-gray-400">{orders.length}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="space-y-3">
          {visibleOrders.length === 0 && (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400">
              {filter === 'active' ? 'ไม่มีออเดอร์ค้างอยู่ 🎉' : 'ยังไม่มีคำสั่งซื้อ'}
            </div>
          )}
          {visibleOrders.map(order => {
            const s = statusLabel[order.status] ?? { label: order.status, color: 'bg-gray-100 text-gray-600' }
            return (
              <div key={order.id} className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-800">#{order.id.slice(0, 8)}</p>
                    <p className="text-sm text-gray-500">{order.customers?.display_name} | {order.customers?.email}</p>
                    <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleString('th-TH')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-blue-600">฿{order.total}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                  </div>
                </div>

                {/* รายการสินค้า */}
                <div className="mt-3 space-y-1">
                  {(order.isSplit ? order.items.filter((i: any) => !i.is_preorder) : order.items).map((item: any) => (
                    <p key={item.id} className="text-xs text-gray-500">{item.name} x{item.quantity} — ฿{item.price * item.quantity}</p>
                  ))}
                </div>
                {order.isSplit && (
                  <p className="mt-2 text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded px-2 py-1">
                    ออเดอร์นี้แยกส่ง 2 รอบ — ของพรีออเดอร์อยู่ที่หน้า{' '}
                    <a href="/admin/preorders" className="underline font-medium">จัดการ Pre-order</a>
                    {' '}(ยอด ฿{order.total} รวมค่าส่ง 2 รอบแล้ว)
                  </p>
                )}

                {/* ที่อยู่ */}
                {order.address && (
                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-500">
                    {order.address.name} | {order.address.phone} | {order.address.address} {order.address.district} {order.address.province} {order.address.postal_code}
                  </div>
                )}

                {/* สลิป */}
                {order.slip_url && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-1">สลิปการโอน</p>
                    <img src={order.slip_url} className="h-32 object-contain rounded border cursor-pointer"
                      onClick={() => window.open(order.slip_url, '_blank')} />
                  </div>
                )}

                {/* tracking */}
                {order.tracking_number && (
                  <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                    <span className="text-gray-500">เลขพัสดุ: </span>
                    <span className="font-bold text-blue-700">{order.tracking_number}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {order.status === 'pending_payment' && (
                    <>
                      <button onClick={() => handleUpdateStatus(order.id, 'paid')}
                        className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600">
                        ✓ ยืนยันรับเงิน
                      </button>
                      <button onClick={() => handleUpdateStatus(order.id, 'cancelled')}
                        className="text-xs bg-red-100 text-red-600 px-3 py-1 rounded hover:bg-red-200">
                        ✕ ยกเลิก
                      </button>
                    </>
                  )}
                  {order.status === 'paid' && (
                    <TrackingInput orderId={order.id} onSave={handleUpdateTracking} />
                  )}
                  {order.status === 'shipping' && (
                    <button onClick={() => handleUpdateStatus(order.id, 'delivered')}
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

function TrackingInput({ orderId, onSave }: { orderId: string, onSave: (id: string, tracking: string) => void }) {
  const [tracking, setTracking] = useState('')
  return (
    <div className="flex gap-2 items-center">
      <input
        value={tracking}
        onChange={e => setTracking(e.target.value)}
        placeholder="เลขพัสดุ"
        className="border rounded px-2 py-1 text-xs"
      />
      <button
        onClick={() => tracking && onSave(orderId, tracking)}
        className="text-xs bg-purple-500 text-white px-3 py-1 rounded hover:bg-purple-600"
      >
        บันทึกและจัดส่ง
      </button>
    </div>
  )
}