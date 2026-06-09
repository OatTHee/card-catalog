'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function ProfilePage() {
  const [customer, setCustomer] = useState<any>(null)
  const [addresses, setAddresses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddAddress, setShowAddAddress] = useState(false)
  const [editAddress, setEditAddress] = useState<any>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '/login'; return }

    const { data: customerData } = await supabase
      .from('customers').select('*').eq('id', session.user.id).single()
    const { data: addressData } = await supabase
      .from('shipping_addresses').select('*').eq('customer_id', session.user.id)
      .order('is_default', { ascending: false })

    setCustomer(customerData)
    setAddresses(addressData ?? [])
    setLoading(false)
  }

  async function handleSetDefault(addressId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase.from('shipping_addresses')
      .update({ is_default: false }).eq('customer_id', session.user.id)
    await supabase.from('shipping_addresses')
      .update({ is_default: true }).eq('id', addressId)
    loadData()
  }

  async function handleDelete(addressId: string) {
    if (!confirm('ลบที่อยู่นี้?')) return
    await supabase.from('shipping_addresses').delete().eq('id', addressId)
    loadData()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/catalog'
  }

  if (loading) return <div className="min-h-screen bg-blue-50 flex items-center justify-center">กำลังโหลด...</div>

  return (
    <main className="min-h-screen bg-blue-50">
      <header className="bg-white border-b border-blue-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/catalog" className="text-blue-500 text-sm">← กลับ</a>
          <h1 className="font-bold text-blue-900">โปรไฟล์</h1>
          <button onClick={handleLogout} className="text-sm text-red-400 hover:text-red-600">ออกจากระบบ</button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* ข้อมูลบัญชี */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            {customer?.avatar_url && (
              <img src={customer.avatar_url} className="w-12 h-12 rounded-full" />
            )}
            <div>
              <p className="font-semibold text-gray-800">{customer?.display_name}</p>
              <p className="text-sm text-gray-400">{customer?.email}</p>
            </div>
          </div>
        </div>

        {/* ที่อยู่จัดส่ง */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-800">ที่อยู่จัดส่ง</h2>
            <button
              onClick={() => setShowAddAddress(true)}
              className="text-sm text-blue-500 hover:text-blue-700"
            >
              + เพิ่มที่อยู่
            </button>
          </div>

          {addresses.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีที่อยู่จัดส่ง</p>
          )}

          <div className="space-y-3">
            {addresses.map(addr => (
              <div key={addr.id} className={`border rounded-lg p-3 ${addr.is_default ? 'border-blue-300 bg-blue-50' : ''}`}>
                <div className="flex justify-between items-start">
                  <div>
                    {addr.is_default && (
                      <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full mb-1 inline-block">ค่าเริ่มต้น</span>
                    )}
                    <p className="text-sm font-medium">{addr.name} | {addr.phone}</p>
                    <p className="text-sm text-gray-500">{addr.address}</p>
                    <p className="text-sm text-gray-500">{addr.district} {addr.province} {addr.postal_code}</p>
                  </div>
                </div>
                <div className="flex gap-3 mt-2">
                  {!addr.is_default && (
                    <button onClick={() => handleSetDefault(addr.id)} className="text-xs text-blue-500 hover:text-blue-700">
                      ตั้งเป็นค่าเริ่มต้น
                    </button>
                  )}
                  <button onClick={() => setEditAddress(addr)} className="text-xs text-gray-500 hover:text-gray-700">แก้ไข</button>
                  <button onClick={() => handleDelete(addr.id)} className="text-xs text-red-400 hover:text-red-600">ลบ</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ประวัติคำสั่งซื้อ */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-2">ประวัติคำสั่งซื้อ</h2>
          <a href="/orders" className="text-sm text-blue-500 hover:text-blue-700">ดูทั้งหมด →</a>
        </div>
      </div>

      {(showAddAddress || editAddress) && (
        <AddressModal
          address={editAddress}
          onClose={() => { setShowAddAddress(false); setEditAddress(null) }}
          onSaved={() => { setShowAddAddress(false); setEditAddress(null); loadData() }}
        />
      )}
    </main>
  )
}

function AddressModal({ address, onClose, onSaved }: { address: any, onClose: () => void, onSaved: () => void }) {
  const [form, setForm] = useState({
    name: address?.name || '',
    phone: address?.phone || '',
    address: address?.address || '',
    district: address?.district || '',
    province: address?.province || '',
    postal_code: address?.postal_code || '',
  })
  const [saving, setSaving] = useState(false)

  function update(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.name || !form.phone || !form.address || !form.province || !form.postal_code) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    if (address) {
      await supabase.from('shipping_addresses').update(form).eq('id', address.id)
    } else {
      const isFirst = (await supabase.from('shipping_addresses')
        .select('id').eq('customer_id', session.user.id)).data?.length === 0
      await supabase.from('shipping_addresses').insert({
        ...form, customer_id: session.user.id, is_default: isFirst
      })
    }
    setSaving(false)
    onSaved()
  }

  const fields = [
    { key: 'name', label: 'ชื่อผู้รับ', placeholder: 'ชื่อ-นามสกุล' },
    { key: 'phone', label: 'เบอร์โทร', placeholder: '08X-XXX-XXXX' },
    { key: 'address', label: 'ที่อยู่', placeholder: 'บ้านเลขที่ ถนน ซอย' },
    { key: 'district', label: 'แขวง/ตำบล', placeholder: '' },
    { key: 'province', label: 'จังหวัด', placeholder: '' },
    { key: 'postal_code', label: 'รหัสไปรษณีย์', placeholder: '' },
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl w-full max-w-md max-h-screen overflow-y-auto p-6">
        <h2 className="font-bold mb-4">{address ? 'แก้ไขที่อยู่' : 'เพิ่มที่อยู่ใหม่'}</h2>
        <div className="space-y-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="text-sm text-gray-600">{f.label}</label>
              <input
                value={form[f.key as keyof typeof form]}
                onChange={e => update(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-blue-500 text-white py-2 rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
          <button onClick={onClose} className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50">ยกเลิก</button>
        </div>
      </div>
    </div>
  )
}