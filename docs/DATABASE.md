# ฐานข้อมูล Supabase (ตรวจจาก DB จริง 16 ต.ค. 2026)

Project ref `joceifkrecfcntbjpsvn` · Postgres 17 · schema `public` · RLS เปิดทุกตาราง
**DB นี้ใช้ร่วมกับระบบอื่น** (บอท Discord + เว็บจัดทัวร์ Khosok) — แยกเป็น 2 กลุ่มด้านล่าง

> เอกสารนี้คือสรุป ไม่ใช่ source of truth — ก่อนแก้อะไรให้อ่านนิยามจริงจาก DB เสมอ:
> `select pg_get_functiondef('public.<ชื่อ>'::regproc);` และ `select * from pg_policies where tablename='<ตาราง>';`

---

## กลุ่ม A — ตารางที่เว็บร้านนี้ใช้

| ตาราง | แถว (โดยประมาณ) | หน้าที่ / คอลัมน์สำคัญ |
|---|---|---|
| `sellers` | 3 | ร้านค้า `type` ∈ `official \| admin \| vendor` (CHECK) · มี `contact_url` (ปุ่ม "ติดต่อซื้อ" ของสินค้าที่ไม่ใช่ official) · ตอนนี้: official "กลุ่ม DMT", vendor 2 ร้าน, **ไม่มี** type admin |
| `products` | 47 | สินค้า `type` ∈ `set \| single \| accessory \| gacha` · `is_available` (แสดง/ซ่อน), `is_for_sale` (โชว์ `/catalog`), `is_for_redeem` (โชว์ `/redeem`), `is_preorder` (สินค้าพรีถาวร), `in_preorder_promo` (อยู่ในโปรพรีออเดอร์ — ช่วงพรีเปิดอยู่ ของหมดก็พรีได้), `sort_order`, `seller_id`, `deleted_at` (soft delete) |
| `product_variants` | 236 | ตัวเลือกย่อย `price`, `stock`, `image_url`, `sort_order`, `redeem_points` (null = แลกแต้มไม่ได้), `deleted_at` (soft delete) |
| `set_items` | 0 | รายการการ์ดในเซ็ต — ว่าง, RLS ไม่มี policy (ใช้งานไม่ได้จาก client) แต่ `/admin` ลบแถวในนี้ตอนลบสินค้า |
| `settings` | 3 | key/value text — `shipping_fee = 40`, `preorder_mode` (`on`\|`off` สวิตช์ช่วงพรีออเดอร์ในหน้า /admin), `announcement` (JSON ประกาศหน้าร้าน `{enabled,title,body,link_text,link_url,image_url,tone}` ดู `src/lib/announcement.ts`) · (`redeem_free_shipping_threshold` ถูกอ่านแต่ **ยังไม่มีแถว** → default 40) · **ไม่มี INSERT policy** — key ใหม่ต้อง insert ด้วย SQL |
| `user_profiles` | 2 | role `admin \| vendor` (+ `seller_id` ของ vendor) — ตอนนี้ admin 2 คน vendor 0 · `id` = `auth.users.id` |
| `customers` | 146 | 1 แถวต่อผู้ใช้ที่ login (`id` = `auth.users.id`) · `points`, `exp`, `uid` (unique, จากระบบเก่า), `discord_id` (unique), `real_name`, `address_raw` (ที่อยู่แบบเก่า) |
| `shipping_addresses` | 85 | ที่อยู่หลายที่ต่อคน `is_default` |
| `orders` | 94 | `status` (CHECK `pending_payment\|paid\|shipping\|delivered\|cancelled`), `subtotal`, `shipping_fee`, `total`, `slip_url`, `tracking_number`, `stock_deducted`, `ship_together`, `preorder_status` (null ถ้าไม่แยกส่ง), `preorder_tracking_number`, `preorder_stock_deducted` |
| `order_items` | 260 | `variant_id`, `name`, `price` (snapshot), `quantity`, `is_preorder` (snapshot), `is_backorder` (สั่งตอนของหมดในช่วงพรีออเดอร์ = **ไม่ได้ตัดสต็อก**, `_apply_stock_delta` ข้ามบรรทัดนี้), `promotion_id` / `promotion_name` (snapshot) / `promo_group` (จับกลุ่มโปร 1 ชุด) — แถวหัวโปรมี `variant_id = null` |
| `promotions` | 0 | โปรหน้าร้าน `type` ∈ `bundle` (เหมา: `price` = ราคาเหมา) \| `b1g1` (ซื้อ 1 แถม 1: เลือก 2 ชิ้นคละ ชิ้นถูกฟรี) · `is_active` เปิด/ปิดเอง · RLS อ่านทุกคน เขียนเฉพาะ `is_admin()` |
| `promotion_items` | 0 | สินค้าในโปร `promotion_id` (cascade), `variant_id`, `quantity` (ใช้กับเหมา) |
| `stock_transactions` | 808 | ledger สต็อก (trigger `log_stock_change` เขียนเมื่อ `product_variants.stock` เปลี่ยน แล้ว RPC แก้ `reason` ทีหลัง) |
| `legacy_accounts` | 59 | ผู้เล่นจากระบบเก่า PK `uid` · `discord_id`, `points`, `exp`, `duels`, `champion`, `top3`, `top5`, `last_active`, `claimed_by`, `claimed_at` |
| `player_stats` | 38 | สถิติแข่งของคนที่ claim แล้ว PK `user_id` |
| `wallet_transactions` | 590 | ledger แต้ม/EXP **append-only** · `currency` ∈ `points \| exp`, `delta`, `balance_after`, `reason`, `ref_type` (`manual`, `admin_adjust`, `legacy_import`, `redemption` …) |
| `bag` | 181 | กระเป๋าของแลก · `status` ∈ `In Bag \| Shipped` · `customer_id` หรือ `legacy_uid` · `variant_id` (null ได้ = ของที่ไม่ผูกสินค้า), `points_used` (ต่อชิ้น), `qty`, `gacha_config_id`, `shipment_id` → `redeem_history.id` |
| `redeem_history` | 104 | 1 แถว = 1 รอบจัดส่งของแลก · `status` ภาษาไทย (CHECK `กำลังตรวจสอบสลิป\|กำลังเตรียมของ\|ส่งแล้ว\|สลิปไม่ถูกต้อง`) · `slip_url` = URL หรือคำว่า `ส่งฟรี` · `is_merge_order` |
| `gacha_configs` | 1 | ซองสุ่มผูกกับ variant (unique) · `rolls_per_pack` |
| `gacha_prizes` | 25 | รางวัลในซอง `label`, `image_url`, `weight` (>0), `is_jackpot`, `sort_order` |
| `gacha_rolls` | 6 | ผลการเปิดซอง (มีแถว = ซองนั้นเปิดแล้ว) |
| `profile_address_history` | 10 | ประวัติที่อยู่แบบเก่า (อ้างอิงย้อนหลังเท่านั้น) |

Foreign key ที่มีผลตอนลบ (ตรวจซ้ำ 16 ต.ค. 2026 — ฉบับก่อนเขียนผิดว่าไม่มี cascade เลย):
- `order_items.variant_id`, `bag.variant_id` → `product_variants` **ไม่มี cascade** → variant ที่เคยถูกขาย/อยู่ในกระเป๋า ลบแถวจริงไม่ได้
- `stock_transactions`, `gacha_configs`, `set_items` → `product_variants` เป็น **ON DELETE CASCADE** (ลบ variant = ledger สต็อกหายด้วย)
- `product_variants.product_id` → `products` และ `products.seller_id` → `sellers` เป็น **ON DELETE CASCADE** (ลบร้าน vendor = สินค้าของร้านหายตาม)

**ลบสินค้า = soft delete** (migration `soft_delete_products`): `products.deleted_at` / `product_variants.deleted_at` (null = ยังอยู่) — `/admin` ประทับเวลาแทนการ DELETE, ทุกหน้า (`/catalog`, `/redeem`, `/admin`, `/admin/managebag`) กรอง `deleted_at is null`, `place_order` ปฏิเสธของที่ถูกลบ · ห้ามเขียนโค้ดใหม่ที่ DELETE แถว products/product_variants · กู้คืน: `update products set deleted_at = null where id = ...`

## RPC ที่เว็บเรียก

ทุกตัวเป็น `SECURITY DEFINER` (ข้าม RLS) — การเช็คสิทธิ์อยู่ในตัวฟังก์ชัน

| RPC | เรียกจาก | เช็คสิทธิ์ | ทำอะไร |
|---|---|---|---|
| `place_order(p_shipping_address_id, p_items, p_slip_url, p_ship_together)` | `/checkout` | `auth.uid()` + ที่อยู่ต้องเป็นของตัวเอง | ล็อก variant (`FOR UPDATE`) เช็คสต็อก, ราคา/ค่าส่งจาก DB, สร้าง order + items, ตัดสต็อก, คืน `{order_id, total, has_preorder, is_split, has_backorder, …}` · ปฏิเสธของที่ `deleted_at` · ถ้า `preorder_mode = on` + ร้าน official + (`type = 'set'` หรือ `in_preorder_promo`) + สต็อกไม่พอ → แยกบรรทัด (สินค้าประเภทอื่นที่ไม่ได้ติ๊ก = ปฏิเสธแบบเดิม · `is_preorder` ไม่เกี่ยว): ส่วนที่มีของ (ตัดสต็อก) + ส่วนเกิน (`is_preorder = is_backorder = true` ไม่ตัดสต็อก) · รับรายการโปร `{promotion_id, variant_ids}` (1 โปรต่อออเดอร์, ไม่ใช้ช่วงพรี, ราคาคิดฝั่ง DB ผ่าน `_promo_lines`) · นับสต็อกสะสมต่อ variant ในออเดอร์เดียว (บรรทัดซ้ำ/โปร+ชิ้นเดี่ยว ขายเกินไม่ได้) |
| `redeem_to_bag(p_items)` | `RedeemCard` | `auth.uid()` | เช็คสต็อก/แต้ม ตัดสต็อก หักแต้ม ใส่ bag — **⚠️ ใช้ `points` ที่ client ส่งมา ดู KNOWN_ISSUES #S2** |
| `open_gacha_pack(p_bag_id)` | `/redeem` | เจ้าของ bag หรือ admin | สุ่มรางวัลผ่าน `_resolve_gacha_pack` ต่อชื่อผลไว้ท้าย `bag.item_name` |
| `bridge_bag_to_history(p_shipping_address_id, p_slip_url, p_is_merge_order)` | `/redeem` | `auth.uid()` | รวมของ In Bag ทั้งหมด (เปิดซองค้าง) ตัดสินส่งฟรี สร้าง `redeem_history` เปลี่ยน bag เป็น Shipped |
| `claim_legacy_account(p_user_id)` | `/auth/confirm` | ต้องเป็นตัวเองหรือ admin | เคลม `legacy_accounts` แบบ atomic (กัน race) ย้ายแต้ม/EXP/สถิติ/bag/history |
| `admin_adjust_wallet(p_discord_id, p_points_delta, p_exp_delta, p_reason)` | `/admin/players` | `is_admin()` | ปรับแต้ม/EXP คนที่ claim แล้ว |
| `admin_bag_add_item(p_customer_id, p_item_name, p_points_used, p_qty, p_variant_id, p_deduct_stock)` | `/admin/managebag` | `is_admin()` | เพิ่มของเข้ากระเป๋า (เลือกตัดสต็อกได้) |
| `admin_bag_update_item(p_bag_id, p_qty, p_item_name, p_points_used)` | `/admin/managebag` | `is_admin()` | แก้รายการในกระเป๋า |
| `admin_bag_remove_item(p_bag_id, p_restore_stock)` | `/admin/managebag` | `is_admin()` | ลบรายการ (เลือกคืนสต็อกได้) |
| `award_points(p_winners, p_reason)` · `finish_tournament(…)` | `/api/bot-bridge` (service role) | execute ได้เฉพาะ `service_role` | ของบอท — ดูกลุ่ม B |

ฟังก์ชันช่วย (ไม่ควรถูกเรียกตรงจาก client แต่ตอนนี้ anon/authenticated เรียกได้ → KNOWN_ISSUES #S3): `is_admin()`, `_apply_stock_delta(...)`, `_order_is_split(...)`, `_resolve_gacha_pack(...)`
ไม่มีใครใช้แล้ว: `decrement_stock(variant_id, amount)` (execute ได้เฉพาะ service_role)

## Trigger

| ตาราง | trigger | ผล |
|---|---|---|
| `orders` | `trg_sync_stock_on_order_status` (BEFORE UPDATE OF status) | เปลี่ยนเป็น `cancelled` + `stock_deducted` = คืนสต็อก (ถ้าแยกส่ง คืนเฉพาะของพร้อมส่ง) · เปิดออเดอร์ที่ยกเลิกกลับมา = ตัดสต็อกใหม่ |
| `orders` | `trg_sync_stock_on_preorder_status` (BEFORE UPDATE OF preorder_status) | แบบเดียวกันแต่เฉพาะของพรี ในออเดอร์ที่แยกส่ง |
| `product_variants` | `trg_log_stock_change` (AFTER UPDATE OF stock) | เขียน `stock_transactions` |
| `customers` | `trg_log_wallet_change` (AFTER UPDATE OF points, exp) | เขียน `wallet_transactions` (`ref_type='manual'`) — RPC ต่าง ๆ แก้ `reason/ref_type` ของแถวล่าสุดทีหลัง |
| `customers` | `trg_fill_discord_id_on_customer_insert` (BEFORE INSERT) | เติม `discord_id` จาก `auth.users` |
| `auth.users` | `trg_sync_discord_id` (AFTER INSERT/UPDATE) | เติม `customers.discord_id` ถ้ายังว่าง |

ข้อสังเกต: แพทเทิร์น "trigger เขียน ledger แล้ว RPC ไป UPDATE แถวล่าสุดเพื่อแก้ reason" ถ้ามี 2 transaction ชนกัน อาจแก้ผิดแถวได้ (ยังไม่เคยพบปัญหา — แค่ข้อควรระวังถ้าจะเขียน RPC ใหม่)

## RLS โดยสรุป

- อ่านได้ทุกคน (`USING (true)`): `products`, `product_variants`, `sellers`, `settings`, `gacha_configs`, `player_stats`
- เจ้าของแถวอ่านได้: `customers`, `shipping_addresses`, `orders`, `order_items`, `bag`, `redeem_history`, `gacha_rolls`, `wallet_transactions`, `profile_address_history`, `user_profiles` (admin อ่านได้หมดในตารางส่วนใหญ่)
- admin เขียนได้: `products`, `product_variants`, `sellers`, `settings` (update), `bag`, `redeem_history`, `gacha_*`, `legacy_accounts`, `player_stats`, `orders` (update), `user_profiles` (insert/delete)
- vendor: `products` ของร้านตัวเอง (policy ไม่มี WITH CHECK)
- **ลูกค้าเขียนได้**: `customers` (insert/update แถวตัวเอง **ทุกคอลัมน์** → #S1), `orders` (insert + update แถวตัวเอง ทุกคอลัมน์ → #S4), `order_items` (insert), `shipping_addresses` (CRUD ของตัวเอง)
- policy เช็ค admin มี 2 แบบปนกัน: `is_admin()` กับ `EXISTS (select 1 from user_profiles where … role='admin')` — ผลเหมือนกัน

---

## กลุ่ม B — ของระบบอื่น ห้ามแก้ (เว็บนี้ไม่ได้ใช้โดยตรง)

ตาราง: `tournaments`, `tournament_players`, `tournament_matches`, `tournament_history`, `tournament_staff`, `tournament_audit`, `tournament_deletions`
ฟังก์ชัน: `t_award_exp`, `t_award_points`, `t_close`, `t_finish`, `t_reopen`, `t_reset`, `t_reverse_stats`, `t_wallet_apply`, `bot_finish_tournament`, `finish_tournament`, `award_points`, `credit_wallet`, `record_match_stats` (execute ได้เฉพาะ `service_role`)

ระบบเหล่านี้**เขียนลง `customers.points/exp`, `player_stats`, `legacy_accounts`, `wallet_transactions`** ด้วย → ถ้าจะเปลี่ยนโครงสร้างตารางกลุ่ม A ที่ใช้ร่วมกัน (เปลี่ยนชื่อ/ลบคอลัมน์, เพิ่ม NOT NULL, เพิ่ม trigger) อาจทำให้บอทหรือเว็บจัดทัวร์พัง — ต้องถามเจ้าของก่อนเสมอ
เกณฑ์แต้ม/EXP ของทัวร์นาเมนต์ (ใน comment คอลัมน์ `tournaments.reward_config`) เป็นเรื่องของระบบนั้น ไม่ใช่ของเว็บนี้

## Migrations

`list_migrations` มี 19 รายการ (`20260731032215_legacy_accounts_admin_fix` … `20261011161828_khosok_tournament_deletions`) — ตารางหลักของร้าน (sellers/products/orders/…) ถูกสร้างก่อนเริ่มเก็บ migration จึงไม่มีในรายการ
ไฟล์ SQL ที่เคยเขียนไว้ (เก็บใน Claude Project "DMT Promo Shop": `claude/preorder_feature.sql`, `claude/fix_checkout_stock_place_order.sql`, `claude/admin_bag_rpcs.sql`) ถูก apply ไปแล้วตาม migration ชื่อเดียวกัน — ใช้ DB จริงเป็นตัวอ้างอิง ไม่ใช่ไฟล์เหล่านั้น
