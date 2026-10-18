# สถาปัตยกรรม (ตรวจจากโค้ด commit `c0dae1c`, 16 ต.ค. 2026 · อัปเดตส่วนหลายร้าน 18 ต.ค. 2026)

## Stack

| ส่วน | ของที่ใช้ |
|---|---|
| Framework | Next.js `16.2.7` (App Router, Turbopack, `reactCompiler: true`), React `19.2.4`, TypeScript strict |
| CSS | Tailwind CSS v4 (`src/app/globals.css` มีแค่ `@import "tailwindcss";`) |
| DB / Auth | Supabase (`@supabase/supabase-js`) — login ด้วย Google และ Discord OAuth |
| รูปภาพ | Cloudflare R2 ผ่าน `@aws-sdk/client-s3` (`src/lib/r2.ts`) public host `pub-b5f616fbd8a1437d8fd9a58a37363569.r2.dev` (ตั้งไว้ใน `next.config.ts` → `images.remotePatterns`) |
| แจ้งเตือน | Discord webhook (ออเดอร์ใหม่ / การแลกแต้มใหม่) |
| ลากเรียง | `@dnd-kit/*` (หน้า `/admin`) |
| Hosting | Vercel — URL `card-catalog-pi.vercel.app` ถูก hardcode ใน `src/app/login/page.tsx` และ `src/app/api/notify/route.ts` |

ไม่มี: middleware, test, CI config, Supabase edge function (ตรวจแล้วว่างเปล่า), shared Supabase client (`src/lib/supabase.ts` เป็นไฟล์ว่าง)

## หน้าเว็บ (src/app)

| Route | ชนิด | ทำอะไร | ข้อมูลที่ใช้ |
|---|---|---|---|
| `/` | server | redirect ไป `/catalog` | — |
| `/catalog` | **server + ISR 3600s** | หน้าร้าน แบ่ง 3 กลุ่มตาม `sellers.type`: official ("สินค้ากลุ่ม" + สินค้าที่หา seller ไม่เจอ), admin ("สินค้าแอดมิน"), vendor ("สินค้ามือสอง") แสดงเฉพาะ `is_for_sale = true` และ `is_available = true` · **official + admin ใส่ตะกร้าได้ · vendor เป็นปุ่ม "ติดต่อซื้อ"** (`src/lib/sellers.ts` → `canCheckout`) | `sellers (id, type, name, contact_url)`, `products`, `product_variants` (มี retry 5 ครั้ง + throw ถ้าพัง) |
| `/cart` | client | ตะกร้า (เก็บใน `localStorage` key `cart`, ดู `src/lib/cart.ts`) **แยกยอด/ค่าส่งตามร้าน** (`src/lib/cartGroups.ts`) | `product_variants` + `products.sellers` ผ่าน `loadVariantStockInfo` (query เดียว) |
| `/checkout` | client | หน้าเดียว **กล่องละร้าน** (รายการ/ค่าส่ง/ยอดรวม/QR/ข้อความบัญชี/ช่องแนบสลิป) ปุ่มยืนยันกดได้เมื่อแนบสลิปครบทุกกล่อง → อัปสลิปทีละร้าน → RPC `place_order_multi` (1 ออเดอร์ต่อร้าน transaction เดียว) → ยิง `/api/notify` ด้วย order ids → ไป `/orders/{id}` (ร้านเดียว) หรือ `/orders` (หลายร้าน) | `shipping_addresses`, `product_variants` + ข้อมูลร้าน |
| `/orders` | client | ประวัติออเดอร์ของตัวเอง (แยกใบตามร้าน แสดงชื่อร้าน) | `orders` + `order_items` + `sellers(name)` |
| `/orders/[id]` | client | รายละเอียดออเดอร์ (**มีบั๊ก ดู KNOWN_ISSUES #B1**) | `orders`, `order_items`, `shipping_addresses` |
| `/profile` | client | ข้อมูลตัวเอง + จัดการที่อยู่จัดส่ง (หลายที่อยู่, มี default) | `customers`, `shipping_addresses` |
| `/redeem` | client | แลกแต้ม 3 แท็บ: แคตตาล็อก (`is_for_redeem = true`, variant ที่ `redeem_points` ไม่ null) / กระเป๋า (`bag` สถานะ In Bag, เปิดซองสุ่ม) / ประวัติจัดส่ง (`redeem_history`) | RPC `redeem_to_bag`, `open_gacha_pack`, `bridge_bag_to_history` |
| `/login` | client | ปุ่ม Google / Discord, `redirectTo` = `https://card-catalog-pi.vercel.app/auth/confirm` (hardcode) | — |
| `/auth/callback` | route | ถ้ามี `?code=` ส่งต่อไป `/auth/confirm?code=` | — |
| `/auth/confirm` | client | รอ session → upsert `customers` → RPC `claim_legacy_account` (มี `useRef` กันยิงซ้ำ) → ไป `/catalog` (timeout 5 วิ ไป `/login?error=auth`) | `customers` |
| `/admin` | client | จัดการสินค้า/variant/สต็อก/ซองสุ่ม(gacha)/**ร้านค้า (แก้ค่าส่ง QR บัญชี ชื่อ env webhook ของทุกร้าน)**, ตัวกรองตามร้าน, โหมด "จัดชั้นวาง" ลากเรียง `sort_order` | `products`, `product_variants`, `sellers`, `settings`, `set_items`, `gacha_configs`, `gacha_prizes`, `user_profiles`, `/api/invite`, `/api/upload` |
| `/admin/orders` | client | ออเดอร์ "ของพร้อมส่ง" เปลี่ยนสถานะ/ใส่เลขพัสดุ (ตัวกรอง ค้างอยู่/ทั้งหมด + **ตัวกรองร้าน** รับ `?seller=<id>` จากลิงก์ใน Discord) | `orders` + `sellers(id,name,type)`, `order_items`, `shipping_addresses` |
| `/admin/preorders` | client | ออเดอร์ที่มีของพรี **เฉพาะร้านกลุ่ม (official)** — ถ้าแยกส่ง ใช้ `preorder_status`/`preorder_tracking_number` | เหมือนข้างบน (กรองด้วย `sellers!inner.type=official`) |
| `/admin/redeems` | client | รายการแลกแต้ม เปลี่ยนสถานะ | `redeem_history`, `legacy_accounts` |
| `/admin/players` | client | ดู/แก้แต้ม EXP สถิติ ของผู้เล่นทุกคน (ทั้ง claim แล้วและยังไม่ claim) | `legacy_accounts`, `customers`, `player_stats`, RPC `admin_adjust_wallet` |
| `/admin/managebag` | client | ดู/เพิ่ม/แก้/ลบของในกระเป๋าผู้ใช้ | `bag`, `customers`, `gacha_rolls`, `product_variants`, RPC `admin_bag_*` |

การกันหน้า admin ฝั่ง client (เช็ค `user_profiles.role === 'admin'` แล้ว redirect): มีใน `/admin`, `/admin/players`, `/admin/managebag` — **ไม่มี**ใน `/admin/orders`, `/admin/preorders`, `/admin/redeems` (เช็คแค่ว่า login) ข้อมูลไม่รั่วเพราะ RLS กันไว้ แต่หน้าเปิดได้

## API routes (src/app/api — รันฝั่ง server)

| Route | auth | ทำอะไร |
|---|---|---|
| `POST /api/upload` | ต้องมี `Authorization: Bearer <access_token>` ของ user ที่ login | รับ `file` + `prefix` (ใช้จริง: `products/`, `slips/`, `redeem-slips/`) จำกัด 8MB → อัปขึ้น R2 → คืน `{ url }` |
| `POST /api/invite` | Bearer token ต้องเป็น admin | invite email ทาง Supabase Auth แล้ว insert `user_profiles` role `vendor` + `seller_id` |
| `POST /api/notify` | Bearer token ของเจ้าของออเดอร์ | รับแค่ `{ orderIds }` → อ่านออเดอร์จาก DB ครั้งเดียวด้วย service role (กรอง `customer_id` ของ token) → ยิงทีละออเดอร์เข้า Discord webhook **ของร้านนั้น** (URL มาจาก env ตามชื่อใน `sellers.webhook_env` + allowlist ใน `src/lib/sellers.ts`) · ปุ่มในการ์ด: ร้านกลุ่ม → `/admin/orders`, ร้านอื่น → `/admin/orders?seller=<id>` |
| `POST /api/redeem-notify` | **ไม่มี** | รับ `historyId` → อ่าน `redeem_history` ด้วย service role → ยิง Discord webhook การแลก |
| `POST /api/bot-bridge` | header `x-bot-secret` = `BOT_BRIDGE_SECRET` (**ถ้าไม่ตั้ง env นี้ = ไม่เช็คเลย**) | ให้บอท Discord เรียก: `get_profile`, `get_leaderboard`, `award_points`, `finish_tournament` |

Server action: `src/app/actions/revalidate.ts` → `revalidateCatalog()` = `revalidatePath('/catalog')`

## Flow สำคัญ

### สั่งซื้อ (เงินจริง โอนแล้วแนบสลิป)
1. ตะกร้าอยู่ใน localStorage (ราคาในตะกร้าเป็นแค่ตัวแสดงผล) — ไม่ได้เก็บร้านไว้ในตะกร้า ร้านมาจาก DB ทุกครั้ง
2. `/checkout` จัดกลุ่มรายการตามร้าน (1 กล่อง = 1 ร้าน = 1 ออเดอร์) เช็คสต็อกฝั่ง client (แค่ UX) → resize สลิปของแต่ละร้านเป็น JPEG 800px → `/api/upload` prefix `slips/`
3. RPC `place_order_multi(p_shipping_address_id, p_items[{variant_id, quantity, name}], p_slips{seller_id: slip_url}, p_ship_together)` — **ราคา ค่าส่ง สต็อก และการจัดกลุ่มตามร้าน คำนวณฝั่ง DB ทั้งหมด** ล็อกแถว ตัดสต็อก สร้าง `orders` (status `pending_payment`, `stock_deducted = true`, `seller_id`) + `order_items` ทีละร้านใน transaction เดียว — ร้านไหนไม่ผ่าน (สต็อกไม่พอ) **rollback ทั้งหมด ไม่มีออเดอร์ไหนถูกสร้าง**
4. ค่าส่ง = `sellers.shipping_fee` ของร้านนั้น (กลุ่ม 40 · แอฟโฟร่แมน ช็อป 50) คิดแยกต่อออเดอร์ — ถ้าออเดอร์ของร้านกลุ่มมีทั้งของพรีและของพร้อมส่ง และไม่ติ๊ก "ส่งพร้อมกัน" = แยก 2 รอบ คิดค่าส่ง ×2 และออเดอร์จะมี `preorder_status`
5. ยิง `/api/notify` ด้วย `{ orderIds }` + Bearer token → server อ่าน DB เอง → Discord webhook ของแต่ละร้าน → redirect `/orders/{id}` (ร้านเดียว) หรือ `/orders`
6. แอดมินเปลี่ยนสถานะที่ `/admin/orders` (กรองตามร้านได้) หรือ `/admin/preorders` (เฉพาะร้านกลุ่ม) — เปลี่ยนเป็น `cancelled` แล้ว trigger คืนสต็อกให้อัตโนมัติ (ดู `docs/DATABASE.md`)

### แลกแต้ม (ระบบ "กระเป๋า" ย้ายมาจาก Google Apps Script เดิม)
1. `/redeem` แท็บแคตตาล็อก → RPC `redeem_to_bag` หักแต้ม + ตัดสต็อก + ใส่ `bag` (ซองสุ่ม 1 ซอง = 1 แถว)
2. แท็บกระเป๋า: ซองสุ่ม (`bag.gacha_config_id` ไม่ null) เปิดด้วย `open_gacha_pack` ได้ทีละซอง
3. "ยืนยันจัดส่ง" = ส่ง**ของทั้งหมด**ในกระเป๋าพร้อมกัน → RPC `bridge_bag_to_history` (ซองที่ยังไม่เปิดจะถูกเปิดให้อัตโนมัติ) สร้าง `redeem_history` 1 แถว แล้วเปลี่ยน bag เป็น `Shipped`
   - ถ้าแต้มรวม ≥ เกณฑ์ส่งฟรี → `slip_url = 'ส่งฟรี'` ไม่ต้องแนบสลิป · เกณฑ์อ่านจาก `settings.redeem_free_shipping_threshold` แต่**ตอนนี้ไม่มี key นี้ใน DB** ทั้ง RPC และหน้าเว็บจึงใช้ค่า default 40
4. ยิง `/api/redeem-notify` → Discord (`DISCORD_REDEEM_WEBHOOK_URL`)

### Login + บัญชีเก่า
- ผู้เล่นเก่ามีข้อมูลใน `legacy_accounts` (นำเข้าจาก Google Sheet) ผูกด้วย `discord_id`
- login ด้วย Discord ครั้งแรก → `claim_legacy_account` ย้ายแต้ม/EXP/สถิติ/ของในกระเป๋า/ประวัติ มาเข้าบัญชีใหม่ แถว legacy ถูกตั้ง `claimed_by` แล้ว "แช่แข็ง"
- trigger `sync_discord_id` (บน `auth.users`) และ `fill_discord_id_on_customer_insert` (บน `customers`) เติม `customers.discord_id` ให้อัตโนมัติ
- login ด้วย Google จะไม่มี discord identity → เคลมของเก่าไม่ได้ (RPC คืน `claimed: false`)

### รูปภาพ
- รูปสินค้า: `src/lib/upload.ts` บีบเป็น WebP 800px → `/api/upload` prefix `products/`
- key ใน R2 = `{prefix}{timestamp}-{uuid8}.{ext}` · ส่ง `Cache-Control: immutable`
- `next/image` อนุญาตแค่ host R2 ข้างบน — ถ้าจะใช้รูปจาก host อื่นกับ `<Image>` ต้องเพิ่มใน `next.config.ts`
- รูป QR + ข้อความบัญชีของแต่ละร้านเก็บใน `sellers.qr_image_url` / `sellers.payment_note` (แก้ได้ที่หน้าต่าง "ร้านค้า" ใน `/admin`, อัปรูปขึ้น R2 prefix `qr/`) — ของร้านกลุ่มยังเป็นรูปเดิมบน host `i.postimg.cc` จึงต้องใช้ `<img>` ธรรมดา ไม่ใช่ `next/image`

## Environment variables (ตั้งใน Vercel — ค่าจริงไม่มีใน repo)

| ตัวแปร | ใช้ที่ | จำเป็น |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ทุกไฟล์ | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ทุกหน้า client + `/catalog` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | `api/upload`, `api/invite`, `api/redeem-notify`, `api/bot-bridge` | ✅ (ขาดแล้ว build พัง) |
| `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET_NAME` | `src/lib/r2.ts` | ✅ สำหรับอัปโหลด |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | `src/lib/r2.ts` (สร้าง URL คืน) | ✅ สำหรับอัปโหลด |
| `DISCORD_WEBHOOK_URL` | `api/notify` (ร้านกลุ่ม) | ✅ สำหรับแจ้งออเดอร์ (ไม่ตั้ง = ข้ามการแจ้งเตือนของร้านนั้นพร้อม log) |
| `DISCORD_WEBHOOK_URL_OAT` | `api/notify` (ร้าน "แอฟโฟร่แมน ช็อป") | ✅ ถ้าจะให้ร้านนี้มีแจ้งเตือน · ชื่อ env ต้องอยู่ใน allowlist ของ `src/lib/sellers.ts` |
| `DISCORD_REDEEM_WEBHOOK_URL` | `api/redeem-notify` | ไม่ตั้ง = ข้ามเงียบ ๆ |
| `BOT_BRIDGE_SECRET` | `api/bot-bridge` | **ต้องตั้ง** ไม่งั้น endpoint เปิดโล่ง (ไม่ทราบว่าบน Vercel ตั้งไว้หรือยัง — ต้องถามเจ้าของ) |

สคริปต์ใน `scripts/` ใช้ไฟล์ `.env.migrate` แยก (ดูหัวไฟล์ `scripts/migrate-to-r2.mjs`)

## ระบบภายนอกที่เกี่ยวข้อง (ไม่อยู่ใน repo นี้)

- **บอท Discord "Khosok"** — เรียก `/api/bot-bridge` (comment ในโค้ดอ้างถึง `Khosok/index.js` และคำสั่ง `!dmtprof`)
- **เว็บจัดทัวร์ Khosok** — เขียนตาราง `tournament*` ใน Supabase เดียวกันผ่าน service_role (จาก comment ของตาราง) และเรียก RPC `t_*`
- **ระบบเก่า Google Apps Script + Google Sheet** — ต้นฉบับของระบบแลกแต้ม/กระเป๋า (ไฟล์ `1_config.js` … `9_Bag_Feature.js`, `Code.js`, `Index.html` อยู่ใน Claude Project "DMT Promo Shop" ไม่ได้อยู่ใน repo) ยังใช้งานอยู่หรือเลิกแล้ว: **ไม่ทราบ ต้องถามเจ้าของ**
- Supabase Auth settings (redirect URL ที่อนุญาต, provider) ตั้งใน dashboard — ไม่ได้ตรวจ
