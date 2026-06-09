'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

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

  useEffect(() => {
    checkAuthAndLoad()
  }, [])

  async function checkAuthAndLoad() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      window.location.href = '/login'
      return
    }
    loadProducts()
  }

  async function loadProducts() {
  const { data: productsData } = await supabase
    .from('products')
    .select('*, sellers(*), product_variants(*)')
    .order('created_at', { ascending: false })

  const { data: sellersData } = await supabase
    .from('sellers')
    .select('*')

  setProducts(productsData ?? [])
  setSellers(sellersData ?? [])
  setLoading(false)
}
async function handleDelete(productId: string) {
  if (!confirm('ลบสินค้านี้จริงไหม?')) return
  await supabase.from('products').delete().eq('id', productId)
  loadProducts()
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
    <button
      onClick={handleLogout}
      className="text-sm text-gray-500 hover:text-red-500"
    >
      ออกจากระบบ
    </button>
  </div>
</div>

      <div className="space-y-4">
        {products.map(product => (
          <div key={product.id} className="border rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium">{product.name}</h3>
                <p className="text-sm text-gray-500">{product.sellers?.name}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {product.type === 'set' ? 'เซ็ต' : product.type === 'single' ? 'การ์ดแยกใบ' : 'อุปกรณ์เสริม'}
                </p>
              </div>
<button
  onClick={() => handleToggleAvailable(product.id, product.is_available)}
  className={product.is_available
    ? 'text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
    : 'text-xs px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700'
  }
>
  {product.is_available ? 'แสดงอยู่' : 'ซ่อนอยู่'}
</button>
            </div>

            {product.product_variants?.length > 0 && (
              <div className="mt-3 space-y-2">
                {product.product_variants.map((variant: any) => (
                  <VariantRow
                    key={variant.id}
                    variant={variant}
                    onStockUpdate={loadProducts}
                  />
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-3 pt-3 border-t">
  <button
    onClick={() => setEditProduct(product)}
    className="text-xs text-blue-500 hover:text-blue-700"
  >
    แก้ไข
  </button>
  <button
    onClick={() => handleDelete(product.id)}
    className="text-xs text-red-400 hover:text-red-600"
  >
    ลบ
  </button>
</div>
          </div>
        ))}
      </div>
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

function AddProductModal({ sellers, onClose, onSaved }: {
  sellers: any[],
  onClose: () => void,
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState('set')
  const [sellerId, setSellerId] = useState(sellers[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [variants, setVariants] = useState([{ name: '', price: '', stock: '' }])
  const [saving, setSaving] = useState(false)

  function addVariantRow() {
    setVariants([...variants, { name: '', price: '', stock: '' }])
  }

  function removeVariantRow(index: number) {
    setVariants(variants.filter((_, i) => i !== index))
  }

  function updateVariant(index: number, field: string, value: string) {
    const updated = [...variants]
    updated[index] = { ...updated[index], [field]: value }
    setVariants(updated)
  }

  async function handleSave() {
    if (!name || !sellerId) return
    setSaving(true)

    const { data: product, error } = await supabase
      .from('products')
      .insert({ name, type, seller_id: sellerId, description, is_available: true })
      .select()
      .single()

    if (error || !product) {
      console.error(error)
      setSaving(false)
      return
    }

    const validVariants = variants.filter(v => v.name && v.price)
    if (validVariants.length > 0) {
      await supabase.from('product_variants').insert(
        validVariants.map(v => ({
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
              <div key={i} className="flex gap-2 mb-2">
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
                  <button
                    onClick={() => removeVariantRow(i)}
                    className="text-red-400 hover:text-red-600 text-sm"
                  >
                    ✕
                  </button>
                )}
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
  const [name, setName] = useState(product.name)
  const [type, setType] = useState(product.type)
  const [sellerId, setSellerId] = useState(product.seller_id)
  const [description, setDescription] = useState(product.description ?? '')
  const [variants, setVariants] = useState<any[]>(product.product_variants ?? [])
  const [newVariants, setNewVariants] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

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

    await supabase
      .from('products')
      .update({ name, type, seller_id: sellerId, description })
      .eq('id', product.id)

    for (const v of variants) {
      await supabase
        .from('product_variants')
        .update({ name: v.name, price: Number(v.price), stock: Number(v.stock) })
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
              <div key={v.id} className="flex gap-2 mb-2">
                <input
                  value={v.name}
                  onChange={e => updateExistingVariant(i, 'name', e.target.value)}
                  placeholder="ชื่อ"
                  className="flex-1 border rounded px-2 py-1 text-sm"
                />
                <input
                  value={v.price}
                  onChange={e => updateExistingVariant(i, 'price', e.target.value)}
                  type="number"
                  placeholder="ราคา"
                  className="w-20 border rounded px-2 py-1 text-sm"
                />
                <input
                  value={v.stock}
                  onChange={e => updateExistingVariant(i, 'stock', e.target.value)}
                  type="number"
                  placeholder="สต็อก"
                  className="w-20 border rounded px-2 py-1 text-sm"
                />
                <button
                  onClick={() => handleDeleteVariant(v.id)}
                  className="text-red-400 hover:text-red-600 text-sm"
                >
                  ✕
                </button>
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
                  <p className="text-xs text-gray-400 mb-2">{v.contact_url}</p>
                  <div className="flex gap-2">
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
async function handleToggleAvailable(productId: string, current: boolean) {
  await supabase
    .from('products')
    .update({ is_available: !current })
    .eq('id', productId)
  loadProducts()
}