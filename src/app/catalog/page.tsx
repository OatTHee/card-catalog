import { createClient } from '@supabase/supabase-js'

async function getProducts() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )

  const { data: products, error: productError } = await supabase
    .from('products')
    .select('*')

  if (productError) {
    console.log('product error:', JSON.stringify(productError))
    return []
  }

  const { data: sellers, error: sellerError } = await supabase
    .from('sellers')
    .select('*')

  if (sellerError) {
    console.log('seller error:', JSON.stringify(sellerError))
    return []
  }

  const { data: variants, error: variantError } = await supabase
    .from('product_variants')
    .select('*')

  if (variantError) {
    console.log('variant error:', JSON.stringify(variantError))
    return []
  }

  // รวมข้อมูลเอง
  return products.map(product => ({
    ...product,
    sellers: sellers.find(s => s.id === product.seller_id) ?? null,
    product_variants: variants.filter(v => v.product_id === product.id)
  }))
}

export default async function CatalogPage() {
  const products = await getProducts()

  const official = products.filter(p => p.sellers?.type === 'official')
  const admin = products.filter(p => p.sellers?.type === 'admin')
  const vendor = products.filter(p => p.sellers?.type === 'vendor')

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-8">แคตตาล็อกสินค้า</h1>
      <Section title="สินค้ากลุ่ม (กึ่งออฟฟิเชียล)" products={official} />
      <Section title="สินค้าแอดมิน" products={admin} />
      <Section title="สินค้ามือสอง" products={vendor} />
    </main>
  )
}

function Section({ title, products }: { title: string, products: any[] }) {
  if (products.length === 0) return null

  return (
    <section className="mb-12">
      <h2 className="text-xl font-semibold mb-4 border-b pb-2">{title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
    <div className="border rounded-lg overflow-hidden shadow-sm">
      {product.image_url && (
        <img
          src={product.image_url}
          alt={product.name}
          className="w-full h-40 object-cover"
        />
      )}
      <div className="p-3">
        <h3 className="font-medium text-sm">{product.name}</h3>
        {minPrice && (
          <p className="text-sm text-gray-600 mt-1">เริ่มต้น ฿{minPrice}</p>
        )}
        <p className="text-xs text-gray-400 mt-1">
          {isAvailable ? `คงเหลือ ${totalStock} ชิ้น` : 'หมดแล้ว'}
        </p>
        {isAvailable ? (
          <a
            href={product.sellers?.contact_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block text-center text-sm py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600"
          >
            ติดต่อซื้อ
          </a>
        ) : (
          <button
            disabled
            className="mt-3 w-full text-center text-sm py-1.5 rounded bg-gray-200 text-gray-400"
          >
            หมดแล้ว
          </button>
        )}
      </div>
    </div>
  )
}