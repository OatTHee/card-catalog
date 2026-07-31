import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// เช็คว่า request มี access token ของแอดมินจริงไหม ก่อนอนุญาตให้ invite/ตั้ง role
// (เดิม endpoint นี้ใช้ service_role key ตรงๆ โดยไม่เช็คใครเรียกเลย ใครก็ยิง POST
// เข้ามาให้ตัวเองเป็น vendor ได้ทันที — เป็นช่องโหว่สิทธิ์ระดับสูง ต้องเช็คก่อนทุกครั้ง)
async function requireAdmin(req: Request) {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return null

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null

  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') return null
  return user
}

export async function POST(req: Request) {
  const admin = await requireAdmin(req)
  if (!admin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { email, sellerId } = await req.json()

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)
  if (error) return NextResponse.json({ error: error.message })

  await supabaseAdmin.from('user_profiles').insert({
    id: data.user.id,
    role: 'vendor',
    seller_id: sellerId
  })

  return NextResponse.json({ success: true })
}
