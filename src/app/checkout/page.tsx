'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { getCart, clearCart, isPromoLine, CartItem } from '@/lib/cart'
import Header from '@/components/Header'
import { SHOP_CLOSED } from '@/lib/shopStatus'
import { loadVariantStockInfo, splitLine, splitWarning, VariantStockInfo } from '@/lib/preorder'
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
  const [shippingFee, setShippingFee] = useState(40)
  const [slipFile, setSlipFile] = useState<File | null>(null)
  const [slipPreview, setSlipPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [session, setSession] = useState<any>(null)
  const [showQR, setShowQR] = useState(false)
  // สต็อก/สถานะพรีของ variant ในตะกร้า (ดึงสดจาก DB ไม่เชื่อค่าที่ค้างใน localStorage)
  const [stockInfo, setStockInfo] = useState<Map<string, VariantStockInfo>>(new Map())
  const [shipTogether, setShipTogether] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      setSession(session)
      loadData(session.user.id)
    })
  }, [])

  async function loadData(userId: string) {
    const currentCart = getCart()
    const variantIds = currentCart.filter(i => !isPromoLine(i)).map(i => i.variantId)

    const [{ data: addrs }, { data: settings }, { info }] = await Promise.all([
      supabase.from('shipping_addresses').select('*').eq('customer_id', userId).order('is_default', { ascending: false }),
      supabase.from('settings').select('value').eq('key', 'shipping_fee').single(),
      loadVariantStockInfo(supabase, variantIds)
    ])
    setAddresses(addrs ?? [])
    if (addrs?.length) setSelectedAddress(addrs.find((a: any) => a.is_default)?.id || addrs[0].id)
    if (settings) setShippingFee(Number(settings.value))
    setStockInfo(info)
    setCart(currentCart)
    setLoading(false)
  }

  function handleSlipChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSlipFile(file)
    setSlipPreview(URL.createObjectURL(file))
  }

  async function handleSubmit() {
    if (SHOP_CLOSED || !selectedAddress || !slipFile || cart.length === 0) return
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
      // ช่วงพรีออเดอร์: ร้าน official สั่งเกินสต็อกได้ (ส่วนเกินเป็นพรี) — DB เช็คซ้ำอีกรอบ
      const canBackorder = stockInfo.get(item.variantId)?.canBackorder ?? false
      if (!variant || (variant.stock < item.quantity && !canBackorder)) {
        alert(`สินค้า ${item.variantName} มีไม่พอครับ (เหลือ ${variant?.stock ?? 0})`)
        setSubmitting(false)
        return
      }
    }

    const resizedFile = await resizeImage(slipFile)

    const slipFormData = new FormData()
    slipFormData.append('file', resizedFile, resizedFile.name)
    slipFormData.append('prefix', 'slips/')

    const uploadRes = await fetch('/api/upload', {
      method: 'POST',
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      body: slipFormData
    })
    if (!uploadRes.ok) { alert('อัปโหลดสลิปไม่สำเร็จ'); setSubmitting(false); return }
    const { url: slipUrl } = await uploadRes.json()

    // สร้างออเดอร์ + ตัดสต็อก ในทรานแซกชันเดียวฝั่ง DB
    // (RPC เป็น SECURITY DEFINER จึงข้าม RLS ของ product_variants ได้ และล็อกแถวกัน oversell)
    const { data: result, error: rpcError } = await supabase.rpc('place_order', {
      p_shipping_address_id: selectedAddress,
      p_items: cart.map(i => isPromoLine(i)
        // โปร: ส่งแค่ id โปร + ชิ้นที่เลือก ราคา/ชื่อ/ของแถม DB คำนวณเอง
        ? { promotion_id: i.promotionId, variant_ids: i.promoVariantIds ?? [] }
        : {
          variant_id: i.variantId,
          quantity: i.quantity,
          name: `${i.productName} - ${i.variantName}`
        }),
      p_slip_url: slipUrl,
      p_ship_together: shipTogether
    })

    if (rpcError || !result?.order_id) {
      alert(rpcError?.message || 'สั่งซื้อไม่สำเร็จ ลองใหม่อีกครั้ง')
      setSubmitting(false)
      return
    }

    const orderId = result.order_id as string
    const orderTotal = Number(result.total)

    clearCart()
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        customerName: session.user.user_metadata?.full_name || session.user.user_metadata?.username,
        items: cart.map(i => ({ name: `${i.productName} - ${i.variantName}`, quantity: i.quantity, price: i.price })),
        total: orderTotal,
        slipUrl: slipUrl,
        hasPreorder: Boolean(result.has_preorder),
        isSplit: Boolean(result.is_split),
        shipTogether: shipTogether,
        address: (() => {
          const addr = addresses.find(a => a.id === selectedAddress)
          if (!addr) return 'ไม่ระบุ'
          return `${addr.name} | ${addr.phone}\n${addr.address} ${addr.district} ${addr.province} ${addr.postal_code}`
        })(),
      })
    })
    window.location.href = `/orders/${orderId}`
  }

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  // แบ่งแต่ละบรรทัดเป็น ส่วนพร้อมส่ง / ส่วนพรี ให้ตรงกับที่ place_order จะบันทึก
  const splits = new Map(cart.map(i => [i.variantId, splitLine(stockInfo.get(i.variantId), i.quantity)]))
  const hasPreorder = cart.some(i => (splits.get(i.variantId)?.preorder ?? 0) > 0)
  const hasNormal = cart.some(i => (splits.get(i.variantId)?.ready ?? 0) > 0)
  const isMixed = hasPreorder && hasNormal
  // ปนกันแล้วไม่ได้ติ๊กส่งพร้อม = ส่ง 2 รอบ = ค่าส่ง 2 เท่า (ฝั่ง DB คิดซ้ำอีกรอบเป็นตัวตัดสิน)
  const effectiveShipping = isMixed && !shipTogether ? shippingFee * 2 : shippingFee
  const grandTotal = subtotal + effectiveShipping

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
            {cart.map(item => {
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
                ตะกร้านี้มีทั้งสินค้าพรีออเดอร์และสินค้าพร้อมส่ง ปกติจะแยกส่ง 2 รอบ
                จึงคิดค่าส่ง 2 เท่า (฿{shippingFee} x 2)
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
                  <span className="text-green-600 font-medium"> (จ่ายค่าส่ง ฿{shippingFee} รอบเดียว)</span>
                </span>
              </label>
            </div>
          )}
          <div className="border-t mt-3 pt-3 space-y-1">
            <div className="flex justify-between text-sm text-gray-500">
              <span>ค่าส่ง{isMixed && !shipTogether ? ' (ส่ง 2 รอบ)' : ''}</span><span>฿{effectiveShipping}</span>
            </div>
            <div className="flex justify-between font-bold text-blue-900">
              <span>รวม</span><span>฿{grandTotal}</span>
            </div>
          </div>
        </div>

        {/* ชำระเงิน */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-semibold text-gray-800 mb-3">ชำระเงิน</h3>
          <div className="bg-blue-900/30 border border-blue-500/50 p-5 rounded-xl text-center mb-4">
            <img
              src="https://i.postimg.cc/RV9Z9KJh/004999184266566-20250920-153316.jpg"
              className="w-64 mx-auto mb-4 rounded-xl shadow-lg border-2 border-white/20 cursor-pointer hover:opacity-90"
              onClick={() => setShowQR(true)}
            />
            <p className="text-xs text-blue-200 mb-3">กดรูปเพื่อขยาย</p>
            <div className="text-left text-sm bg-white text-black p-4 rounded-xl mx-auto max-w-sm font-bold shadow-inner">
              <p className="mb-2 text-base">🏦 <b>กสิกร:</b> 8450260981 (ศรัณย์)</p>
              <p className="text-base">📱 <b>Wallet:</b> 094-7066766 (ศรัณย์)</p>
            </div>
          </div>
          <p className="text-sm font-medium text-blue-900 mb-3">โอนเงิน ฿{grandTotal} แล้วแนบสลิปด้านล่าง</p>

          {/* อัปโหลดสลิป */}
          <input type="file" accept="image/*" onChange={handleSlipChange} className="w-full text-sm mb-3" />
          {slipPreview && (
            <img src={slipPreview} className="w-full max-h-48 object-contain rounded-lg border mb-3" />
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={SHOP_CLOSED || submitting || !selectedAddress || !slipFile || cart.length === 0}
          className="w-full bg-blue-500 text-white py-3 rounded-xl font-medium hover:bg-blue-600 disabled:opacity-50"
        >
          {SHOP_CLOSED ? 'ปิดการขายชั่วคราว' : submitting ? 'กำลังดำเนินการ...' : 'ยืนยันคำสั่งซื้อ'}
        </button>
      </div>

      {/* QR Fullscreen */}
      {showQR && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4"
          onClick={() => setShowQR(false)}
        >
          <img
            src="https://i.postimg.cc/RV9Z9KJh/004999184266566-20250920-153316.jpg"
            className="max-w-sm w-full rounded-xl"
          />
        </div>
      )}
      <Footer />
      
    </main>
  )
}