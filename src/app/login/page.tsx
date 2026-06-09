'use client'

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function LoginPage() {
  async function loginWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `https://card-catalog-pi.vercel.app/auth/confirm` }
  })
}

async function loginWithDiscord() {
  await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: `https://card-catalog-pi.vercel.app/auth/confirm` }
  })
}

  return (
    <main className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm p-8 w-full max-w-sm">
        <h1 className="text-xl font-bold text-blue-900 mb-2 text-center">เข้าสู่ระบบ</h1>
        <p className="text-sm text-gray-400 text-center mb-6">เพื่อสั่งซื้อสินค้า</p>
        <div className="space-y-3">
          <button
            onClick={loginWithGoogle}
            className="w-full flex items-center justify-center gap-3 border rounded-lg py-2.5 text-sm hover:bg-gray-50"
          >
            <img src="https://www.google.com/favicon.ico" className="w-4 h-4" />
            เข้าสู่ระบบด้วย Google
          </button>
          <button
            onClick={loginWithDiscord}
            className="w-full flex items-center justify-center gap-3 bg-indigo-600 text-white rounded-lg py-2.5 text-sm hover:bg-indigo-700"
          >
            เข้าสู่ระบบด้วย Discord
          </button>
        </div>
      </div>
    </main>
  )
}