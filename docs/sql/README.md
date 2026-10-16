# SQL ของงาน feature/shop-updates (16 ต.ค. 2026)

ไฟล์ในนี้ **รันบน DB จริงไปแล้ว** (ชื่อเดียวกันใน `list_migrations`) เก็บไว้อ้างอิง/ย้อนกลับเท่านั้น — **ห้ามรันซ้ำ**
DB จริงคือ source of truth เสมอ (`select pg_get_functiondef('public.place_order'::regproc);`)

| ลำดับ | migration | ข้อ |
|---|---|---|
| 1 | `soft_delete_products` | ข้อ 3 ลบสินค้าแบบ soft delete |
| 2 | `preorder_mode_backorder` | ข้อ 1 ช่วงพรีออเดอร์ตอนของหมด |
| 3 | `announcement_setting` | ข้อ 2 ประกาศหน้าร้าน |
| 4 | `promotions` | ข้อ 4 โปรเหมา / ซื้อ 1 แถม 1 |

## ย้อนกลับ (ต้องย้อนจากตัวล่าสุดขึ้นไป: 4 → 3 → 2 → 1 และต้องขออนุมัติเจ้าของก่อนตามกฎ CLAUDE.md ข้อ 3)

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
