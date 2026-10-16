# ปัญหาที่ตรวจพบ (16 ต.ค. 2026)

ทุกข้อด้านล่าง **ยังไม่ได้แก้** — ตรวจพบระหว่างทำเอกสารส่งต่อ แบบอ่านอย่างเดียว ไม่ได้เปลี่ยนโค้ดหรือ DB
ก่อนแก้ข้อไหน: ตรวจซ้ำกับ DB/โค้ดจริง → เสนอวิธีแก้ + วิธีย้อนกลับให้เจ้าของ → รออนุมัติ → แก้ทีละข้อ → อัปเดตสถานะในไฟล์นี้
SQL ในไฟล์นี้เป็น **ร่าง ยังไม่ได้ทดสอบ ห้ามรันจนกว่าเจ้าของอนุมัติ**

ระดับ: 🔴 ร้ายแรง (ถูกโกงแต้ม/ของ/สต็อกได้จริง) · 🟠 สูง · 🟡 กลาง · ⚪ ต่ำ/ข้อสังเกต

---

## ความปลอดภัย

### S1 🔴 ลูกค้าแก้แต้ม/EXP ของตัวเองได้โดยตรง
- หลักฐาน: policy `customer update own` บน `customers` = `USING (id = auth.uid())` ไม่มี WITH CHECK และ role `authenticated`/`anon` มีสิทธิ์ UPDATE **ทุกคอลัมน์** (ตรวจจาก `information_schema.column_privileges`) รวม `points`, `exp`, `discord_id`, `uid`
- ผล: ใครก็ได้ที่ login ยิง `supabase.from('customers').update({ points: 999999 }).eq('id', myId)` จาก console เบราว์เซอร์แล้วเอาแต้มไปแลกของได้ (trigger จะบันทึก `wallet_transactions` เป็น `ref_type='manual'` ไว้ แต่ไม่ได้กัน) · INSERT ก็เปิดทุกคอลัมน์เหมือนกัน (ตั้งแต้มตอนสร้างแถวแรกได้)
- โค้ดเว็บที่เขียน `customers` จริง: มีที่เดียว คือ upsert ใน `src/app/auth/confirm/page.tsx` (คอลัมน์ `id, display_name, email, avatar_url`) — หน้า profile อ่านอย่างเดียว ส่วนบอท/เว็บทัวร์ใช้ service_role (ไม่โดนผลกระทบจาก grant)
- แนวทาง (ร่าง): จำกัดสิทธิ์รายคอลัมน์
  ```sql
  revoke insert, update on public.customers from anon, authenticated;
  grant insert (id, display_name, email, avatar_url) on public.customers to authenticated;
  grant update (display_name, email, avatar_url) on public.customers to authenticated;
  ```
  ต้องทดสอบ: login ใหม่ (Google และ Discord) ยังสร้าง/อัปเดตแถวได้ — **upsert ของ PostgREST อาจใส่ `id` ไว้ใน `DO UPDATE SET` ด้วย ถ้าใช่ต้องเพิ่ม `id` ใน grant update หรือเปลี่ยนโค้ดหน้า confirm ไม่งั้น login พัง** ห้ามเดา ให้ทดสอบ, `claim_legacy_account` ยังทำงาน (เป็น SECURITY DEFINER ไม่ควรโดน), trigger `fill_discord_id_on_customer_insert` ยังเติม discord_id ได้ (BEFORE INSERT แก้ `NEW` — ต้องทดสอบจริงว่าไม่ติด column grant)
- ควรตรวจข้อมูลย้อนหลังด้วย: `select * from wallet_transactions where ref_type='manual' and created_by is null order by created_at;` (ตอนตรวจมีแถว manual 104 แถว เป็นเพิ่มแต้ม 5 แถว — **ยังแยกไม่ได้ว่าเป็นแอดมินแก้ใน dashboard หรือถูกโกง** ให้เจ้าของดูเอง)

### S2 🔴 `redeem_to_bag` เชื่อแต้มที่ client ส่งมา
- หลักฐาน: ในฟังก์ชัน `v_total_cost` และ `bag.points_used` คำนวณจาก `v_item->>'points'` (ค่าจาก client) ไม่ใช่ `product_variants.redeem_points` ที่ดึงมาแล้วในตัวแปร `v_redeem_points` · และ item ที่ `variant_id` เป็น null ผ่านได้โดยไม่เช็คอะไรเลย
- ผล: เรียก `supabase.rpc('redeem_to_bag', { p_items: [{ variant_id, item_name, points: 0, qty: 5 }] })` = ได้ของฟรี (ตัดสต็อกจริง) หรือใส่ของชื่ออะไรก็ได้ (`variant_id: null`) เข้ากระเป๋าแล้วกดจัดส่ง
- แนวทาง: ในรอบที่ 1 และ 2 ใช้ `v_redeem_points` จาก DB แทน `v_item->>'points'` และ `raise exception` ถ้า `variant_id` เป็น null (ฝั่งเว็บ `RedeemCard.tsx` ส่ง variant_id มาเสมออยู่แล้ว ไม่ต้องแก้หน้าเว็บ) · ชื่อ item ควรดึงจาก DB ด้วย (ตอนนี้ client ส่ง `item_name` เอง)
- ข้อมูลประกอบ: ตอนตรวจมี `bag` ที่ `points_used` ไม่ตรงกับ `redeem_points` ปัจจุบัน 16 แถว และ `variant_id` เป็น null 95 แถว — ส่วนใหญ่น่าจะมาจากการนำเข้าระบบเก่า/แอดมินเพิ่มเอง/ราคาเปลี่ยนทีหลัง **ยังไม่ได้พิสูจน์ว่ามีการโกง**

### S3 🟠 ฟังก์ชันภายใน SECURITY DEFINER ถูกเรียกจากภายนอกได้ (แม้ไม่ login)
- หลักฐาน (Supabase advisor + `has_function_privilege`): `anon` และ `authenticated` execute ได้
  - `_apply_stock_delta(p_order_id, p_only_preorder, p_all, p_sign, p_reason)` — ไม่เช็คสิทธิ์เลย → ใครก็ได้เพิ่ม/ลดสต็อกของสินค้าในออเดอร์ไหนก็ได้ (`/rest/v1/rpc/_apply_stock_delta`) ต้องรู้ order id
  - `_resolve_gacha_pack(p_bag_id, p_config_id, p_customer_id)` — ไม่เช็คสิทธิ์ → สร้าง `gacha_rolls` ให้ bag ของคนอื่นได้ (ทำให้ซองนั้นถือว่า "เปิดแล้ว")
  - `_order_is_split`, `is_admin` และฟังก์ชัน trigger (`log_*`, `sync_*`, `fill_*`) — อันตรายน้อยกว่า
- แนวทาง (ร่าง):
  ```sql
  revoke execute on function public._apply_stock_delta(uuid, boolean, boolean, integer, text) from public, anon, authenticated;
  revoke execute on function public._resolve_gacha_pack(uuid, uuid, uuid) from public, anon, authenticated;
  revoke execute on function public._order_is_split(uuid, boolean) from public, anon, authenticated;
  ```
  เหตุที่น่าจะไม่พัง: ตัวที่เรียกฟังก์ชันพวกนี้ (`sync_stock_on_*`, `open_gacha_pack`, `bridge_bag_to_history`) เป็น SECURITY DEFINER รันด้วยสิทธิ์เจ้าของฟังก์ชัน — **ต้องทดสอบจริง**: ยกเลิกออเดอร์แล้วสต็อกคืน, เปิดซองสุ่ม, ยืนยันจัดส่งที่มีซองค้าง
  ห้าม revoke `is_admin()` จาก authenticated — RLS policy หลายตัวเรียกมัน
- เพิ่มเติม (advisor WARN): 11 ฟังก์ชันไม่ได้ตั้ง `search_path` (`redeem_to_bag`, `bridge_bag_to_history`, `claim_legacy_account`, `is_admin`, …)

### S4 🟠 ลูกค้าแก้ออเดอร์ของตัวเองได้ทุกคอลัมน์ และสร้างออเดอร์เองได้โดยไม่ผ่าน `place_order`
- หลักฐาน: policy `customer update own orders` (`USING customer_id = auth.uid()` ไม่มี WITH CHECK) + สิทธิ์ UPDATE ทุกคอลัมน์ · policy `customer insert orders` และ `customer insert order_items`
- ผล: ลูกค้าเปลี่ยน `status`, `total`, `tracking_number` เองได้ · ตั้ง `stock_deducted = true` แล้วสลับ `status` ไป `cancelled` → trigger คืนสต็อกที่ไม่เคยถูกตัด (ปั๊มสต็อก) ทำซ้ำได้ · insert ออเดอร์ปลอมยอดเท่าไรก็ได้ (แอดมินยังต้องตรวจสลิปเอง)
- โค้ดเว็บไม่มีที่ไหนที่ลูกค้า update/insert `orders`/`order_items` ตรง ๆ (ใช้ RPC `place_order` ซึ่งข้าม RLS อยู่แล้ว) — ต้องยืนยันว่าระบบอื่นไม่ได้พึ่ง policy เหล่านี้ก่อนลบ
- แนวทาง: drop 3 policy นั้น (ร่าง: `drop policy "customer update own orders" on public.orders;` ฯลฯ)

### S5 🟠 `/api/bot-bridge` เปิดโล่งถ้าไม่ได้ตั้ง `BOT_BRIDGE_SECRET`
- `checkSecret()` คืน `true` ถ้าไม่มี env → ใครก็ได้ยิง `award_points` / `finish_tournament` (ใช้ service role) แจกแต้มเองได้
- **ไม่ทราบว่าบน Vercel ตั้งไว้หรือยัง** → ถามเจ้าของ ถ้าตั้งแล้วข้อนี้ปิดได้ ถ้าจะแก้โค้ดให้ fail-closed (`return false` เมื่อไม่มี env) ต้องตั้ง env ก่อน deploy ไม่งั้นบอทใช้ไม่ได้

### S6 🟡 `/api/notify` และ `/api/redeem-notify` ไม่เช็คว่าใครเรียก
- `/api/notify` เอาทุกอย่างจาก body ไปโพสต์ Discord → ใครก็ได้สแปม/ปลอมแจ้งเตือนออเดอร์ในห้องแอดมิน
- `/api/redeem-notify` รับ `historyId` อะไรก็ได้ → โพสต์ซ้ำรายการเก่าได้
- แนวทาง: ให้ client ส่ง Bearer token แบบ `/api/upload` แล้วฝั่ง server ดึงข้อมูลออเดอร์จาก DB เองด้วย id (ไม่เชื่อ body) และเช็คว่าเป็นเจ้าของออเดอร์

### S7 ⚪ อื่น ๆ
- `/api/upload` ไม่ตรวจ `prefix` และชนิดไฟล์ — user ที่ login ระบุ prefix อะไรก็ได้ (ชื่อไฟล์มี timestamp+uuid จึงทับไฟล์เดิมยาก)
- server action `revalidateCatalog()` ไม่เช็คสิทธิ์ — ใครก็สั่งล้าง cache `/catalog` ได้ (ผลแค่โหลด DB เพิ่ม)
- advisor INFO: `set_items` เปิด RLS แต่ไม่มี policy · Auth leaked password protection ปิด (เว็บใช้ OAuth อย่างเดียว ผลน้อย)
- **secret อยู่ในเอกสาร Claude Project** (ไม่ใช่ใน repo): ไฟล์ `1_config.js` ของระบบ Google Apps Script เดิมมี Discord client secret และ webhook URL แบบ plain text — ถ้าระบบเก่ายังใช้ secret นั้นอยู่ ควรพิจารณา rotate และอย่าคัดลอกค่าพวกนี้เข้า repo

---

## บั๊กการทำงาน

### B1 🟠 หน้า `/orders/[id]` เปิดไม่ได้ เด้งกลับ `/orders` ทุกครั้ง (ยืนยันแล้ว)
- สาเหตุ: `src/app/orders/[id]/page.tsx` ใช้ `params.id` แบบ synchronous — Next.js 16 ยกเลิกการเข้าถึง `params` แบบ sync แล้ว (`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` หัวข้อ Async Request APIs) ทำให้ `params.id` เป็น `undefined`
- หลักฐานจริง: Supabase edge log มี request `/rest/v1/orders?select=*&id=eq.undefined` จากมือถือลูกค้า
- ผล: หลังสั่งซื้อ checkout redirect ไป `/orders/{id}` → query ไม่เจอ → เด้งไป `/orders` (ลูกค้ายังเห็นรายการ จึงอาจไม่มีใครสังเกต)
- แนวทาง: เป็น client component → ใช้ `useParams()` จาก `next/navigation` หรือ `use(params)` กับ `params: Promise<{ id: string }>` · ทดสอบ: สั่งซื้อจริง 1 ครั้ง หรือเปิด `/orders/<id ที่มีอยู่>` ขณะ login

### B2 🟠 แอดมินไม่เห็นที่อยู่ลูกค้าในหน้า `/admin/orders` และ `/admin/preorders` (ยืนยันแล้ว)
- สาเหตุ: `shipping_addresses` มี policy อ่านได้เฉพาะเจ้าของ ไม่มี policy ให้ admin · หน้าเว็บ render ที่อยู่แบบมีเงื่อนไข (`{order.address && …}`) จึงหายเงียบ ไม่ error
- หลักฐาน: จำลอง session แอดมินใน transaction (rollback) → เห็น `shipping_addresses` 4 จาก 85 แถว (เฉพาะของตัวเอง) แต่เห็น `orders` ครบ 94
- ตอนนี้แอดมินน่าจะใช้ที่อยู่จากแจ้งเตือน Discord แทน (ต้องถามเจ้าของว่าตั้งใจหรือไม่)
- แนวทาง (ถ้าเจ้าของต้องการ): เพิ่ม policy SELECT `using (is_admin())` บน `shipping_addresses`

### B3 🟡 ลบสินค้าใน `/admin` อาจลบไม่ครบ/ลบครึ่งเดียว — ✅ แก้แล้ว (branch `feature/shop-updates`)
- แก้เป็น soft delete (`deleted_at`) ทั้งลบสินค้าและปุ่ม ✕ ลบ variant — ไม่ DELETE แถวจริงอีกแล้ว ดู `docs/DATABASE.md`
- ข้อสังเกตที่ยังค้าง: `redeem_to_bag` ไม่ได้เช็ค `deleted_at` (หน้าเว็บซ่อนแล้ว แต่ยิง RPC ตรงยังแลกได้ — แก้พร้อม S2)

เดิม:
- `handleDelete` ใน `src/app/admin/page.tsx` ลบ `set_items` → `product_variants` → `products` โดยไม่เช็ค error ของ 2 ขั้นแรก · variant ที่มีแถวใน `order_items`/`stock_transactions`/`bag` ลบไม่ได้ (FK) แต่ variant อื่นของสินค้าเดียวกันอาจถูกลบไปแล้ว แล้วจึงขึ้นข้อความ "ลบไม่ได้ เนื่องจากมี order…"

### B4 ⚪ หน้า `/admin/orders`, `/admin/preorders`, `/admin/redeems` ไม่เช็ค role ฝั่ง client
- ลูกค้าทั่วไปเปิดได้ แต่จะเห็นแค่ข้อมูลตัวเอง (RLS กัน) — เป็นเรื่องความเรียบร้อย ไม่ใช่ข้อมูลรั่ว

### B5 ⚪ ข้อสังเกตอื่น
- ~~`place_order` เช็คสต็อกทีละบรรทัด ถ้าส่ง variant เดียวกันซ้ำหลายบรรทัด (ยิง API ตรง) อาจขายเกินสต็อก~~ ✅ แก้แล้วพร้อมฟีเจอร์โปรโมชัน (migration `promotions`) — นับสต็อกสะสมต่อ variant
- `/admin/orders` และ `/admin/preorders` ยิง 2 query ต่อออเดอร์ (N+1) ตอนนี้ ~190 request ต่อการโหลด จะช้าลงเรื่อย ๆ ตามจำนวนออเดอร์
- URL `https://card-catalog-pi.vercel.app` hardcode ใน `src/app/login/page.tsx` → login บน localhost / preview deploy จะเด้งไปเว็บจริง
- `settings.redeem_free_shipping_threshold` ยังไม่มีแถว — ทำงานได้ด้วย default 40 ทั้งฝั่ง DB และหน้าเว็บ
- `src/lib/supabase.ts` ว่าง, `@supabase/ssr` และ `dotenv`/`ws` (ใช้แค่ใน scripts) อยู่ใน dependencies
- ESLint baseline 152 errors / 44 warnings: `no-explicit-any` 128, `no-img-element` 22, `alt-text` 17, `react-hooks/immutability` 13, `exhaustive-deps` 5, `no-unescaped-entities` 4, `no-html-link-for-pages` 4, `set-state-in-effect` 3 (`next build` ไม่ได้รัน eslint)

---

## ลำดับที่แนะนำ (ให้เจ้าของตัดสินใจ)
1. S1, S2, S3 — ปิดช่องโกงแต้ม/ของ/สต็อก (แก้ฝั่ง DB อย่างเดียว ไม่ต้อง deploy เว็บ)
2. S5 — ถามว่าตั้ง `BOT_BRIDGE_SECRET` แล้วหรือยัง
3. B1 — แก้ไฟล์เดียว
4. S4, B2, S6 — ต้องคุยเรื่องการใช้งานก่อน
