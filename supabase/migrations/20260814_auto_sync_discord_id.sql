-- ============================================================================
-- Auto-fill customers.discord_id สำหรับผู้ใช้ที่สมัคร/ล็อกอินด้วย Discord
-- ============================================================================
-- ปัญหา: หน้า src/app/auth/confirm/page.tsx ทำ upsert เข้า customers โดยไม่เคย
-- ส่งฟิลด์ discord_id เลย ทำให้ discord_id ถูกเติมเฉพาะคนที่มีบัญชีเก่าใน
-- legacy_accounts (ผ่าน RPC claim_legacy_account) เท่านั้น
-- ผู้ใช้ใหม่ที่ไม่มีบัญชีเก่าจะได้ discord_id = null ทุกราย
-- ผลกระทบ: /api/bot-bridge ค้นหาผู้ใช้ด้วย discord_id ทำให้บอท Discord
-- มองไม่เห็นผู้ใช้กลุ่มนี้ (พบตกหล่น 10 ราย ณ 2026-08-14)
--
-- ทางแก้: ย้ายการเติม discord_id มาไว้ฝั่ง DB เพื่อไม่ให้ client แก้ค่าเองได้
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) เติม discord_id เมื่อ auth.users ถูก insert หรือ update (ทุกครั้งที่ล็อกอิน)
-- ---------------------------------------------------------------------------
create or replace function public.sync_discord_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discord_id text;
begin
  -- เฉพาะการล็อกอินด้วย discord เท่านั้น
  if coalesce(new.raw_app_meta_data->>'provider', '') <> 'discord'
     and not (new.raw_app_meta_data->'providers' ? 'discord') then
    return new;
  end if;

  v_discord_id := new.raw_user_meta_data->>'provider_id';
  if v_discord_id is null or v_discord_id = '' then
    return new;
  end if;

  -- discord_id เป็น unique — ห้ามแย่ง id ที่เป็นของ customer รายอื่นอยู่แล้ว
  if exists (select 1 from public.customers c
             where c.discord_id = v_discord_id and c.id <> new.id) then
    return new;
  end if;

  -- เติมเฉพาะตอนที่ยังว่าง ห้ามทับค่าที่ได้จากการเคลมบัญชีเก่า
  update public.customers
     set discord_id = v_discord_id
   where id = new.id
     and discord_id is null;

  return new;
end;
$$;

-- แถวใน customers ถูกสร้างโดย client ประมาณ 1 วินาทีหลัง auth.users
-- ถ้าดักแค่ INSERT ตัว trigger จะยังหาแถวไม่เจอ จึงต้องดัก UPDATE ด้วย
-- (last_sign_in_at เปลี่ยนทุกครั้งที่ล็อกอิน จึงครอบคลุมผู้ใช้เดิมที่ตกหล่นด้วย)
drop trigger if exists trg_sync_discord_id on auth.users;
create trigger trg_sync_discord_id
after insert or update on auth.users
for each row execute function public.sync_discord_id();

-- ---------------------------------------------------------------------------
-- 2) กันพลาด: ถ้าแถว customers ถูก insert หลัง trigger ข้อ 1 ทำงานไปแล้ว
--    ให้ดึง discord_id จาก auth.users มาเติมตั้งแต่ตอน insert
-- ---------------------------------------------------------------------------
create or replace function public.fill_discord_id_on_customer_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discord_id text;
begin
  if new.discord_id is not null then
    return new;
  end if;

  select u.raw_user_meta_data->>'provider_id'
    into v_discord_id
    from auth.users u
   where u.id = new.id
     and (coalesce(u.raw_app_meta_data->>'provider','') = 'discord'
          or u.raw_app_meta_data->'providers' ? 'discord');

  if v_discord_id is null or v_discord_id = '' then
    return new;
  end if;

  if exists (select 1 from public.customers c
             where c.discord_id = v_discord_id and c.id <> new.id) then
    return new;
  end if;

  new.discord_id := v_discord_id;
  return new;
end;
$$;

drop trigger if exists trg_fill_discord_id_on_customer_insert on public.customers;
create trigger trg_fill_discord_id_on_customer_insert
before insert on public.customers
for each row execute function public.fill_discord_id_on_customer_insert();

-- ---------------------------------------------------------------------------
-- 3) Backfill ผู้ใช้เดิมที่สมัครก่อนมี trigger (idempotent รันซ้ำได้)
-- ---------------------------------------------------------------------------
update public.customers c
   set discord_id = u.raw_user_meta_data->>'provider_id'
  from auth.users u
 where u.id = c.id
   and c.discord_id is null
   and (coalesce(u.raw_app_meta_data->>'provider','') = 'discord'
        or u.raw_app_meta_data->'providers' ? 'discord')
   and nullif(u.raw_user_meta_data->>'provider_id','') is not null
   and not exists (
     select 1 from public.customers c2
      where c2.discord_id = u.raw_user_meta_data->>'provider_id'
        and c2.id <> c.id
   );
