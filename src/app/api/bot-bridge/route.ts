import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ⚠️ ใช้ service_role key เท่านั้น ห้าม import ไฟล์นี้เข้า client component
// service_role bypass RLS ได้ทั้งหมด ต้องรันฝั่ง server (API route) เท่านั้น
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// กันคนนอกยิงตรงมาแจกแต้ม/ปั่น leaderboard เอง — บอทต้องแนบ header นี้มาด้วย
// ตั้งค่า BOT_BRIDGE_SECRET ใน .env ของเว็บ และ BOT_BRIDGE_SECRET เดียวกันใน
// .env ของบอท แล้วส่งเป็น header 'x-bot-secret' ทุกครั้งที่เรียก (ดูตัวอย่าง
// การแก้ไขบอทด้านล่าง)
function checkSecret(req: NextRequest): boolean {
  const expected = process.env.BOT_BRIDGE_SECRET
  if (!expected) return true // ยังไม่ตั้งค่า secret เลย ไม่บล็อก (dev only เตือนไว้ด้านล่าง)
  return req.headers.get('x-bot-secret') === expected
}

export async function POST(req: NextRequest) {
  if (!checkSecret(req)) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'invalid json body' }, { status: 400 })
  }

  const { action } = body

  try {
    switch (action) {
      case 'get_profile':
        return await handleGetProfile(body)
      case 'get_leaderboard':
        return await handleGetLeaderboard()
      case 'award_points':
        return await handleAwardPoints(body)
      case 'finish_tournament':
        return await handleFinishTournament(body)
      default:
        return NextResponse.json({ success: false, error: `unknown action: ${action}` }, { status: 400 })
    }
  } catch (err: any) {
    console.error('bot-bridge error:', action, err)
    return NextResponse.json({ success: false, error: err.message || 'internal error' }, { status: 500 })
  }
}

// ----------------------------------------------------------------------------
// get_profile: มิเรอร์ field เดิมที่บอทอ่านตรงๆ จาก data.xxx (ดู !dmtprof ใน
// Khosok/index.js) — เช็คทั้ง user_profiles (claim แล้ว) และ legacy_accounts
// (ยังไม่ claim) เพื่อให้คนที่ยังไม่เคย login เว็บก็ยังใช้ !dmtprof ได้
// ----------------------------------------------------------------------------
async function handleGetProfile(body: any) {
  const { discordId } = body
  if (!discordId) {
    return NextResponse.json({ success: false, error: 'missing discordId' }, { status: 400 })
  }

  const { data: profile } = await supabaseAdmin
    .from('customers')
    .select('id, uid, real_name, points, exp, discord_id')
    .eq('discord_id', discordId)
    .maybeSingle()

  if (profile) {
    const { data: stats } = await supabaseAdmin
      .from('player_stats')
      .select('duels, champion, top3, top5, last_active')
      .eq('user_id', profile.id)
      .maybeSingle()

    return NextResponse.json({
      found: true,
      uid: profile.uid,
      realName: profile.real_name,
      points: profile.points,
      exp: profile.exp,
      duels: stats?.duels ?? 0,
      champion: stats?.champion ?? 0,
      top3: stats?.top3 ?? 0,
      top5: stats?.top5 ?? 0,
      lastActive: stats?.last_active ?? ''
    })
  }

  const { data: legacy } = await supabaseAdmin
    .from('legacy_accounts')
    .select('uid, real_name, points, exp, duels, champion, top3, top5, last_active')
    .eq('discord_id', discordId)
    .maybeSingle()

  if (legacy) {
    return NextResponse.json({
      found: true,
      uid: legacy.uid,
      realName: legacy.real_name,
      points: legacy.points,
      exp: legacy.exp,
      duels: legacy.duels,
      champion: legacy.champion,
      top3: legacy.top3,
      top5: legacy.top5,
      lastActive: legacy.last_active ?? ''
    })
  }

  return NextResponse.json({ found: false })
}

// ----------------------------------------------------------------------------
// get_leaderboard: มิเรอร์ res.data.data ที่บอทอ่าน (array ของ {discordId, exp})
// รวมทั้งคน claim แล้วและยังไม่ claim เรียง exp มาก->น้อย เอา 20 อันดับแรก
// ----------------------------------------------------------------------------
async function handleGetLeaderboard() {
  const [{ data: claimed }, { data: legacy }] = await Promise.all([
    supabaseAdmin.from('customers').select('discord_id, exp').gt('exp', 0).not('discord_id', 'is', null),
    supabaseAdmin.from('legacy_accounts').select('discord_id, exp').gt('exp', 0).is('claimed_by', null).not('discord_id', 'is', null)
  ])

  const all = [
    ...(claimed ?? []).map(p => ({ discordId: p.discord_id, exp: p.exp })),
    ...(legacy ?? []).map(p => ({ discordId: p.discord_id, exp: p.exp }))
  ]
    .sort((a, b) => b.exp - a.exp)
    .slice(0, 20)

  return NextResponse.json({ data: all })
}

// ----------------------------------------------------------------------------
// award_points: {winners: [{discordId, points, name}]} — name คือชื่อทัวร์นาเมนต์
// เอาไว้ใส่ใน reason ให้ตรงกับที่โชว์ตอนแจก
// ----------------------------------------------------------------------------
async function handleAwardPoints(body: any) {
  const { winners } = body
  if (!Array.isArray(winners) || winners.length === 0) {
    return NextResponse.json({ success: false, error: 'winners ต้องเป็น array และมีอย่างน้อย 1 คน' }, { status: 400 })
  }

  const reason = winners[0]?.name ? `แจกแต้มจากทัวร์นาเมนต์ ${winners[0].name}` : 'แจกแต้มจากทัวร์นาเมนต์'

  const { error } = await supabaseAdmin.rpc('award_points', {
    p_winners: winners.map((w: any) => ({ discordId: w.discordId, points: w.points })),
    p_reason: reason
  })

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, count: winners.length })
}

// ----------------------------------------------------------------------------
// finish_tournament: ส่งตรงเข้า RPC finish_tournament ที่ทำ EXP ขั้นบันได
// 60/40/30/10 และอัปเดตสถิติให้แล้ว
// ----------------------------------------------------------------------------
async function handleFinishTournament(body: any) {
  const { tournamentName, participantsList, matchHistory, playerStats } = body

  if (!tournamentName || !Array.isArray(playerStats)) {
    return NextResponse.json({ success: false, error: 'ข้อมูลไม่ครบ (tournamentName, playerStats)' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.rpc('finish_tournament', {
    p_tournament_name: tournamentName,
    p_participants_list: participantsList ?? '',
    p_match_history: matchHistory ?? '',
    p_player_stats: playerStats
  })

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, tournamentId: data })
}
