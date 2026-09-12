'use client'
import { uploadImage } from '@/lib/upload'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { revalidateCatalog } from '@/app/actions/revalidate'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, rectSortingStrategy, useSortable, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

// ---------- helpers ----------

const SHELF_GROUPS = [
  { key: 'official', title: 'สินค้ากลุ่ม', subtitle: 'ผลิตภัณฑ์ของทางกลุ่ม และร้าน มาสเตอร์ ดี ไฟท์เตอร์', bar: 'bg-blue-500' },
  { key: 'admin', title: 'สินค้าแอดมิน', subtitle: 'ของแอดมิน', bar: 'bg-sky-500' },
  { key: 'vendor', title: 'สินค้ามือสอง', subtitle: 'ร้านค้าอื่นๆ', bar: 'bg-slate-500' },
  { key: 'other', title: 'ยังไม่ได้กำหนดร้าน', subtitle: 'สินค้าพวกนี้จะไม่ขึ้นหน้าลูกค้า จนกว่าจะตั้งร้านให้', bar: 'bg-red-400' },
] as const

type ShelfKey = typeof SHELF_GROUPS[number]['key']
type StockFilter = 'all' | 'visible' | 'hidden' | 'out'

function totalStock(product: any) {
  return (product.product_variants ?? []).reduce((sum: number, v: any) => sum + (v.stock ?? 0), 0)
}

function minPrice(product: any) {
  const vs = product.product_variants ?? []
  return vs.length > 0 ? Math.min(...vs.map((v: any) => v.price)) : null
}

function typeLabel(product: any) {
  return product.type === 'set' ? 'เซ็ต' : product.type === 'single' ? 'การ์ดแยกใบ' : 'อุปกรณ์เสริม'
}

function groupOf(product: any): ShelfKey {
  const t = product.sellers?.type
  return t === 'official' || t === 'admin' || t === 'vendor' ? t : 'other'
}

function buildShelf(list: any[]): Record<ShelfKey, any[]> {
  const g: Record<ShelfKey, any[]> = { official: [], admin: [], vendor: [], other: [] }
  for (const p of list) g[groupOf(p)].push(p)
  return g
}

export default function AdminPage() {
  const [showManageVendors, setShowManageVendors] = useState(false)
  const [editProduct, setEditProduct] = useState<any>(null)
  const [sellers, setSellers] = useState<any[]>([])
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [shippingFee, setShippingFee] = useState('')

  // โหมดการใช้งาน: 'manage' = ค้นหา/กรอง/แก้ไข  |  'shelf' = จัดชั้นวาง (ลากเรียง)
  const [mode, setMode] = useState<'manage' | 'shelf'>('manage')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StockFilter>('all')
  const [detailId, setDetailId] = useState<string | null>(null)

  const [shelf, setShelf] = useState<Record<ShelfKey, any[]>>({ official: [], admin: [], vendor: [], other: [] })
  const [orderDirty, setOrderDirty] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)

  useEffect(() => {
    checkAuthAndLoad()
  }, [])

  async function checkAuthAndLoad() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '/login'; return }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      window.location.href = '/catalog'
      return
    }

    loadProducts()
  }

  async function handleUpdateShipping() {
    await supabase.from('settings').update({ value: shippingFee }).eq('key', 'shipping_fee')
    alert('บันทึกแล้ว')
  }

  async function loadProducts() {
    const { data: productsData } = await supabase
      .from('products')
      .select('*, sellers(*), product_variants(*)')
      .order('sort_order', { ascending: true })

    const { data: sellersData } = await supabase.from('sellers').select('*')
    const { data: settings } = await supabase.from('settings').select('value').eq('key', 'shipping_fee').single()

    const sorted = (productsData ?? []).map(p => ({
      ...p,
      product_variants: [...(p.product_variants ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
    }))

    setProducts(sorted)
    setSellers(sellersData ?? [])
    if (settings) setShippingFee(settings.value)
    setLoading(false)
  }

  async function handleDelete(productId: string) {
    if (!confirm('ลบสินค้านี้จริงไหม?')) return

    const { data: variants } = await supabase
      .from('product_variants')
      .select('id')
      .eq('product_id', productId)

    const variantIds = (variants ?? []).map(v => v.id)

    if (variantIds.length > 0) {
      await supabase.from('set_items').delete().in('variant_id', variantIds)
    }

    await supabase.from('product_variants').delete().eq('product_id', productId)

    const { error } = await supabase.from('products').delete().eq('id', productId)

    if (error) {
      alert('ลบไม่ได้ เนื่องจากมี order ที่เคยสั่งซื้อสินค้านี้อยู่\nแนะนำให้ซ่อนสินค้าแทนครับ')
      return
    }

    setDetailId(null)
    loadProducts()
    revalidateCatalog()
  }

  async function handleToggleAvailable(productId: string, current: boolean) {
    await supabase
      .from('products')
      .update({ is_available: !current })
      .eq('id', productId)
    loadProducts()
    revalidateCatalog()
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ---------- โหมดจัดชั้นวาง ----------

  function enterShelfMode() {
    setSearch('')
    setFilter('all')
    setDetailId(null)
    setShelf(buildShelf(products))
    setOrderDirty(false)
    setMode('shelf')
  }

  function leaveShelfMode() {
    if (orderDirty && !confirm('ยังไม่ได้บันทึกลำดับ ออกเลยไหม?')) return
    setOrderDirty(false)
    setMode('manage')
  }

  function handleShelfDragEnd(event: DragEndEvent, groupKey: ShelfKey) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const arr = shelf[groupKey]
    const oldIndex = arr.findIndex(p => p.id === active.id)
    const newIndex = arr.findIndex(p => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    setShelf({ ...shelf, [groupKey]: arrayMove(arr, oldIndex, newIndex) })
    setOrderDirty(true)
  }

  async function handleSaveOrder() {
    setSavingOrder(true)

    // เรียงต่อกันตามลำดับกลุ่มเดียวกับหน้าลูกค้า แล้วค่อยไล่เลข 0..n
    const ordered = [...shelf.official, ...shelf.admin, ...shelf.vendor, ...shelf.other]
    const changed = ordered
      .map((p, i) => ({ id: p.id, sort_order: i, was: p.sort_order }))
      .filter(u => u.was !== u.sort_order)

    // ยิงทีละชุด 10 รายการ กันยิงพร้อมกันทีเดียว 46 เส้น
    for (let i = 0; i < changed.length; i += 10) {
      await Promise.all(
        changed.slice(i, i + 10).map(u =>
          supabase.from('products').update({ sort_order: u.sort_order }).eq('id', u.id)
        )
      )
    }

    await loadProducts()
    revalidateCatalog()
    setSavingOrder(false)
    setOrderDirty(false)
    setMode('manage')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // ---------- ค้นหา / กรอง ----------

  const q = search.trim().toLowerCase()

  const searched = products.filter(p => {
    if (!q) return true
    const hay = [p.name, p.sellers?.name, ...(p.product_variants ?? []).map((v: any) => v.name)]
      .filter(Boolean).join(' ').toLowerCase()
    return hay.includes(q)
  })

  const counts = {
    all: searched.length,
    visible: searched.filter(p => p.is_available).length,
    hidden: searched.filter(p => !p.is_available).length,
    out: searched.filter(p => totalStock(p) === 0).length,
  }

  const visibleProducts = searched.filter(p => {
    if (filter === 'visible') return p.is_available
    if (filter === 'hidden') return !p.is_available
    if (filter === 'out') return totalStock(p) === 0
    return true
  })

  const detail = detailId ? products.find(p => p.id === detailId) ?? null : null

  if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-500">กำลังโหลด...</div>

  return (
    <main className="min-h-screen bg-slate-100">
      {/* แถบหลังบ้าน - สีเข้ม ให้ต่างจากหน้าลูกค้าชัดๆ */}
      <header className="bg-slate-800 text-white sticky top-0 z-20 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-bold bg-amber-400 text-slate-900 px-2 py-0.5 rounded">โหมดแอดมิน</span>
          <h1 className="font-bold text-sm">จัดการสินค้า</h1>
          <nav className="flex items-center gap-3 ml-auto text-xs flex-wrap">
            <a href="/admin/orders" className="text-slate-300 hover:text-white">Order</a>
            <a href="/admin/preorders" className="text-slate-300 hover:text-white">Pre-order</a>
            <a href="/admin/redeems" className="text-slate-300 hover:text-white">การแลก</a>
            <a href="/admin/players" className="text-slate-300 hover:text-white">แต้ม/EXP</a>
            <a href="/admin/managebag" className="text-slate-300 hover:text-white">กระเป๋า</a>
            <a href="/catalog" target="_blank" className="text-slate-400 hover:text-white border-l border-slate-600 pl-3">ดูหน้าลูกค้า ↗</a>
            <button onClick={handleLogout} className="text-slate-400 hover:text-red-300">ออกจากระบบ</button>
          </nav>
        </div>
      </header>

      {/* แถบเครื่องมือ */}
      <div className="bg-white border-b border-slate-200 sticky top-[52px] z-10">
        <div className="max-w-6xl mx-auto px-4 py-3">
          {mode === 'manage' ? (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่อสินค้า / ไซซ์ / ร้าน"
                  className="w-full border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {search && (
                  <button onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm">✕</button>
                )}
              </div>

              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="ทั้งหมด" count={counts.all} />
                <FilterChip active={filter === 'visible'} onClick={() => setFilter('visible')} label="แสดงอยู่" count={counts.visible} />
                <FilterChip active={filter === 'hidden'} onClick={() => setFilter('hidden')} label="ซ่อนอยู่" count={counts.hidden} />
                <FilterChip active={filter === 'out'} onClick={() => setFilter('out')} label="ของหมด" count={counts.out} />
              </div>

              <div className="flex gap-2 ml-auto">
                <button onClick={enterShelfMode}
                  className="text-sm bg-slate-700 text-white px-3 py-2 rounded-lg hover:bg-slate-800">
                  ⠿ จัดชั้นวาง
                </button>
                <button onClick={() => setShowManageVendors(true)}
                  className="text-sm bg-slate-100 text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-200">
                  ร้านค้า
                </button>
                <button onClick={() => setShowAddProduct(true)}
                  className="text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">
                  + เพิ่มสินค้า
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-sm">
                <p className="font-semibold text-slate-800">⠿ กำลังจัดชั้นวาง</p>
                <p className="text-xs text-slate-500">ลากการ์ดสลับที่ได้ ลำดับนี้คือลำดับที่ลูกค้าจะเห็น — ย้ายข้ามกลุ่มไม่ได้ (ถ้าจะย้ายกลุ่ม ให้แก้ร้านค้าของสินค้า)</p>
              </div>
              <div className="flex gap-2 ml-auto">
                <button onClick={leaveShelfMode}
                  className="text-sm bg-slate-100 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-200">
                  ยกเลิก
                </button>
                <button onClick={handleSaveOrder} disabled={!orderDirty || savingOrder}
                  className="text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  {savingOrder ? 'กำลังบันทึก...' : orderDirty ? 'บันทึกลำดับ' : 'ยังไม่มีการเปลี่ยนแปลง'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {mode === 'manage' ? (
          <>
            {visibleProducts.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center text-slate-400">
                {q ? `ไม่พบสินค้าที่ตรงกับ "${search}"` : 'ไม่มีสินค้าในตัวกรองนี้'}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {visibleProducts.map(product => (
                  <AdminProductCard key={product.id} product={product} onClick={() => setDetailId(product.id)} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-8">
            {SHELF_GROUPS.map(group => {
              const items = shelf[group.key]
              if (!items || items.length === 0) return null
              return (
                <section key={group.key}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-1 h-6 rounded-full ${group.bar}`} />
                    <div>
                      <h2 className="text-sm font-bold text-slate-800">{group.title}</h2>
                      <p className="text-xs text-slate-400">{group.subtitle}</p>
                    </div>
                    <span className="ml-auto text-xs text-slate-400">{items.length} ชิ้น</span>
                  </div>
                  <DndContext sensors={sensors} collisionDetection={closestCenter}
                    onDragEnd={e => handleShelfDragEnd(e, group.key)}>
                    <SortableContext items={items.map(p => p.id)} strategy={rectSortingStrategy}>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {items.map((product, i) => (
                          <SortableShelfCard key={product.id} product={product} position={i + 1} />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </section>
              )
            })}
          </div>
        )}

        {mode === 'manage' && (
          <div className="mt-8 bg-white rounded-xl p-4 border border-slate-200">
            <h2 className="font-semibold mb-3 text-sm text-slate-700">ตั้งค่าค่าส่ง</h2>
            <div className="flex gap-2 items-center">
              <input
                value={shippingFee}
                onChange={e => setShippingFee(e.target.value)}
                type="number"
                className="border border-slate-300 rounded px-3 py-2 text-sm w-32"
              />
              <span className="text-sm text-slate-500">บาท</span>
              <button onClick={handleUpdateShipping}
                className="text-sm bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                บันทึก
              </button>
            </div>
          </div>
        )}
      </div>

      {detail && (
        <ProductDetailModal
          product={detail}
          onClose={() => setDetailId(null)}
          onEdit={() => { setEditProduct(detail); setDetailId(null) }}
          onDelete={() => handleDelete(detail.id)}
          onToggleAvailable={() => handleToggleAvailable(detail.id, detail.is_available)}
          onStockUpdate={loadProducts}
        />
      )}

      {showAddProduct && (
        <AddProductModal
          sellers={sellers}
          onClose={() => setShowAddProduct(false)}
          onSaved={() => {
            setShowAddProduct(false)
            loadProducts()
          }}
        />
      )}
      {editProduct && (
        <EditProductModal
          product={editProduct}
          sellers={sellers}
          onClose={() => setEditProduct(null)}
          onSaved={() => {
            setEditProduct(null)
            loadProducts()
          }}
        />
      )}
      {showManageVendors && (
        <ManageVendorsModal
          sellers={sellers}
          onClose={() => setShowManageVendors(false)}
          onSaved={loadProducts}
        />
      )}
    </main>
  )
}

function FilterChip({ active, onClick, label, count }: {
  active: boolean, onClick: () => void, label: string, count: number
}) {
  return (
    <button onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-md whitespace-nowrap ${active ? 'bg-white shadow-sm text-slate-800 font-medium' : 'text-slate-500 hover:text-slate-700'}`}>
      {label} <span className={active ? 'text-slate-400' : 'text-slate-400'}>{count}</span>
    </button>
  )
}

// การ์ดสินค้าในโหมดจัดการ - หน้าตาใกล้เคียงหน้าลูกค้า แต่เติมสต็อกกับสถานะซ่อนให้แอดมินเห็น
function AdminProductCard({ product, onClick }: { product: any, onClick: () => void }) {
  const stock = totalStock(product)
  const price = minPrice(product)
  const variantCount = (product.product_variants ?? []).length

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 ${product.is_available ? 'border-slate-200' : 'border-dashed border-slate-300'}`}
    >
      <div className="relative w-full aspect-square bg-slate-50 overflow-hidden">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} loading="lazy"
            className={`w-full h-full object-contain ${product.is_available ? '' : 'opacity-40 grayscale'}`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300 text-4xl">🃏</div>
        )}
        {!product.is_available && (
          <span className="absolute top-2 left-2 text-[10px] font-medium bg-slate-700 text-white px-2 py-0.5 rounded">ซ่อนอยู่</span>
        )}
        {stock === 0 && (
          <span className="absolute top-2 right-2 text-[10px] font-medium bg-red-500 text-white px-2 py-0.5 rounded">ของหมด</span>
        )}
      </div>
      <div className="p-3">
        <p className="text-[11px] text-slate-400 mb-0.5 flex flex-wrap gap-1 items-center">
          <span>{typeLabel(product)}</span>
          {product.is_preorder && <span className="text-orange-600 bg-orange-50 border border-orange-200 rounded px-1">พรีออเดอร์</span>}
          {product.is_for_redeem && <span className="text-amber-600 bg-amber-50 border border-amber-200 rounded px-1">แลกแต้ม</span>}
          {!product.is_for_sale && <span className="text-slate-500 bg-slate-100 border border-slate-200 rounded px-1">ไม่ขาย</span>}
        </p>
        <h3 className="font-semibold text-sm text-slate-800 leading-tight mb-1 line-clamp-2">{product.name}</h3>
        <p className="text-[11px] text-slate-400 mb-2">{product.sellers?.name ?? 'ยังไม่ได้ตั้งร้าน'}</p>
        <div className="flex items-center justify-between">
          <span className="text-blue-600 font-bold text-sm">{price != null ? `฿${price}` : '-'}</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${stock > 0 ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-500'}`}>
            สต็อก {stock}
          </span>
        </div>
        {variantCount > 0 && (
          <p className="text-[10px] text-slate-400 mt-1">{variantCount} ตัวเลือก</p>
        )}
      </div>
    </div>
  )
}

// การ์ดในโหมดจัดชั้นวาง - ลากได้ทั้งใบ ไม่มีปุ่มอะไรให้กดพลาด
function SortableShelfCard({ product, position }: { product: any, position: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className="bg-white rounded-xl border border-slate-200 overflow-hidden cursor-grab active:cursor-grabbing select-none shadow-sm">
      <div className="relative w-full aspect-square bg-slate-50 overflow-hidden">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} loading="lazy"
            className={`w-full h-full object-contain pointer-events-none ${product.is_available ? '' : 'opacity-40 grayscale'}`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300 text-4xl">🃏</div>
        )}
        <span className="absolute top-2 left-2 text-[10px] font-bold bg-slate-800 text-white w-6 h-6 rounded-full flex items-center justify-center">
          {position}
        </span>
        {!product.is_available && (
          <span className="absolute top-2 right-2 text-[10px] bg-slate-700 text-white px-2 py-0.5 rounded">ซ่อนอยู่</span>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-sm text-slate-800 leading-tight line-clamp-2">{product.name}</h3>
        <p className="text-[11px] text-slate-400 mt-1">⠿ ลากเพื่อสลับที่</p>
      </div>
    </div>
  )
}

// หน้าต่างรายละเอียด - แก้สต็อก จัดลำดับตัวเลือก แสดง/ซ่อน แก้ไข ลบ
function ProductDetailModal({ product, onClose, onEdit, onDelete, onToggleAvailable, onStockUpdate }: {
  product: any
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleAvailable: () => void
  onStockUpdate: () => void
}) {
  const [variants, setVariants] = useState<any[]>(product.product_variants ?? [])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    setVariants(product.product_variants ?? [])
  }, [product])

  async function handleVariantDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = variants.findIndex((v: any) => v.id === active.id)
    const newIndex = variants.findIndex((v: any) => v.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const newVariants = arrayMove<any>(variants, oldIndex, newIndex)
    setVariants(newVariants)

    await Promise.all(
      newVariants.map((v: any, i: number) =>
        supabase.from('product_variants').update({ sort_order: i }).eq('id', v.id)
      )
    )
    onStockUpdate()
    revalidateCatalog()
  }

  const stock = totalStock({ product_variants: variants })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start md:items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl my-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-4 p-5 border-b border-slate-100">
          <div className="w-24 h-24 shrink-0 bg-slate-50 rounded-xl overflow-hidden">
            {product.image_url
              ? <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" />
              : <div className="w-full h-full flex items-center justify-center text-slate-300 text-3xl">🃏</div>}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800 leading-tight">{product.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{product.sellers?.name ?? 'ยังไม่ได้ตั้งร้าน'} · {typeLabel(product)}</p>
            <div className="flex flex-wrap gap-1 mt-2 text-[11px]">
              {product.is_preorder && <span className="text-orange-600 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">พรีออเดอร์</span>}
              {product.is_for_redeem && <span className="text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">แลกแต้ม</span>}
              {!product.is_for_sale && <span className="text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">ไม่ได้ตั้งขาย</span>}
              <span className={`rounded px-1.5 py-0.5 border ${stock > 0 ? 'text-slate-600 bg-slate-50 border-slate-200' : 'text-red-500 bg-red-50 border-red-200'}`}>
                สต็อกรวม {stock}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700">ตัวเลือกและสต็อก</h3>
            <span className="text-[11px] text-slate-400">ลาก ⠿ เพื่อจัดลำดับที่ลูกค้าเห็น</span>
          </div>

          {variants.length === 0 ? (
            <p className="text-sm text-slate-400 bg-slate-50 rounded-lg p-4 text-center">ยังไม่มีตัวเลือก — กด &quot;แก้ไขสินค้า&quot; เพื่อเพิ่ม</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleVariantDragEnd}>
              <SortableContext items={variants.map((v: any) => v.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {variants.map((variant: any) => (
                    <SortableVariantRow key={variant.id} variant={variant} onStockUpdate={onStockUpdate} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="flex flex-wrap gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button onClick={onToggleAvailable}
            className={product.is_available
              ? 'text-sm px-3 py-2 rounded-lg bg-green-100 text-green-700 hover:bg-green-200'
              : 'text-sm px-3 py-2 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300'}>
            {product.is_available ? '👁 ลูกค้าเห็นอยู่ — กดเพื่อซ่อน' : '🚫 ซ่อนอยู่ — กดเพื่อแสดง'}
          </button>
          <button onClick={onEdit}
            className="text-sm px-3 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600">
            แก้ไขสินค้า
          </button>
          <button onClick={onDelete}
            className="text-sm px-3 py-2 rounded-lg text-red-500 hover:bg-red-50 ml-auto">
            ลบสินค้า
          </button>
        </div>
      </div>
    </div>
  )
}

function SortableVariantRow({ variant, onStockUpdate }: { variant: any, onStockUpdate: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: variant.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-2">
      <span {...attributes} {...listeners}
        className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 px-1 select-none">⠿</span>
      <VariantRow variant={variant} onStockUpdate={onStockUpdate} />
    </div>
  )
}

function VariantRow({ variant, onStockUpdate }: { variant: any, onStockUpdate: () => void }) {
  const [stock, setStock] = useState<number>(variant.stock ?? 0)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)

  useEffect(() => {
    setStock(variant.stock ?? 0)
  }, [variant.stock])

  const dirty = stock !== (variant.stock ?? 0)

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase
      .from('product_variants')
      .update({ stock })
      .eq('id', variant.id)
    setSaving(false)

    if (error) {
      alert('บันทึกสต็อกไม่สำเร็จ: ' + error.message)
      return
    }

    setSavedAt(Date.now())
    onStockUpdate()
    revalidateCatalog()
  }

  return (
    <div className="flex items-center justify-between gap-2 flex-1 min-w-0">
      <div className="min-w-0">
        <p className="text-sm text-slate-700 truncate">{variant.name}</p>
        <p className="text-xs text-slate-400">
          ฿{variant.price}
          {variant.redeem_points != null && <span className="text-amber-500"> · ✨{variant.redeem_points}</span>}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {savedAt > 0 && !dirty && !saving && <span className="text-xs text-green-600">✓</span>}
        <button
          onClick={() => setStock(Math.max(0, stock - 1))}
          className="w-7 h-7 rounded border border-slate-300 text-slate-500 hover:bg-slate-100 leading-none">−</button>
        <input
          type="number"
          value={stock}
          onChange={e => setStock(Math.max(0, Number(e.target.value)))}
          className={`w-14 border rounded px-2 py-1 text-sm text-center ${stock === 0 ? 'border-red-300 text-red-500' : 'border-slate-300'}`}
          min={0}
        />
        <button
          onClick={() => setStock(stock + 1)}
          className="w-7 h-7 rounded border border-slate-300 text-slate-500 hover:bg-slate-100 leading-none">+</button>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {saving ? '...' : 'บันทึก'}
        </button>
      </div>
    </div>
  )
}

function AddProductModal({ sellers, onClose, onSaved }: {
  sellers: any[],
  onClose: () => void,
  onSaved: () => void
}) {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [name, setName] = useState('')
  const [type, setType] = useState('set')
  const [sellerId, setSellerId] = useState(sellers[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [variants, setVariants] = useState([{ name: '', price: '', stock: '', image_url: '', imageFile: null as File | null, redeemPoints: '' }])
  const [saving, setSaving] = useState(false)
  const [isForSale, setIsForSale] = useState(true)
  const [isForRedeem, setIsForRedeem] = useState(false)
  const [isPreorder, setIsPreorder] = useState(false)

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  setImageFile(file)
  setImagePreview(URL.createObjectURL(file))
}

  function addVariantRow() {
    setVariants([...variants, { name: '', price: '', stock: '', image_url: '', imageFile: null, redeemPoints: '' }])
  }

  function removeVariantRow(index: number) {
    setVariants(variants.filter((_, i) => i !== index))
  }

  function updateVariant(index: number, field: string, value: any) {
  const updated = [...variants]
  updated[index] = { ...updated[index], [field]: value }
  setVariants(updated)
}

  async function handleSave() {
  if (!name || !sellerId) return
  setSaving(true)

  let imageUrl = ''
  if (imageFile) {
    const url = await uploadImage(imageFile)
    if (url) imageUrl = url
  }

  const { data: product, error } = await supabase
    .from('products')
    .insert({ name, type, seller_id: sellerId, description, image_url: imageUrl, is_available: true, is_for_sale: isForSale, is_for_redeem: isForRedeem, is_preorder: isPreorder })
    .select()
    .single()

  if (error || !product) {
    console.error(error)
    setSaving(false)
    return
  }

  const validVariants = variants.filter(v => v.name && v.price)
if (validVariants.length > 0) {
  for (const v of validVariants) {
    let imageUrl = ''
    if (v.imageFile) {
      const url = await uploadImage(v.imageFile)
      if (url) imageUrl = url
    }
    await supabase.from('product_variants').insert({
      product_id: product.id,
      name: v.name,
      price: Number(v.price),
      stock: Number(v.stock) || 0,
      image_url: imageUrl,
      redeem_points: isForRedeem && v.redeemPoints ? Number(v.redeemPoints) : null
    })
  }
}
  setSaving(false)
  onSaved()
  revalidateCatalog()
}

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-screen overflow-y-auto p-6">
        <h2 className="text-lg font-bold mb-4">เพิ่มสินค้าใหม่</h2>

        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-600">ชื่อสินค้า</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1"
              placeholder="เช่น เซ็ตเปลี่ยนเกลือเป็นทอง"
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">ประเภท</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1"
            >
              <option value="set">เซ็ต</option>
              <option value="single">การ์ดแยกใบ</option>
              <option value="accessory">อุปกรณ์เสริม</option>
              <option value="gacha">ซองสุ่ม</option>
            </select>
            {type === 'gacha' && (
              <p className="text-xs text-purple-700 mt-1">
                🎁 บันทึกสินค้านี้ก่อน แล้วเข้าไปแก้ไข (แก้ไขสินค้า) เพื่อตั้งค่ารางวัลของแต่ละ variant
              </p>
            )}
          </div>

          <div>
            <label className="text-sm text-gray-600">ผู้ขาย</label>
            <select
              value={sellerId}
              onChange={e => setSellerId(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1"
            >
              {sellers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-600">รายละเอียด (ไม่บังคับ)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1"
              rows={2}
            />
          </div>

          <div className="flex flex-wrap gap-4 border rounded-lg p-3 bg-gray-50">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={isForSale} onChange={e => setIsForSale(e.target.checked)} />
              ขายในร้านค้า (/catalog)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={isForRedeem} onChange={e => setIsForRedeem(e.target.checked)} />
              เปิดให้แลกด้วยแต้ม (/redeem)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={isPreorder} onChange={e => setIsPreorder(e.target.checked)} />
              📦 สินค้าพรีออเดอร์
            </label>
          </div>
          {isPreorder && (
            <p className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
              สินค้าพรีออเดอร์จะถูกส่งคนละรอบกับสินค้าในสต็อก ออเดอร์จะไปโผล่ที่หน้า &ldquo;จัดการ Pre-order&rdquo;
              และถ้าลูกค้าสั่งปนกับสินค้าในสต็อกจะคิดค่าส่ง 2 เท่า เว้นแต่ลูกค้าติ๊กให้ส่งพร้อมกัน
            </p>
          )}
<div>
  <label className="text-sm text-gray-600">รูปสินค้า</label>
  <input
    type="file"
    accept="image/*"
    onChange={handleImageChange}
    className="w-full text-sm mt-1"
  />
  {imagePreview && (
    <img
      src={imagePreview}
      alt="preview"
      className="mt-2 w-full h-40 object-cover rounded"
    />
  )}
</div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-gray-600">Variants</label>
              <button
                onClick={addVariantRow}
                className="text-xs text-blue-500 hover:text-blue-700"
              >
                + เพิ่ม variant
              </button>
            </div>
            {variants.map((v, i) => (
  <div key={i} className="border rounded-lg p-2 mb-2 space-y-2">
    <div className="flex gap-2">
      <input
        value={v.name}
        onChange={e => updateVariant(i, 'name', e.target.value)}
        placeholder="ชื่อ"
        className="flex-1 border rounded px-2 py-1 text-sm"
      />
      <input
        value={v.price}
        onChange={e => updateVariant(i, 'price', e.target.value)}
        placeholder="ราคา"
        type="number"
        className="w-20 border rounded px-2 py-1 text-sm"
      />
      <input
        value={v.stock}
        onChange={e => updateVariant(i, 'stock', e.target.value)}
        placeholder="สต็อก"
        type="number"
        className="w-20 border rounded px-2 py-1 text-sm"
      />
      {variants.length > 1 && (
        <button onClick={() => removeVariantRow(i)} className="text-red-400 text-sm">✕</button>
      )}
    </div>
    {isForRedeem && (
      <input
        value={v.redeemPoints}
        onChange={e => updateVariant(i, 'redeemPoints', e.target.value)}
        placeholder="แต้มที่ใช้แลก (ว่าง = แลก variant นี้ไม่ได้)"
        type="number"
        className="w-full border rounded px-2 py-1 text-sm border-amber-300 bg-amber-50"
      />
    )}
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) updateVariant(i, 'imageFile', file)
        }}
        className="w-full text-xs"
      />
      {v.imageFile && (
        <img src={URL.createObjectURL(v.imageFile)} className="mt-1 h-16 object-cover rounded" />
      )}
    </div>
  </div>
))}
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-500 text-white py-2 rounded text-sm hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 border py-2 rounded text-sm hover:bg-gray-50"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  )
}
function EditProductModal({ product, sellers, onClose, onSaved }: {
  product: any,
  sellers: any[],
  onClose: () => void,
  onSaved: () => void
}) {
    const [imageFile, setImageFile] = useState<File | null>(null)
const [imagePreview, setImagePreview] = useState<string>(product.image_url ?? '')
  const [name, setName] = useState(product.name)
  const [type, setType] = useState(product.type)
  const [sellerId, setSellerId] = useState(product.seller_id)
  const [description, setDescription] = useState(product.description ?? '')
  const [variants, setVariants] = useState<any[]>(
    (product.product_variants ?? []).map((v: any) => ({ ...v, redeemPoints: v.redeem_points ?? '' }))
  )
  const [newVariants, setNewVariants] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [isForSale, setIsForSale] = useState(product.is_for_sale ?? true)
  const [isForRedeem, setIsForRedeem] = useState(product.is_for_redeem ?? false)
  const [isPreorder, setIsPreorder] = useState(product.is_preorder ?? false)
  const [gachaConfigVariant, setGachaConfigVariant] = useState<any>(null)
function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  setImageFile(file)
  setImagePreview(URL.createObjectURL(file))
}
  function addNewVariantRow() {
    setNewVariants([...newVariants, { name: '', price: '', stock: '', redeemPoints: '' }])
  }

  function updateNewVariant(index: number, field: string, value: string) {
    const updated = [...newVariants]
    updated[index] = { ...updated[index], [field]: value }
    setNewVariants(updated)
  }

  function updateExistingVariant(index: number, field: string, value: string) {
    const updated = [...variants]
    updated[index] = { ...updated[index], [field]: value }
    setVariants(updated)
  }

  async function handleDeleteVariant(variantId: string) {
    await supabase.from('product_variants').delete().eq('id', variantId)
    setVariants(variants.filter(v => v.id !== variantId))
    revalidateCatalog()
  }

  async function handleSave() {
  setSaving(true)

  let imageUrl = product.image_url ?? ''
  if (imageFile) {
    const url = await uploadImage(imageFile)
    if (url) imageUrl = url
  }

  await supabase
    .from('products')
    .update({ name, type, seller_id: sellerId, description, image_url: imageUrl, is_for_sale: isForSale, is_for_redeem: isForRedeem, is_preorder: isPreorder })
    .eq('id', product.id)

  for (const v of variants) {
  await supabase.from('product_variants')
    .update({
      name: v.name,
      price: Number(v.price),
      stock: Number(v.stock),
      image_url: v.image_url,
      redeem_points: isForRedeem && v.redeemPoints ? Number(v.redeemPoints) : null
    })
    .eq('id', v.id)
}

  const validNew = newVariants.filter(v => v.name && v.price)
  if (validNew.length > 0) {
    await supabase.from('product_variants').insert(
      validNew.map(v => ({
        product_id: product.id,
        name: v.name,
        price: Number(v.price),
        stock: Number(v.stock) || 0,
        redeem_points: isForRedeem && v.redeemPoints ? Number(v.redeemPoints) : null
      }))
    )
  }

  setSaving(false)
  onSaved()
  revalidateCatalog()
}

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-screen overflow-y-auto p-6">
        <h2 className="text-lg font-bold mb-4">แก้ไขสินค้า</h2>

        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-600">ชื่อสินค้า</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1"
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">ประเภท</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1"
            >
              <option value="set">เซ็ต</option>
              <option value="single">การ์ดแยกใบ</option>
              <option value="accessory">อุปกรณ์เสริม</option>
              <option value="gacha">ซองสุ่ม</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-600">ผู้ขาย</label>
            <select
              value={sellerId}
              onChange={e => setSellerId(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1"
            >
              {sellers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-600">รายละเอียด</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1"
              rows={2}
            />
          </div>

          <div className="flex flex-wrap gap-4 border rounded-lg p-3 bg-gray-50">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={isForSale} onChange={e => setIsForSale(e.target.checked)} />
              ขายในร้านค้า (/catalog)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={isForRedeem} onChange={e => setIsForRedeem(e.target.checked)} />
              เปิดให้แลกด้วยแต้ม (/redeem)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={isPreorder} onChange={e => setIsPreorder(e.target.checked)} />
              📦 สินค้าพรีออเดอร์
            </label>
          </div>
          {isPreorder && (
            <p className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
              สินค้าพรีออเดอร์จะถูกส่งคนละรอบกับสินค้าในสต็อก ออเดอร์จะไปโผล่ที่หน้า &ldquo;จัดการ Pre-order&rdquo;
              และถ้าลูกค้าสั่งปนกับสินค้าในสต็อกจะคิดค่าส่ง 2 เท่า เว้นแต่ลูกค้าติ๊กให้ส่งพร้อมกัน
            </p>
          )}
<div>
  <label className="text-sm text-gray-600">รูปสินค้า</label>
  <input
    type="file"
    accept="image/*"
    onChange={handleImageChange}
    className="w-full text-sm mt-1"
  />
  {imagePreview && (
    <img
      src={imagePreview}
      alt="preview"
      className="mt-2 w-full h-40 object-cover rounded"
    />
  )}
</div>
          {type === 'gacha' && (
            <div className="border border-purple-300 bg-purple-50 rounded-lg p-3 text-sm text-purple-800">
              🎁 สินค้าประเภทซองสุ่ม: บันทึก variant ให้เสร็จก่อน แล้วกด "⚙️ ตั้งค่าซองสุ่ม" ที่แต่ละ variant ด้านล่างเพื่อกำหนดจำนวนเลขต่อซองและรางวัล
            </div>
          )}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-gray-600">Variants</label>
              <button
                onClick={addNewVariantRow}
                className="text-xs text-blue-500 hover:text-blue-700"
              >
                + เพิ่ม variant
              </button>
            </div>

            {variants.map((v, i) => (
  <div key={v.id} className="border rounded-lg p-2 mb-2 space-y-2">
    <div className="flex gap-2">
      <input value={v.name} onChange={e => updateExistingVariant(i, 'name', e.target.value)}
        placeholder="ชื่อ" className="flex-1 border rounded px-2 py-1 text-sm" />
      <input value={v.price} onChange={e => updateExistingVariant(i, 'price', e.target.value)}
        type="number" placeholder="ราคา" className="w-20 border rounded px-2 py-1 text-sm" />
      <input value={v.stock} onChange={e => updateExistingVariant(i, 'stock', e.target.value)}
        type="number" placeholder="สต็อก" className="w-20 border rounded px-2 py-1 text-sm" />
      <button onClick={() => handleDeleteVariant(v.id)} className="text-red-400 text-sm">✕</button>
    </div>
    {isForRedeem && (
      <input
        value={v.redeemPoints}
        onChange={e => updateExistingVariant(i, 'redeemPoints', e.target.value)}
        placeholder="แต้มที่ใช้แลก (ว่าง = แลก variant นี้ไม่ได้)"
        type="number"
        className="w-full border rounded px-2 py-1 text-sm border-amber-300 bg-amber-50"
      />
    )}
    <div>
      {v.image_url && <img src={v.image_url} className="h-16 object-cover rounded mb-1" />}
      <input
        type="file"
        accept="image/*"
        onChange={async e => {
          const file = e.target.files?.[0]
          if (!file) return
          const url = await uploadImage(file)
          if (url) updateExistingVariant(i, 'image_url', url)
        }}
        className="w-full text-xs"
      />
    </div>
    {type === 'gacha' && (
      <button
        onClick={() => setGachaConfigVariant(v)}
        className="text-xs bg-purple-100 text-purple-700 border border-purple-300 rounded px-2 py-1 hover:bg-purple-200"
      >
        ⚙️ ตั้งค่าซองสุ่ม
      </button>
    )}
  </div>
))}
            {newVariants.map((v, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  value={v.name}
                  onChange={e => updateNewVariant(i, 'name', e.target.value)}
                  placeholder="ชื่อ (ใหม่)"
                  className="flex-1 border rounded px-2 py-1 text-sm border-blue-300"
                />
                <input
                  value={v.price}
                  onChange={e => updateNewVariant(i, 'price', e.target.value)}
                  type="number"
                  placeholder="ราคา"
                  className="w-20 border rounded px-2 py-1 text-sm border-blue-300"
                />
                <input
                  value={v.stock}
                  onChange={e => updateNewVariant(i, 'stock', e.target.value)}
                  type="number"
                  placeholder="สต็อก"
                  className="w-20 border rounded px-2 py-1 text-sm border-blue-300"
                />
                <button
                  onClick={() => setNewVariants(newVariants.filter((_, j) => j !== i))}
                  className="text-red-400 hover:text-red-600 text-sm"
                >
                  ✕
                </button>
              </div>
            ))}
            {isForRedeem && newVariants.map((v, i) => (
              <input
                key={'redeem-' + i}
                value={v.redeemPoints}
                onChange={e => updateNewVariant(i, 'redeemPoints', e.target.value)}
                placeholder={`แต้มที่ใช้แลก "${v.name || 'variant ใหม่'}" (ว่าง = แลกไม่ได้)`}
                type="number"
                className="w-full border rounded px-2 py-1 text-sm border-amber-300 bg-amber-50 mb-2 -mt-1"
              />
            ))}
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-500 text-white py-2 rounded text-sm hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 border py-2 rounded text-sm hover:bg-gray-50"
          >
            ยกเลิก
          </button>
        </div>
      </div>
      {gachaConfigVariant && (
        <GachaConfigModal
          variant={gachaConfigVariant}
          onClose={() => setGachaConfigVariant(null)}
        />
      )}
    </div>
  )
}
function GachaConfigModal({ variant, onClose }: {
  variant: any,
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [configId, setConfigId] = useState<string | null>(null)
  const [rollsPerPack, setRollsPerPack] = useState('1')
  const [prizes, setPrizes] = useState<any[]>([])

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    setLoading(true)
    const { data: config } = await supabase
      .from('gacha_configs')
      .select('*')
      .eq('variant_id', variant.id)
      .maybeSingle()

    if (config) {
      setConfigId(config.id)
      setRollsPerPack(String(config.rolls_per_pack ?? 1))
      const { data: prizeRows } = await supabase
        .from('gacha_prizes')
        .select('*')
        .eq('gacha_config_id', config.id)
        .order('sort_order', { ascending: true })
      setPrizes(
        (prizeRows ?? []).map(p => ({
          id: p.id,
          label: p.label,
          image_url: p.image_url ?? '',
          weight: String(p.weight),
          is_jackpot: p.is_jackpot
        }))
      )
    }
    setLoading(false)
  }

  function addPrizeRow() {
    setPrizes([...prizes, { label: '', image_url: '', weight: '1', is_jackpot: false }])
  }

  function updatePrize(index: number, field: string, value: any) {
    const updated = [...prizes]
    updated[index] = { ...updated[index], [field]: value }
    setPrizes(updated)
  }

  function removePrize(index: number) {
    setPrizes(prizes.filter((_, i) => i !== index))
  }

  const totalWeight = prizes.reduce((sum, p) => sum + (Number(p.weight) || 0), 0)

  async function handleSave() {
    const validPrizes = prizes.filter(p => p.label && Number(p.weight) > 0)
    if (validPrizes.length === 0) {
      alert('ต้องมีรางวัลอย่างน้อย 1 รายการ')
      return
    }
    setSaving(true)

    let cfgId = configId
    if (!cfgId) {
      const { data: inserted, error } = await supabase
        .from('gacha_configs')
        .insert({ variant_id: variant.id, rolls_per_pack: Number(rollsPerPack) || 1 })
        .select()
        .single()
      if (error || !inserted) {
        setSaving(false)
        alert('บันทึกไม่สำเร็จ: ' + (error?.message ?? 'unknown error'))
        return
      }
      cfgId = inserted.id
      setConfigId(cfgId)
    } else {
      await supabase
        .from('gacha_configs')
        .update({ rolls_per_pack: Number(rollsPerPack) || 1 })
        .eq('id', cfgId)
    }

    // simplest-correct approach: replace the whole prize list
    await supabase.from('gacha_prizes').delete().eq('gacha_config_id', cfgId)
    await supabase.from('gacha_prizes').insert(
      validPrizes.map((p, i) => ({
        gacha_config_id: cfgId,
        label: p.label,
        image_url: p.image_url || null,
        weight: Number(p.weight),
        is_jackpot: !!p.is_jackpot,
        sort_order: i
      }))
    )

    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-screen overflow-y-auto p-6">
        <h2 className="text-lg font-bold mb-1">⚙️ ตั้งค่าซองสุ่ม</h2>
        <p className="text-sm text-gray-500 mb-4">{variant.name}</p>

        {loading ? (
          <p className="text-sm text-gray-400">กำลังโหลด...</p>
        ) : (
          <>
            <div className="mb-4">
              <label className="text-sm text-gray-600">จำนวนเลขที่สุ่มต่อ 1 ซอง (rolls per pack)</label>
              <input
                type="number"
                min={1}
                value={rollsPerPack}
                onChange={e => setRollsPerPack(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm mt-1"
              />
              <p className="text-xs text-gray-400 mt-1">
                เช่น 1 ซอง 1 เลข ใส่ 1 / 1 ซอง 3 เลข ใส่ 3 (สุ่มแบบสุ่มซ้ำได้ในกล่องรางวัลเดียวกัน)
              </p>
            </div>

            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-gray-600">รางวัลในกล่องสุ่ม (น้ำหนัก = โอกาสออก)</label>
              <button onClick={addPrizeRow} className="text-xs text-blue-500 hover:text-blue-700">
                + เพิ่มรางวัล
              </button>
            </div>

            {prizes.map((p, i) => {
              const pct = totalWeight > 0 ? ((Number(p.weight) || 0) / totalWeight * 100).toFixed(1) : '0.0'
              return (
                <div key={p.id ?? i} className="border rounded-lg p-2 mb-2 space-y-2">
                  <div className="flex gap-2 items-center">
                    <input
                      value={p.label}
                      onChange={e => updatePrize(i, 'label', e.target.value)}
                      placeholder="ชื่อรางวัล / เลขที่ได้"
                      className="flex-1 border rounded px-2 py-1 text-sm"
                    />
                    <input
                      value={p.weight}
                      onChange={e => updatePrize(i, 'weight', e.target.value)}
                      type="number"
                      min={0}
                      placeholder="น้ำหนัก"
                      className="w-20 border rounded px-2 py-1 text-sm"
                    />
                    <span className="text-xs text-gray-400 w-14 text-right">{pct}%</span>
                    <button onClick={() => removePrize(i)} className="text-red-400 text-sm">✕</button>
                  </div>
                  <div className="flex gap-3 items-center">
                    <label className="flex items-center gap-1 text-xs text-yellow-700">
                      <input
                        type="checkbox"
                        checked={!!p.is_jackpot}
                        onChange={e => updatePrize(i, 'is_jackpot', e.target.checked)}
                      />
                      🌟 แจ็คพอต
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const url = await uploadImage(file)
                        if (url) updatePrize(i, 'image_url', url)
                      }}
                      className="flex-1 text-xs"
                    />
                  </div>
                  {p.image_url && <img src={p.image_url} className="h-12 object-cover rounded" />}
                </div>
              )
            })}

            {prizes.length > 0 && (
              <p className="text-xs text-gray-400 mb-2">น้ำหนักรวม: {totalWeight}</p>
            )}
          </>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 bg-purple-500 text-white py-2 rounded text-sm hover:bg-purple-600 disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 border py-2 rounded text-sm hover:bg-gray-50"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  )
}
function ManageVendorsModal({ sellers, onClose, onSaved }: {
  sellers: any[],
  onClose: () => void,
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [contactUrl, setContactUrl] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [message, setMessage] = useState('')

  async function handleAddSeller() {
    if (!name || !contactUrl) return
    setSaving(true)
    const { error } = await supabase
      .from('sellers')
      .insert({ name, type: 'vendor', contact_url: contactUrl })
    if (error) {
      setMessage('เกิดข้อผิดพลาด: ' + error.message)
    } else {
      setName('')
      setContactUrl('')
      setMessage('เพิ่ม vendor สำเร็จ')
      onSaved()
    }
    setSaving(false)
  }

  async function handleInvite(sellerId: string) {
    if (!email) return
    setInviting(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
      },
      body: JSON.stringify({ email, sellerId })
    })
    const data = await res.json()
    if (data.error) {
      setMessage('เกิดข้อผิดพลาด: ' + data.error)
    } else {
      setEmail('')
      setMessage('ส่ง invite email สำเร็จ')
    }
    setInviting(false)
  }
  async function handleDeleteVendor(sellerId: string) {
  if (!confirm('ลบ vendor นี้จริงไหม?')) return
  
  // ลบ user_profiles ของ vendor นี้ก่อน
  await supabase
    .from('user_profiles')
    .delete()
    .eq('seller_id', sellerId)

  // แล้วค่อยลบ seller
  const { error } = await supabase
    .from('sellers')
    .delete()
    .eq('id', sellerId)

  if (error) {
    setMessage('เกิดข้อผิดพลาด: ' + error.message)
  } else {
    setMessage('ลบ vendor สำเร็จ')
    onSaved()
  }
}
  const vendors = sellers.filter(s => s.type === 'vendor')

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-screen overflow-y-auto p-6">
        <h2 className="text-lg font-bold mb-4">จัดการ Vendor</h2>

        {message && (
          <p className="text-sm text-green-600 mb-3">{message}</p>
        )}

        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">เพิ่ม Vendor ใหม่</h3>
          <div className="space-y-2">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ชื่อ vendor"
              className="w-full border rounded px-3 py-2 text-sm"
            />
            <input
              value={contactUrl}
              onChange={e => setContactUrl(e.target.value)}
              placeholder="ลิงก์ติดต่อ (Discord, Facebook ฯลฯ)"
              className="w-full border rounded px-3 py-2 text-sm"
            />
            <button
              onClick={handleAddSeller}
              disabled={saving}
              className="w-full bg-blue-500 text-white py-2 rounded text-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : 'เพิ่ม Vendor'}
            </button>
          </div>
        </div>

        {vendors.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Vendor ที่มีอยู่</h3>
            <div className="space-y-3">
              {vendors.map(v => (
                <div key={v.id} className="border rounded p-3">
                  <p className="text-sm font-medium">{v.name}</p>
<div className="flex justify-between items-center mb-2">
  <p className="text-xs text-gray-400">{v.contact_url}</p>
  <button
    onClick={() => handleDeleteVendor(v.id)}
    className="text-xs text-red-400 hover:text-red-600"
  >
    ลบ
  </button>
</div>                  <div className="flex gap-2">
                    <input
                      placeholder="อีเมล vendor"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="flex-1 border rounded px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => handleInvite(v.id)}
                      disabled={inviting}
                      className="text-xs bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 disabled:opacity-50"
                    >
                      {inviting ? '...' : 'Invite'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full border py-2 rounded text-sm hover:bg-gray-50 mt-6"
        >
          ปิด
        </button>
      </div>
    </div>
  )
}