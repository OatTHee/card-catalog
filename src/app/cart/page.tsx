'use client'

import { useEffect, useState } from 'react'
import { getCart, removeFromCart, updateQuantity, CartItem } from '@/lib/cart'
import { createClient } from '@supabase/supabase-js'
import Header from '@/components/Header'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function CartPage() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [shippingFee, setShippingFee] = useState(40)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    loadCart()
  }, [])

  async function loadCart() {
    const { data } = await supabase.from('settings').select('value').eq('key', 'shipping_fee').single()
    if (data) setShippingFee(Number(data.value))
    setCart(getCart())
    setLoading(false)
  }

  function handleRemove(variantId: string) {
    removeFromCart(variantId)
    setCart(getCart())
  }

  function handleQuantity(variantId: string, quantity: number) {
    updateQuantity(variantId, quantity)
    setCart(getCart())
  }

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const total = subtotal + (cart.length > 0 ? shippingFee : 0)

  if (loading) return <div className="min-h-screen bg-blue-50 flex items-center justify-center">กำลังโหลด...</div>

  return (
    <main className="min-h-screen bg-blue-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <h2 className="font-bold text-blue-900 text-lg">ตะกร้าสินค้า</h2>

        {cart.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center shadow-sm">
            <p className="text-gray-400 mb-4">ตะกร้าว่างเปล่า</p>
            <a href="/catalog" className="text-blue-500 text-sm hover:text-blue-700">← กลับไปเลือกสินค้า</a>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl shadow-sm divide-y">
              {cart.map(item => (
                <div key={item.variantId} className="p-4 flex gap-3">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} className="w-16 h-16 rounded-lg object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-blue-50 flex items-center justify-center text-2xl">🃏</div>
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-sm text-gray-800">{item.productName}</p>
                    <p className="text-xs text-gray-400">{item.variantName}</p>
                    <p className="text-blue-600 font-bold text-sm mt-1">฿{item.price}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <button onClick={() => handleRemove(item.variantId)} className="text-xs text-red-400 hover:text-red-600">ลบ</button>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleQuantity(item.variantId, item.quantity - 1)}
                        className="w-6 h-6 rounded border text-sm flex items-center justify-center hover:bg-gray-50">-</button>
                      <span className="text-sm w-6 text-center">{item.quantity}</span>
                      <button onClick={() => handleQuantity(item.variantId, item.quantity + 1)}
                        className="w-6 h-6 rounded border text-sm flex items-center justify-center hover:bg-gray-50">+</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>ยอดสินค้า</span>
                <span>฿{subtotal}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>ค่าส่ง</span>
                <span>฿{shippingFee}</span>
              </div>
              <div className="flex justify-between font-bold text-blue-900 pt-2 border-t">
                <span>รวมทั้งหมด</span>
                <span>฿{total}</span>
              </div>
            </div>

            {session ? (
              <a href="/checkout"
                className="block w-full bg-blue-500 text-white text-center py-3 rounded-xl font-medium hover:bg-blue-600">
                สั่งซื้อ
              </a>
            ) : (
              <a href="/login"
                className="block w-full bg-gray-300 text-white text-center py-3 rounded-xl font-medium">
                เข้าสู่ระบบเพื่อสั่งซื้อ
              </a>
            )}
          </>
        )}
      </div>
    </main>
  )
}