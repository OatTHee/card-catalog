import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export async function uploadImage(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const fileName = `${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('products')
    .upload(fileName, file)

  if (error) {
    console.error('upload error:', error)
    return null
  }

  const { data } = supabase.storage
    .from('products')
    .getPublicUrl(fileName)

  return data.publicUrl
}