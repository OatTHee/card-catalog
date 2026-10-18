-- migration: multi_seller  (ระบบหลายร้าน — ร้านที่ 2 ขายบนเว็บได้, 1 ออเดอร์ต่อร้าน)
-- ⚠️ รันบน DB จริง ต้องได้รับอนุมัติจากเจ้าของก่อน (CLAUDE.md กฎข้อ 3) · วิธีย้อนกลับอยู่ใน docs/sql/README.md

-- ========== ส่วนที่ 1: โครงสร้าง + ข้อมูล ==========

-- (ก) คอลัมน์ใหม่ของร้าน
alter table public.sellers
  add column if not exists shipping_fee numeric not null default 40,
  add column if not exists qr_image_url text,
  add column if not exists payment_note text,
  add column if not exists webhook_env text;

comment on column public.sellers.shipping_fee is 'ค่าส่งของร้านนี้ (คิดต่อ 1 ออเดอร์) — ร้าน official ถูกซิงก์ไป settings.shipping_fee ด้วย trigger';
comment on column public.sellers.qr_image_url is 'รูป QR ชำระเงินของร้าน (อัปขึ้น R2 ผ่าน /api/upload)';
comment on column public.sellers.payment_note is 'ข้อความบัญชี/TrueWallet ของร้าน (หลายบรรทัดได้)';
comment on column public.sellers.webhook_env is 'ชื่อ env ของ Discord webhook ร้านนี้ (เก็บแค่ชื่อ ห้ามเก็บ URL) — โค้ด /api/notify มี allowlist กำกับ';

-- (ข) ย้ายค่าของร้านกลุ่มมาไว้ที่แถว seller (ค่าเดิมทุกตัว)
update public.sellers set
  shipping_fee = (select coalesce(nullif(value, '')::numeric, 40) from public.settings where key = 'shipping_fee'),
  qr_image_url = 'https://i.postimg.cc/RV9Z9KJh/004999184266566-20250920-153316.jpg',
  payment_note = '🏦 กสิกร: 8450260981 (ศรัณย์)' || chr(10) || '📱 Wallet: 094-7066766 (ศรัณย์)',
  webhook_env  = 'DISCORD_WEBHOOK_URL'
where type = 'official';

-- (ค) ร้านใหม่ (type admin = ขายบนเว็บได้ แต่พรีออเดอร์ไม่ได้)
insert into public.sellers (name, type, contact_url, shipping_fee, webhook_env)
values ('แอฟโฟร่แมน ช็อป', 'admin', 'https://linktr.ee/oat35785', 50, 'DISCORD_WEBHOOK_URL_OAT');

-- (ง) orders.seller_id + backfill ออเดอร์เก่าเป็นร้านกลุ่ม
alter table public.orders add column if not exists seller_id uuid references public.sellers(id);
update public.orders set seller_id = (select id from public.sellers where type = 'official' limit 1)
 where seller_id is null;
alter table public.orders alter column seller_id set not null;
create index if not exists orders_seller_id_created_at_idx on public.orders (seller_id, created_at desc);
comment on column public.orders.seller_id is 'ร้านเจ้าของออเดอร์ — 1 ออเดอร์ = 1 ร้าน (ตะกร้าปนร้านถูกแยกเป็นหลายออเดอร์ใน place_order_multi)';

-- (จ) trigger ซิงก์ค่าส่งร้านกลุ่ม → settings.shipping_fee (ระบบแลกแต้มยังอ่าน settings เหมือนเดิม)
create or replace function public.sync_shipping_fee_setting()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.type = 'official' then
    update settings set value = new.shipping_fee::text where key = 'shipping_fee';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_sync_shipping_fee_setting on public.sellers;
create trigger trg_sync_shipping_fee_setting
after insert or update of shipping_fee, type on public.sellers
for each row execute function public.sync_shipping_fee_setting();

-- ========== ส่วนที่ 2: RPC ==========

-- (ฉ) หาร้านเจ้าของของ 1 รายการในตะกร้า (อ่านจาก DB ไม่เชื่อ client)
create or replace function public._item_seller(p_item jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sid   uuid;
  v_first uuid;
  v_line  record;
begin
  if p_item ? 'promotion_id' then
    for v_line in select * from _promo_lines((p_item->>'promotion_id')::uuid, p_item->'variant_ids') loop
      select p.seller_id into v_sid
      from product_variants pv join products p on p.id = pv.product_id
      where pv.id = v_line.variant_id;

      if v_sid is null then
        raise exception 'สินค้าในโปรโมชันไม่มีร้านเจ้าของ';
      end if;
      if v_first is null then
        v_first := v_sid;
      elsif v_first <> v_sid then
        raise exception 'โปรโมชันนี้มีสินค้าหลายร้าน สั่งซื้อไม่ได้';
      end if;
    end loop;
    if v_first is null then
      raise exception 'โปรโมชันนี้ยังไม่มีสินค้า';
    end if;
    return v_first;
  end if;

  select p.seller_id into v_sid
  from product_variants pv join products p on p.id = pv.product_id
  where pv.id = (p_item->>'variant_id')::uuid;

  if v_sid is null then
    raise exception 'ไม่พบสินค้าในตะกร้า (variant ไม่ถูกต้อง หรือสินค้าไม่มีร้านเจ้าของ)';
  end if;
  return v_sid;
end;
$function$;

-- (ช) รายชื่อร้านทั้งหมดที่อยู่ในตะกร้า
create or replace function public._order_sellers(p_items jsonb)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(distinct public._item_seller(item)), '{}'::uuid[])
  from jsonb_array_elements(p_items) item;
$function$;

-- (ซ) ไส้ของการสั่งซื้อ 1 ร้าน = 1 ออเดอร์ (ย้ายมาจาก place_order เดิม)
--     ต่างจากเดิม 2 จุด: ค่าส่งอ่านจาก sellers.shipping_fee ของร้านนั้น + ทุกรายการต้องเป็นของร้านนั้นจริง
--     ห้ามเรียกจาก client (revoke ท้ายไฟล์) — ไม่ได้เช็ค login/ที่อยู่ ผู้เรียกต้องเช็คมาก่อน
create or replace function public._place_order_one(p_user_id uuid, p_shipping_address_id uuid, p_seller_id uuid, p_items jsonb, p_slip_url text, p_ship_together boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item          jsonb;
  v_variant_id    uuid;
  v_qty           integer;
  v_stock         integer;
  v_price         numeric;
  v_db_name       text;
  v_is_pre        boolean;
  v_deleted       boolean;
  v_item_seller   uuid;
  v_shop_type     text;
  v_shop_name     text;
  v_product_type  text;
  v_in_promo      boolean;
  v_mode_on       boolean;
  v_can_back      boolean;
  v_ready         integer;
  v_back          integer;
  v_avail         integer;
  v_has_back      boolean := false;
  v_used          jsonb := '{}'::jsonb;  -- จำนวนที่ถูกจองแล้วต่อ variant ในออเดอร์นี้ (กันสั่งซ้ำบรรทัดเกินสต็อก)
  v_promo         record;
  v_line          record;
  v_promo_id      uuid;
  v_seen_promos   uuid[] := '{}';
  v_lines         integer;
  v_promo_total   numeric;
  v_group         uuid;
  v_subtotal      numeric := 0;
  v_base_fee      numeric;
  v_shipping_fee  numeric;
  v_has_pre       boolean := false;
  v_has_normal    boolean := false;
  v_is_split      boolean;
  v_ship_together boolean := coalesce(p_ship_together, false);
  v_order_id      uuid;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'ไม่มีรายการสินค้าในตะกร้า';
  end if;

  -- ค่าส่งของร้านนี้ (ไม่ใช่ค่ากลางใน settings อีกแล้ว)
  select s.type, s.name, coalesce(s.shipping_fee, 40)
  into v_shop_type, v_shop_name, v_base_fee
  from sellers s where s.id = p_seller_id;

  if v_shop_type is null then
    raise exception 'ไม่พบร้านค้านี้';
  end if;
  v_base_fee := coalesce(v_base_fee, 40);

  -- ช่วงพรีออเดอร์: ร้าน official ที่สต็อกไม่พอ และเป็นเซ็ต/อยู่ในโปรพรี สั่งได้ ส่วนที่เกินเป็นพรี (ไม่ตัดสต็อก)
  select coalesce(value = 'on', false) into v_mode_on
  from settings where key = 'preorder_mode';
  v_mode_on := coalesce(v_mode_on, false);

  -- รอบที่ 1: ล็อกแถว + เช็คสต็อกให้ครบทุกชิ้นก่อน + ดูว่าปนพรีออเดอร์ไหม
  for v_item in select * from jsonb_array_elements(p_items) loop

    -- ----- รายการโปร -----
    if v_item ? 'promotion_id' then
      v_promo_id := (v_item->>'promotion_id')::uuid;
      if v_promo_id = any(v_seen_promos) then
        raise exception 'โปรเดียวกันใส่ได้ 1 ชุดต่อออเดอร์';
      end if;
      v_seen_promos := v_seen_promos || v_promo_id;

      select * into v_promo from promotions where id = v_promo_id for share;
      if not found or not v_promo.is_active then
        raise exception 'โปรโมชันนี้ปิดไปแล้ว กรุณาลบออกจากตะกร้า';
      end if;

      v_lines := 0;
      v_promo_total := coalesce(case when v_promo.type = 'bundle' then v_promo.price end, 0);
      for v_line in select * from _promo_lines(v_promo_id, v_item->'variant_ids') loop
        v_lines := v_lines + 1;
        select pv.stock, pv.name, (pv.deleted_at is not null or p.deleted_at is not null), p.seller_id
        into v_stock, v_db_name, v_deleted, v_item_seller
        from product_variants pv
        left join products p on p.id = pv.product_id
        where pv.id = v_line.variant_id
        for update of pv;

        if v_deleted then
          raise exception 'โปร "%" มีสินค้าที่ถูกนำออกจากร้านแล้ว', v_promo.name;
        end if;
        if v_item_seller is distinct from p_seller_id then
          raise exception 'โปร "%" มีสินค้าที่ไม่ใช่ของร้าน "%"', v_promo.name, v_shop_name;
        end if;
        -- โปรไม่ใช้ช่วงพรีออเดอร์: ของต้องมีจริงเท่านั้น
        v_avail := v_stock - coalesce((v_used->>v_line.variant_id::text)::integer, 0);
        if v_avail < v_line.qty then
          raise exception 'โปร "%" ของหมดแล้ว (%)', v_promo.name, v_db_name;
        end if;
        v_used := jsonb_set(v_used, array[v_line.variant_id::text],
                    to_jsonb(coalesce((v_used->>v_line.variant_id::text)::integer, 0) + v_line.qty));
        v_promo_total := v_promo_total + v_line.price;
      end loop;

      if v_lines = 0 then
        raise exception 'โปร "%" ยังไม่มีสินค้า', v_promo.name;
      end if;

      v_has_normal := true;
      v_subtotal := v_subtotal + v_promo_total;
      continue;
    end if;

    -- ----- รายการสินค้าปกติ -----
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_qty        := coalesce((v_item->>'quantity')::integer, 1);

    if v_variant_id is null then
      raise exception 'รายการสินค้าไม่ถูกต้อง (ไม่มี variant_id)';
    end if;
    if v_qty < 1 then
      raise exception 'จำนวนต้องมากกว่า 0';
    end if;

    select pv.stock, pv.price, pv.name, coalesce(p.is_preorder, false),
           (pv.deleted_at is not null or p.deleted_at is not null), p.seller_id,
           p.type, coalesce(p.in_preorder_promo, false)
    into v_stock, v_price, v_db_name, v_is_pre, v_deleted, v_item_seller,
         v_product_type, v_in_promo
    from product_variants pv
    left join products p on p.id = pv.product_id
    where pv.id = v_variant_id
    for update of pv;

    if not found then
      raise exception 'ไม่พบสินค้า variant %', v_variant_id;
    end if;
    -- สินค้าที่แอดมินลบออกจากร้านแล้ว (soft delete) สั่งไม่ได้ แม้จะค้างอยู่ในตะกร้า
    if v_deleted then
      raise exception 'สินค้า "%" ถูกนำออกจากร้านแล้ว กรุณาลบออกจากตะกร้า', v_db_name;
    end if;
    -- กันของข้ามร้าน: ออเดอร์นี้เป็นของร้าน p_seller_id เท่านั้น
    if v_item_seller is distinct from p_seller_id then
      raise exception 'สินค้า "%" ไม่ใช่ของร้าน "%"', v_db_name, v_shop_name;
    end if;

    v_avail := v_stock - coalesce((v_used->>v_variant_id::text)::integer, 0);
    -- พรีตอนของหมดได้เฉพาะ: ช่วงพรีเปิด + ร้าน official + (เซ็ต หรือ ติ๊กอยู่ในโปรพรีออเดอร์)
    v_can_back := v_mode_on and v_shop_type = 'official'
                  and (v_product_type = 'set' or v_in_promo);
    if v_avail < v_qty and not v_can_back then
      raise exception 'สินค้า "%" เหลือ % ชิ้น ไม่พอกับที่สั่ง (%)', v_db_name, greatest(v_avail, 0), v_qty;
    end if;

    -- ส่วนที่มีของ / ส่วนที่เป็นพรีตอนของหมด
    v_ready := case when v_avail >= v_qty then v_qty else greatest(v_avail, 0) end;
    v_back  := v_qty - v_ready;
    v_used := jsonb_set(v_used, array[v_variant_id::text],
                to_jsonb(coalesce((v_used->>v_variant_id::text)::integer, 0) + v_ready));

    if v_is_pre then
      v_has_pre := true;                       -- สินค้าพรีทั้งตัว (flow เดิม)
    else
      if v_ready > 0 then v_has_normal := true; end if;
      if v_back  > 0 then v_has_pre := true; end if;
    end if;
    if v_back > 0 then v_has_back := true; end if;
    v_subtotal := v_subtotal + (v_price * v_qty);
  end loop;

  -- ปนกันและไม่ได้ติ๊กส่งพร้อม = ส่ง 2 รอบ = ค่าส่ง 2 เท่า
  v_is_split := v_has_pre and v_has_normal and not v_ship_together;
  if not (v_has_pre and v_has_normal) then
    v_ship_together := false;   -- ไม่ได้ปนกัน ธงนี้ไม่มีความหมาย
  end if;
  v_shipping_fee := case when v_is_split then v_base_fee * 2 else v_base_fee end;

  insert into orders (
    customer_id, seller_id, shipping_address_id, subtotal, shipping_fee, total,
    slip_url, status, stock_deducted,
    ship_together, preorder_status, preorder_stock_deducted
  )
  values (
    p_user_id, p_seller_id, p_shipping_address_id, v_subtotal, v_shipping_fee,
    v_subtotal + v_shipping_fee, p_slip_url, 'pending_payment', true,
    v_ship_together,
    case when v_is_split then 'pending_payment' else null end,
    v_is_split
  )
  returning id into v_order_id;

  -- รอบที่ 2: บันทึกรายการ + ตัดสต็อก (ลำดับเดียวกับรอบที่ 1)
  for v_item in select * from jsonb_array_elements(p_items) loop

    -- ----- รายการโปร: แถวหัวโปร + แถวสินค้า -----
    if v_item ? 'promotion_id' then
      v_promo_id := (v_item->>'promotion_id')::uuid;
      select * into v_promo from promotions where id = v_promo_id;
      v_group := gen_random_uuid();

      insert into order_items (order_id, variant_id, name, price, quantity, is_preorder,
                               promotion_id, promotion_name, promo_group)
      values (
        v_order_id, null,
        '🎁 ' || case when v_promo.type = 'bundle' then 'โปรเหมา: ' else 'โปรซื้อ 1 แถม 1: ' end || v_promo.name,
        case when v_promo.type = 'bundle' then v_promo.price else 0 end,
        1, false, v_promo_id, v_promo.name, v_group
      );

      for v_line in select * from _promo_lines(v_promo_id, v_item->'variant_ids') loop
        insert into order_items (order_id, variant_id, name, price, quantity, is_preorder,
                                 promotion_id, promotion_name, promo_group)
        values (v_order_id, v_line.variant_id, '└ ' || v_line.line_name, v_line.price, v_line.qty, false,
                v_promo_id, v_promo.name, v_group);

        update product_variants set stock = stock - v_line.qty where id = v_line.variant_id;

        update stock_transactions
        set reason = 'ขายผ่านหน้าร้าน (โปร ' || v_promo.name || ') order ' || left(v_order_id::text, 8)
        where id = (
          select id from stock_transactions
          where variant_id = v_line.variant_id
          order by created_at desc limit 1
        );
      end loop;
      continue;
    end if;

    -- ----- รายการสินค้าปกติ -----
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_qty        := coalesce((v_item->>'quantity')::integer, 1);

    select pv.stock, pv.price, pv.name, coalesce(p.is_preorder, false),
           p.type, coalesce(p.in_preorder_promo, false)
    into v_stock, v_price, v_db_name, v_is_pre,
         v_product_type, v_in_promo
    from product_variants pv
    left join products p on p.id = pv.product_id
    where pv.id = v_variant_id;

    -- สต็อกตอนนี้หักบรรทัดก่อนหน้าในออเดอร์นี้ไปแล้ว จึงได้ผลเดียวกับรอบที่ 1
    -- พรีตอนของหมดได้เฉพาะ: ช่วงพรีเปิด + ร้าน official + (เซ็ต หรือ ติ๊กอยู่ในโปรพรีออเดอร์)
    v_can_back := v_mode_on and v_shop_type = 'official'
                  and (v_product_type = 'set' or v_in_promo);
    if v_stock >= v_qty or not v_can_back then
      v_ready := v_qty;                        -- พฤติกรรมเดิม
    else
      v_ready := greatest(v_stock, 0);
    end if;
    v_back := v_qty - v_ready;

    -- ส่วนที่มีของ: บันทึก + ตัดสต็อกแบบเดิม
    if v_ready > 0 then
      insert into order_items (order_id, variant_id, name, price, quantity, is_preorder)
      values (
        v_order_id, v_variant_id,
        coalesce(nullif(trim(v_item->>'name'), ''), v_db_name),
        v_price, v_ready, v_is_pre
      );

      update product_variants set stock = stock - v_ready where id = v_variant_id;

      update stock_transactions
      set reason = case when v_is_pre then 'พรีออเดอร์ผ่านหน้าร้าน order ' else 'ขายผ่านหน้าร้าน order ' end
                   || left(v_order_id::text, 8)
      where id = (
        select id from stock_transactions
        where variant_id = v_variant_id
        order by created_at desc limit 1
      );
    end if;

    -- ส่วนที่เกินสต็อก (ช่วงพรีออเดอร์): เป็นพรี ไม่ตัดสต็อก
    if v_back > 0 then
      insert into order_items (order_id, variant_id, name, price, quantity, is_preorder, is_backorder)
      values (
        v_order_id, v_variant_id,
        coalesce(nullif(trim(v_item->>'name'), ''), v_db_name),
        v_price, v_back, true, true
      );
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'seller_id', p_seller_id,
    'subtotal', v_subtotal,
    'shipping_fee', v_shipping_fee,
    'total', v_subtotal + v_shipping_fee,
    'has_preorder', v_has_pre,
    'has_normal', v_has_normal,
    'is_split', v_is_split,
    'has_backorder', v_has_back
  );
end;
$function$;

-- (ฌ) place_order — คงลายเซ็น/ค่าที่คืนเดิม เพื่อให้โค้ดเว็บเวอร์ชันก่อนหน้าใช้ได้ต่อระหว่าง deploy
create or replace function public.place_order(p_shipping_address_id uuid, p_items jsonb, p_slip_url text DEFAULT NULL::text, p_ship_together boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_sellers uuid[];
begin
  if v_user_id is null then
    raise exception 'ต้อง login ก่อนถึงจะสั่งซื้อได้';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'ไม่มีรายการสินค้าในตะกร้า';
  end if;
  if p_shipping_address_id is null then
    raise exception 'กรุณาเลือกที่อยู่จัดส่ง';
  end if;
  if not exists (
    select 1 from shipping_addresses
    where id = p_shipping_address_id and customer_id = v_user_id
  ) then
    raise exception 'ไม่พบที่อยู่จัดส่งนี้ของคุณ';
  end if;

  v_sellers := _order_sellers(p_items);
  if coalesce(array_length(v_sellers, 1), 0) = 0 then
    raise exception 'ไม่มีรายการสินค้าในตะกร้า';
  end if;
  if array_length(v_sellers, 1) > 1 then
    raise exception 'ตะกร้ามีสินค้าหลายร้าน กรุณารีเฟรชหน้าเว็บแล้วสั่งซื้อใหม่';
  end if;

  return _place_order_one(v_user_id, p_shipping_address_id, v_sellers[1], p_items, p_slip_url, p_ship_together);
end;
$function$;

-- (ญ) place_order_multi — ตะกร้าหลายร้าน = 1 ออเดอร์ต่อร้าน ใน transaction เดียว
--     p_slips = { "<seller_id>": "<slip_url>" } · ร้านไหน fail = rollback ทั้งก้อน
create or replace function public.place_order_multi(p_shipping_address_id uuid, p_items jsonb, p_slips jsonb, p_ship_together boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_sellers uuid[];
  v_seller  record;
  v_group   jsonb;
  v_slip    text;
  v_res     jsonb;
  v_orders  jsonb := '[]'::jsonb;
  v_total   numeric := 0;
begin
  if v_user_id is null then
    raise exception 'ต้อง login ก่อนถึงจะสั่งซื้อได้';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'ไม่มีรายการสินค้าในตะกร้า';
  end if;
  if p_shipping_address_id is null then
    raise exception 'กรุณาเลือกที่อยู่จัดส่ง';
  end if;
  if not exists (
    select 1 from shipping_addresses
    where id = p_shipping_address_id and customer_id = v_user_id
  ) then
    raise exception 'ไม่พบที่อยู่จัดส่งนี้ของคุณ';
  end if;

  v_sellers := _order_sellers(p_items);
  if coalesce(array_length(v_sellers, 1), 0) = 0 then
    raise exception 'ไม่มีรายการสินค้าในตะกร้า';
  end if;

  -- ร้านกลุ่มก่อน แล้วเรียงตามชื่อ (ให้ลำดับออเดอร์คงที่)
  for v_seller in
    select s.id, s.name, s.type from sellers s
    where s.id = any(v_sellers)
    order by (s.type <> 'official'), s.name
  loop
    select coalesce(jsonb_agg(item), '[]'::jsonb) into v_group
    from jsonb_array_elements(p_items) item
    where _item_seller(item) = v_seller.id;

    v_slip := nullif(trim(coalesce(p_slips->>v_seller.id::text, '')), '');
    if v_slip is null then
      raise exception 'กรุณาแนบสลิปของร้าน "%"', v_seller.name;
    end if;

    v_res := _place_order_one(v_user_id, p_shipping_address_id, v_seller.id, v_group, v_slip, p_ship_together);
    v_orders := v_orders || jsonb_build_array(v_res || jsonb_build_object('seller_name', v_seller.name));
    v_total := v_total + (v_res->>'total')::numeric;
  end loop;

  return jsonb_build_object('success', true, 'orders', v_orders, 'total', v_total);
end;
$function$;

-- (ฎ) ฟังก์ชันภายใน ห้ามเรียกจาก client (บทเรียน KNOWN_ISSUES S3)
revoke execute on function public._place_order_one(uuid, uuid, uuid, jsonb, text, boolean) from public, anon, authenticated;
revoke execute on function public._item_seller(jsonb) from public, anon, authenticated;
revoke execute on function public._order_sellers(jsonb) from public, anon, authenticated;
