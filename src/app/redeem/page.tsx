'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import RedeemCard from '@/components/RedeemCard'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function RedeemPage() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'catalog' | 'bag'>('catalog')
  const [myPoints, setMyPoints] = useState(0)
  const [products, setProducts] = useState<any[]>([])
  const [bagItems, setBagItems] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      setSession(session)
      loadAll(session.user.id)
    })
  }, [])

  async function loadAll(userId: string) {
    setLoading(true)
    const [{ data: profile }, { data: prods }, { data: variants }, { data: bag }] = await Promise.all([
      supabase.from('customers').select('points').eq('id', userId).single(),
      supabase.from('products').select('*').eq('is_for_redeem', true).order('sort_order', { ascending: true }),
      supabase.from('product_variants').select('*').not('redeem_points', 'is', null).order('sort_order', { ascending: true }),
      supabase.from('redemptions').select('*').eq('customer_id', userId).eq('status', 'in_bag').order('created_at', { ascending: false })
    ])

    setMyPoints(profile?.points ?? 0)
    setProducts((prods ?? []).map(p => ({
      ...p,
      product_variants: (variants ?? []).filter(v => v.product_id === p.id)
    })))
    setBagItems(bag ?? [])
    setLoading(false)
  }

  function handleRedeemed(pointsRemaining: number) {
    setMyPoints(pointsRemaining)
    if (session) loadAll(session.user.id)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-amber-50">
        <Header />
        <div className="max-w-5xl mx-auto px-4 py-16 text-center text-gray-400">กำลังโหลด...</div>
        <Footer />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-amber-50">
      <Header />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* แถบแต้มของฉัน */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-400 rounded-2xl p-5 mb-6 text-white flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs text-amber-100">แต้มของฉัน</p>
            <p className="text-2xl font-bold">✨ {myPoints.toLocaleString()} แต้ม</p>
          </div>
          <span className="text-4xl opacity-80">🎴</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('catalog')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              tab === 'catalog' ? 'bg-amber-500 text-white' : 'bg-white text-gray-500 border border-gray-200'
            }`}
          >
            แลกของรางวัล
          </button>
          <button
            onClick={() => setTab('bag')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors relative ${
              tab === 'bag' ? 'bg-amber-500 text-white' : 'bg-white text-gray-500 border border-gray-200'
            }`}
          >
            กระเป๋าของฉัน
            {bagItems.length > 0 && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                tab === 'bag' ? 'bg-white text-amber-600' : 'bg-amber-100 text-amber-600'
              }`}>
                {bagItems.length}
              </span>
            )}
          </button>
        </div>

        {tab === 'catalog' ? (
          products.length === 0 ? (
            <p className="text-center text-gray-400 py-16">ยังไม่มีของรางวัลให้แลกตอนนี้ ลองกลับมาดูใหม่นะ</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map(product => (
                <RedeemCard key={product.id} product={product} myPoints={myPoints} onRedeemed={handleRedeemed} />
              ))}
            </div>
          )
        ) : (
          <BagSection
            userId={session.user.id}
            bagItems={bagItems}
            onChanged={() => loadAll(session.user.id)}
          />
        )}
      </div>

      <Footer />
    </main>
  )
}

function BagSection({ userId, bagItems, onChanged }: {
  userId: string
  bagItems: any[]
  onChanged: () => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [showConfirm, setShowConfirm] = useState(false)

  const totalPoints = bagItems
    .filter(i => selected.includes(i.id))
    .reduce((sum, i) => sum + i.points_spent, 0)

  function toggle(id: string) {
    setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id])
  }

  if (bagItems.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">กระเป๋ายังว่างอยู่</p>
        <p className="text-xs text-gray-300 mt-1">แลกของรางวัลก่อน แล้วมันจะมาเก็บรออยู่ที่นี่</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        เลือกของที่จะให้จัดส่งพร้อมกัน ดองรวมกันได้หลายชิ้นเพื่อประหยัดค่าส่ง
      </p>
      <div className="space-y-2">
        {bagItems.map(item => (
          <label
            key={item.id}
            className={`flex items-center gap-3 bg-white rounded-xl border p-3 cursor-pointer transition-colors ${
              selected.includes(item.id) ? 'border-amber-400 bg-amber-50' : 'border-gray-100'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={() => toggle(item.id)}
              className="w-4 h-4 accent-amber-500"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{item.item_description}</p>
              <p className="text-xs text-gray-400">
                {item.quantity > 1 ? `จำนวน ${item.quantity} · ` : ''}
                {new Date(item.created_at).toLocaleDateString('th-TH')}
              </p>
            </div>
            <span className="text-sm font-semibold text-amber-600 whitespace-nowrap">✨ {item.points_spent}</span>
          </label>
        ))}
      </div>

      <div className="sticky bottom-4 mt-6">
        <button
          onClick={() => setShowConfirm(true)}
          disabled={selected.length === 0}
          className="w-full py-3 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
        >
          {selected.length === 0 ? 'เลือกของที่จะส่งก่อน' : `ยืนยันจัดส่ง ${selected.length} ชิ้น (✨ ${totalPoints})`}
        </button>
      </div>

      {showConfirm && (
        <ConfirmShipmentModal
          userId={userId}
          redemptionIds={selected}
          onClose={() => setShowConfirm(false)}
          onConfirmed={() => {
            setShowConfirm(false)
            setSelected([])
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function ConfirmShipmentModal({ userId, redemptionIds, onClose, onConfirmed }: {
  userId: string
  redemptionIds: string[]
  onClose: () => void
  onConfirmed: () => void
}) {
  const [addresses, setAddresses] = useState<any[]>([])
  const [selectedAddress, setSelectedAddress] = useState('')
  const [shippingFee, setShippingFee] = useState(0)
  const [slipFile, setSlipFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loadingAddr, setLoadingAddr] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('shipping_addresses').select('*').eq('customer_id', userId).order('is_default', { ascending: false }),
      supabase.from('settings').select('value').eq('key', 'shipping_fee').single()
    ]).then(([{ data: addrs }, { data: settings }]) => {
      setAddresses(addrs ?? [])
      if (addrs?.length) setSelectedAddress(addrs.find((a: any) => a.is_default)?.id || addrs[0].id)
      if (settings) setShippingFee(Number(settings.value))
      setLoadingAddr(false)
    })
  }, [userId])

  async function handleConfirm() {
    if (!selectedAddress) return
    setSubmitting(true)
    setError('')

    let slipUrl: string | null = null
    if (slipFile) {
      const formData = new FormData()
      formData.append('file', slipFile)
      formData.append('prefix', 'redeem-slips/')
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!uploadRes.ok) {
        setError('อัปโหลดสลิปไม่สำเร็จ')
        setSubmitting(false)
        return
      }
      const uploadData = await uploadRes.json()
      slipUrl = uploadData.url
    }

    const { error: rpcError } = await supabase.rpc('confirm_shipment', {
      p_redemption_ids: redemptionIds,
      p_shipping_address_id: selectedAddress,
      p_shipping_fee: shippingFee,
      p_slip_url: slipUrl
    })

    setSubmitting(false)

    if (rpcError) {
      setError(rpcError.message || 'ยืนยันจัดส่งไม่สำเร็จ')
      return
    }

    onConfirmed()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="font-bold text-gray-800">ยืนยันจัดส่ง</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">✕</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {loadingAddr ? (
            <p className="text-sm text-gray-400">กำลังโหลดที่อยู่...</p>
          ) : addresses.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-500 mb-2">ยังไม่มีที่อยู่จัดส่ง</p>
              <a href="/profile" className="text-sm text-amber-600 underline">เพิ่มที่อยู่ในหน้าโปรไฟล์</a>
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">ที่อยู่จัดส่ง</p>
              <div className="space-y-2">
                {addresses.map(addr => (
                  <label
                    key={addr.id}
                    className={`block p-3 rounded-lg border text-sm cursor-pointer ${
                      selectedAddress === addr.id ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="address"
                      checked={selectedAddress === addr.id}
                      onChange={() => setSelectedAddress(addr.id)}
                      className="mr-2 accent-amber-500"
                    />
                    <span className="font-medium">{addr.name}</span> — {addr.phone}
                    <p className="text-xs text-gray-500 mt-0.5">{addr.address} {addr.district} {addr.province} {addr.postal_code}</p>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-gray-500">ค่าจัดส่ง</span>
            <span className="font-semibold text-gray-700">{shippingFee > 0 ? `฿${shippingFee}` : 'ฟรี'}</span>
          </div>

          {shippingFee > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">แนบสลิปโอนค่าจัดส่ง</p>
              <input
                type="file"
                accept="image/*"
                onChange={e => setSlipFile(e.target.files?.[0] ?? null)}
                className="text-xs"
              />
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="p-5 border-t">
          <button
            onClick={handleConfirm}
            disabled={!selectedAddress || submitting || (shippingFee > 0 && !slipFile)}
            className="w-full py-3 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'กำลังยืนยัน...' : 'ยืนยันจัดส่ง'}
          </button>
        </div>
      </div>
    </div>
  )
}
