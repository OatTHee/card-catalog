import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket
}

const dotenv = await import('dotenv')
dotenv.config({ path: '.env.migrate' })

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data, error } = await supabase.storage.listBuckets()

if (error) {
  console.error('❌ ดึงรายชื่อ bucket ไม่สำเร็จ:', error.message)
  console.error('รายละเอียด:', error)
  process.exit(1)
}

console.log(`เจอ bucket ทั้งหมด ${data.length} อัน:\n`)
for (const b of data) {
  console.log(`- ${b.name}  (public: ${b.public}, สร้างเมื่อ: ${b.created_at})`)
}
