import { NextResponse } from 'next/server'

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL!

export async function POST(req: Request) {
  const { orderId, customerName, items, total, slipUrl, address,
          hasPreorder, isSplit, shipTogether } = await req.json()
  const preNote = !hasPreorder
    ? null
    : isSplit
      ? 'มีสินค้าพรีออเดอร์ปนมา — แยกส่ง 2 รอบ (คิดค่าส่ง 2 เท่า)'
      : shipTogether
        ? 'มีสินค้าพรีออเดอร์ — ลูกค้าขอให้ส่งพร้อมกันรอบเดียว'
        : 'ออเดอร์พรีออเดอร์ล้วน'
  const itemList = items.map((i: any) => `• ${i.name} x${i.quantity} — ฿${i.price * i.quantity}`).join('\n')
  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [
  {
    title: hasPreorder ? '📦 มีคำสั่งซื้อใหม่ (มีสินค้าพรีออเดอร์)' : '🛒 มีคำสั่งซื้อใหม่!',
    description: '[📋 คลิกเพื่อจัดการ Order](https://card-catalog-pi.vercel.app/admin/orders)',
    color: 0x3b82f6,
    fields: [
  { name: 'Order ID', value: `#${orderId.slice(0, 8)}`, inline: true },
  { name: 'ลูกค้า', value: customerName || 'ไม่ระบุ', inline: true },
  { name: 'รายการสินค้า', value: itemList },
  { name: 'ยอดรวม', value: `฿${total}`, inline: true },
  { name: '📦 ที่อยู่จัดส่ง', value: address || 'ไม่ระบุ' },
  ...(preNote ? [{ name: '⏳ พรีออเดอร์', value: preNote }] : []),
],
    image: slipUrl ? { url: slipUrl } : undefined,
    timestamp: new Date().toISOString()
  }
],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: '📋 จัดการ Order',
              url: 'https://card-catalog-pi.vercel.app/admin/orders'
            },
            ...(hasPreorder ? [{
              type: 2,
              style: 5,
              label: '📦 จัดการ Pre-order',
              url: 'https://card-catalog-pi.vercel.app/admin/preorders'
            }] : [])
          ]
        }
      ]
    })
  })

  return NextResponse.json({ success: true })
}