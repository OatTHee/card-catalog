'use client'

import { useEffect, useState } from 'react'
import { getCart, removeFromCart, updateQuantity, isPromoLine, CartItem } from '@/lib/cart'
import { createClient } from '@supabase/supabase-js'
import Header from '@/components/Header'
import { SHOP_CLOSED } from '@/lib/shopStatus'
import { loadVariantStockInfo, splitLine, splitWarning, VariantStockInfo } from '@/lib/preorder'
import { groupCartBySeller, variantIdsOfCart, groupShipping, groupTotal, SellerGroup } from '@/lib/cartGroups'
import Footer from '@/components/Footer'
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function CartPage() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<any>(null)
  const [stockInfo, setStockInfo] = useState<Map<string, VariantStockInfo>>(new Map())

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    loadCart()
  }, [])

  // ข้อมูลร้าน (ชื่อ/ค่าส่ง) มาพร้อมกับสต็อกใน query เดียว — ไม่ต้องอ่าน settings.shipping_fee อีกแล้ว
  async function loadCart() {
    const currentCart = getCart()
    const { info } = await loadVariantStockInfo(supabase, variantIdsOfCart(currentCart))
    setStockInfo(info)
    setCart(currentCart)
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

  const groups = groupCartBySeller(cart, stockInfo)
  // หน้าตะกร้าแสดงค่าส่งแบบยังไม่ติ๊ก "ส่งพร้อมกัน" (เลือกได้ที่หน้าชำระเงิน)
  const shippingTotal = groups.reduce((sum, g) => sum + groupShipping(g, false), 0)
  const subtotal = groups.reduce((sum, g) => sum + g.subtotal, 0)
  const total = subtotal + shippingTotal

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
            {groups.length > 1 && (
              <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                🏬 ตะกร้านี้มีสินค้าจาก {groups.length} ร้าน — จะถูกแยกเป็น {groups.length} ออเดอร์
                คิดค่าส่งแยกตามร้าน และต้องโอน/แนบสลิปแยกใบ
              </p>
            )}

            {groups.map(group => (
              <div key={group.sellerId ?? 'unknown'} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
                  <span className="text-sm font-semibold text-blue-900">
                    🏬 {group.seller?.name ?? 'ไม่ทราบร้าน'}
                  </span>
                  <span className="text-xs text-blue-700">ค่าส่ง ฿{group.shippingFee}</span>
                </div>

                <div className="divide-y">
                  {group.items.map(item => (
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
                        {(() => {
                          const warning = splitWarning(
                            splitLine(stockInfo.get(item.variantId), item.quantity),
                            stockInfo.get(item.variantId)?.isPreorderProduct ?? false
                          )
                          return warning && <p className="text-xs text-orange-700 mt-1">⚠️ {warning}</p>
                        })()}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <button onClick={() => handleRemove(item.variantId)} className="text-xs text-red-400 hover:text-red-600">ลบ</button>
                        {isPromoLine(item) ? (
                          <span className="text-xs text-gray-400">1 ชุด</span>
                        ) : (
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleQuantity(item.variantId, item.quantity - 1)}
                            className="w-6 h-6 rounded border text-sm flex items-center justify-center hover:bg-gray-50">-</button>
                          <span className="text-sm w-6 text-center">{item.quantity}</span>
                          <button onClick={() => handleQuantity(item.variantId, item.quantity + 1)}
                            className="w-6 h-6 rounded border text-sm flex items-center justify-center hover:bg-gray-50">+</button>
                        </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <GroupSummary group={group} />
              </div>
            ))}

            <div className="bg-white rounded-xl shadow-sm p-4 space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>ยอดสินค้าทั้งหมด</span>
                <span>฿{subtotal}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>ค่าส่งทั้งหมด{groups.length > 1 ? ` (${groups.length} ร้าน)` : ''}</span>
                <span>฿{shippingTotal}</span>
              </div>
              <div className="flex justify-between font-bold text-blue-900 pt-2 border-t">
                <span>รวมทั้งหมด</span>
                <span>฿{total}</span>
              </div>
            </div>

            {SHOP_CLOSED ? (
              <button disabled
                className="block w-full bg-gray-200 text-gray-500 text-center py-3 rounded-xl font-medium cursor-not-allowed">
                ปิดการขายชั่วคราว
              </button>
            ) : session ? (
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
      <Footer />
    </main>
  )
}

function GroupSummary({ group }: { group: SellerGroup }) {
  const shipping = groupShipping(group, false)
  const isSplit = shipping > group.shippingFee
  return (
    <div className="px-4 py-3 bg-gray-50 border-t space-y-1">
      <div className="flex justify-between text-xs text-gray-600">
        <span>ยอดสินค้า</span>
        <span>฿{group.subtotal}</span>
      </div>
      <div className="flex justify-between text-xs text-gray-600">
        <span>ค่าส่ง{isSplit ? ' (ส่ง 2 รอบ)' : ''}</span>
        <span>฿{shipping}</span>
      </div>
      <div className="flex justify-between text-sm font-semibold text-blue-900">
        <span>รวมร้านนี้</span>
        <span>฿{groupTotal(group, false)}</span>
      </div>
    </div>
  )
}
