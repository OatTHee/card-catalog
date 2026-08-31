'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

// ----------------------------------------------------------------------------
// หน้าจัดการกระเป๋าผู้เล่น (ต่อกับหน้าแลกแต้ม /redeem)
//
// ของในกระเป๋า 1 แถว = 1 รายการ มี 2 สถานะ
//   In Bag  -> ยังอยู่ในกระเป๋า ผู้เล่นยังไม่กดจัดส่ง  => แอดมินแก้/ลบได้
//   Shipped -> ผู้เล่นกดจัดส่งไปแล้ว ผูกกับ redeem_history => อ่านได้อย่างเดียว
//
// ทุกการเขียนวิ่งผ่าน RPC admin_bag_* ซึ่งเช็คสิทธิ์แอดมินและกันเคสอันตราย
// ไว้ที่ฝั่ง database อีกชั้น (กันลบซองสุ่มที่เปิดแล้ว, กันแตะแถว Shipped)
// หน้านี้ไม่ยุ่งกับแต้มผู้เล่นเลย — ปรับแต้มไปที่ /admin/players
// ----------------------------------------------------------------------------

type BagRow = {
  id: string
  customer_id: string | null
  variant_id: string | null
  item_name: string
  points_used: number
  qty: number
  status: string
  gacha_config_id: string | null
  created_at: string
  isGachaOpened: boolean
}

type PlayerGroup = {
  customerId: string
  name: string
  email: string
  uid: string
  discordId: string
  points: number
  items: BagRow[]
  inBagCount: number
  inBagPoints: number
}

type VariantOption = {
  id: string
  label: string
  stock: number
  redeemPoints: number | null
}

export default function AdminManageBagPage() {
  const [groups, setGroups] = useState<PlayerGroup[]>([])
  const [variants, setVariants] = useState<VariantOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showShipped, setShowShipped] = useState(false)
  const [openCustomer, setOpenCustomer] = useState<string | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'ok' | 'err', text: string } | null>(null)

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

    loadAll()
  }

  async function loadAll() {
    setLoading(true)

    const [{ data: bag, error: bagErr }, { data: customers }, { data: rolls }, { data: variantRows }] =
      await Promise.all([
        supabase.from('bag').select('*').order('created_at', { ascending: false }),
        supabase.from('customers').select('id, display_name, real_name, email, uid, discord_id, points'),
        supabase.from('gacha_rolls').select('bag_id'),
        supabase
          .from('product_variants')
          .select('id, name, stock, redeem_points, products(name, is_for_sale, is_for_redeem)')
          .order('sort_order', { ascending: true })
      ])

    if (bagErr) {
      setNotice({ type: 'err', text: 'โหลดข้อมูลกระเป๋าไม่สำเร็จ: ' + bagErr.message })
      setLoading(false)
      return
    }

    const openedBagIds = new Set((rolls ?? []).map((r: any) => r.bag_id))
    const customerById = new Map((customers ?? []).map((c: any) => [c.id, c]))

    // จัดกลุ่มของในกระเป๋าตามผู้เล่น
    const byCustomer = new Map<string, BagRow[]>()
    for (const b of (bag ?? []) as any[]) {
      if (!b.customer_id) continue // แถวเก่าที่ยังผูกกับ legacy_uid อย่างเดียว ข้ามไปก่อน
      const row: BagRow = { ...b, isGachaOpened: openedBagIds.has(b.id) }
      const list = byCustomer.get(b.customer_id) ?? []
      list.push(row)
      byCustomer.set(b.customer_id, list)
    }

    const result: PlayerGroup[] = []
    for (const [customerId, items] of byCustomer.entries()) {
      const c: any = customerById.get(customerId)
      const inBag = items.filter(i => i.status === 'In Bag')
      result.push({
        customerId,
        name: c?.display_name || c?.real_name || '(ไม่ทราบชื่อ)',
        email: c?.email || '',
        uid: c?.uid || '',
        discordId: c?.discord_id || '',
        points: c?.points ?? 0,
        items,
        inBagCount: inBag.length,
        inBagPoints: inBag.reduce((s, i) => s + i.points_used * (i.qty || 1), 0)
      })
    }

    // ผู้เล่นที่ยังไม่มีของในกระเป๋าเลย ก็ต้องเห็น เพื่อให้แอดมินเพิ่มของให้ได้
    for (const c of (customers ?? []) as any[]) {
      if (byCustomer.has(c.id)) continue
      result.push({
        customerId: c.id,
        name: c.display_name || c.real_name || '(ไม่ทราบชื่อ)',
        email: c.email || '',
        uid: c.uid || '',
        discordId: c.discord_id || '',
        points: c.points ?? 0,
        items: [],
        inBagCount: 0,
        inBagPoints: 0
      })
    }

    // เรียงคนที่มีของค้างในกระเป๋าขึ้นก่อน
    result.sort((a, b) => b.inBagCount - a.inBagCount || a.name.localeCompare(b.name, 'th'))

    setGroups(result)
    setVariants(
      (variantRows ?? []).map((v: any) => ({
        id: v.id,
        label: `${v.products?.name ? v.products.name + ' — ' : ''}${v.name}`,
        stock: v.stock ?? 0,
        redeemPoints: v.redeem_points
      }))
    )
    setLoading(false)
  }

  async function handleRemove(row: BagRow) {
    const restore = row.variant_id
      ? confirm(
          `เอา "${row.item_name}" ออกจากกระเป๋า\n\n` +
          `กด OK = คืนสต็อกสินค้า ${row.qty} ชิ้นด้วย\n` +
          `กด Cancel = ลบอย่างเดียว ไม่คืนสต็อก`
        )
      : false

    if (!row.variant_id && !confirm(`เอา "${row.item_name}" ออกจากกระเป๋า?`)) return

    setBusyId(row.id)
    const { data, error } = await supabase.rpc('admin_bag_remove_item', {
      p_bag_id: row.id,
      p_restore_stock: restore
    })
    setBusyId(null)

    if (error) {
      setNotice({ type: 'err', text: 'ลบไม่สำเร็จ: ' + error.message })
      return
    }
    setNotice({
      type: 'ok',
      text: `เอา "${row.item_name}" ออกแล้ว` + (data?.stock_restored ? ' (คืนสต็อกให้ด้วย)' : '')
    })
    loadAll()
  }

  async function handleChangeQty(row: BagRow, nextQty: number) {
    if (nextQty < 1) return
    setBusyId(row.id)
    const { error } = await supabase.rpc('admin_bag_update_item', {
      p_bag_id: row.id,
      p_qty: nextQty,
      p_item_name: null,
      p_points_used: null
    })
    setBusyId(null)

    if (error) {
      setNotice({ type: 'err', text: 'แก้จำนวนไม่สำเร็จ: ' + error.message })
      return
    }
    loadAll()
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = groups
    if (q) {
      list = groups.filter(g =>
        g.name.toLowerCase().includes(q) ||
        g.email.toLowerCase().includes(q) ||
        g.uid.toLowerCase().includes(q) ||
        g.discordId.toLowerCase().includes(q) ||
        g.items.some(i => i.item_name.toLowerCase().includes(q))
      )
    }
    return list
  }, [groups, search])

  const totalInBag = groups.reduce((s, g) => s + g.inBagCount, 0)

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">กำลังโหลด...</div>
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <a href="/admin" className="text-blue-500 text-sm">← จัดการสินค้า</a>
            <a href="/admin/orders" className="text-green-600 text-sm">จัดการ Order</a>
            <a href="/admin/redeems" className="text-amber-500 text-sm">จัดการการแลก</a>
            <a href="/admin/players" className="text-purple-500 text-sm">จัดการแต้ม/EXP</a>
            <h1 className="font-bold text-gray-800">จัดการกระเป๋าผู้เล่น</h1>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
            className="text-sm text-gray-500 hover:text-red-500"
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {notice && (
          <div
            className={`mb-4 rounded-lg px-3 py-2 text-sm flex justify-between items-start gap-3 ${
              notice.type === 'ok'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-600 border border-red-200'
            }`}
          >
            <span className="whitespace-pre-line">{notice.text}</span>
            <button onClick={() => setNotice(null)} className="shrink-0 opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาด้วยชื่อ, อีเมล, UID, Discord ID หรือชื่อของ"
            className="border rounded px-3 py-2 text-sm w-full sm:w-96"
          />
          <label className="flex items-center gap-2 text-xs text-gray-500 whitespace-nowrap">
            <input
              type="checkbox"
              checked={showShipped}
              onChange={e => setShowShipped(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
            />
            แสดงของที่ส่งไปแล้วด้วย
          </label>
          <span className="text-xs text-gray-400 whitespace-nowrap">
            ของค้างในกระเป๋ารวม {totalInBag} รายการ
          </span>
        </div>

        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400">ไม่พบผู้เล่น</div>
          )}

          {filtered.map(g => {
            const isOpen = openCustomer === g.customerId
            const visibleItems = showShipped ? g.items : g.items.filter(i => i.status === 'In Bag')

            return (
              <div key={g.customerId} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setOpenCustomer(isOpen ? null : g.customerId)}
                  className="w-full text-left p-4 hover:bg-gray-50 flex justify-between items-center gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-800">{g.name}</span>
                      {g.inBagCount > 0 ? (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          ในกระเป๋า {g.inBagCount} รายการ · ✨ {g.inBagPoints}
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          กระเป๋าว่าง
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1 truncate">
                      {g.email || 'ไม่มีอีเมล'} · UID: {g.uid || '-'} · แต้มคงเหลือ ✨ {g.points}
                    </div>
                  </div>
                  <span className="text-gray-400 text-sm shrink-0">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="border-t px-4 py-3">
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-xs text-gray-500">
                        {visibleItems.length === 0
                          ? 'ยังไม่มีของ'
                          : `${visibleItems.length} รายการ`}
                      </p>
                      <button
                        onClick={() => setAddingFor(addingFor === g.customerId ? null : g.customerId)}
                        className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded hover:bg-blue-600"
                      >
                        {addingFor === g.customerId ? 'ปิดฟอร์ม' : '+ เพิ่มของให้ผู้เล่นคนนี้'}
                      </button>
                    </div>

                    {addingFor === g.customerId && (
                      <AddItemForm
                        customerId={g.customerId}
                        customerName={g.name}
                        variants={variants}
                        onDone={(msg) => {
                          setAddingFor(null)
                          setNotice({ type: 'ok', text: msg })
                          loadAll()
                        }}
                        onError={(msg) => setNotice({ type: 'err', text: msg })}
                      />
                    )}

                    {visibleItems.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-gray-400 border-b">
                              <th className="text-left font-normal py-2">item_name</th>
                              <th className="text-right font-normal py-2 whitespace-nowrap">point used</th>
                              <th className="text-center font-normal py-2 whitespace-nowrap">จำนวน</th>
                              <th className="text-center font-normal py-2">status</th>
                              <th className="text-right font-normal py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleItems.map(item => {
                              const locked = item.status !== 'In Bag'
                              const isPack = !!item.gacha_config_id
                              const busy = busyId === item.id

                              return (
                                <tr key={item.id} className="border-b last:border-0">
                                  <td className="py-2 pr-2">
                                    <span className="text-gray-800">{item.item_name}</span>
                                    {isPack && (
                                      <span className="ml-2 text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">
                                        {item.isGachaOpened ? 'ซองสุ่ม (เปิดแล้ว)' : 'ซองสุ่ม (ยังไม่เปิด)'}
                                      </span>
                                    )}
                                    <div className="text-[11px] text-gray-400">
                                      {new Date(item.created_at).toLocaleString('th-TH')}
                                    </div>
                                  </td>
                                  <td className="py-2 text-right text-amber-600 whitespace-nowrap">
                                    ✨ {item.points_used * (item.qty || 1)}
                                    {item.qty > 1 && (
                                      <div className="text-[11px] text-gray-400">({item.points_used}/ชิ้น)</div>
                                    )}
                                  </td>
                                  <td className="py-2 text-center whitespace-nowrap">
                                    {locked || isPack ? (
                                      <span className="text-gray-600">{item.qty}</span>
                                    ) : (
                                      <div className="inline-flex items-center gap-1">
                                        <button
                                          disabled={busy || item.qty <= 1}
                                          onClick={() => handleChangeQty(item, item.qty - 1)}
                                          className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40"
                                        >−</button>
                                        <span className="w-8 text-center text-gray-800">{item.qty}</span>
                                        <button
                                          disabled={busy}
                                          onClick={() => handleChangeQty(item, item.qty + 1)}
                                          className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40"
                                        >+</button>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 text-center whitespace-nowrap">
                                    <span
                                      className={`text-xs px-2 py-0.5 rounded-full ${
                                        item.status === 'In Bag'
                                          ? 'bg-blue-100 text-blue-700'
                                          : 'bg-gray-100 text-gray-500'
                                      }`}
                                    >
                                      {item.status}
                                    </span>
                                  </td>
                                  <td className="py-2 text-right whitespace-nowrap">
                                    {locked ? (
                                      <span className="text-[11px] text-gray-300">ส่งแล้ว แก้ไม่ได้</span>
                                    ) : isPack && item.isGachaOpened ? (
                                      <span className="text-[11px] text-gray-300">เปิดซองแล้ว ลบไม่ได้</span>
                                    ) : (
                                      <button
                                        disabled={busy}
                                        onClick={() => handleRemove(item)}
                                        className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded disabled:opacity-40"
                                      >
                                        {busy ? '...' : 'เอาออก'}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-xs text-gray-400 mt-6 leading-relaxed">
          หมายเหตุ: หน้านี้ไม่ยุ่งกับแต้มของผู้เล่น — เพิ่ม/ลบของที่นี่จะไม่หักหรือคืนแต้มให้อัตโนมัติ
          ถ้าต้องการปรับแต้มให้ไปที่หน้า <a href="/admin/players" className="text-purple-500 underline">จัดการแต้ม/EXP</a>
          <br />
          ของที่สถานะ Shipped คือของที่ผู้เล่นกดจัดส่งไปแล้ว ผูกกับประวัติการแลกจริง จึงล็อกไว้ไม่ให้แก้
        </p>
      </div>
    </main>
  )
}

// ----------------------------------------------------------------------------
// ฟอร์มเพิ่มของ 2 โหมด
//   catalog -> เลือกสินค้าจากในเว็บ ตัดสต็อกให้ (ติ๊กออกได้ถ้าไม่อยากตัด)
//   custom  -> พิมพ์ชื่อเอง สำหรับของนอกเว็บ ไม่ยุ่งกับสต็อก
// ----------------------------------------------------------------------------
function AddItemForm({
  customerId, customerName, variants, onDone, onError
}: {
  customerId: string
  customerName: string
  variants: VariantOption[]
  onDone: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [mode, setMode] = useState<'catalog' | 'custom'>('catalog')
  const [variantId, setVariantId] = useState('')
  const [variantSearch, setVariantSearch] = useState('')
  const [customName, setCustomName] = useState('')
  const [points, setPoints] = useState('0')
  const [qty, setQty] = useState('1')
  const [deductStock, setDeductStock] = useState(true)
  const [saving, setSaving] = useState(false)

  const shownVariants = useMemo(() => {
    const q = variantSearch.trim().toLowerCase()
    const list = q ? variants.filter(v => v.label.toLowerCase().includes(q)) : variants
    return list.slice(0, 100)
  }, [variants, variantSearch])

  const selected = variants.find(v => v.id === variantId)

  async function handleSubmit() {
    const qtyNum = Number(qty)
    const pointsNum = Number(points)

    if (!Number.isFinite(qtyNum) || qtyNum < 1) { onError('จำนวนต้องเป็นตัวเลขมากกว่า 0'); return }
    if (!Number.isFinite(pointsNum) || pointsNum < 0) { onError('แต้มต้องเป็นตัวเลขไม่ติดลบ'); return }
    if (mode === 'catalog' && !variantId) { onError('เลือกสินค้าก่อน'); return }
    if (mode === 'custom' && !customName.trim()) { onError('ใส่ชื่อของก่อน'); return }

    setSaving(true)
    const { data, error } = await supabase.rpc('admin_bag_add_item', {
      p_customer_id: customerId,
      p_item_name: mode === 'custom' ? customName.trim() : (selected?.label ?? ''),
      p_points_used: pointsNum,
      p_qty: qtyNum,
      p_variant_id: mode === 'catalog' ? variantId : null,
      p_deduct_stock: mode === 'catalog' ? deductStock : false
    })
    setSaving(false)

    if (error) { onError('เพิ่มของไม่สำเร็จ: ' + error.message); return }

    onDone(
      `เพิ่ม "${data?.item_name}" x${qtyNum} ให้ ${customerName} แล้ว` +
      (data?.is_gacha ? ` (ซองสุ่ม แยกเป็น ${data?.rows_inserted} แถว)` : '') +
      (mode === 'catalog' && deductStock ? ` · สต็อกเหลือ ${data?.stock_after}` : '')
    )
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
      <div className="flex gap-1 bg-white rounded-lg p-1 mb-3 w-fit">
        <button
          onClick={() => setMode('catalog')}
          className={`text-xs px-3 py-1 rounded-md ${mode === 'catalog' ? 'bg-blue-500 text-white' : 'text-gray-500'}`}
        >
          เลือกจากสินค้าในเว็บ
        </button>
        <button
          onClick={() => setMode('custom')}
          className={`text-xs px-3 py-1 rounded-md ${mode === 'custom' ? 'bg-blue-500 text-white' : 'text-gray-500'}`}
        >
          พิมพ์ชื่อเอง (ของนอกเว็บ)
        </button>
      </div>

      {mode === 'catalog' ? (
        <div className="space-y-2">
          <input
            value={variantSearch}
            onChange={e => setVariantSearch(e.target.value)}
            placeholder="ค้นหาสินค้า..."
            className="border rounded px-2 py-1.5 text-sm w-full"
          />
          <select
            value={variantId}
            onChange={e => {
              setVariantId(e.target.value)
              const v = variants.find(x => x.id === e.target.value)
              if (v?.redeemPoints != null) setPoints(String(v.redeemPoints))
            }}
            className="border rounded px-2 py-1.5 text-sm w-full bg-white"
          >
            <option value="">— เลือกสินค้า —</option>
            {shownVariants.map(v => (
              <option key={v.id} value={v.id}>
                {v.label} (สต็อก {v.stock}{v.redeemPoints != null ? ` · ✨${v.redeemPoints}` : ''})
              </option>
            ))}
          </select>
          {variants.length > shownVariants.length && (
            <p className="text-[11px] text-gray-400">
              แสดง {shownVariants.length} จาก {variants.length} รายการ — พิมพ์ค้นหาเพื่อกรองเพิ่ม
            </p>
          )}
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={deductStock}
              onChange={e => setDeductStock(e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            ตัดสต็อกสินค้าด้วย {selected ? `(ตอนนี้เหลือ ${selected.stock})` : ''}
          </label>
        </div>
      ) : (
        <input
          value={customName}
          onChange={e => setCustomName(e.target.value)}
          placeholder="ชื่อของที่จะให้ เช่น ของรางวัลงานแข่ง"
          className="border rounded px-2 py-1.5 text-sm w-full"
        />
      )}

      <div className="grid grid-cols-2 gap-2 mt-3">
        <label className="block">
          <span className="text-xs text-gray-500">แต้มที่ใช้ (ต่อชิ้น)</span>
          <input
            type="number" min="0" value={points}
            onChange={e => setPoints(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm w-full"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">จำนวน</span>
          <input
            type="number" min="1" value={qty}
            onChange={e => setQty(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm w-full"
          />
        </label>
      </div>

      <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
        แต้มที่ใส่ตรงนี้เป็นแค่ตัวเลขที่โชว์ในกระเป๋าและใช้คิดเกณฑ์ส่งฟรีตอนผู้เล่นกดจัดส่ง
        <span className="text-gray-500"> ไม่ได้หักแต้มจริงจากผู้เล่น</span> — ถ้าให้ฟรีใส่ 0 ได้เลย
      </p>

      <div className="flex gap-2 mt-3">
        <button
          disabled={saving}
          onClick={handleSubmit}
          className="text-sm bg-blue-500 text-white px-4 py-1.5 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {saving ? 'กำลังเพิ่ม...' : 'เพิ่มเข้ากระเป๋า'}
        </button>
      </div>
    </div>
  )
}
