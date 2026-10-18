// กฎของ "ร้าน" (sellers) ที่ใช้ร่วมกันทั้งเว็บ — ตัวตัดสินจริงอยู่ฝั่ง DB (RPC place_order*)
//   official = ร้านกลุ่ม DMT  — ซื้อบนเว็บได้ + ใช้ช่วงพรีออเดอร์ได้ + มีโปรโมชัน
//   admin    = ร้านส่วนตัวของแอดมิน — ซื้อบนเว็บได้ แต่ "ของหมดคือหมด" ไม่มีพรีออเดอร์
//   vendor   = ร้านฝากขาย/มือสอง — ไม่ขายบนเว็บ แสดงปุ่ม "ติดต่อซื้อ" ไปที่ contact_url
export type SellerType = 'official' | 'admin' | 'vendor'

// ข้อมูลร้านที่หน้าเว็บใช้ (select เฉพาะที่ใช้จริงเสมอ)
export interface SellerBasic {
  id: string
  name?: string | null
  type?: string | null
  contact_url?: string | null
}

export interface SellerCheckout extends SellerBasic {
  shipping_fee?: number | null
  qr_image_url?: string | null
  payment_note?: string | null
}

export const DEFAULT_SHIPPING_FEE = 40

// ซื้อผ่านตะกร้า/เช็คเอาต์ได้ไหม
export function canCheckout(sellerType: string | null | undefined) {
  return sellerType === 'official' || sellerType === 'admin'
}

// ร้านนี้ใช้ช่วงพรีออเดอร์ (สั่งตอนของหมด) ได้ไหม — ต้องตรงกับ _place_order_one ฝั่ง DB
export function canPreorder(sellerType: string | null | undefined) {
  return sellerType === 'official'
}

export function shippingFeeOf(seller: SellerCheckout | null | undefined) {
  const fee = Number(seller?.shipping_fee)
  return Number.isFinite(fee) ? fee : DEFAULT_SHIPPING_FEE
}

// ชื่อ env ของ Discord webhook ที่ยอมให้ใช้ได้ (DB เก็บแค่ "ชื่อ" — ค่าจริงอยู่ใน env ของ Vercel)
// เพิ่มร้านใหม่ที่ต้องมี webhook ของตัวเอง = เพิ่มชื่อในลิสต์นี้ + ตั้ง env ใน Vercel
export const WEBHOOK_ENV_ALLOWLIST = [
  'DISCORD_WEBHOOK_URL',      // ร้านกลุ่ม DMT
  'DISCORD_WEBHOOK_URL_OAT',  // ร้านส่วนตัวแอดมิน
] as const

export function isAllowedWebhookEnv(name: string | null | undefined): boolean {
  return typeof name === 'string' && (WEBHOOK_ENV_ALLOWLIST as readonly string[]).includes(name)
}

// PostgREST คืน relation แบบ many-to-one เป็น object หรือ array แล้วแต่ที่มันเดา
export function sellerNameOf(row: { sellers?: SellerBasic | SellerBasic[] | null } | null | undefined): string {
  const seller = Array.isArray(row?.sellers) ? row?.sellers[0] : row?.sellers
  return seller?.name ?? 'ไม่ทราบร้าน'
}
