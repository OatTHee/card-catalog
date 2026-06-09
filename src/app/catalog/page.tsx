export const revalidate = 0

import { createClient } from '@supabase/supabase-js'

async function getProducts() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )

  const { data: products } = await supabase
    .from('products')
    .select('*')

  const { data: sellers } = await supabase
    .from('sellers')
    .select('*')

  const { data: variants } = await supabase
    .from('product_variants')
    .select('*')

  return (products ?? []).map(product => ({
    ...product,
    sellers: (sellers ?? []).find(s => s.id === product.seller_id) ?? null,
    product_variants: (variants ?? []).filter(v => v.product_id === product.id)
  }))
}

export default async function CatalogPage() {
  const products = await getProducts()

  const official = products.filter(p => p.sellers?.type === 'official' && p.is_available)
  const admin = products.filter(p => p.sellers?.type === 'admin' && p.is_available)
  const vendor = products.filter(p => p.sellers?.type === 'vendor' && p.is_available)

  return (
    <main className="min-h-screen bg-blue-50">
      <header className="bg-white border-b border-blue-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">D</span>
          </div>
          <h1 className="text-lg font-bold text-blue-900">DMT Shop</h1>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <Section title="สินค้ากลุ่ม" subtitle="กึ่งออฟฟิเชียล" products={official} color="blue" />
        <Section title="สินค้าแอดมิน" subtitle="ของแอดมิน" products={admin} color="sky" />
        <Section title="สินค้ามือสอง" subtitle="ร้านค้าอื่นๆ" products={vendor} color="slate" />
      </div>
    </main>
  )
}

function Section({ title, subtitle, products, color }: {
  title: string
  subtitle: string
  products: any[]
  color: string
}) {
  if (products.length === 0) return null

  const colors: Record<string, string> = {
    blue: 'bg-blue-500',
    sky: 'bg-sky-500',
    slate: 'bg-slate-500'
  }

  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-1 h-6 rounded-full ${colors[color]}`} />
        <div>
          <h2 className="text-base font-bold text-gray-800">{title}</h2>
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}

function ProductCard({ product }: { product: any }) {
  const minPrice = product.product_variants?.length > 0
    ? Math.min(...product.product_variants.map((v: any) => v.price))
    : null

  const totalStock = product.product_variants?.reduce(
    (sum: number, v: any) => sum + v.stock, 0
  ) ?? 0

  const isAvailable = totalStock > 0

  return (
    <div className="bg-white rounded-xl shadow-sm border border-blue-50 overflow-hidden hover:shadow-md transition-shadow">
      <div className="w-full h-40 bg-blue-50 flex items-center justify-center overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
          />
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
          {minPrice ? (
            <span className="text-blue-600 font-bold text-sm">฿{minPrice}</span>
          ) : (
            <span className="text-gray-300 text-sm">-</span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full ${isAvailable ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
            {isAvailable ? `เหลือ ${totalStock}` : 'หมด'}
          </span>
        </div>

        {isAvailable ? (
          
            href={product.sellers?.contact_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block text-center text-sm py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors font-medium"
          >
            ติดต่อซื้อ
          </a>
        ) : (
          <button
            disabled
            className="mt-3 w-full text-center text-sm py-1.5 rounded-lg bg-gray-100 text-gray-400 cursor-not-allowed"
          >
            หมดแล้ว
          </button>
        )}
      </div>
    </div>
  )
}