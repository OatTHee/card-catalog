'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function ConfirmPage() {
  // กัน onAuthStateChange ยิงซ้ำ (Supabase อาจ fire หลาย event เช่น INITIAL_SESSION
  // แล้วตามด้วย SIGNED_IN ในช่วงเวลาไล่เลี่ยกัน) ถ้าไม่กัน claim_legacy_account จะถูกเรียก
  // พร้อมกันหลายครั้ง เกิด race condition เครดิตแต้ม/EXP ซ้ำได้ (เจอเคสจริงมาแล้ว)
  const handledRef = useRef(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        if (handledRef.current) return
        handledRef.current = true

        await supabase.from('customers').upsert({
          id: session.user.id,
          display_name: session.user.user_metadata?.full_name || session.user.user_metadata?.username,
          email: session.user.email,
          avatar_url: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture
        }, { onConflict: 'id' })

        // เคลมแต้ม/exp/สถิติ/ของในกระเป๋าจากระบบเก่า (ถ้ามี) — ทำเงียบๆ ไม่บล็อก
        // การ login ถ้าไม่มีข้อมูลเก่าก็แค่ไม่มีอะไรเกิดขึ้น (claimed: false)
        try {
          const { data } = await supabase.rpc('claim_legacy_account', { p_user_id: session.user.id })
          if (data?.claimed) {
            console.log(`เคลมข้อมูลเก่าสำเร็จ: UID ${data.uid}, +${data.points_added} แต้ม, +${data.exp_added} EXP`)
          }
        } catch (err) {
          console.error('claim_legacy_account error:', err)
        }

        window.location.href = '/catalog'
      } else if (event === 'SIGNED_OUT') {
        window.location.href = '/login?error=auth'
      }
    })

    // timeout fallback
    const timeout = setTimeout(() => {
      window.location.href = '/login?error=auth'
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center">
      <p className="text-gray-500">กำลังเข้าสู่ระบบ...</p>
    </div>
  )
}
