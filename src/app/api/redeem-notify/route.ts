import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// service_role: อ่านข้อมูล history/customer ได้โดยไม่ติด RLS (รันฝั่ง server เท่านั้น)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// พอร์ตจาก sendDiscordNotification ใน 6_Webhook.js
// ยิงหลัง bridge_bag_to_history สำเร็จ (ตอนผู้ใช้ยืนยันจัดส่ง)
export async function POST(req: NextRequest) {
  try {
    const { historyId } = await req.json()
    if (!historyId) {
      return NextResponse.json({ success: false, error: 'missing historyId' }, { status: 400 })
    }

    const webhookUrl = process.env.DISCORD_REDEEM_WEBHOOK_URL
    if (!webhookUrl) {
      // ไม่ตั้งค่า webhook = ไม่ยิง แต่ไม่ถือว่า error (เผื่อ dev)
      return NextResponse.json({ success: true, skipped: 'no webhook configured' })
    }

    // ดึงข้อมูลรอบจัดส่งที่เพิ่งสร้าง + ชื่อ discord ของผู้แลก
    const { data: history } = await supabaseAdmin
      .from('redeem_history')
      .select('item_name, points_used, shipping_address, slip_url, is_merge_order, customer_id, legacy_uid')
      .eq('id', historyId)
      .maybeSingle()

    if (!history) {
      return NextResponse.json({ success: false, error: 'history not found' }, { status: 404 })
    }

    let discordName = 'ไม่ทราบชื่อ'
    if (history.customer_id) {
      const { data: cust } = await supabaseAdmin
        .from('customers')
        .select('display_name, real_name')
        .eq('id', history.customer_id)
        .maybeSingle()
      discordName = cust?.display_name || cust?.real_name || discordName
    }

    const isMerge = history.is_merge_order
    const mergeText = isMerge ? '\n\n**📦 ฝากส่งรวมกับออเดอร์อื่น**' : ''

    const embed: any = {
      color: isMerge ? 16753920 : 3447003, // ส้มถ้าฝากส่งรวม / ฟ้าปกติ
      description:
        '**- แลกรับ:**\n' + history.item_name + '\n\n' +
        '**- ผู้แลก (ชื่อ discord):** ' + discordName + '\n\n' +
        '**- แต้มรวมที่ใช้:** ' + Number(history.points_used).toLocaleString() + ' แต้ม\n\n' +
        '**- ข้อมูลจัดส่ง:**\n' + (history.shipping_address || '-') + mergeText
    }

    // สลิป: ถ้ามีลิงก์ (ไม่ใช่ "ส่งฟรี") แนบเป็นรูปใน embed
    if (history.slip_url && history.slip_url !== 'ส่งฟรี') {
      embed.image = { url: history.slip_url }
    } else if (history.slip_url === 'ส่งฟรี') {
      embed.description += '\n\n**- ค่าจัดส่ง:** 🎉 ส่งฟรี'
    }

    const payload = {
      content: '**หัวข้อ : มีรายการแลกแต้มเข้ามาใหม่**\n========================',
      embeds: [embed]
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      return NextResponse.json({ success: false, error: `discord returned ${res.status}` }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('redeem-notify error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
