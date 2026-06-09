'use client'

import { useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function ConfirmPage() {
  useEffect(() => {
    async function confirm() {
      const code = new URLSearchParams(window.location.search).get('code')
      if (!code) { window.location.href = '/login?error=auth'; return }

      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error || !data.user) { window.location.href = '/login?error=auth'; return }

      await supabase.from('customers').upsert({
        id: data.user.id,
        display_name: data.user.user_metadata?.full_name || data.user.user_metadata?.username,
        email: data.user.email,
        avatar_url: data.user.user_metadata?.avatar_url
      }, { onConflict: 'id' })

      window.location.href = '/catalog'
    }
    confirm()
  }, [])

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center">
      <p className="text-gray-500">กำลังเข้าสู่ระบบ...</p>
    </div>
  )
}