'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Header from '@/components/Header'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const statusLabel: Record<string, { label: string, color: string }> = {
  pending_payment: { label: 'รอตรวจสอบการชำระเงิน', color: 'bg-yellow-100 text-yellow-700' },
  paid: { label: 'ชำระเงินแล้ว', color: 'bg-blue-100 text-blue-700' },
  shipping: { label: 'กำลังจัดส่ง', color: 'bg-purple-100 text-purple-700' },
  delivered: { label: 'จัดส่งแล้ว', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'ยกเลิกแล้ว', color: 'bg-red-100 text-red-700' },
}

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [address, setAddress] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      loadOrder()
    })
  }, [])

  async function loadOrder() {
    const { data: orderData } = await supabase.from('orders').select('*').eq('id', params.id).single()
    if (!orderData) { window.location.href = '/orders'; return }

    const { data: itemsData } = await supabase.from('order_items').select('*').eq('order_id', params.id)
    const { data: addrData } = await supabase.from('shipping_addresses').select('*').eq('id', orderData.shipping_address_id).single()

    setOrder(orderData)
    setItems(itemsData ?? [])
    setAddress(addrData)
    setLoading(false)
  }

  if (loading) return <div className="min-h-screen bg-blue-50 flex items-center justify-center">กำลังโหลด...</div>
  if (!order) return null

  const s = statusLabel[order.status]

  return (
    <main className="min-h-screen bg-blue-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <a href="/orders" className="text-blue-500 text-sm">← กลับ</a>
          <h2 className="font-bold text-blue-900 text-lg">คำสั่งซื้อ #{order.id.slice(0, 8)}</h2>
        </div>

        {/* สถานะ */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <span className={`text-sm px-3 py-1 rounded-full font-medium ${s.color}`}>{s.label}</span>
          {order.tracking_number && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-gray-500">เลขพัสดุ</p>
              <p className="font-bold text-blue-900">{order.tracking_number}</p>
            </div>
          )}
        </div>

        {/* ที่อยู่จัดส่ง */}
        {address && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="font-semibold text-gray-800 mb-2">ที่อยู่จัดส่ง</h3>
            <p className="text-sm text-gray-600">{address.name} | {address.phone}</p>
            <p className="text-sm text-gray-500">{address.address} {address.district} {address.province} {address.postal_code}</p>
          </div>
        )}

        {/* รายการสินค้า */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-semibold text-gray-800 mb-3">รายการสินค้า</h3>
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.name} x{item.quantity}</span>
                <span className="font-medium">฿{item.price * item.quantity}</span>
              </div>
            ))}
          </div>
          <div className="border-t mt-3 pt-3 space-y-1">
            <div className="flex justify-between text-sm text-gray-500">
              <span>ค่าส่ง</span><span>฿{order.shipping_fee}</span>
            </div>
            <div className="flex justify-between font-bold text-blue-900">
              <span>รวม</span><span>฿{order.total}</span>
            </div>
          </div>
        </div>

        {/* สลิป */}
        {order.slip_url && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="font-semibold text-gray-800 mb-3">หลักฐานการโอนเงิน</h3>
            <img src={order.slip_url} className="w-full max-h-64 object-contain rounded-lg border" />
          </div>
        )}
      </div>
    </main>
  )
}