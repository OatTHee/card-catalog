'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function RedeemCard({
  product,
  myPoints,
  onRedeemed
}: {
  product: any
  myPoints: number
  onRedeemed: (pointsRemaining: number) => void
}) {
  const [showModal, setShowModal] = useState(false)

  const variants = (product.product_variants ?? []).filter((v: any) => v.redeem_points != null)
  const totalStock = variants.reduce((sum: number, v: any) => sum + v.stock, 0)
  const isAvailable = totalStock > 0
  const minPoints = variants.length > 0 ? Math.min(...variants.map((v: any) => v.redeem_points)) : null

  if (variants.length === 0) return null

  return (
    <>
      <div
        onClick={() => setShowModal(true)}
        className="bg-white rounded-xl shadow-sm border border-blue-50 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer"
      >
        <div className="relative w-full aspect-square bg-blue-50 overflow-hidden">
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 50vw, 25vw"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-blue-200 text-4xl">🎴</span>
            </div>
          )}
        </div>
        <div className="p-3">
          <h3 className="font-semibold text-sm text-gray-800 leading-tight mb-1">{product.name}</h3>
          <div className="flex items-center justify-between mt-2">
            <span className="text-amber-600 font-bold text-sm">
              {minPoints != null ? `✨ ${minPoints} แต้ม` : '-'}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${isAvailable ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
              {isAvailable ? 'แลกได้' : 'หมด'}
            </span>
          </div>
        </div>
      </div>

      {showModal && (
        <RedeemModal
          product={product}
          variants={variants}
          myPoints={myPoints}
          onClose={() => setShowModal(false)}
          onRedeemed={onRedeemed}
        />
      )}
    </>
  )
}

function RedeemModal({ product, variants, myPoints, onClose, onRedeemed }: {
  product: any
  variants: any[]
  myPoints: number
  onClose: () => void
  onRedeemed: (pointsRemaining: number) => void
}) {
  const [selectedVariantId, setSelectedVariantId] = useState(variants[0]?.id ?? '')
  const [quantity, setQuantity] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const selectedVariant = variants.find(v => v.id === selectedVariantId) ?? variants[0]
  const displayImage = selectedVariant?.image_url || product.image_url
  const isAvailable = (selectedVariant?.stock ?? 0) > 0
  const totalPoints = (selectedVariant?.redeem_points ?? 0) * quantity
  const canAfford = myPoints >= totalPoints

  async function handleRedeem() {
    if (!selectedVariant || submitting) return
    setSubmitting(true)
    setError('')

    const { data, error: rpcError } = await supabase.rpc('redeem_to_bag', {
      p_items: [{
        variant_id: selectedVariant.id,
        item_name: `${product.name} - ${selectedVariant.name}`,
        points: selectedVariant.redeem_points,
        qty: quantity
      }]
    })

    setSubmitting(false)

    if (rpcError) {
      setError(rpcError.message || 'แลกไม่สำเร็จ ลองใหม่อีกครั้ง')
      return
    }

    setSuccess(true)
    onRedeemed(data.points_remaining)
    setTimeout(() => {
      onClose()
    }, 1200)
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-xl flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="relative w-full aspect-square bg-blue-50 flex items-center justify-center overflow-hidden rounded-t-2xl flex-shrink-0">
          {displayImage ? (
            <Image src={displayImage} alt={product.name} fill className="object-contain" />
          ) : (
            <span className="text-blue-200 text-6xl">🎴</span>
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 bg-black bg-opacity-40 hover:bg-opacity-60 text-white rounded-full flex items-center justify-center text-lg"
          >
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <h2 className="font-bold text-gray-800 text-lg leading-tight">{product.name}</h2>
          {product.description && (
            <p className="text-sm text-gray-500 mt-1">{product.description}</p>
          )}

          {variants.length > 1 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-gray-500 font-medium">เลือกตัวเลือก</p>
              {variants.map((v: any) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariantId(v.id)}
                  disabled={v.stock === 0}
                  className={`w-full flex justify-between items-center px-3 py-2 rounded-lg border text-sm transition-colors ${
                    selectedVariantId === v.id
                      ? 'border-amber-400 bg-amber-50 text-amber-700'
                      : v.stock === 0
                      ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                      : 'border-gray-200 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {v.image_url && <img src={v.image_url} className="w-8 h-8 rounded object-cover block flex-shrink-0" loading="lazy" />}
                    <span>{v.name}</span>
                  </div>
                  <span className="font-bold text-right">
                    <span className="block">{v.stock === 0 ? 'หมด' : `✨ ${v.redeem_points}`}</span>
                    {v.stock > 0 && <span className="text-xs font-normal text-gray-400">เหลือ {v.stock}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}

          {variants.length === 1 && (
            <p className="text-2xl font-bold text-amber-600 mt-3">✨ {selectedVariant?.redeem_points} แต้ม</p>
          )}

          {isAvailable && (
            <div className="flex items-center gap-3 mt-4">
              <span className="text-xs text-gray-500 font-medium">จำนวน</span>
              <div className="flex items-center border border-gray-200 rounded-lg">
                <button
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-8 h-8 text-gray-500 hover:bg-gray-50"
                >−</button>
                <span className="w-10 text-center text-sm">{quantity}</span>
                <button
                  onClick={() => setQuantity(q => Math.min(selectedVariant?.stock ?? 1, q + 1))}
                  className="w-8 h-8 text-gray-500 hover:bg-gray-50"
                >+</button>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">แต้มของฉัน</span>
            <span className="font-semibold text-gray-700">{myPoints.toLocaleString()} แต้ม</span>
          </div>
          {isAvailable && (
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-gray-500">ใช้ทั้งหมด</span>
              <span className={`font-semibold ${canAfford ? 'text-amber-600' : 'text-red-500'}`}>
                {totalPoints.toLocaleString()} แต้ม
              </span>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500 mt-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="mt-4">
            {!isAvailable ? (
              <button disabled className="w-full py-3 rounded-xl bg-gray-100 text-gray-400 cursor-not-allowed">
                หมดแล้ว
              </button>
            ) : !canAfford ? (
              <button disabled className="w-full py-3 rounded-xl bg-gray-100 text-gray-400 cursor-not-allowed">
                แต้มไม่พอ
              </button>
            ) : (
              <button
                onClick={handleRedeem}
                disabled={submitting}
                className={`w-full py-3 rounded-xl font-medium transition-colors ${
                  success ? 'bg-green-500 text-white' : 'bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60'
                }`}
              >
                {success ? '✓ แลกสำเร็จ เข้ากระเป๋าแล้ว' : submitting ? 'กำลังแลก...' : 'แลกเลย'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
