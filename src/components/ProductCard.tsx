'use client'

import { addToCart } from '@/lib/cart'
import { useState } from 'react'

export default function ProductCard({ product }: { product: any }) {
  const [selectedVariantId, setSelectedVariantId] = useState(product.product_variants?.[0]?.id ?? '')
  const [added, setAdded] = useState(false)

  const isOfficial = product.sellers?.type === 'official'
  const variants = product.product_variants ?? []
  const selectedVariant = variants.find((v: any) => v.id === selectedVariantId) ?? variants[0]
  const totalStock = variants.reduce((sum: number, v: any) => sum + v.stock, 0)
  const isAvailable = totalStock > 0

  function handleAddToCart() {
    if (!selectedVariant) return
    addToCart({
      variantId: selectedVariant.id,
      productId: product.id,
      productName: product.name,
      variantName: selectedVariant.name,
      price: selectedVariant.price,
      quantity: 1,
      imageUrl: product.image_url
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-blue-50 overflow-hidden hover:shadow-md transition-shadow">
      <div className="w-full h-40 bg-blue-50 flex items-center justify-center overflow-hidden">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-blue-200 text-4xl">🃏</span>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs text-blue-400 mb-0.5">
          {product.type === 'set' ? 'เซ็ต' : product.type === 'single' ? 'การ์ดแยกใบ' : 'อุปกรณ์เสริม'}
        </p>
        <h3 className="font-semibold text-sm text-gray-800 leading-tight mb-1">{product.name}</h3>

        {isOfficial && variants.length > 1 && (
          <select
            value={selectedVariantId}
            onChange={e => setSelectedVariantId(e.target.value)}
            className="w-full border rounded-lg px-2 py-1 text-xs mt-1 text-gray-600"
          >
            {variants.map((v: any) => (
              <option key={v.id} value={v.id} disabled={v.stock === 0}>
                {v.name} — ฿{v.price} {v.stock === 0 ? '(หมด)' : `(เหลือ ${v.stock})`}
              </option>
            ))}
          </select>
        )}

        <div className="flex items-center justify-between mt-2">
          <span className="text-blue-600 font-bold text-sm">
            {selectedVariant ? `฿${selectedVariant.price}` : '-'}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${isAvailable ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
            {isAvailable ? `เหลือ ${selectedVariant?.stock ?? 0}` : 'หมด'}
          </span>
        </div>

        {!isAvailable ? (
          <button disabled className="mt-3 w-full text-sm py-1.5 rounded-lg bg-gray-100 text-gray-400 cursor-not-allowed">
            หมดแล้ว
          </button>
        ) : isOfficial ? (
          <button
            onClick={handleAddToCart}
            disabled={selectedVariant?.stock === 0}
            className={`mt-3 w-full text-sm py-1.5 rounded-lg font-medium transition-colors ${added ? 'bg-green-500 text-white' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
          >
            {added ? '✓ เพิ่มแล้ว' : '+ ใส่ตะกร้า'}
          </button>
        ) : (
          <a href={product.sellers?.contact_url} target="_blank" rel="noopener noreferrer"
            className="mt-3 block text-center text-sm py-1.5 rounded-lg bg-slate-500 text-white hover:bg-slate-600 font-medium">
            ติดต่อซื้อ
          </a>
        )}
      </div>
    </div>
  )
}