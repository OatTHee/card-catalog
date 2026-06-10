'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Header from '@/components/Header'

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

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      loadOrders(session.user.id)
    })
  }, [])

  async function loadOrders(userId: string) {
  const { data: ordersData } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('customer_id', userId)
    .order('created_at', { ascending: false })
  setOrders(ordersData ?? [])
  setLoading(false)
}

  if (loading) return <div className="min-h-screen bg-blue-50 flex items-center justify-center">กำลังโหลด...</div>

  return (
    <main className="min-h-screen bg-blue-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h2 className="font-bold text-blue-900 text-lg mb-4">คำสั่งซื้อของฉัน</h2>
        {orders.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center shadow-sm">
            <p className="text-gray-400 mb-4">ยังไม่มีคำสั่งซื้อ</p>
            <a href="/catalog" className="text-blue-500 text-sm">← กลับไปเลือกสินค้า</a>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(order => {
  const s = statusLabel[order.status]
  return (
    <div key={order.id} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-gray-800">คำสั่งซื้อ #{order.id.slice(0, 8)}</p>
          <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString('th-TH')}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${s.color}`}>{s.label}</span>
      </div>

      {/* รายการสินค้า */}
      <div className="space-y-1 border-t pt-3">
        {order.order_items?.map((item: any) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span className="text-gray-600">{item.name} x{item.quantity}</span>
            <span className="text-gray-800">฿{item.price * item.quantity}</span>
          </div>
        ))}
        <div className="flex justify-between text-xs text-gray-400 pt-1">
          <span>ค่าส่ง</span>
          <span>฿{order.shipping_fee}</span>
        </div>
        <div className="flex justify-between font-bold text-blue-900 border-t pt-1">
          <span>รวม</span>
          <span>฿{order.total}</span>
        </div>
      </div>

      {/* เลขพัสดุ */}
      {order.tracking_number && (
        <div className="bg-blue-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">เลขพัสดุ</p>
          <p className="font-bold text-blue-700 text-lg">{order.tracking_number}</p>
          <p className="text-xs text-gray-400 mt-1">นำเลขนี้ไปเช็คที่เว็บขนส่งได้เลยครับ</p>
        </div>
      )}
    </div>
  )
})}
          </div>
        )}
      </div>
    </main>
  )
}