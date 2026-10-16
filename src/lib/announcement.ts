// ประกาศหน้าร้าน (แถบใต้ Header เฉพาะหน้า /catalog) — แอดมินแก้ในหน้า /admin
// เก็บเป็น JSON ใน settings key 'announcement' · เปิด/ปิดด้วยมือ ไม่มีวันหมดอายุ
export const ANNOUNCEMENT_KEY = 'announcement'

export const ANNOUNCEMENT_TONES = {
  info:    { label: 'ฟ้า (ทั่วไป)',  box: 'bg-blue-50 border-blue-300 text-blue-900',     link: 'text-blue-700 hover:text-blue-900' },
  warning: { label: 'เหลือง (เตือน)', box: 'bg-amber-50 border-amber-300 text-amber-900',  link: 'text-blue-700 hover:text-blue-900' },
  success: { label: 'เขียว (ข่าวดี)', box: 'bg-green-50 border-green-300 text-green-900',  link: 'text-green-800 hover:text-green-950' },
  danger:  { label: 'แดง (สำคัญ)',   box: 'bg-red-50 border-red-300 text-red-900',        link: 'text-red-800 hover:text-red-950' },
  neutral: { label: 'เทา',          box: 'bg-slate-50 border-slate-300 text-slate-800',  link: 'text-blue-700 hover:text-blue-900' },
} as const

export type AnnouncementTone = keyof typeof ANNOUNCEMENT_TONES

export interface Announcement {
  enabled: boolean
  title: string
  body: string
  link_text: string
  link_url: string
  image_url: string
  tone: AnnouncementTone
}

export const EMPTY_ANNOUNCEMENT: Announcement = {
  enabled: false, title: '', body: '', link_text: '', link_url: '', image_url: '', tone: 'info',
}

// อ่านค่าจาก settings แบบกันพัง — JSON เสีย/ไม่มีแถว = ถือว่าไม่มีประกาศ (หน้าร้านต้องไม่ล่มเพราะประกาศ)
export function parseAnnouncement(raw: string | null | undefined): Announcement {
  if (!raw) return EMPTY_ANNOUNCEMENT
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof Announcement, unknown>>
    const str = (x: unknown) => (typeof x === 'string' ? x : '')
    const tone = str(v.tone)
    return {
      enabled: v.enabled === true,
      title: str(v.title),
      body: str(v.body),
      link_text: str(v.link_text),
      link_url: str(v.link_url),
      image_url: str(v.image_url),
      tone: tone in ANNOUNCEMENT_TONES ? (tone as AnnouncementTone) : 'info',
    }
  } catch {
    return EMPTY_ANNOUNCEMENT
  }
}

// รับเฉพาะลิงก์ http/https กัน javascript: URL
export function isSafeLink(url: string) {
  return /^https?:\/\//i.test(url.trim())
}

export function hasContent(a: Announcement) {
  return Boolean(a.title.trim() || a.body.trim())
}
