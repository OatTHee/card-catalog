'use server'
import { revalidatePath } from 'next/cache'

export async function revalidateCatalog() {
  revalidatePath('/catalog')
}