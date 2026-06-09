import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { email, sellerId } = await req.json()

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)
  if (error) return NextResponse.json({ error: error.message })

  await supabaseAdmin.from('user_profiles').insert({
    id: data.user.id,
    role: 'vendor',
    seller_id: sellerId
  })

  return NextResponse.json({ success: true })
}