import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { uploadToR2 } from '@/lib/r2'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    // ต้อง login ก่อนถึงจะอัปโหลดได้ (กันสแปม/เปลือง storage จากคนนอกที่ไม่ login)
    // ใช้ได้ทั้งแอดมิน (อัปรูปสินค้า) และลูกค้าทั่วไป (อัปสลิปตอนเช็คเอาท์/แลกของ)
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const prefix = (formData.get('prefix') as string) || ''

    if (!file) {
      return NextResponse.json({ error: 'no file provided' }, { status: 400 })
    }

    // จำกัดขนาดไฟล์กันโดนยิงสแปม (ปรับได้ตามต้องการ)
    const MAX_SIZE = 8 * 1024 * 1024 // 8MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'file too large' }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.split('.').pop() || 'bin'
    const key = `${prefix}${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`

    const url = await uploadToR2(key, buffer, file.type || 'application/octet-stream')

    return NextResponse.json({ url })
  } catch (err) {
    console.error('upload route error:', err)
    return NextResponse.json({ error: 'upload failed' }, { status: 500 })
  }
}
