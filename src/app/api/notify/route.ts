import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAllowedWebhookEnv } from '@/lib/sellers'

// แจ้งเตือนออเดอร์ใหม่เข้า Discord — webhook แยกตามร้าน
//   หน้าเว็บส่งมาแค่ order ids + Bearer token · ข้อมูลทั้งหมดอ่านจาก DB ฝั่ง server (ไม่เชื่อ body)
//   URL ของ webhook ไม่ได้เก็บใน DB — DB เก็บแค่ "ชื่อ env" (sellers.webhook_env) และต้องอยู่ใน allowlist
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SITE_URL = 'https://card-catalog-pi.vercel.app'

type OrderItemRow = { name: string, quantity: number, price: number, is_preorder: boolean, is_backorder: boolean }
type SellerRel = { id: string, name: string, type: string, webhook_env: string | null }
type AddressRel = { name: string, phone: string, address: string, district: string, province: string, postal_code: string }
type CustomerRel = { display_name: string | null, real_name: string | null }
type OrderRow = {
  id: string
  seller_id: string
  total: number
  slip_url: string | null
  ship_together: boolean
  created_at: string
  sellers: SellerRel | SellerRel[] | null
  order_items: OrderItemRow[] | null
  shipping_addresses: AddressRel | AddressRel[] | null
  customers: CustomerRel | CustomerRel[] | null
}

function webhookUrlOf(envName: string | null | undefined): string | null {
  if (!isAllowedWebhookEnv(envName)) return null
  const url = process.env[envName as string]
  return url && url.startsWith('https://') ? url : null
}

function relationOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const orderIds: string[] = Array.isArray(body?.orderIds)
      ? body.orderIds.filter((id: unknown) => typeof id === 'string').slice(0, 10)
      : []
    if (orderIds.length === 0) {
      return NextResponse.json({ error: 'orderIds required' }, { status: 400 })
    }

    // อ่านครั้งเดียวจบ: ออเดอร์ + ร้าน + รายการ + ที่อยู่ + ชื่อลูกค้า
    // .eq('customer_id', user.id) = ด่านเช็คเจ้าของ (order id ของคนอื่นจะไม่ถูกคืนมาเลย)
    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select(`id, seller_id, total, slip_url, ship_together, created_at,
               sellers(id, name, type, webhook_env),
               order_items(name, quantity, price, is_preorder, is_backorder),
               shipping_addresses(name, phone, address, district, province, postal_code),
               customers(display_name, real_name)`)
      .in('id', orderIds)
      .eq('customer_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }

    let sent = 0
    const skipped: string[] = []

    for (const order of orders as unknown as OrderRow[]) {
      const seller = relationOf<SellerRel>(order.sellers)
      const webhookUrl = webhookUrlOf(seller?.webhook_env)
      if (!webhookUrl) {
        // ร้านยังไม่ได้ตั้งชื่อ env / ชื่อไม่อยู่ใน allowlist / env ไม่มีค่าบน Vercel
        console.error(`[notify] ไม่มี webhook ของร้าน ${seller?.name ?? order.seller_id} (env: ${seller?.webhook_env ?? 'ไม่ได้ตั้ง'})`)
        skipped.push(order.id)
        continue
      }

      const items = (order.order_items ?? []) as OrderItemRow[]
      const hasPreorder = items.some(i => i.is_preorder)
      const hasNormal = items.some(i => !i.is_preorder)
      const isSplit = hasPreorder && hasNormal && !order.ship_together
      const preNote = !hasPreorder
        ? null
        : isSplit
          ? 'มีสินค้าพรีออเดอร์ปนมา — แยกส่ง 2 รอบ (คิดค่าส่ง 2 เท่า)'
          : order.ship_together
            ? 'มีสินค้าพรีออเดอร์ — ลูกค้าขอให้ส่งพร้อมกันรอบเดียว'
            : 'ออเดอร์พรีออเดอร์ล้วน'

      const itemList = items.length
        ? items.map(i => `• ${i.name} x${i.quantity} — ฿${Number(i.price) * i.quantity}`).join('\n')
        : 'ไม่มีรายการ'

      const addr = relationOf<AddressRel>(order.shipping_addresses)
      const address = addr
        ? `${addr.name} | ${addr.phone}\n${addr.address} ${addr.district} ${addr.province} ${addr.postal_code}`
        : 'ไม่ระบุ'
      const customer = relationOf<CustomerRel>(order.customers)
      const customerName = customer?.display_name || customer?.real_name || 'ไม่ระบุ'

      // ร้านกลุ่มใช้หน้าเดิม ร้านอื่นลิงก์เข้าตัวกรองของร้านตัวเอง
      const isOfficial = seller?.type === 'official'
      const ordersUrl = isOfficial
        ? `${SITE_URL}/admin/orders`
        : `${SITE_URL}/admin/orders?seller=${seller?.id ?? order.seller_id}`

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [
            {
              title: hasPreorder ? '📦 มีคำสั่งซื้อใหม่ (มีสินค้าพรีออเดอร์)' : '🛒 มีคำสั่งซื้อใหม่!',
              description: `[📋 คลิกเพื่อจัดการ Order](${ordersUrl})`,
              color: 0x3b82f6,
              fields: [
                { name: 'Order ID', value: `#${String(order.id).slice(0, 8)}`, inline: true },
                { name: 'ร้าน', value: seller?.name ?? 'ไม่ระบุ', inline: true },
                { name: 'ลูกค้า', value: customerName, inline: true },
                { name: 'รายการสินค้า', value: itemList },
                { name: 'ยอดรวม', value: `฿${order.total}`, inline: true },
                { name: '📦 ที่อยู่จัดส่ง', value: address },
                ...(preNote ? [{ name: '⏳ พรีออเดอร์', value: preNote }] : []),
              ],
              image: order.slip_url ? { url: order.slip_url } : undefined,
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
                  url: ordersUrl
                },
                // หน้า /admin/preorders มีแต่ของร้านกลุ่ม
                ...(hasPreorder && isOfficial ? [{
                  type: 2,
                  style: 5,
                  label: '📦 จัดการ Pre-order',
                  url: `${SITE_URL}/admin/preorders`
                }] : [])
              ]
            }
          ]
        })
      })
      sent++
    }

    return NextResponse.json({ success: true, sent, skipped })
  } catch (e) {
    console.error('[notify] error', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
