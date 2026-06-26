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
  const compressed = await compressImage(file) // เพิ่มบรรทัดนี้
  const fileName = `${Date.now()}.webp`        // เปลี่ยน ext เป็น webp

  const { error } = await supabase.storage
    .from('products')
    .upload(fileName, compressed, {  // ส่ง compressed แทน file
      cacheControl: '31536000',
      contentType: 'image/webp',
      upsert: false,
    })

  if (error) {
    console.error('upload error:', error)
    return null
  }

  const { data } = supabase.storage
    .from('products')
    .getPublicUrl(fileName)

  return data.publicUrl
}