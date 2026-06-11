'use client'

import { addToCart } from '@/lib/cart'
import { useState } from 'react'

export default function ProductCard({ product }: { product: any }) {
  const [showModal, setShowModal] = useState(false)

  const isOfficial = product.sellers?.type === 'official'
  const variants = product.product_variants ?? []
  const totalStock = variants.reduce((sum: number, v: any) => sum + v.stock, 0)
  const isAvailable = totalStock > 0
  const minPrice = variants.length > 0 ? Math.min(...variants.map((v: any) => v.price)) : null

  return (
    <>
      <div
        onClick={() => setShowModal(true)}
        className="bg-white rounded-xl shadow-sm border border-blue-50 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer"
      >
        <div className="w-full aspect-square bg-blue-50 flex items-center justify-center overflow-hidden">
  {product.image_url ? (
    <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" />
  ) : (
    <span className="text-blue-200 text-4xl">🃏</span>
  )}
</div>
        <div className="p-3">
          <p className="text-xs text-blue-400 mb-0.5">
            {product.type === 'set' ? 'เซ็ต' : product.type === 'single' ? 'การ์ดแยกใบ' : 'อุปกรณ์เสริม'}
          </p>
          <h3 className="font-semibold text-sm text-gray-800 leading-tight mb-1">{product.name}</h3>
          <div className="flex items-center justify-between mt-2">
            <span className="text-blue-600 font-bold text-sm">{minPrice ? `฿${minPrice}` : '-'}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${isAvailable ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
  {isAvailable ? 'มีสินค้า' : 'หมด'}
</span>
          </div>
        </div>
      </div>

      {showModal && (
        <ProductModal
          product={product}
          isOfficial={isOfficial}
          variants={variants}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

function ProductModal({ product, isOfficial, variants, onClose }: {
  product: any
  isOfficial: boolean
  variants: any[]
  onClose: () => void
}) {
  const [selectedVariantId, setSelectedVariantId] = useState(variants[0]?.id ?? '')
  const [added, setAdded] = useState(false)

  const selectedVariant = variants.find(v => v.id === selectedVariantId) ?? variants[0]
  const displayImage = selectedVariant?.image_url || product.image_url
  const isAvailable = (selectedVariant?.stock ?? 0) > 0

  function handleAddToCart() {
    if (!selectedVariant) return
    addToCart({
      variantId: selectedVariant.id,
      productId: product.id,
      productName: product.name,
      variantName: selectedVariant.name,
      price: selectedVariant.price,
      quantity: 1,
      imageUrl: displayImage
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
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
  {/* รูปสินค้า fixed ด้านบน */}
<div className="relative w-full aspect-square bg-blue-50 flex items-center justify-center overflow-hidden rounded-t-2xl flex-shrink-0">
  {displayImage ? (
    <img src={displayImage} alt={product.name} className="w-full h-full object-contain" />
  ) : (
    <span className="text-blue-200 text-6xl">🃏</span>
  )}
  <button
    onClick={onClose}
    className="absolute top-3 right-3 w-8 h-8 bg-black bg-opacity-40 hover:bg-opacity-60 text-white rounded-full flex items-center justify-center text-lg"
  >
    ✕
  </button>
</div>

  {/* ส่วนล่าง scroll ได้ */}
  <div className="p-5 overflow-y-auto flex-1">
    <p className="text-xs text-blue-400 mb-1">
      {product.type === 'set' ? 'เซ็ต' : product.type === 'single' ? 'การ์ดแยกใบ' : 'อุปกรณ์เสริม'}
      {' · '}{product.sellers?.name}
    </p>
    <h2 className="font-bold text-gray-800 text-lg leading-tight">{product.name}</h2>

    {product.description && (
      <p className="text-sm text-gray-500 mt-1">{product.description}</p>
    )}

    {variants.length > 1 && (
      <div className="mt-3 space-y-1">
        <p className="text-xs text-gray-500 font-medium">เลือก variant</p>
        {variants.map((v: any) => (
          <button
            key={v.id}
            onClick={() => setSelectedVariantId(v.id)}
            disabled={v.stock === 0}
            className={`w-full flex justify-between items-center px-3 py-2 rounded-lg border text-sm transition-colors ${
              selectedVariantId === v.id
                ? 'border-blue-400 bg-blue-50 text-blue-700'
                : v.stock === 0
                ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                : 'border-gray-200 hover:border-blue-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {v.image_url && <img src={v.image_url} className="w-8 h-8 rounded object-cover" />}
              <span>{v.name}</span>
            </div>
            <span className="font-bold text-right">
              <span className="block">{v.stock === 0 ? 'หมด' : `฿${v.price}`}</span>
              {v.stock > 0 && <span className="text-xs font-normal text-gray-400">เหลือ {v.stock}</span>}
            </span>
          </button>
        ))}
      </div>
    )}

    {variants.length === 1 && (
      <p className="text-2xl font-bold text-blue-600 mt-3">฿{selectedVariant?.price}</p>
    )}

    <div className="mt-4">
      {!isOfficial ? (
        <a
          href={product.sellers?.contact_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center py-3 rounded-xl bg-slate-500 text-white font-medium hover:bg-slate-600"
        >
          ติดต่อซื้อ
        </a>
      ) : !isAvailable ? (
        <button disabled className="w-full py-3 rounded-xl bg-gray-100 text-gray-400 cursor-not-allowed">
          หมดแล้ว
        </button>
      ) : (
        <button
          onClick={handleAddToCart}
          className={`w-full py-3 rounded-xl font-medium transition-colors ${added ? 'bg-green-500 text-white' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
        >
          {added ? '✓ เพิ่มในตะกร้าแล้ว' : '+ ใส่ตะกร้า'}
        </button>
      )}
    </div>
  </div>
</div>
    </div> 
  )
}