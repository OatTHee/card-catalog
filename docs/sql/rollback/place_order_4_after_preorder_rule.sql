-- place_order หลัง migration preorder_rule_by_type (ใช้ย้อน migration multi_seller)
CREATE OR REPLACE FUNCTION public.place_order(p_shipping_address_id uuid, p_items jsonb, p_slip_url text DEFAULT NULL::text, p_ship_together boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id       uuid := auth.uid();
  v_item          jsonb;
  v_variant_id    uuid;
  v_qty           integer;
  v_stock         integer;
  v_price         numeric;
  v_db_name       text;
  v_is_pre        boolean;
  v_deleted       boolean;
  v_seller_type   text;
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

  select coalesce(nullif(value, '')::numeric, 40) into v_base_fee
  from settings where key = 'shipping_fee';
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
        select pv.stock, pv.name, (pv.deleted_at is not null or p.deleted_at is not null)
        into v_stock, v_db_name, v_deleted
        from product_variants pv
        left join products p on p.id = pv.product_id
        where pv.id = v_line.variant_id
        for update of pv;

        if v_deleted then
          raise exception 'โปร "%" มีสินค้าที่ถูกนำออกจากร้านแล้ว', v_promo.name;
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
           (pv.deleted_at is not null or p.deleted_at is not null), s.type,
           p.type, coalesce(p.in_preorder_promo, false)
    into v_stock, v_price, v_db_name, v_is_pre, v_deleted, v_seller_type,
         v_product_type, v_in_promo
    from product_variants pv
    left join products p on p.id = pv.product_id
    left join sellers s on s.id = p.seller_id
    where pv.id = v_variant_id
    for update of pv;

    if not found then
      raise exception 'ไม่พบสินค้า variant %', v_variant_id;
    end if;
    -- สินค้าที่แอดมินลบออกจากร้านแล้ว (soft delete) สั่งไม่ได้ แม้จะค้างอยู่ในตะกร้า
    if v_deleted then
      raise exception 'สินค้า "%" ถูกนำออกจากร้านแล้ว กรุณาลบออกจากตะกร้า', v_db_name;
    end if;

    v_avail := v_stock - coalesce((v_used->>v_variant_id::text)::integer, 0);
    -- พรีตอนของหมดได้เฉพาะ: ช่วงพรีเปิด + ร้าน official + (เซ็ต หรือ ติ๊กอยู่ในโปรพรีออเดอร์)
    v_can_back := v_mode_on and v_seller_type = 'official'
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
    customer_id, shipping_address_id, subtotal, shipping_fee, total,
    slip_url, status, stock_deducted,
    ship_together, preorder_status, preorder_stock_deducted
  )
  values (
    v_user_id, p_shipping_address_id, v_subtotal, v_shipping_fee,
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

    select pv.stock, pv.price, pv.name, coalesce(p.is_preorder, false), s.type,
           p.type, coalesce(p.in_preorder_promo, false)
    into v_stock, v_price, v_db_name, v_is_pre, v_seller_type,
         v_product_type, v_in_promo
    from product_variants pv
    left join products p on p.id = pv.product_id
    left join sellers s on s.id = p.seller_id
    where pv.id = v_variant_id;

    -- สต็อกตอนนี้หักบรรทัดก่อนหน้าในออเดอร์นี้ไปแล้ว จึงได้ผลเดียวกับรอบที่ 1
    -- พรีตอนของหมดได้เฉพาะ: ช่วงพรีเปิด + ร้าน official + (เซ็ต หรือ ติ๊กอยู่ในโปรพรีออเดอร์)
    v_can_back := v_mode_on and v_seller_type = 'official'
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
