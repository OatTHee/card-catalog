export interface CartItem {
  variantId: string
  productId: string
  productName: string
  variantName: string
  price: number
  quantity: number
  imageUrl?: string
}

export function getCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  const cart = localStorage.getItem('cart')
  return cart ? JSON.parse(cart) : []
}

export function saveCart(cart: CartItem[]) {
  localStorage.setItem('cart', JSON.stringify(cart))
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