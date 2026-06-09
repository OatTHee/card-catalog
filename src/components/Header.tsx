'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function Header() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <header className="bg-white border-b border-blue-100 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">D</span>
          </div>
          <h1 className="text-lg font-bold text-blue-900">DMT Shop</h1>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <a href="/cart" className="text-sm text-gray-600 hover:text-blue-500">🛒 ตะกร้า</a>
              <a href="/orders" className="text-sm text-gray-600 hover:text-blue-500">คำสั่งซื้อ</a>
              <a href="/profile">
                <img
                  src={user.user_metadata?.avatar_url || user.user_metadata?.picture || '/default-avatar.png'}
                  className="w-8 h-8 rounded-full border border-blue-200"
                />
              </a>
            </>
          ) : (
            <a href="/login" className="text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">
              เข้าสู่ระบบ
            </a>
          )}
        </div>
      </div>
    </header>
  )
}