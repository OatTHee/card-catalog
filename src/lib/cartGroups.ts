// จัดกลุ่มตะกร้าตาม "ร้าน" — ตะกร้าปนหลายร้าน = 1 ออเดอร์ต่อร้าน (RPC place_order_multi)
// ข้อมูลร้านมาจาก loadVariantStockInfo (query เดิมของสต็อก) ไม่ได้เก็บไว้ใน localStorage
// ตัวเลขในนี้ใช้แสดงผลเท่านั้น — ราคา/ค่าส่ง/สต็อกจริงคำนวณฝั่ง DB
import { CartItem, isPromoLine } from './cart'
import type { VariantStockInfo } from './preorder'
import { splitLine } from './preorder'
import { shippingFeeOf, type SellerCheckout } from './sellers'

export interface SellerGroup {
  sellerId: string | null        // null = ยังไม่รู้ร้าน (โหลดข้อมูลไม่สำเร็จ / ของค้างในตะกร้า)
  seller: SellerCheckout | null
  items: CartItem[]
  subtotal: number
  shippingFee: number           // ค่าส่งของร้านนี้ (ยังไม่คูณ 2 ตอนแยกส่งพรี)
  hasPreorder: boolean
  hasNormal: boolean
}

// variant ทั้งหมดที่ต้องรู้สต็อก/ร้าน (รวมของในโปร เพื่อให้รู้ว่าโปรเป็นของร้านไหน)
export function variantIdsOfCart(cart: CartItem[]): string[] {
  const ids = new Set<string>()
  for (const item of cart) {
    if (isPromoLine(item)) {
      for (const vid of item.promoVariantIds ?? []) ids.add(vid)
    } else {
      ids.add(item.variantId)
    }
  }
  return [...ids]
}

export function sellerOfItem(item: CartItem, stockInfo: Map<string, VariantStockInfo>): SellerCheckout | null {
  if (isPromoLine(item)) {
    for (const vid of item.promoVariantIds ?? []) {
      const seller = stockInfo.get(vid)?.seller
      if (seller) return seller
    }
    return null
  }
  return stockInfo.get(item.variantId)?.seller ?? null
}

// ร้านกลุ่ม (official) ขึ้นก่อน แล้วเรียงตามชื่อ — ลำดับเดียวกับ place_order_multi ฝั่ง DB
export function groupCartBySeller(cart: CartItem[], stockInfo: Map<string, VariantStockInfo>): SellerGroup[] {
  const groups = new Map<string, SellerGroup>()

  for (const item of cart) {
    const seller = sellerOfItem(item, stockInfo)
    const key = seller?.id ?? ''
    let group = groups.get(key)
    if (!group) {
      group = {
        sellerId: seller?.id ?? null,
        seller,
        items: [],
        subtotal: 0,
        shippingFee: shippingFeeOf(seller),
        hasPreorder: false,
        hasNormal: false,
      }
      groups.set(key, group)
    }
    group.items.push(item)
    group.subtotal += item.price * item.quantity

    if (isPromoLine(item)) {
      group.hasNormal = true
      continue
    }
    const info = stockInfo.get(item.variantId)
    const split = splitLine(info, item.quantity)
    if (info?.isPreorderProduct) {
      group.hasPreorder = true
    } else {
      if (split.ready > 0) group.hasNormal = true
      if (split.preorder > 0) group.hasPreorder = true
    }
  }

  return [...groups.values()].sort((a, b) => {
    const rank = (g: SellerGroup) => (g.seller?.type === 'official' ? 0 : 1)
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    return (a.seller?.name ?? '').localeCompare(b.seller?.name ?? '', 'th')
  })
}

// ค่าส่งที่คิดจริงของกล่องนี้ — ปนพรีกับของพร้อมส่งและไม่ติ๊ก "ส่งพร้อมกัน" = ส่ง 2 รอบ
export function groupIsSplit(group: SellerGroup, shipTogether: boolean) {
  return group.hasPreorder && group.hasNormal && !shipTogether
}

export function groupShipping(group: SellerGroup, shipTogether: boolean) {
  return groupIsSplit(group, shipTogether) ? group.shippingFee * 2 : group.shippingFee
}

export function groupTotal(group: SellerGroup, shipTogether: boolean) {
  return group.subtotal + groupShipping(group, shipTogether)
}
