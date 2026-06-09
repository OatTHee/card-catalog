import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // สร้าง customer profile ถ้ายังไม่มี
      await supabase.from('customers').upsert({
        id: data.user.id,
        display_name: data.user.user_metadata?.full_name || data.user.user_metadata?.username,
        email: data.user.email,
        avatar_url: data.user.user_metadata?.avatar_url
      }, { onConflict: 'id' })

      return NextResponse.redirect(`${origin}/catalog`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}