'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { uploadImage } from '@/lib/upload'
import { revalidateCatalog } from '@/app/actions/revalidate'
import AnnouncementBar from '@/components/AnnouncementBar'
import {
  ANNOUNCEMENT_KEY, ANNOUNCEMENT_TONES, Announcement, AnnouncementTone, EMPTY_ANNOUNCEMENT,
  hasContent, isSafeLink, parseAnnouncement
} from '@/lib/announcement'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

// กล่องแก้ประกาศหน้าร้านในหน้า /admin (แสดงเฉพาะหน้า /catalog)
export default function AnnouncementEditor() {
  const [form, setForm] = useState<Announcement>(EMPTY_ANNOUNCEMENT)
  const [saved, setSaved] = useState<Announcement>(EMPTY_ANNOUNCEMENT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', ANNOUNCEMENT_KEY).maybeSingle().then(({ data }) => {
      const a = parseAnnouncement(data?.value)
      setForm(a)
      setSaved(a)
      setLoading(false)
    })
  }, [])

  const dirty = JSON.stringify(form) !== JSON.stringify(saved)

  function set<K extends keyof Announcement>(key: K, value: Announcement[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const url = await uploadImage(file)
    setUploading(false)
    if (!url) { alert('อัปโหลดรูปไม่สำเร็จ'); return }
    set('image_url', url)
  }

  async function save(next: Announcement) {
    if (next.enabled && !hasContent(next)) {
      alert('ใส่หัวข้อหรือข้อความอย่างน้อย 1 อย่างก่อนเปิดประกาศ')
      return
    }
    if (next.link_url.trim() && !isSafeLink(next.link_url)) {
      alert('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('settings')
      .update({ value: JSON.stringify(next) })
      .eq('key', ANNOUNCEMENT_KEY)
    setSaving(false)
    if (error) {
      alert('บันทึกประกาศไม่สำเร็จ: ' + error.message)
      return
    }
    setForm(next)
    setSaved(next)
    revalidateCatalog()
  }

  if (loading) return null

  return (
    <div className="mt-4 bg-white rounded-xl p-4 border border-slate-200">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <div className="flex-1 min-w-[200px]">
          <h2 className="font-semibold text-sm text-slate-700">ประกาศหน้าร้าน</h2>
          <p className="text-xs text-slate-500 mt-0.5">แถบใต้หัวเว็บ แสดงเฉพาะหน้า /catalog ทุกครั้งที่เปิด จนกว่าจะกดปิด</p>
        </div>
        <button
          onClick={() => save({ ...form, enabled: !saved.enabled })}
          disabled={saving}
          className={`text-sm px-4 py-2 rounded-lg disabled:opacity-50 ${saved.enabled
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
        >
          {saved.enabled ? '📢 แสดงอยู่ — กดเพื่อปิด' : 'ปิดอยู่ — บันทึกและเปิดประกาศ'}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-slate-600 sm:col-span-2">
          หัวข้อ
          <input value={form.title} onChange={e => set('title', e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm mt-1" placeholder="เช่น ร้านหยุดส่งของวันที่ 1-3" />
        </label>
        <label className="text-xs text-slate-600 sm:col-span-2">
          ข้อความ (ขึ้นบรรทัดใหม่ได้)
          <textarea value={form.body} onChange={e => set('body', e.target.value)} rows={3}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm mt-1" />
        </label>
        <label className="text-xs text-slate-600">
          ข้อความลิงก์ (ไม่บังคับ)
          <input value={form.link_text} onChange={e => set('link_text', e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm mt-1" placeholder="เช่น ดูรายละเอียด" />
        </label>
        <label className="text-xs text-slate-600">
          URL ลิงก์ (ไม่บังคับ)
          <input value={form.link_url} onChange={e => set('link_url', e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm mt-1" placeholder="https://..." />
        </label>
        <label className="text-xs text-slate-600">
          สี
          <select value={form.tone} onChange={e => set('tone', e.target.value as AnnouncementTone)}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm mt-1">
            {Object.entries(ANNOUNCEMENT_TONES).map(([k, t]) => (
              <option key={k} value={k}>{t.label}</option>
            ))}
          </select>
        </label>
        <div className="text-xs text-slate-600">
          รูป (ไม่บังคับ)
          <div className="flex items-center gap-2 mt-1">
            <input type="file" accept="image/*" onChange={handleImage} disabled={uploading} className="text-xs flex-1 min-w-0" />
            {uploading && <span className="text-slate-400">กำลังอัปโหลด...</span>}
            {form.image_url && !uploading && (
              <button onClick={() => set('image_url', '')} className="text-red-500 hover:text-red-700">ลบรูป</button>
            )}
          </div>
        </div>
      </div>

      {hasContent(form) && (
        <div className="mt-3">
          <p className="text-[11px] text-slate-400 mb-1">ตัวอย่างที่ลูกค้าจะเห็น</p>
          <div className="border border-dashed border-slate-300 rounded-lg overflow-hidden">
            <AnnouncementBar announcement={form} preview />
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-3 justify-end">
        {dirty && (
          <button onClick={() => setForm(saved)} className="text-sm px-3 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">
            ยกเลิกการแก้
          </button>
        )}
        <button onClick={() => save(form)} disabled={saving || !dirty}
          className="text-sm px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed">
          {saving ? 'กำลังบันทึก...' : 'บันทึกข้อความ'}
        </button>
      </div>
    </div>
  )
}
