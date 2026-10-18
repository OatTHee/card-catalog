'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { getCart, clearCart, isPromoLine, CartItem } from '@/lib/cart'
import Header from '@/components/Header'
import { SHOP_CLOSED } from '@/lib/shopStatus'
import { loadVariantStockInfo, splitLine, splitWarning, VariantStockInfo } from '@/lib/preorder'
import { groupCartBySeller, variantIdsOfCart, groupIsSplit, groupShipping, groupTotal } from '@/lib/cartGroups'
import Footer from '@/components/Footer'
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)
async function resizeImage(file: File, maxWidth = 800): Promise<File> {
  return new Promise(resolve => {
    const img = new window.Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, maxWidth / img.width)
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => {
        resolve(new File([blob!], file.name, { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.8)
    }
    img.src = URL.createObjectURL(file)
  })
}
export default function CheckoutPage() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [addresses, setAddresses] = useState<any[]>([])
  const [selectedAddress, setSelectedAddress] = useState<string>('')
  // สลิปแยกตามร้าน (key = seller_id) — 1 ออเดอร์ต่อร้าน จึงต้องโอนแยกใบ
  const [slips, setSlips] = useState<Record<string, { file: File, preview: string }>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [session, setSession] = useState<any>(null)
  const [zoomQR, setZoomQR] = useState<string | null>(null)
  // สต็อก/สถานะพรี/ข้อมูลร้าน ของ variant ในตะกร้า (ดึงสดจาก DB ไม่เชื่อค่าที่ค้างใน localStorage)
  const [stockInfo, setStockInfo] = useState<Map<string, VariantStockInfo>>(new Map())
  const [shipTogether, setShipTogether] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      setSession(session)
      loadData(session.user.id)
    })
  }, [])

  // ค่าส่ง/QR/บัญชี ของแต่ละร้านมาพร้อมกับสต็อกใน query เดียว (ไม่อ่าน settings.shipping_fee อีกแล้ว)
  async function loadData(userId: string) {
    const currentCart = getCart()

    const [{ data: addrs }, { info }] = await Promise.all([
      supabase.from('shipping_addresses').select('*').eq('customer_id', userId).order('is_default', { ascending: false }),
      loadVariantStockInfo(supabase, variantIdsOfCart(currentCart))
    ])
    setAddresses(addrs ?? [])
    if (addrs?.length) setSelectedAddress(addrs.find((a: any) => a.is_default)?.id || addrs[0].id)
    setStockInfo(info)
    setCart(currentCart)
    setLoading(false)
  }

  function handleSlipChange(sellerId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSlips(prev => ({ ...prev, [sellerId]: { file, preview: URL.createObjectURL(file) } }))
  }

  async function handleSubmit() {
    if (SHOP_CLOSED || !selectedAddress || cart.length === 0 || !allSlipsReady) return
    setSubmitting(true)

    for (const item of cart) {
      if (isPromoLine(item)) {
        // โปร: ทุกชิ้นในโปรต้องมีของ (โปรไม่ใช้ช่วงพรีออเดอร์) — DB เช็คซ้ำอีกรอบ
        const need = new Map<string, number>()
        for (const id of item.promoVariantIds ?? []) need.set(id, (need.get(id) ?? 0) + 1)
        const { data: rows } = await supabase.from('product_variants').select('id, stock').in('id', [...need.keys()])
        const short = [...need].some(([id, n]) => ((rows ?? []).find(r => r.id === id)?.stock ?? 0) < n)
        if (!rows || rows.length !== need.size || short) {
          alert(`${item.productName} ของหมดแล้วครับ กรุณาลบออกจากตะกร้า`)
          setSubmitting(false)
          return
        }
        continue
      }
      const { data: variant } = await supabase
        .from('product_variants').select('stock, name').eq('id', item.variantId).single()
      // ช่วงพรีออเดอร์: เฉพาะร้านกลุ่มที่สั่งเกินสต็อกได้ (ส่วนเกินเป็นพรี) — DB เช็คซ้ำอีกรอบ
      const canBackorder = stockInfo.get(item.variantId)?.canBackorder ?? false
      if (!variant || (variant.stock < item.quantity && !canBackorder)) {
        alert(`สินค้า ${item.variantName} มีไม่พอครับ (เหลือ ${variant?.stock ?? 0})`)
        setSubmitting(false)
        return
      }
    }

    // อัปสลิปของแต่ละร้าน (เก็บแยกไฟล์ แยกออเดอร์)
    const slipUrls: Record<string, string> = {}
    for (const group of groups) {
      const sellerId = group.sellerId
      const slip = sellerId ? slips[sellerId] : undefined
      if (!sellerId || !slip) { alert('กรุณาแนบสลิปให้ครบทุกร้าน'); setSubmitting(false); return }

      const resizedFile = await resizeImage(slip.file)
      const slipFormData = new FormData()
      slipFormData.append('file', resizedFile, resizedFile.name)
      slipFormData.append('prefix', 'slips/')

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: slipFormData
      })
      if (!uploadRes.ok) { alert(`อัปโหลดสลิปของร้าน ${group.seller?.name ?? ''} ไม่สำเร็จ`); setSubmitting(false); return }
      const { url } = await uploadRes.json()
      slipUrls[sellerId] = url
    }

    // สร้างออเดอร์ (1 ใบต่อร้าน) + ตัดสต็อก ในทรานแซกชันเดียวฝั่ง DB
    // ร้านไหนไม่ผ่าน (สต็อกไม่พอ/ของถูกลบ) = rollback ทั้งก้อน ไม่มีออเดอร์ไหนถูกสร้าง
    const { data: result, error: rpcError } = await supabase.rpc('place_order_multi', {
      p_shipping_address_id: selectedAddress,
      p_items: cart.map(i => isPromoLine(i)
        // โปร: ส่งแค่ id โปร + ชิ้นที่เลือก ราคา/ชื่อ/ของแถม DB คำนวณเอง
        ? { promotion_id: i.promotionId, variant_ids: i.promoVariantIds ?? [] }
        : {
          variant_id: i.variantId,
          quantity: i.quantity,
          name: `${i.productName} - ${i.variantName}`
        }),
      p_slips: slipUrls,
      p_ship_together: shipTogether
    })

    const createdOrders = (result?.orders ?? []) as { order_id: string }[]
    if (rpcError || createdOrders.length === 0) {
      alert(rpcError?.message || 'สั่งซื้อไม่สำเร็จ ลองใหม่อีกครั้ง')
      setSubmitting(false)
      return
    }

    const orderIds = createdOrders.map(o => o.order_id)

    clearCart()
    // แจ้งเตือน Discord: ฝั่ง server อ่านออเดอร์จาก DB เอง แล้วยิงเข้า webhook ของร้านนั้น ๆ
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({ orderIds })
      })
    } catch {
      // แจ้งเตือนพลาดไม่ควรทำให้ลูกค้าค้างหน้า — ออเดอร์ถูกสร้างแล้ว
    }
    window.location.href = orderIds.length === 1 ? `/orders/${orderIds[0]}` : '/orders'
  }

  // แบ่งแต่ละบรรทัดเป็น ส่วนพร้อมส่ง / ส่วนพรี ให้ตรงกับที่ place_order จะบันทึก
  const splits = new Map(cart.map(i => [i.variantId, splitLine(stockInfo.get(i.variantId), i.quantity)]))
  const groups = groupCartBySeller(cart, stockInfo)
  const unknownSeller = groups.some(g => !g.sellerId)
  const allSlipsReady = groups.length > 0 && groups.every(g => g.sellerId && slips[g.sellerId])
  const grandTotal = groups.reduce((sum, g) => sum + groupTotal(g, shipTogether), 0)

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

        {groups.length > 1 && (
          <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            🏬 ตะกร้านี้มีสินค้าจาก {groups.length} ร้าน — แยกเป็น {groups.length} ออเดอร์
            ต้องโอนและแนบสลิปแยกตามร้าน (คนละบัญชี) กดยืนยันครั้งเดียวได้เลย
          </p>
        )}
        {unknownSeller && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            โหลดข้อมูลร้านของบางรายการไม่สำเร็จ กรุณารีเฟรชหน้านี้อีกครั้ง
          </p>
        )}

        {/* กล่องละร้าน: รายการ + ยอด + ชำระเงิน + สลิป */}
        {groups.map(group => {
          const sellerId = group.sellerId
          const slip = sellerId ? slips[sellerId] : undefined
          const isMixed = group.hasPreorder && group.hasNormal
          return (
            <div key={sellerId ?? 'unknown'} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
                <span className="text-sm font-semibold text-blue-900">🏬 {group.seller?.name ?? 'ไม่ทราบร้าน'}</span>
                <span className="text-xs text-blue-700">
                  {slip ? '✓ แนบสลิปแล้ว' : 'ยังไม่แนบสลิป'}
                </span>
              </div>

              <div className="p-4">
                <div className="space-y-2">
                  {group.items.map(item => {
                    const split = splits.get(item.variantId) ?? { ready: item.quantity, preorder: 0 }
                    const warning = splitWarning(split, stockInfo.get(item.variantId)?.isPreorderProduct ?? false)
                    return (
                      <div key={item.variantId}>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">
                            {item.productName} - {item.variantName} x{item.quantity}
                            {split.preorder > 0 && (
                              <span className="ml-1 text-[10px] text-orange-600 bg-orange-50 border border-orange-200 rounded px-1 py-0.5">พรีออเดอร์</span>
                            )}
                          </span>
                          <span className="font-medium">฿{item.price * item.quantity}</span>
                        </div>
                        {warning && <p className="text-xs text-orange-700 mt-0.5">⚠️ {warning}</p>}
                      </div>
                    )
                  })}
                </div>

                {isMixed && (
                  <div className="mt-3 border border-orange-200 bg-orange-50 rounded-lg p-3">
                    <p className="text-xs text-orange-700 leading-relaxed">
                      ร้านนี้มีทั้งสินค้าพรีออเดอร์และสินค้าพร้อมส่ง ปกติจะแยกส่ง 2 รอบ
                      จึงคิดค่าส่ง 2 เท่า (฿{group.shippingFee} x 2)
                    </p>
                    <label className="flex items-start gap-2 mt-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={shipTogether}
                        onChange={e => setShipTogether(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        รอของพรีออเดอร์ แล้วส่งมาพร้อมกันรอบเดียว
                        <span className="text-green-600 font-medium"> (จ่ายค่าส่ง ฿{group.shippingFee} รอบเดียว)</span>
                      </span>
                    </label>
                  </div>
                )}

                <div className="border-t mt-3 pt-3 space-y-1">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>ยอดสินค้า</span><span>฿{group.subtotal}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>ค่าส่ง{groupIsSplit(group, shipTogether) ? ' (ส่ง 2 รอบ)' : ''}</span>
                    <span>฿{groupShipping(group, shipTogether)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-blue-900">
                    <span>รวมร้านนี้</span><span>฿{groupTotal(group, shipTogether)}</span>
                  </div>
                </div>

                {/* ชำระเงินของร้านนี้ */}
                <div className="mt-4">
                  {group.seller?.qr_image_url || group.seller?.payment_note ? (
                    <div className="bg-blue-900/30 border border-blue-500/50 p-5 rounded-xl text-center mb-3">
                      {group.seller?.qr_image_url && (
                        <>
                          <img
                            src={group.seller.qr_image_url}
                            className="w-64 mx-auto mb-4 rounded-xl shadow-lg border-2 border-white/20 cursor-pointer hover:opacity-90"
                            onClick={() => setZoomQR(group.seller?.qr_image_url ?? null)}
                          />
                          <p className="text-xs text-blue-200 mb-3">กดรูปเพื่อขยาย</p>
                        </>
                      )}
                      {group.seller?.payment_note && (
                        <div className="text-left text-sm bg-white text-black p-4 rounded-xl mx-auto max-w-sm font-bold shadow-inner whitespace-pre-line">
                          {group.seller.payment_note}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                      ร้านนี้ยังไม่ได้ตั้งข้อมูลการชำระเงิน — กรุณาติดต่อแอดมินก่อนโอน
                    </p>
                  )}

                  <p className="text-sm font-medium text-blue-900 mb-2">
                    โอนเงิน ฿{groupTotal(group, shipTogether)} ให้ร้าน {group.seller?.name ?? ''} แล้วแนบสลิปด้านล่าง
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => sellerId && handleSlipChange(sellerId, e)}
                    disabled={!sellerId}
                    className="w-full text-sm mb-3"
                  />
                  {slip?.preview && (
                    <img src={slip.preview} className="w-full max-h-48 object-contain rounded-lg border" />
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {groups.length > 1 && (
          <div className="bg-white rounded-xl shadow-sm p-4 flex justify-between font-bold text-blue-900">
            <span>รวมทุกร้าน</span><span>฿{grandTotal}</span>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={SHOP_CLOSED || submitting || !selectedAddress || cart.length === 0 || !allSlipsReady}
          className="w-full bg-blue-500 text-white py-3 rounded-xl font-medium hover:bg-blue-600 disabled:opacity-50"
        >
          {SHOP_CLOSED
            ? 'ปิดการขายชั่วคราว'
            : submitting
            ? 'กำลังดำเนินการ...'
            : !allSlipsReady && groups.length > 1
            ? 'แนบสลิปให้ครบทุกร้านก่อน'
            : 'ยืนยันคำสั่งซื้อ'}
        </button>
      </div>

      {/* QR Fullscreen */}
      {zoomQR && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4"
          onClick={() => setZoomQR(null)}
        >
          <img src={zoomQR} className="max-w-sm w-full rounded-xl" />
        </div>
      )}
      <Footer />

    </main>
  )
}
