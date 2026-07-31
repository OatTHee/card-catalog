import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export async function compressImage(file: File, maxWidthPx = 800): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, maxWidthPx / img.width)
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => resolve(blob!), 'image/webp', 0.82)
    }
    img.src = URL.createObjectURL(file)
  })
}

export async function uploadImage(file: File): Promise<string | null> {
  const compressed = await compressImage(file)

  const formData = new FormData()
  formData.append('file', compressed, `${Date.now()}.webp`)
  formData.append('prefix', 'products/')

  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    body: formData
  })

  if (!res.ok) {
    console.error('upload error:', await res.text())
    return null
  }

  const { url } = await res.json()
  return url as string
}
