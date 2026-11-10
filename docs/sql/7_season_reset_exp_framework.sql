-- migration: season_reset_exp_framework  (รันบน DB จริงแล้วเมื่อ 2 พ.ย. 2026 — เก็บไว้อ้างอิง ห้ามรันซ้ำ)
-- ปิดซีซั่น: เก็บยอด EXP ลง season_archive → customers.exp = 0 → เปลี่ยนเหตุผล log เป็น "รีซีซั่น X → Y"
-- ใช้ครั้งแรก: select public.season_reset_exp('SS6', 'SS7');  (archive 29 คน รวม 5,950 EXP)
-- วิธีย้อนกลับอยู่ใน docs/sql/README.md

-- ตารางเก็บยอด EXP ปิดซีซั่น
create table if not exists public.season_archive (
  id           bigserial primary key,
  season       text not null,
  user_id      uuid references public.customers(id) on delete set null,
  uid          text,
  display_name text,
  exp          integer not null,
  title        text,
  season_rank  integer not null,
  archived_at  timestamptz not null default now(),
  unique (season, user_id)
);
create index if not exists season_archive_season_idx on public.season_archive (season, season_rank);
alter table public.season_archive enable row level security;
revoke all on public.season_archive from anon, authenticated;

-- ฉายาตาม EXP (ตรงกับตารางในสกิล dinomaster-scoring)
create or replace function public.exp_title(p_exp integer)
returns text language sql immutable as $$
  select case
    when p_exp >= 400 then '🦖 เจ้าแห่งเมโซโซอิก'
    when p_exp >= 350 then '🐦‍🔥 รีคอลปีศาจ'
    when p_exp >= 300 then '⚜️ รีคอลระดับเทพ'
    when p_exp >= 260 then '👑 รีคอลระดับราชา'
    when p_exp >= 240 then '🔱 รีคอลระดับตำนาน'
    when p_exp >= 165 then '⚔️ รีคอลยอดฝีมือ I'
    when p_exp >= 150 then '⚔️ รีคอลยอดฝีมือ II'
    when p_exp >= 130 then '🌿 รีคอลขั้นสูง I'
    when p_exp >= 115 then '🌿 รีคอลขั้นสูง II'
    when p_exp >= 100 then '🌿 รีคอลขั้นสูง III'
    when p_exp >= 80  then '🦴 รีคอลมากประสบการณ์ I'
    when p_exp >= 65  then '🦴 รีคอลมากประสบการณ์ II'
    when p_exp >= 50  then '🦴 รีคอลมากประสบการณ์ III'
    when p_exp >= 35  then '🐣 รีคอลฝึกหัด I'
    when p_exp >= 20  then '🐣 รีคอลฝึกหัด II'
    when p_exp >= 10  then '🐣 รีคอลฝึกหัด III'
    else '🥚 รีคอลหน้าใหม่'
  end
$$;

-- รีซีซั่น: archive → exp = 0 → แก้เหตุผลใน log  (แตะเฉพาะ customers.exp)
create or replace function public.season_reset_exp(p_closing_season text, p_new_season text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason   text;
  v_archived int;
  v_total    bigint;
  v_reset    int;
  v_logs     int;
  v_legacy   int;
begin
  if coalesce(trim(p_closing_season),'') = '' or coalesce(trim(p_new_season),'') = ''
     or p_closing_season = p_new_season then
    raise exception 'ต้องระบุซีซั่นที่ปิดและซีซั่นใหม่ และต้องไม่ซ้ำกัน';
  end if;
  if exists (select 1 from season_archive where season = p_closing_season) then
    raise exception 'ซีซั่น % ถูก archive ไปแล้ว — ห้ามรีซ้ำ', p_closing_season;
  end if;

  v_reason := 'รีซีซั่น ' || p_closing_season || ' → ' || p_new_season;

  insert into season_archive (season, user_id, uid, display_name, exp, title, season_rank)
  select p_closing_season, c.id, c.uid, c.display_name, c.exp, exp_title(c.exp),
         rank() over (order by c.exp desc)
  from customers c
  where c.exp <> 0;
  get diagnostics v_archived = row_count;

  select coalesce(sum(exp),0) into v_total from season_archive where season = p_closing_season;

  update customers set exp = 0 where exp <> 0;   -- trigger log_wallet_change เขียน log ให้
  get diagnostics v_reset = row_count;

  update wallet_transactions w
     set reason = v_reason, ref_type = 'season_reset'
   where w.currency = 'exp' and w.ref_type = 'manual'
     and w.created_at = now()                     -- now() = เวลาเริ่ม transaction นี้
     and w.user_id in (select user_id from season_archive where season = p_closing_season);
  get diagnostics v_logs = row_count;

  select count(*) into v_legacy from legacy_accounts where exp <> 0;

  if v_reset <> v_archived then
    raise exception 'จำนวนที่รีเซ็ต (%) ไม่เท่ากับที่ archive (%) — ยกเลิกทั้งหมด', v_reset, v_archived;
  end if;

  return jsonb_build_object(
    'closing_season', p_closing_season,
    'new_season', p_new_season,
    'archived_players', v_archived,
    'archived_exp_total', v_total,
    'reset_rows', v_reset,
    'log_rows_relabeled', v_logs,
    'legacy_accounts_with_exp', v_legacy
  );
end;
$$;

revoke all on function public.season_reset_exp(text, text) from public, anon, authenticated;
