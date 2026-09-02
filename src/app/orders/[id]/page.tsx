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

  const hasPre = items.some((i: any) => i.is_preorder)
  const hasNormal = items.some((i: any) => !i.is_preorder)
  // แยกส่ง 2 รอบ = มีทั้งของพร้อมส่งและของพรี และไม่ได้เลือกให้ส่งพร้อมกัน
  const isSplit = hasPre && hasNormal && !order.ship_together
  const s = statusLabel[order.status]
  const ps = statusLabel[order.preorder_status ?? 'pending_payment']

  return (
    <main className="min-h-screen bg-blue-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <a href="/orders" className="text-blue-500 text-sm">← กลับ</a>
          <h2 className="font-bold text-blue-900 text-lg">คำสั่งซื้อ #{order.id.slice(0, 8)}</h2>
        </div>

        {/* สถานะ */}
        {isSplit ? (
          <div className="space-y-3">
            <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              📦 ออเดอร์นี้แยกส่ง 2 รอบ — ของพร้อมส่งไปก่อน ของพรีออเดอร์ตามไปทีหลัง จึงคิดค่าส่ง 2 รอบ
            </p>

            <div className="bg-white rounded-xl shadow-sm p-4">
              <p className="text-sm font-semibold text-gray-800 mb-2">รอบที่ 1 · ของพร้อมส่ง</p>
              <span className={`text-sm px-3 py-1 rounded-full font-medium ${s.color}`}>{s.label}</span>
              <div className="mt-2 space-y-1">
                {items.filter((i: any) => !i.is_preorder).map((item: any) => (
                  <p key={item.id} className="text-xs text-gray-500">{item.name} x{item.quantity}</p>
                ))}
              </div>
              {order.tracking_number && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-gray-500">เลขพัสดุ</p>
                  <p className="font-bold text-blue-900">{order.tracking_number}</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-orange-400">
              <p className="text-sm font-semibold text-gray-800 mb-2">รอบที่ 2 · สินค้าพรีออเดอร์</p>
              <span className={`text-sm px-3 py-1 rounded-full font-medium ${ps.color}`}>{ps.label}</span>
              <div className="mt-2 space-y-1">
                {items.filter((i: any) => i.is_preorder).map((item: any) => (
                  <p key={item.id} className="text-xs text-gray-500">{item.name} x{item.quantity}</p>
                ))}
              </div>
              {order.preorder_tracking_number && (
                <div className="mt-3 p-3 bg-orange-50 rounded-lg">
                  <p className="text-xs text-gray-500">เลขพัสดุ</p>
                  <p className="font-bold text-orange-700">{order.preorder_tracking_number}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <span className={`text-sm px-3 py-1 rounded-full font-medium ${s.color}`}>{s.label}</span>
            {hasPre && (
              <p className="mt-3 text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                {hasNormal
                  ? '📦 ออเดอร์นี้มีสินค้าพรีออเดอร์ และคุณเลือกให้ส่งพร้อมกันรอบเดียว — จะจัดส่งเมื่อของพรีเข้าครบ'
                  : '📦 ออเดอร์พรีออเดอร์ — จะจัดส่งเมื่อของเข้า'}
              </p>
            )}
            {order.tracking_number && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-gray-500">เลขพัสดุ</p>
                <p className="font-bold text-blue-900">{order.tracking_number}</p>
              </div>
            )}
          </div>
        )}

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
                <span className="text-gray-600">
                  {item.name} x{item.quantity}
                  {item.is_preorder && (
                    <span className="ml-1 text-[10px] text-orange-600 bg-orange-50 border border-orange-200 rounded px-1 py-0.5">พรีออเดอร์</span>
                  )}
                </span>
                <span className="font-medium">฿{item.price * item.quantity}</span>
              </div>
            ))}
          </div>
          <div className="border-t mt-3 pt-3 space-y-1">
            <div className="flex justify-between text-sm text-gray-500">
              <span>ค่าส่ง{isSplit ? ' (2 รอบ)' : ''}</span><span>฿{order.shipping_fee}</span>
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