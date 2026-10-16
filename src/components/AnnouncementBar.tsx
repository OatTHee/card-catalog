import Image from 'next/image'
import { ANNOUNCEMENT_TONES, Announcement, hasContent, isSafeLink } from '@/lib/announcement'

// แถบประกาศทั่วไป (ไม่ปิดร้าน) หน้าตาแบบ ShopClosedNotice — ข้อความแสดงเป็นตัวอักษรล้วน ไม่รับ HTML
// preview = true ใช้ในหน้าแอดมิน ให้เห็นหน้าตาแม้ยังไม่ได้เปิดประกาศ
export default function AnnouncementBar({ announcement: a, preview = false }: { announcement: Announcement, preview?: boolean }) {
  if (!hasContent(a) || (!a.enabled && !preview)) return null
  const tone = ANNOUNCEMENT_TONES[a.tone] ?? ANNOUNCEMENT_TONES.info
  const showLink = a.link_url.trim() !== '' && isSafeLink(a.link_url)

  return (
    <div role="status" className={`border-b-2 ${tone.box}`}>
      <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col sm:flex-row gap-3 sm:items-start">
        {a.image_url && (
          <Image
            src={a.image_url}
            alt={a.title || 'ประกาศ'}
            width={800}
            height={800}
            className="w-full sm:w-40 h-auto max-h-48 object-contain rounded-lg shrink-0"
          />
        )}
        <div className="min-w-0">
          {a.title.trim() && <p className="font-bold text-base">📢 {a.title}</p>}
          {a.body.trim() && <p className="text-sm mt-1 leading-relaxed whitespace-pre-line">{a.body}</p>}
          {showLink && (
            <a
              href={a.link_url.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-block text-sm mt-1 font-semibold underline ${tone.link}`}
            >
              {a.link_text.trim() || a.link_url.trim()}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
