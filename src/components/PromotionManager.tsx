'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { uploadImage } from '@/lib/upload'
import { revalidateCatalog } from '@/app/actions/revalidate'
import { PROMOTION_TYPE_LABEL, PromotionType } from '@/lib/promotion'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

interface PromoRow {
  id: string
  name: string
  type: PromotionType
  price: number | null
  description: string | null
  image_url: string | null
  is_active: boolean
  sort_order: number
  promotion_items: { variant_id: string, quantity: number }[]
}

interface VariantOption {
  id: string
  label: string
  price: number
  stock: number
}

interface FormState {
  id: string | null
  name: string
  type: PromotionType
  price: string
  description: string
  image_url: string
  is_active: boolean
  items: { variant_id: string, quantity: number }[]
}

const EMPTY_FORM: FormState = {
  id: null, name: '', type: 'bundle', price: '', description: '', image_url: '', is_active: false, items: [],
}

interface ProductForPicker {
  name: string
  sellers?: { type?: string } | null
  product_variants?: { id: string, name: string, price: number, stock: number }[]
}

async function fetchPromos() {
  const { data, error } = await supabase
    .from('promotions')
    .select('*, promotion_items(variant_id, quantity)')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) alert('โหลดโปรไม่สำเร็จ: ' + error.message)
  return (data ?? []) as PromoRow[]
}

// จัดการโปรโมชัน (เหมา / ซื้อ 1 แถม 1) — แอดมินสร้าง/แก้/เปิด-ปิด/ลบเอง ไม่มีวันหมดเขต
// products = สินค้าที่ยังไม่ถูกลบ (หน้า /admin ส่งมา) ใช้ได้เฉพาะของร้าน official
export default function PromotionManager({ products, onClose }: { products: ProductForPicker[], onClose: () => void }) {
  const [promos, setPromos] = useState<PromoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pickVariant, setPickVariant] = useState('')

  const options: VariantOption[] = products
    .filter(p => p.sellers?.type === 'official')
    .flatMap(p => (p.product_variants ?? []).map(v => ({
      id: v.id,
      label: `${p.name} - ${v.name}`,
      price: Number(v.price),
      stock: v.stock ?? 0,
    })))
  const optionById = new Map(options.map(o => [o.id, o]))

  useEffect(() => {
    fetchPromos().then(rows => {
      setPromos(rows)
      setLoading(false)
    })
  }, [])

  async function loadPromos() {
    setPromos(await fetchPromos())
  }

  function editPromo(p: PromoRow) {
    setForm({
      id: p.id,
      name: p.name,
      type: p.type,
      price: p.price == null ? '' : String(p.price),
      description: p.description ?? '',
      image_url: p.image_url ?? '',
      is_active: p.is_active,
      items: p.promotion_items.map(i => ({ variant_id: i.variant_id, quantity: i.quantity })),
    })
    setPickVariant('')
  }

  function addItem() {
    if (!form || !pickVariant || form.items.some(i => i.variant_id === pickVariant)) return
    setForm({ ...form, items: [...form.items, { variant_id: pickVariant, quantity: 1 }] })
    setPickVariant('')
  }

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !form) return
    setUploading(true)
    const url = await uploadImage(file)
    setUploading(false)
    if (!url) { alert('อัปโหลดรูปไม่สำเร็จ'); return }
    setForm({ ...form, image_url: url })
  }

  async function handleSave() {
    if (!form) return
    if (!form.name.trim()) { alert('ใส่ชื่อโปรก่อน'); return }
    if (form.type === 'bundle' && (form.price === '' || Number(form.price) < 0)) { alert('ใส่ราคาเหมาก่อน'); return }
    if (form.items.length === 0) { alert('เลือกสินค้าในโปรอย่างน้อย 1 ชิ้น'); return }
    setSaving(true)

    const row = {
      name: form.name.trim(),
      type: form.type,
      price: form.type === 'bundle' ? Number(form.price) : null,
      description: form.description.trim() || null,
      image_url: form.image_url || null,
      is_active: form.is_active,
    }

    let promoId = form.id
    if (promoId) {
      const { error } = await supabase.from('promotions').update(row).eq('id', promoId)
      if (error) { setSaving(false); alert('บันทึกโปรไม่สำเร็จ: ' + error.message); return }
    } else {
      const { data, error } = await supabase
        .from('promotions')
        .insert({ ...row, sort_order: promos.length })
        .select('id')
        .single()
      if (error || !data) { setSaving(false); alert('สร้างโปรไม่สำเร็จ: ' + error?.message); return }
      promoId = data.id
    }

    // แทนที่รายการสินค้าในโปรทั้งชุด
    const { error: delErr } = await supabase.from('promotion_items').delete().eq('promotion_id', promoId)
    if (delErr) { setSaving(false); alert('บันทึกรายการสินค้าไม่สำเร็จ: ' + delErr.message); return }
    const { error: insErr } = await supabase.from('promotion_items').insert(
      form.items.map(i => ({ promotion_id: promoId, variant_id: i.variant_id, quantity: form.type === 'bundle' ? i.quantity : 1 }))
    )
    setSaving(false)
    if (insErr) { alert('บันทึกรายการสินค้าไม่สำเร็จ: ' + insErr.message); return }

    setForm(null)
    await loadPromos()
    revalidateCatalog()
  }

  async function handleToggle(p: PromoRow) {
    const { error } = await supabase.from('promotions').update({ is_active: !p.is_active }).eq('id', p.id)
    if (error) { alert('เปลี่ยนสถานะไม่สำเร็จ: ' + error.message); return }
    await loadPromos()
    revalidateCatalog()
  }

  async function handleDelete(p: PromoRow) {
    if (!confirm(`ลบโปร "${p.name}" จริงไหม?\n(ออเดอร์ที่เคยใช้โปรนี้ยังแสดงชื่อโปรเดิมอยู่)`)) return
    const { error } = await supabase.from('promotions').delete().eq('id', p.id)
    if (error) { alert('ลบโปรไม่สำเร็จ: ' + error.message); return }
    await loadPromos()
    revalidateCatalog()
  }

  const normalTotal = form ? form.items.reduce((s, i) => s + (optionById.get(i.variant_id)?.price ?? 0) * i.quantity, 0) : 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start md:items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl my-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800">โปรโมชัน</h2>
            <p className="text-xs text-slate-500">เหมาราคาเดียว / ซื้อ 1 แถม 1 (ชิ้นที่ถูกกว่าฟรี) · ของในโปรหมด = โปรไม่ขึ้นหน้าร้าน</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        {form ? (
          <div className="p-5 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-600 sm:col-span-2">
                ชื่อโปร
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm mt-1" />
              </label>
              <label className="text-xs text-slate-600">
                ประเภท
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as PromotionType })}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm mt-1">
                  <option value="bundle">{PROMOTION_TYPE_LABEL.bundle} (ราคาเดียวได้ทุกชิ้น)</option>
                  <option value="b1g1">{PROMOTION_TYPE_LABEL.b1g1} (เลือก 2 ชิ้น ชิ้นถูกกว่าฟรี)</option>
                </select>
              </label>
              {form.type === 'bundle' && (
                <label className="text-xs text-slate-600">
                  ราคาเหมา (บาท)
                  <input type="number" min={0} value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm mt-1" />
                  {normalTotal > 0 && <span className="text-[11px] text-slate-400">ราคาปกติรวม ฿{normalTotal}</span>}
                </label>
              )}
              <label className="text-xs text-slate-600 sm:col-span-2">
                รายละเอียด (ไม่บังคับ)
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm mt-1" />
              </label>
              <div className="text-xs text-slate-600 sm:col-span-2">
                รูปโปร (ไม่บังคับ)
                <div className="flex items-center gap-2 mt-1">
                  <input type="file" accept="image/*" onChange={handleImage} disabled={uploading} className="text-xs flex-1 min-w-0" />
                  {uploading && <span className="text-slate-400">กำลังอัปโหลด...</span>}
                  {form.image_url && !uploading && (
                    <button onClick={() => setForm({ ...form, image_url: '' })} className="text-red-500">ลบรูป</button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-600 mb-1">สินค้าในโปร</p>
              <div className="space-y-1">
                {form.items.map((i, idx) => {
                  const o = optionById.get(i.variant_id)
                  return (
                    <div key={i.variant_id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                      <span className="flex-1 min-w-0 truncate">
                        {o ? o.label : <span className="text-red-500">สินค้านี้ถูกลบ/ไม่ใช่ร้าน official แล้ว</span>}
                        {o && <span className="text-xs text-slate-400"> · ฿{o.price} · สต็อก {o.stock}</span>}
                      </span>
                      {form.type === 'bundle' && (
                        <input type="number" min={1} value={i.quantity}
                          onChange={e => {
                            const items = [...form.items]
                            items[idx] = { ...i, quantity: Math.max(1, Number(e.target.value) || 1) }
                            setForm({ ...form, items })
                          }}
                          className="w-14 border border-slate-300 rounded px-2 py-1 text-sm text-center" />
                      )}
                      <button onClick={() => setForm({ ...form, items: form.items.filter(x => x.variant_id !== i.variant_id) })}
                        className="text-red-400 hover:text-red-600">✕</button>
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-2 mt-2">
                <select value={pickVariant} onChange={e => setPickVariant(e.target.value)}
                  className="flex-1 min-w-0 border border-slate-300 rounded px-2 py-2 text-sm">
                  <option value="">— เลือกสินค้าเพิ่ม —</option>
                  {options.filter(o => !form.items.some(i => i.variant_id === o.id)).map(o => (
                    <option key={o.id} value={o.id}>{o.label} (฿{o.price}, สต็อก {o.stock})</option>
                  ))}
                </select>
                <button onClick={addItem} disabled={!pickVariant}
                  className="text-sm px-3 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-40">+ เพิ่ม</button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              เปิดโปรนี้ (ขึ้นหน้าร้าน)
            </label>

            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setForm(null)} className="text-sm px-3 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">ยกเลิก</button>
              <button onClick={handleSave} disabled={saving || uploading}
                className="text-sm px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'บันทึกโปร'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5">
            {loading ? (
              <p className="text-sm text-slate-400 text-center py-6">กำลังโหลด...</p>
            ) : promos.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">ยังไม่มีโปร</p>
            ) : (
              <div className="space-y-2">
                {promos.map(p => (
                  <div key={p.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {p.name}
                        <span className="ml-2 text-[11px] text-pink-600 bg-pink-50 border border-pink-200 rounded px-1">{PROMOTION_TYPE_LABEL[p.type]}</span>
                      </p>
                      <p className="text-xs text-slate-400">
                        {p.type === 'bundle' ? `฿${p.price} · ` : ''}{p.promotion_items.length} รายการ
                      </p>
                    </div>
                    <button onClick={() => handleToggle(p)}
                      className={`text-xs px-2 py-1 rounded ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {p.is_active ? 'เปิดอยู่' : 'ปิดอยู่'}
                    </button>
                    <button onClick={() => editPromo(p)} className="text-xs px-2 py-1 rounded bg-blue-500 text-white">แก้ไข</button>
                    <button onClick={() => handleDelete(p)} className="text-xs px-2 py-1 rounded text-red-500 hover:bg-red-50">ลบ</button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => { setForm(EMPTY_FORM); setPickVariant('') }}
              className="mt-4 w-full text-sm py-2 rounded-lg border-2 border-dashed border-slate-300 text-slate-600 hover:bg-slate-50">
              + สร้างโปรใหม่
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
