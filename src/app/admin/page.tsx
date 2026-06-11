'use client'
import { uploadImage } from '@/lib/upload'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function AdminPage() {
    const [showManageVendors, setShowManageVendors] = useState(false)
    const [editProduct, setEditProduct] = useState<any>(null)
    const [sellers, setSellers] = useState<any[]>([])
    const [showAddProduct, setShowAddProduct] = useState(false)
    const [products, setProducts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [shippingFee, setShippingFee] = useState('')
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
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

  // ดึง variants ก่อน
  const { data: variants } = await supabase
    .from('product_variants')
    .select('id')
    .eq('product_id', productId)

  const variantIds = (variants ?? []).map(v => v.id)

  // ลบ set_items
  if (variantIds.length > 0) {
    await supabase.from('set_items').delete().in('variant_id', variantIds)
  }

  // ลบ variants
  await supabase.from('product_variants').delete().eq('product_id', productId)

  // ลบ product
  const { error } = await supabase.from('products').delete().eq('id', productId)

  if (error) {
    alert('ลบไม่ได้ เนื่องจากมี order ที่เคยสั่งซื้อสินค้านี้อยู่\nแนะนำให้ซ่อนสินค้าแทนครับ')
    return
  }

  loadProducts()
}
async function handleToggleAvailable(productId: string, current: boolean) {
  await supabase
    .from('products')
    .update({ is_available: !current })
    .eq('id', productId)
  loadProducts()
}

const sensors = useSensors(
  useSensor(PointerSensor),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
)

async function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event
  if (!over || active.id === over.id) return

  const oldIndex = products.findIndex(p => p.id === active.id)
  const newIndex = products.findIndex(p => p.id === over.id)
  const newProducts = arrayMove(products, oldIndex, newIndex)
  setProducts(newProducts)

  for (let i = 0; i < newProducts.length; i++) {
    await supabase.from('products').update({ sort_order: i }).eq('id', newProducts[i].id)
  }
}

async function handleVariantDragEnd(event: DragEndEvent, productId: string) {
  const { active, over } = event
  if (!over || active.id === over.id) return

  const product = products.find((p: any) => p.id === productId) as { product_variants: any[] } | undefined
  if (!product) return

  const oldIndex = product.product_variants.findIndex((v: any) => v.id === active.id)
  const newIndex = product.product_variants.findIndex((v: any) => v.id === over.id)
  if (oldIndex === -1 || newIndex === -1) return
  const newVariants = arrayMove<any>(product.product_variants, oldIndex, newIndex)

  setProducts(products.map(p => p.id === productId ? { ...p, product_variants: newVariants } : p))

  for (let i = 0; i < newVariants.length; i++) {
    const variantId = (newVariants[i] as any).id
    await supabase.from('product_variants').update({ sort_order: i }).eq('id', variantId)
  }
}

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) return <div className="p-8">กำลังโหลด...</div>

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
  <h1 className="text-2xl font-bold">จัดการสินค้า</h1>
  <div className="flex gap-2">
    <button
      onClick={() => setShowAddProduct(true)}
      className="text-sm bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
    >
      + เพิ่มสินค้า
    </button>
    <button
  onClick={() => setShowManageVendors(true)}
  className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200"
>
  จัดการ Vendor
</button>
<a href="/admin/orders"
  className="text-sm bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
  จัดการ Order
</a>
    <button
      onClick={handleLogout}
      className="text-sm text-gray-500 hover:text-red-500"
    >
      ออกจากระบบ
    </button>
  </div>
</div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  <SortableContext items={products.map(p => p.id)} strategy={verticalListSortingStrategy}>
    <div className="space-y-4">
      {products.map(product => (
        <SortableProductItem
          key={product.id}
          product={product}
          collapsed={collapsed[product.id] ?? false}
          onToggleCollapse={() => setCollapsed(prev => ({ ...prev, [product.id]: !prev[product.id] }))}
          onEdit={() => setEditProduct(product)}
          onDelete={() => handleDelete(product.id)}
          onToggleAvailable={() => handleToggleAvailable(product.id, product.is_available)}
          onStockUpdate={loadProducts}
          onVariantDragEnd={handleVariantDragEnd}
        />
      ))}
    </div>
  </SortableContext>
</DndContext>
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
<div className="mt-8 bg-white rounded-lg p-4 border">
  <h2 className="font-semibold mb-3">ตั้งค่าค่าส่ง</h2>
  <div className="flex gap-2 items-center">
    <input
      value={shippingFee}
      onChange={e => setShippingFee(e.target.value)}
      type="number"
      className="border rounded px-3 py-2 text-sm w-32"
    />
    <span className="text-sm text-gray-500">บาท</span>
    <button onClick={handleUpdateShipping}
      className="text-sm bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
      บันทึก
    </button>
  </div>
</div>
    </main>
)
}

function VariantRow({ variant, onStockUpdate }: { variant: any, onStockUpdate: () => void }) {
  const [stock, setStock] = useState(variant.stock)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
  setSaving(true)
  const { data: { session } } = await supabase.auth.getSession()
  console.log('session uid:', session?.user?.id)
  console.log('variant id:', variant.id)
  
  const { data, error } = await supabase
    .from('product_variants')
    .update({ stock })
    .eq('id', variant.id)
    .select()
  console.log('update result:', data, error)
  setSaving(false)
  onStockUpdate()
}
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
      <span className="text-sm">{variant.name} — ฿{variant.price}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={stock}
          onChange={e => setStock(Number(e.target.value))}
          className="w-16 border rounded px-2 py-1 text-sm text-center"
          min={0}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {saving ? '...' : 'บันทึก'}
        </button>
      </div>
    </div>
  )
}
function SortableProductItem({ product, collapsed, onToggleCollapse, onEdit, onDelete, onToggleAvailable, onStockUpdate, onVariantDragEnd }: {
  product: any
  collapsed: boolean
  onToggleCollapse: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleAvailable: () => void
  onStockUpdate: () => void
  onVariantDragEnd: (event: DragEndEvent, productId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: product.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const sensors = useSensors(useSensor(PointerSensor))

  return (
    <div ref={setNodeRef} style={style} className="border rounded-lg p-4 bg-white">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <span {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-gray-500 text-lg">⠿</span>
          <div>
            <h3 className="font-medium">{product.name}</h3>
            <p className="text-sm text-gray-500">{product.sellers?.name}</p>
            <p className="text-xs text-gray-400 mt-1">
              {product.type === 'set' ? 'เซ็ต' : product.type === 'single' ? 'การ์ดแยกใบ' : 'อุปกรณ์เสริม'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleAvailable}
            className={product.is_available
              ? 'text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
              : 'text-xs px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700'
            }
          >
            {product.is_available ? 'แสดงอยู่' : 'ซ่อนอยู่'}
          </button>
          <button onClick={onToggleCollapse} className="text-xs text-gray-400 hover:text-gray-600 px-2">
            {collapsed ? '▼ ขยาย' : '▲ ย่อ'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {product.product_variants?.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter}
              onDragEnd={e => onVariantDragEnd(e, product.id)}>
              <SortableContext items={product.product_variants.map((v: any) => v.id)} strategy={verticalListSortingStrategy}>
                <div className="mt-3 space-y-2">
                  {product.product_variants.map((variant: any) => (
                    <SortableVariantRow key={variant.id} variant={variant} onStockUpdate={onStockUpdate} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div className="flex gap-2 mt-3 pt-3 border-t">
            <button onClick={onEdit} className="text-xs text-blue-500 hover:text-blue-700">แก้ไข</button>
            <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600">ลบ</button>
          </div>
        </>
      )}
    </div>
  )
}

function SortableVariantRow({ variant, onStockUpdate }: { variant: any, onStockUpdate: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: variant.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-2">
      <span {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-gray-500">⠿</span>
      <VariantRow variant={variant} onStockUpdate={onStockUpdate} />
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
  const [variants, setVariants] = useState([{ name: '', price: '', stock: '', image_url: '', imageFile: null as File | null }])
  const [saving, setSaving] = useState(false)

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  setImageFile(file)
  setImagePreview(URL.createObjectURL(file))
}

  function addVariantRow() {
    setVariants([...variants, { name: '', price: '', stock: '', image_url: '', imageFile: null }])
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
    .insert({ name, type, seller_id: sellerId, description, image_url: imageUrl, is_available: true })
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
      image_url: imageUrl
    })
  }
}
  setSaving(false)
  onSaved()
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
            <label className="text-sm text-gray-600">รายละเอียด (ไม่บังคับ)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1"
              rows={2}
            />
          </div>
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
  const [variants, setVariants] = useState<any[]>(product.product_variants ?? [])
  const [newVariants, setNewVariants] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  setImageFile(file)
  setImagePreview(URL.createObjectURL(file))
}
  function addNewVariantRow() {
    setNewVariants([...newVariants, { name: '', price: '', stock: '' }])
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
    .update({ name, type, seller_id: sellerId, description, image_url: imageUrl })
    .eq('id', product.id)

  for (const v of variants) {
  await supabase.from('product_variants')
    .update({ name: v.name, price: Number(v.price), stock: Number(v.stock), image_url: v.image_url })
    .eq('id', v.id)
}

  const validNew = newVariants.filter(v => v.name && v.price)
  if (validNew.length > 0) {
    await supabase.from('product_variants').insert(
      validNew.map(v => ({
        product_id: product.id,
        name: v.name,
        price: Number(v.price),
        stock: Number(v.stock) || 0
      }))
    )
  }

  setSaving(false)
  onSaved()
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
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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