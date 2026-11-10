-- migration: admin_season_reset  (ปุ่มรีซีซั่น EXP ในหน้า /admin/players)
-- ⚠️ รันบน DB จริง ต้องได้รับอนุมัติจากเจ้าของก่อน (CLAUDE.md กฎข้อ 3) · วิธีย้อนกลับอยู่ใน docs/sql/README.md
-- ไม่แก้ตาราง/ฟังก์ชันเดิมเลย แค่เพิ่ม RPC 2 ตัวที่เช็ค is_admin() แล้วเปิดให้ authenticated เรียกได้
-- ตัวที่ทำงานจริงยังเป็น season_reset_exp() (migration 7) ซึ่งยังคงปิดสิทธิ์ anon/authenticated ไว้เหมือนเดิม

-- (ก) สถานะก่อนกดรี: ซีซั่นล่าสุดที่ archive ไว้ + ยอด EXP ที่จะถูกล้าง (ใช้แสดงในหน้าต่างเตือน)
create or replace function public.admin_season_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_last text;
begin
  if not is_admin() then
    raise exception 'ต้องเป็นแอดมินเท่านั้น';
  end if;

  select season into v_last
    from season_archive
   group by season
   order by max(archived_at) desc
   limit 1;

  return jsonb_build_object(
    'last_archived_season', v_last,
    'exp_players',  (select count(*) from customers where exp <> 0),
    'exp_total',    (select coalesce(sum(exp), 0) from customers where exp <> 0),
    'exp_max',      (select coalesce(max(exp), 0) from customers),
    'legacy_exp_players', (select count(*) from legacy_accounts where exp <> 0),
    'top', coalesce((
      select jsonb_agg(t order by t.exp desc)
        from (select coalesce(display_name, uid) as name, exp
                from customers where exp <> 0
               order by exp desc limit 3) t
    ), '[]'::jsonb)
  );
end;
$$;

-- (ข) กดรีจากหน้าเว็บ: เช็คแอดมิน → เรียก season_reset_exp() ตัวเดิม → ใส่ชื่อแอดมินที่กดลง log
create or replace function public.admin_season_reset_exp(p_closing_season text, p_new_season text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not is_admin() then
    raise exception 'ต้องเป็นแอดมินเท่านั้น';
  end if;

  v_result := season_reset_exp(trim(p_closing_season), trim(p_new_season));

  update wallet_transactions
     set created_by = auth.uid()
   where ref_type = 'season_reset'
     and currency = 'exp'
     and created_at = now()   -- เฉพาะแถวที่เพิ่งเขียนใน transaction นี้
     and created_by is null;

  return v_result;
end;
$$;

revoke all on function public.admin_season_status() from public, anon;
revoke all on function public.admin_season_reset_exp(text, text) from public, anon;
grant execute on function public.admin_season_status() to authenticated;
grant execute on function public.admin_season_reset_exp(text, text) to authenticated;
