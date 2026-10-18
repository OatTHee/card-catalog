# SQL ของงาน feature/shop-updates + feature/multi-seller (18 ต.ค. 2026)

ไฟล์ในนี้ **รันบน DB จริงไปแล้ว** (ชื่อเดียวกันใน `list_migrations`) เก็บไว้อ้างอิง/ย้อนกลับเท่านั้น — **ห้ามรันซ้ำ**
DB จริงคือ source of truth เสมอ (`select pg_get_functiondef('public.place_order'::regproc);`)

| ลำดับ | migration | ข้อ |
|---|---|---|
| 1 | `soft_delete_products` | ข้อ 3 ลบสินค้าแบบ soft delete |
| 2 | `preorder_mode_backorder` | ข้อ 1 ช่วงพรีออเดอร์ตอนของหมด |
| 3 | `announcement_setting` | ข้อ 2 ประกาศหน้าร้าน |
| 4 | `promotions` | ข้อ 4 โปรเหมา / ซื้อ 1 แถม 1 |
| 5 | `preorder_rule_by_type` | แก้กติกาช่วงพรี: พรีได้เฉพาะเซ็ต + สินค้าที่ติ๊ก `in_preorder_promo` |
| 6 | `multi_seller` + `multi_seller_rpc` (รัน 18 ต.ค. 2026 แยกเป็น 2 migration: ส่วนโครงสร้าง/ข้อมูล และส่วน RPC) | ระบบหลายร้าน: คอลัมน์ค่าส่ง/QR/บัญชี/ชื่อ env webhook ใน `sellers`, `orders.seller_id`, trigger ซิงก์ค่าส่ง, `_item_seller`/`_order_sellers`/`_place_order_one`/`place_order_multi` |

## ย้อนกลับ (ต้องย้อนจากตัวล่าสุดขึ้นไป: 6 → 5 → 4 → 3 → 2 → 1 และต้องขออนุมัติเจ้าของก่อนตามกฎ CLAUDE.md ข้อ 3)

**6 multi_seller**
> ⚠️ ย้อนได้สะอาดเฉพาะ **ก่อน** ร้านใหม่เริ่มมีออเดอร์ — ถ้ามีออเดอร์ของร้านใหม่แล้ว การ drop `orders.seller_id` จะทำให้ข้อมูลว่าออเดอร์ไหนของร้านไหนหายไป (ให้หยุดแค่ขั้น 1-3)
1. ```sql
   drop trigger if exists trg_sync_shipping_fee_setting on public.sellers;
   drop function if exists public.sync_shipping_fee_setting();
   drop function if exists public.place_order_multi(uuid, jsonb, jsonb, boolean);
   ```
2. รัน `rollback/place_order_4_after_preorder_rule.sql` (คืน `place_order` ตัวที่อ่านค่าส่งจาก `settings`)
3. ```sql
   drop function if exists public._place_order_one(uuid, uuid, uuid, jsonb, text, boolean);
   drop function if exists public._order_sellers(jsonb);
   drop function if exists public._item_seller(jsonb);
   ```
4. ```sql
   delete from public.sellers where name = 'แอฟโฟร่แมน ช็อป';   -- ได้เฉพาะตอนยังไม่มีสินค้า/ออเดอร์
   alter table public.orders drop column if exists seller_id;
   alter table public.sellers
     drop column if exists shipping_fee, drop column if exists qr_image_url,
     drop column if exists payment_note, drop column if exists webhook_env;
   ```

**5 preorder_rule_by_type**
1. รัน `rollback/place_order_3_after_promotions.sql`
2. ```sql
   alter table public.products drop column in_preorder_promo;
   ```

**4 promotions**
1. รัน `rollback/place_order_2_after_preorder_mode.sql`
2. ```sql
   drop function public._promo_lines(uuid, jsonb);
   alter table public.order_items drop column promo_group, drop column promotion_name, drop column promotion_id;
   drop table public.promotion_items; drop table public.promotions;
   ```
   (แถวหัวโปรในออเดอร์เก่ายังอยู่ได้ เพราะชื่อ/ราคาเป็น snapshot)

**3 announcement_setting**
```sql
delete from public.settings where key = 'announcement';
```

**2 preorder_mode_backorder**
1. รัน `rollback/apply_stock_delta_0_original.sql` และ `rollback/place_order_1_after_soft_delete.sql`
2. ถ้ามีออเดอร์ `is_backorder = true` แล้ว ต้องตัดสินใจเรื่องออเดอร์พวกนั้นก่อน จากนั้น
   ```sql
   alter table public.order_items drop column is_backorder;
   delete from public.settings where key = 'preorder_mode';
   ```

**1 soft_delete_products**
1. รัน `rollback/place_order_0_original.sql`
2. ```sql
   alter table public.products drop column deleted_at;
   alter table public.product_variants drop column deleted_at;
   ```
   (สินค้าที่ถูกลบไปแล้วจะกลับมาแสดง — ถ้าไม่ต้องการ ให้ตั้ง `is_available = false` ก่อน drop)
