export interface CartItem {
  variantId: string
  productId: string
  productName: string
  variantName: string
  price: number
  quantity: number
  imageUrl?: string
  // บรรทัดโปรโมชัน: variantId = `promo:<promotionId>` (1 โปรต่อตะกร้า จำนวนล็อกไว้ 1)
  // ราคาในบรรทัดนี้แค่แสดงผล place_order คำนวณใหม่ฝั่ง DB
  promotionId?: string
  promoVariantIds?: string[] // ซื้อ 1 แถม 1 = 2 ชิ้นที่เลือก · เหมา = ทุกชิ้นในโปร (ใช้เช็คสต็อกฝั่งหน้าเว็บ)
}

export function isPromoLine(item: CartItem) {
  return Boolean(item.promotionId)
}

// ใส่โปรลงตะกร้า — ถ้ามีโปรเดียวกันอยู่แล้วจะแทนที่ (ไม่บวกจำนวน)
export function addPromoToCart(item: CartItem) {
  const cart = getCart().filter(i => i.variantId !== item.variantId)
  cart.push({ ...item, quantity: 1 })
  saveCart(cart)
}

export function getCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  const cart = localStorage.getItem('cart')
  return cart ? JSON.parse(cart) : []
}

export function saveCart(cart: CartItem[]) {
  localStorage.setItem('cart', JSON.stringify(cart))
  window.dispatchEvent(new Event('cart-updated'))
}

export function addToCart(item: CartItem) {
  const cart = getCart()
  const existing = cart.find(i => i.variantId === item.variantId)
  if (existing) {
    existing.quantity += item.quantity
  } else {
    cart.push(item)
  }
  saveCart(cart)
}

export function removeFromCart(variantId: string) {
  const cart = getCart().filter(i => i.variantId !== variantId)
  saveCart(cart)
}

export function updateQuantity(variantId: string, quantity: number) {
  const cart = getCart()
  const item = cart.find(i => i.variantId === variantId)
  if (item) {
    item.quantity = quantity
    if (item.quantity <= 0) return removeFromCart(variantId)
  }
  saveCart(cart)
}

export function clearCart() {
  localStorage.removeItem('cart')
}

export function getCartCount(): number {
  return getCart().reduce((sum, i) => sum + i.quantity, 0)
}