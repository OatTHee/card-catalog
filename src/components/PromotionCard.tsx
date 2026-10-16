'use client'

import { useState } from 'react'
import Image from 'next/image'
import { addPromoToCart } from '@/lib/cart'
import { SHOP_CLOSED } from '@/lib/shopStatus'
import { PROMOTION_TYPE_LABEL, PromotionView, PromoItemView, b1g1Price } from '@/lib/promotion'

export default function PromotionCard({ promotion: p }: { promotion: PromotionView }) {
  const [showModal, setShowModal] = useState(false)
  const normalTotal = p.items.reduce((sum, i) => sum + i.price * i.quantity, 0)

  return (
    <>
      <div
        onClick={() => setShowModal(true)}
        className="bg-white rounded-xl shadow-sm border-2 border-pink-200 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer"
      >
        <div className="relative w-full aspect-square bg-pink-50 overflow-hidden">
          {p.imageUrl ? (
            <Image src={p.imageUrl} alt={p.name} fill className="object-contain" sizes="(max-width: 768px) 50vw, 25vw" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl">🎁</div>
          )}
          <span className="absolute top-2 left-2 text-[10px] font-bold bg-pink-500 text-white px-2 py-0.5 rounded">
            {PROMOTION_TYPE_LABEL[p.type]}
          </span>
        </div>
        <div className="p-3">
          <h3 className="font-semibold text-sm text-gray-800 leading-tight mb-1">{p.name}</h3>
          <div className="flex items-center gap-2 mt-2">
            {p.type === 'bundle' ? (
              <>
                <span className="text-pink-600 font-bold text-sm">฿{p.price}</span>
                {normalTotal > (p.price ?? 0) && <span className="text-xs text-gray-400 line-through">฿{normalTotal}</span>}
              </>
            ) : (
              <span className="text-pink-600 font-bold text-sm">เลือก 2 ชิ้น จ่ายชิ้นเดียว</span>
            )}
          </div>
        </div>
      </div>

      {showModal && <PromotionModal promotion={p} onClose={() => setShowModal(false)} />}
    </>
  )
}

function PromotionModal({ promotion: p, onClose }: { promotion: PromotionView, onClose: () => void }) {
  // ซื้อ 1 แถม 1: จำนวนที่เลือกต่อ variant (รวมกันได้ 2 ชิ้นพอดี)
  const [picked, setPicked] = useState<Record<string, number>>({})
  const [added, setAdded] = useState(false)

  const pickedList: PromoItemView[] = p.items.flatMap(i => Array(picked[i.variantId] ?? 0).fill(i))
  const pickedCount = pickedList.length
  const ready = p.type === 'bundle' || pickedCount === 2
  const price = p.type === 'bundle'
    ? (p.price ?? 0)
    : pickedCount === 2 ? b1g1Price(pickedList[0], pickedList[1]) : null

  function changePick(item: PromoItemView, delta: number) {
    const cur = picked[item.variantId] ?? 0
    const next = cur + delta
    if (next < 0 || next > item.stock) return
    if (delta > 0 && pickedCount >= 2) return
    setPicked({ ...picked, [item.variantId]: next })
  }

  function handleAdd() {
    if (!ready || price == null) return
    const variantIds = p.type === 'bundle' ? p.items.map(i => i.variantId) : pickedList.map(i => i.variantId)
    const names = p.type === 'bundle'
      ? p.items.map(i => `${i.name}${i.quantity > 1 ? ` x${i.quantity}` : ''}`)
      : pickedList.map(i => i.name)
    addPromoToCart({
      variantId: `promo:${p.id}`,
      productId: p.id,
      productName: `🎁 ${PROMOTION_TYPE_LABEL[p.type]}: ${p.name}`,
      variantName: names.join(' + '),
      price,
      quantity: 1,
      imageUrl: p.imageUrl ?? undefined,
      promotionId: p.id,
      promoVariantIds: variantIds,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  // ชิ้นที่ฟรีในโปรซื้อ 1 แถม 1 = ชิ้นที่ถูกกว่า
  const freeItem = pickedCount === 2
    ? (pickedList[0].price <= pickedList[1].price ? pickedList[0] : pickedList[1])
    : null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl flex flex-col" style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 pb-2">
          <div>
            <p className="text-xs font-bold text-pink-600">{PROMOTION_TYPE_LABEL[p.type]}</p>
            <h2 className="font-bold text-gray-800 text-lg leading-tight">{p.name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="px-5 pb-5 overflow-y-auto flex-1">
          {p.imageUrl && (
            <div className="relative w-full aspect-square bg-pink-50 rounded-xl overflow-hidden mb-3">
              <Image src={p.imageUrl} alt={p.name} fill className="object-contain" />
            </div>
          )}
          {p.description && <p className="text-sm text-gray-500 mb-3 whitespace-pre-line">{p.description}</p>}

          <p className="text-xs text-gray-500 font-medium mb-1">
            {p.type === 'bundle' ? 'ในโปรนี้ได้' : `เลือก 2 ชิ้น (เลือกแล้ว ${pickedCount}/2) — ชิ้นที่ถูกกว่าฟรี`}
          </p>
          <div className="space-y-1">
            {p.items.map(i => (
              <div key={i.variantId} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  {i.imageUrl && (
                    <Image src={i.imageUrl} alt={i.name} width={32} height={32} className="w-8 h-8 rounded object-cover shrink-0" />
                  )}
                  <span className="truncate">{i.name}{p.type === 'bundle' && i.quantity > 1 ? ` x${i.quantity}` : ''}</span>
                </div>
                {p.type === 'bundle' ? (
                  <span className="text-xs text-gray-400 shrink-0">฿{i.price}</span>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-gray-400 mr-1">฿{i.price}</span>
                    <button onClick={() => changePick(i, -1)} className="w-6 h-6 rounded border text-sm hover:bg-gray-50">-</button>
                    <span className="w-5 text-center">{picked[i.variantId] ?? 0}</span>
                    <button onClick={() => changePick(i, 1)} disabled={i.stock <= (picked[i.variantId] ?? 0)}
                      className="w-6 h-6 rounded border text-sm hover:bg-gray-50 disabled:opacity-30">+</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {freeItem && <p className="text-xs text-green-600 mt-2">🎉 ของแถม: {freeItem.name}</p>}

          <div className="mt-4">
            {SHOP_CLOSED ? (
              <button disabled className="w-full py-3 rounded-xl bg-gray-100 text-gray-400 cursor-not-allowed">
                ปิดการขายชั่วคราว
              </button>
            ) : (
              <button onClick={handleAdd} disabled={!ready}
                className={`w-full py-3 rounded-xl font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${added ? 'bg-green-500 text-white' : 'bg-pink-500 text-white hover:bg-pink-600'}`}>
                {added ? '✓ เพิ่มในตะกร้าแล้ว' : ready && price != null ? `+ ใส่ตะกร้า ฿${price}` : 'เลือกให้ครบ 2 ชิ้น'}
              </button>
            )}
            <p className="text-[11px] text-gray-400 mt-1 text-center">1 โปรต่อ 1 ออเดอร์ · ใส่ซ้ำจะแทนที่ของเดิมในตะกร้า</p>
          </div>
        </div>
      </div>
    </div>
  )
}
