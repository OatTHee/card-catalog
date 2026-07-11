/**
 * migrate-to-r2.mjs
 *
 * ย้ายรูปทั้งหมดจาก Supabase Storage (bucket "products") ไป Cloudflare R2
 * แล้วอัปเดต URL ในตาราง products, product_variants, orders ให้ชี้ไปที่ R2
 *
 * วิธีรัน:
 *   1. npm install @supabase/supabase-js @aws-sdk/client-s3 dotenv
 *   2. สร้างไฟล์ .env.migrate (ดูตัวอย่างค่าด้านล่าง) — อย่า commit ไฟล์นี้เข้า git
 *   3. node scripts/migrate-to-r2.mjs
 *
 * .env.migrate ต้องมี:
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=xxxx   <- เอาจาก Supabase Dashboard > Settings > API > service_role (secret)
 *   CLOUDFLARE_R2_ACCOUNT_ID=xxxx
 *   CLOUDFLARE_R2_ACCESS_KEY_ID=xxxx
 *   CLOUDFLARE_R2_SECRET_ACCESS_KEY=xxxx
 *   CLOUDFLARE_R2_BUCKET_NAME=card-catalog-products
 *   NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-xxxx.r2.dev
 *   SUPABASE_STORAGE_BUCKET=products
 *
 * สคริปต์นี้ "dry-run" โดยดีฟอลต์ — จะแค่พิมพ์ว่าจะทำอะไรบ้าง ไม่แก้ไฟล์/DB จริง
 * ต่อเมื่อรันด้วย --apply เท่านั้นถึงจะย้ายไฟล์จริงและอัปเดต DB จริง
 *
 *   node scripts/migrate-to-r2.mjs          # dry run (ปลอดภัย ดูก่อนว่าจะทำอะไร)
 *   node scripts/migrate-to-r2.mjs --apply  # รันจริง
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import fs from 'node:fs'
import path from 'node:path'
import WebSocket from 'ws'

// Node 18 ไม่มี native WebSocket แบบ Node 22 — ใส่ polyfill กันพังตอนสร้าง Supabase client
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket
}

// ---------- config ----------
const APPLY = process.argv.includes('--apply')
const ENV_FILE = '.env.migrate'

if (fs.existsSync(ENV_FILE)) {
  const dotenv = await import('dotenv')
  dotenv.config({ path: ENV_FILE })
}

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CLOUDFLARE_R2_ACCOUNT_ID,
  CLOUDFLARE_R2_ACCESS_KEY_ID,
  CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  CLOUDFLARE_R2_BUCKET_NAME,
  NEXT_PUBLIC_R2_PUBLIC_URL,
  SUPABASE_STORAGE_BUCKET = 'products',
} = process.env

const required = {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CLOUDFLARE_R2_ACCOUNT_ID,
  CLOUDFLARE_R2_ACCESS_KEY_ID,
  CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  CLOUDFLARE_R2_BUCKET_NAME,
  NEXT_PUBLIC_R2_PUBLIC_URL,
}
for (const [k, v] of Object.entries(required)) {
  if (!v) {
    console.error(`❌ ขาดตัวแปร ${k} ใน .env.migrate`)
    process.exit(1)
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
})

// ---------- helpers ----------

// ดึงรายชื่อไฟล์ทั้งหมดใน bucket แบบ recursive
async function listAllFiles(prefix = '') {
  const results = []
  const { data, error } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })

  if (error) throw error

  for (const item of data) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name
    // โฟลเดอร์จะไม่มี item.id (metadata null) — ใช้เช็คว่าเป็นไฟล์หรือโฟลเดอร์
    if (item.id === null) {
      const nested = await listAllFiles(fullPath)
      results.push(...nested)
    } else {
      results.push(fullPath)
    }
  }
  return results
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const map = {
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
  }
  return map[ext] || 'application/octet-stream'
}

async function migrateFile(filePath) {
  const { data, error } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .download(filePath)

  if (error) throw new Error(`ดาวน์โหลด ${filePath} ไม่สำเร็จ: ${error.message}`)

  const buffer = Buffer.from(await data.arrayBuffer())

  await r2.send(
    new PutObjectCommand({
      Bucket: CLOUDFLARE_R2_BUCKET_NAME,
      Key: filePath,
      Body: buffer,
      ContentType: guessContentType(filePath),
      CacheControl: 'public, max-age=31536000, immutable',
    })
  )
}

function supabaseUrlToKey(url) {
  // แปลง URL แบบ .../storage/v1/object/public/products/<key> ให้เหลือแค่ <key>
  const marker = `/object/public/${SUPABASE_STORAGE_BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + marker.length))
}

function toR2Url(key) {
  return `${NEXT_PUBLIC_R2_PUBLIC_URL}/${key}`
}

// ---------- main ----------

async function main() {
  console.log(APPLY ? '⚠️  โหมดจริง (--apply) — จะย้ายไฟล์และแก้ DB จริง' : '🔍 โหมด dry-run — จะแค่แสดงแผนงาน ไม่แก้อะไรจริง')
  console.log('')

  // 1) ย้ายไฟล์
  console.log('กำลังดึงรายชื่อไฟล์จาก Supabase Storage...')
  const files = await listAllFiles()
  console.log(`เจอไฟล์ทั้งหมด ${files.length} ไฟล์\n`)

  let migrated = 0
  let failed = 0
  for (const filePath of files) {
    if (!APPLY) {
      console.log(`[dry-run] จะย้าย: ${filePath}`)
      continue
    }
    try {
      await migrateFile(filePath)
      migrated++
      console.log(`✅ ย้ายแล้ว: ${filePath} (${migrated}/${files.length})`)
    } catch (err) {
      failed++
      console.error(`❌ ล้มเหลว: ${filePath} — ${err.message}`)
    }
  }

  console.log('')
  if (APPLY) {
    console.log(`สรุปการย้ายไฟล์: สำเร็จ ${migrated} ล้มเหลว ${failed} จากทั้งหมด ${files.length}`)
    if (failed > 0) {
      console.log('⚠️  มีไฟล์ที่ย้ายไม่สำเร็จ แนะนำแก้ปัญหาแล้วรันสคริปต์ซ้ำก่อนไปขั้นตอนอัปเดต DB (รันซ้ำได้ปลอดภัย ไฟล์ที่ย้ายไปแล้วจะถูกอัปโหลดทับด้วยข้อมูลเดิม)')
    }
  }

  // 2) อัปเดต DB
  console.log('\n--- อัปเดต URL ใน database ---\n')

  const tables = [
    { name: 'products', column: 'image_url' },
    { name: 'product_variants', column: 'image_url' },
    { name: 'orders', column: 'slip_url' },
  ]

  for (const { name, column } of tables) {
    const { data: rows, error } = await supabase.from(name).select(`id, ${column}`)
    if (error) {
      console.error(`❌ อ่านตาราง ${name} ไม่สำเร็จ: ${error.message}`)
      continue
    }

    let updated = 0
    let skipped = 0
    for (const row of rows) {
      const url = row[column]
      if (!url || !url.includes('supabase.co')) {
        skipped++
        continue
      }
      const key = supabaseUrlToKey(url)
      if (!key) {
        console.warn(`⚠️  parse URL ไม่ได้ ข้ามไป: ${name}.id=${row.id} → ${url}`)
        continue
      }
      const newUrl = toR2Url(key)

      if (!APPLY) {
        console.log(`[dry-run] ${name}.id=${row.id}: ${url} → ${newUrl}`)
        continue
      }

      const { error: updateError } = await supabase.from(name).update({ [column]: newUrl }).eq('id', row.id)
      if (updateError) {
        console.error(`❌ อัปเดต ${name}.id=${row.id} ไม่สำเร็จ: ${updateError.message}`)
      } else {
        updated++
      }
    }
    console.log(`ตาราง ${name}: อัปเดต ${updated} แถว, ข้าม ${skipped} แถว (ไม่ใช่ Supabase URL หรือว่าง)`)
  }

  console.log('\nเสร็จสิ้น')
  if (!APPLY) {
    console.log('\nนี่คือ dry-run เท่านั้น ถ้าแผนงานด้านบนดูถูกต้อง ให้รันอีกครั้งด้วย: node scripts/migrate-to-r2.mjs --apply')
  }
}

main().catch((err) => {
  console.error('เกิดข้อผิดพลาด:', err)
  process.exit(1)
})
