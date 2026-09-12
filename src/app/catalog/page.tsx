export const revalidate = 3600

import Header from '@/components/Header'
import { createClient } from '@supabase/supabase-js'
import Footer from '@/components/Footer'
import ProductCard from '@/components/ProductCard'

// PostgREST สะดุดเป็นครั้งคราว (504 Gateway Timeout) ทั้งที่ข้อมูลเล็กมาก
// เคยทำให้ sellers พังจนแคตตาล็อกว่างทั้งหน้า และเคยทำให้ build บน Vercel ล้ม
// ลองซ้ำแบบถอยห่างขึ้นเรื่อย ๆ 1 / 2 / 4 / 8 วินาที รวมรอได้ถึง ~15 วินาที
async function withRetry<T extends { error: unknown }>(
  run: () => PromiseLike<T>,
  attempts = 5
): Promise<T> {
  let last!: T
  for (let i = 0; i < attempts; i++) {
    try {
      last = await run()
      if (!last.error) return last
    } catch (e) {
      last = { error: e } as T
    }
    if (i < attempts - 1) await new Promise(r => setTimeout(r, 1000 * 2 ** i))
  }
  return last
}

async function getProducts() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )

  const [sellersRes, productsRes, variantsRes] = await Promise.all([
    withRetry(() => supabase.from('sellers').select('id, type')),
    withRetry(() =>
      supabase
        .from('products')
        .select('*')
        .eq('is_for_sale', true)
        .order('sort_order', { ascending: true })
    ),
    withRetry(() =>
      supabase
        .from('product_variants')
        .select('id, product_id, name, price, stock, image_url, sort_order')
        .order('sort_order', { ascending: true })
    ),
  ])

  // สำคัญ: ถ้า query ไหนพัง ต้อง throw ไม่ใช่ปล่อยให้ render เป็นหน้าว่าง
  // เพราะ ISR จะ cache หน้าว่างนั้นไว้ยาว ๆ (revalidate 3600)
  // throw แล้ว Next.js จะคง cache หน้าเดิมที่ดีอยู่ไว้ และลองใหม่รอบถัดไป
  const failed = [
    sellersRes.error && `sellers: ${(sellersRes.error as any)?.message ?? sellersRes.error}`,
    productsRes.error && `products: ${(productsRes.error as any)?.message ?? productsRes.error}`,
    variantsRes.error && `product_variants: ${(variantsRes.error as any)?.message ?? variantsRes.error}`,
  ].filter(Boolean)

  if (failed.length > 0) {
    throw new Error(`[catalog] โหลดข้อมูลจาก Supabase ไม่สำเร็จ (ลองแล้ว 5 ครั้ง) -> ${failed.join(' | ')}`)
  }

  const sellers = sellersRes.data ?? []
  const products = productsRes.data ?? []
  const variants = variantsRes.data ?? []

  return products.map(product => ({
    ...product,
    sellers: sellers.find(s => s.id === product.seller_id) ?? null,
    product_variants: variants.filter(v => v.product_id === product.id)
  }))
}

export default async function CatalogPage() {
  const products = await getProducts()

  const available = products.filter(p => p.is_available)
  const official = available.filter(p => p.sellers?.type === 'official')
  const admin = available.filter(p => p.sellers?.type === 'admin')
  const vendor = available.filter(p => p.sellers?.type === 'vendor')
  // สินค้าที่หา seller ไม่เจอ (ข้อมูลไม่ตรงกัน) เดิมจะหายไปเงียบ ๆ
  // ให้ไปโผล่ในกลุ่มสินค้ากลุ่มแทน จะได้ไม่หายทั้งหน้า
  const orphan = available.filter(p => !p.sellers)

  return (
    <main className="min-h-screen bg-blue-50">
<Header />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Section title="สินค้ากลุ่ม" subtitle="ผลิตภัณฑ์ของทางกลุุ่ม และร้าน มาสเตอร์ ดี ไฟท์เตอร์" products={[...official, ...orphan]} color="blue" />
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
