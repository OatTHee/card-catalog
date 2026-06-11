export const revalidate = 0

import Header from '@/components/Header'
import { createClient } from '@supabase/supabase-js'
import Footer from '@/components/Footer'

async function getProducts() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )


  const { data: sellers } = await supabase
    .from('sellers')
    .select('*')

 const { data: products } = await supabase
  .from('products')
  .select('*')
  .order('sort_order', { ascending: true })

const { data: variants } = await supabase
  .from('product_variants')
  .select('*')
  .order('sort_order', { ascending: true })

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
<Header />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Section title="สินค้ากลุ่ม" subtitle="ผลิตภัณฑ์ของทางกลุุ่ม และร้าน มาสเตอร์ ดี ไฟท์เตอร์" products={official} color="blue" />
        <Section title="สินค้าแอดมิน" subtitle="ของแอดมิน" products={admin} color="sky" />
        <Section title="สินค้ามือสอง" subtitle="ร้านค้าอื่นๆ" products={vendor} color="slate" />
      </div>
      <Footer />
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

import ProductCard from '@/components/ProductCard'