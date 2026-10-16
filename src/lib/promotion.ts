// โปรโมชันหน้าร้าน (ตาราง promotions + promotion_items)
//   bundle = เหมา: จ่ายราคาเดียวได้ทุกชิ้นในโปร
//   b1g1   = ซื้อ 1 แถม 1: เลือก 2 ชิ้นคละในกลุ่ม ชิ้นที่ถูกกว่าฟรี
// ราคา/สต็อกตัวจริงตัดสินใน RPC place_order — ไฟล์นี้ใช้แสดงผลฝั่งหน้าเว็บเท่านั้น
export type PromotionType = 'bundle' | 'b1g1'

export const PROMOTION_TYPE_LABEL: Record<PromotionType, string> = {
  bundle: 'โปรเหมา',
  b1g1: 'ซื้อ 1 แถม 1',
}

export interface PromoItemView {
  variantId: string
  name: string       // "สินค้า - ตัวเลือก"
  price: number
  stock: number
  quantity: number   // จำนวนต่อชุด (ใช้กับโปรเหมา)
  imageUrl?: string | null
}

export interface PromotionView {
  id: string
  name: string
  type: PromotionType
  price: number | null
  description: string | null
  imageUrl: string | null
  items: PromoItemView[]
}

// โปรนี้ยังขายได้ไหม (ของในโปรต้องมีพอ — หมดแล้วไม่มีโปร)
export function isPromotionAvailable(p: PromotionView) {
  if (p.items.length === 0) return false
  if (p.type === 'bundle') return p.price != null && p.items.every(i => i.stock >= i.quantity)
  return p.items.reduce((sum, i) => sum + Math.max(0, i.stock), 0) >= 2
}

// ราคาโปรซื้อ 1 แถม 1 = ชิ้นที่แพงกว่า
export function b1g1Price(a: PromoItemView, b: PromoItemView) {
  return Math.max(a.price, b.price)
}
