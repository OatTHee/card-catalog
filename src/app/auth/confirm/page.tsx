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
      // รอให้ Supabase จัดการ hash fragment ก่อน
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        await supabase.from('customers').upsert({
          id: session.user.id,
          display_name: session.user.user_metadata?.full_name || session.user.user_metadata?.username,
          email: session.user.email,
          avatar_url: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture
        }, { onConflict: 'id' })
        window.location.href = '/catalog'
        return
      }

      window.location.href = '/login?error=auth'
    }
    confirm()
  }, [])

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center">
      <p className="text-gray-500">กำลังเข้าสู่ระบบ...</p>
    </div>
  )
}