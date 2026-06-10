'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { getCart, clearCart, CartItem } from '@/lib/cart'
import Header from '@/components/Header'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function CheckoutPage() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [addresses, setAddresses] = useState<any[]>([])
  const [selectedAddress, setSelectedAddress] = useState<string>('')
  const [shippingFee, setShippingFee] = useState(40)
  const [slipFile, setSlipFile] = useState<File | null>(null)
  const [slipPreview, setSlipPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      setSession(session)
      loadData(session.user.id)
    })
  }, [])

  async function loadData(userId: string) {
    const [{ data: addrs }, { data: settings }] = await Promise.all([
      supabase.from('shipping_addresses').select('*').eq('customer_id', userId).order('is_default', { ascending: false }),
      supabase.from('settings').select('value').eq('key', 'shipping_fee').single()
    ])
    setAddresses(addrs ?? [])
    if (addrs?.length) setSelectedAddress(addrs.find(a => a.is_default)?.id || addrs[0].id)
    if (settings) setShippingFee(Number(settings.value))
    setCart(getCart())
    setLoading(false)
  }

  function handleSlipChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSlipFile(file)
    setSlipPreview(URL.createObjectURL(file))
  }

  async function handleSubmit() {
    if (!selectedAddress || !slipFile || cart.length === 0) return
    setSubmitting(true)

    // เช็ค stock ก่อน
    for (const item of cart) {
      const { data: variant } = await supabase
        .from('product_variants').select('stock, name').eq('id', item.variantId).single()
      if (!variant || variant.stock < item.quantity) {
        alert(`สินค้า ${item.variantName} มีไม่พอครับ (เหลือ ${variant?.stock ?? 0})`)
        setSubmitting(false)
        return
      }
    }

    // อัปโหลดสลิป
    const ext = slipFile.name.split('.').pop()
    const fileName = `slips/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('products').upload(fileName, slipFile)
    if (uploadError) { alert('อัปโหลดสลิปไม่สำเร็จ'); setSubmitting(false); return }
    const { data: slipData } = supabase.storage.from('products').getPublicUrl(fileName)

    // สร้าง order
    const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
    const { data: order, error: orderError } = await supabase.from('orders').insert({
      customer_id: session.user.id,
      shipping_address_id: selectedAddress,
      subtotal,
      shipping_fee: shippingFee,
      total: subtotal + shippingFee,
      slip_url: slipData.publicUrl,
      status: 'pending_payment'
    }).select().single()

    if (orderError || !order) { alert('เกิดข้อผิดพลาด'); setSubmitting(false); return }

    // เพิ่ม order items และตัด stock
    for (const item of cart) {
      await supabase.from('order_items').insert({
        order_id: order.id,
        variant_id: item.variantId,
        name: `${item.productName} - ${item.variantName}`,
        price: item.price,
        quantity: item.quantity
      })
      await supabase.rpc('decrement_stock', {
  variant_id: item.variantId,
  amount: item.quantity
})
    }

    clearCart()
    window.location.href = `/orders/${order.id}`
  }

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)

  if (loading) return <div className="min-h-screen bg-blue-50 flex items-center justify-center">กำลังโหลด...</div>

  return (
    <main className="min-h-screen bg-blue-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <h2 className="font-bold text-blue-900 text-lg">สั่งซื้อสินค้า</h2>

        {/* ที่อยู่จัดส่ง */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-800">ที่อยู่จัดส่ง</h3>
            <a href="/profile" className="text-xs text-blue-500">จัดการที่อยู่</a>
          </div>
          {addresses.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-400 mb-2">ยังไม่มีที่อยู่จัดส่ง</p>
              <a href="/profile" className="text-sm text-blue-500">+ เพิ่มที่อยู่</a>
            </div>
          ) : (
            <div className="space-y-2">
              {addresses.map(addr => (
                <div key={addr.id}
                  onClick={() => setSelectedAddress(addr.id)}
                  className={`border rounded-lg p-3 cursor-pointer ${selectedAddress === addr.id ? 'border-blue-400 bg-blue-50' : 'hover:bg-gray-50'}`}>
                  <p className="text-sm font-medium">{addr.name} | {addr.phone}</p>
                  <p className="text-xs text-gray-500">{addr.address} {addr.district} {addr.province} {addr.postal_code}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* รายการสินค้า */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-semibold text-gray-800 mb-3">รายการสินค้า</h3>
          <div className="space-y-2">
            {cart.map(item => (
              <div key={item.variantId} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.productName} - {item.variantName} x{item.quantity}</span>
                <span className="font-medium">฿{item.price * item.quantity}</span>
              </div>
            ))}
          </div>
          <div className="border-t mt-3 pt-3 space-y-1">
            <div className="flex justify-between text-sm text-gray-500">
              <span>ค่าส่ง</span><span>฿{shippingFee}</span>
            </div>
            <div className="flex justify-between font-bold text-blue-900">
              <span>รวม</span><span>฿{subtotal + shippingFee}</span>
            </div>
          </div>
        </div>

        
  </div>
  {/* อัปโหลดสลิป */}
        <div className="bg-white rounded-xl shadow-sm p-4">
  <h3 className="font-semibold text-gray-800 mb-3">ชำระเงิน</h3>
  <div className="bg-blue-900/30 border border-blue-500/50 p-5 rounded-xl text-center mb-4">
    <img src="https://i.postimg.cc/RV9Z9KJh/004999184266566-20250920-153316.jpg"
      className="w-64 mx-auto mb-4 rounded-xl shadow-lg border-2 border-white/20" />
    <div className="text-left text-sm bg-white text-black p-4 rounded-xl mx-auto max-w-sm font-bold shadow-inner">
      <p className="mb-2 text-base">🏦 <b>กสิกร:</b> 8450260981 (ศรัณย์)</p>
      <p className="text-base">📱 <b>Wallet:</b> 094-7066766 (ศรัณย์)</p>
    </div>
  </div>
  <p className="text-xs text-gray-400 mb-3">โอนเงิน ฿{subtotal + shippingFee} แล้วแนบสลิปด้านล่าง</p>

        <button
          onClick={handleSubmit}
          disabled={submitting || !selectedAddress || !slipFile || cart.length === 0}
          className="w-full bg-blue-500 text-white py-3 rounded-xl font-medium hover:bg-blue-600 disabled:opacity-50"
        >
          {submitting ? 'กำลังดำเนินการ...' : 'ยืนยันคำสั่งซื้อ'}
        </button>
      </div>
    </main>
  )
}