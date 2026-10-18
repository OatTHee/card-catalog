import type { SupabaseClient } from '@supabase/supabase-js'
import { canPreorder, type SellerCheckout } from './sellers'

// โหมด "ช่วงพรีออเดอร์" (settings.preorder_mode = 'on' | 'off')
//   เปิดอยู่ -> สินค้าร้าน official ที่สต็อกไม่พอ และ "พรีได้" ยังสั่งได้ ส่วนที่เกินสต็อกจะเป็นพรีออเดอร์
//   พรีได้ = เป็นเซ็ต (type 'set') หรือแอดมินติ๊ก "อยู่ในโปรพรีออเดอร์" (products.in_preorder_promo)
//   ส่วนพรีนี้ไม่ตัดสต็อก (order_items.is_backorder = true) และส่งแยกรอบแบบพรีออเดอร์เดิม
//   ปิดโหมด -> ไม่มีอะไรพรีได้ ติ๊กค้างไว้ก็ไม่มีผล
// ตัวตัดสินจริงอยู่ใน RPC place_order ฝั่ง DB — ไฟล์นี้ใช้แสดงผล/แจ้งเตือนฝั่งหน้าเว็บเท่านั้น
export const PREORDER_MODE_KEY = 'preorder_mode'

export function isPreorderModeOn(value: string | null | undefined) {
  return value === 'on'
}

// สินค้านี้สั่งพรีตอนของหมดได้ไหม (ยังไม่รวมเงื่อนไขโหมดเปิด/ร้าน official) — ต้องตรงกับ place_order
// หมายเหตุ: is_preorder (สินค้าพรีถาวร) ไม่เกี่ยวกับกติกานี้
export function isBackorderEligible(product: { type?: string | null, in_preorder_promo?: boolean | null } | null | undefined) {
  return product?.type === 'set' || product?.in_preorder_promo === true
}

export interface VariantStockInfo {
  stock: number
  isPreorderProduct: boolean // สินค้าที่ติ๊ก "สินค้าพรีออเดอร์" ไว้ทั้งตัว (flow เดิม)
  canBackorder: boolean      // โหมดเปิด + ร้านที่พรีได้ + พรีได้ (เซ็ต/โปรพรี) -> สั่งเกินสต็อกได้
  seller: SellerCheckout | null // ร้านเจ้าของ (ใช้แยกออเดอร์/ค่าส่ง/QR ใน /cart และ /checkout)
}

export interface LineSplit {
  ready: number    // ชิ้นที่มีของ ส่งรอบปกติ
  preorder: number // ชิ้นที่เป็นพรีออเดอร์
}

// แบ่งจำนวนในตะกร้า 1 บรรทัด ให้ตรงกับที่ place_order จะบันทึก
export function splitLine(info: VariantStockInfo | undefined, qty: number): LineSplit {
  if (!info) return { ready: qty, preorder: 0 }
  if (info.isPreorderProduct) return { ready: 0, preorder: qty }
  if (!info.canBackorder || info.stock >= qty) return { ready: qty, preorder: 0 }
  const ready = Math.max(0, info.stock)
  return { ready, preorder: qty - ready }
}

// ดึงสต็อก/สถานะพรีของ variant ในตะกร้าสดจาก DB (ไม่เชื่อค่าที่ค้างใน localStorage)
export async function loadVariantStockInfo(
  supabase: SupabaseClient,
  variantIds: string[]
): Promise<{ modeOn: boolean, info: Map<string, VariantStockInfo> }> {
  const [{ data: setting }, { data: rows }] = await Promise.all([
    supabase.from('settings').select('value').eq('key', PREORDER_MODE_KEY).maybeSingle(),
    variantIds.length
      ? supabase.from('product_variants').select('id, stock, products(is_preorder, type, in_preorder_promo, sellers(id, name, type, shipping_fee, qr_image_url, payment_note))').in('id', variantIds)
      : Promise.resolve({ data: [] as unknown[] })
  ])

  const modeOn = isPreorderModeOn(setting?.value)
  const info = new Map<string, VariantStockInfo>()
  for (const row of (rows ?? []) as { id: string, stock: number, products: unknown }[]) {
    // relation แบบ many-to-one อาจมาเป็น object หรือ array แล้วแต่ type ที่ PostgREST เดา
    const p = (Array.isArray(row.products) ? row.products[0] : row.products) as
      { is_preorder?: boolean, type?: string, in_preorder_promo?: boolean, sellers?: SellerCheckout | SellerCheckout[] | null } | null
    const s = (Array.isArray(p?.sellers) ? p?.sellers[0] : p?.sellers) ?? null
    info.set(row.id, {
      stock: row.stock ?? 0,
      isPreorderProduct: Boolean(p?.is_preorder),
      canBackorder: modeOn && canPreorder(s?.type) && isBackorderEligible(p),
      seller: s,
    })
  }
  return { modeOn, info }
}

// ข้อความเตือนต่อบรรทัด (null = ไม่ต้องเตือน)
export function splitWarning(split: LineSplit, isPreorderProduct: boolean): string | null {
  if (isPreorderProduct || split.preorder === 0) return null
  if (split.ready === 0) return `สินค้าหมด — ${split.preorder} ชิ้นนี้เป็นพรีออเดอร์ (ส่งแยกรอบกับของพร้อมส่ง)`
  return `มีของพร้อมส่ง ${split.ready} ชิ้น อีก ${split.preorder} ชิ้นเป็นพรีออเดอร์ (ส่งแยกรอบ)`
}
