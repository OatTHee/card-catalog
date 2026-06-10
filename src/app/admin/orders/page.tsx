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

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
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
      return { ...order, items: items ?? [], address: addr }
    }))

    setOrders(ordersWithItems)
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

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">กำลังโหลด...</div>

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <a href="/admin" className="text-blue-500 text-sm">← จัดการสินค้า</a>
            <h1 className="font-bold text-gray-800">จัดการ Order</h1>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="space-y-3">
          {orders.length === 0 && (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400">ยังไม่มีคำสั่งซื้อ</div>
          )}
          {orders.map(order => {
            const s = statusLabel[order.status]
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
                  {order.items.map((item: any) => (
                    <p key={item.id} className="text-xs text-gray-500">{item.name} x{item.quantity} — ฿{item.price * item.quantity}</p>
                  ))}
                </div>

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