import { NextResponse } from 'next/server'

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL!

export async function POST(req: Request) {
  const { orderId, customerName, items, total } = await req.json()

  const itemList = items.map((i: any) => `• ${i.name} x${i.quantity} — ฿${i.price * i.quantity}`).join('\n')

  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: '🛒 มีคำสั่งซื้อใหม่!',
        color: 0x3b82f6,
        fields: [
          { name: 'Order ID', value: `#${orderId.slice(0, 8)}`, inline: true },
          { name: 'ลูกค้า', value: customerName || 'ไม่ระบุ', inline: true },
          { name: 'รายการสินค้า', value: itemList },
          { name: 'ยอดรวม', value: `฿${total}`, inline: true },
        ],
        timestamp: new Date().toISOString()
      }]
    })
  })

  return NextResponse.json({ success: true })
}