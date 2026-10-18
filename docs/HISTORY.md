# ประวัติและเหตุผลของการออกแบบ

สรุปจาก: ชื่อ migration ใน Supabase, comment ในโค้ด, และบันทึกงานเก่าใน Claude Project "DMT Promo Shop" (`claude/*.md`, `claude/*.sql`)
ข้อมูลส่วนที่ไม่มีหลักฐานจะเขียนว่า "ไม่ทราบ"

## ไทม์ไลน์ (จาก migration + บันทึก)

| วันที่ | เรื่อง |
|---|---|
| ก่อน 31 ก.ค. 2026 | สร้างร้านพื้นฐาน (sellers/products/variants/orders/customers ฯลฯ) — ไม่มี migration บันทึกไว้ |
| 31 ก.ค. | ย้ายระบบแต้มจาก Google Sheet: `legacy_accounts`, `admin_adjust_wallet`, แก้ race condition ใน `claim_legacy_account` (เคยเกิดแต้มเครดิตซ้ำจริง → จึงมี `useRef` กันยิงซ้ำใน `/auth/confirm`) · เพิ่มระบบซองสุ่ม (gacha) |
| 2 ส.ค. | `bridge_bag_to_history` เปิดซองสุ่มที่ค้างให้อัตโนมัติก่อนจัดส่ง |
| 9 ส.ค. | RPC ให้บอทปิดทัวร์นาเมนต์ |
| 14 ส.ค. | trigger เติม `customers.discord_id` อัตโนมัติ + backfill |
| 31 ส.ค. | RPC จัดการกระเป๋าของแอดมิน (`admin_bag_*`) + หน้า `/admin/managebag` |
| 1 ก.ย. | แก้บั๊กสั่งซื้อแล้วสต็อกไม่ตัด: `decrement_stock()` เดิมเป็น SECURITY INVOKER แต่ RLS ให้ UPDATE variant ได้เฉพาะ admin → ลูกค้าเรียกแล้วอัปเดต 0 แถวเงียบ ๆ · แก้เป็น RPC `place_order` (SECURITY DEFINER, transaction เดียว) + คอลัมน์ `orders.stock_deducted` (ออเดอร์เก่าก่อนหน้านั้นเป็น false เพราะไม่เคยถูกตัดสต็อกจริง) |
| 2 ก.ย. | ฟีเจอร์พรีออเดอร์: คอลัมน์ `is_preorder`, `ship_together`, `preorder_*`, `place_order` v2, trigger คืนสต็อกเมื่อยกเลิก |
| 12 ก.ย. | แก้ `/catalog` ว่างทั้งหน้า (ด้านล่าง) + ปรับหน้า `/admin` ใหม่ (โหมดจัดชั้นวาง) + ตัวกรองหน้า order |
| 19 ก.ย. – 11 ต.ค. | ระบบทัวร์นาเมนต์ Khosok (ตาราง `tournament*`, ฟังก์ชัน `t_*`) — **เป็นของอีกระบบ** ไม่อยู่ใน repo นี้ |
| 18 ต.ค. 2026 | **ระบบหลายร้าน (multi_seller)**: เพิ่มร้าน `แอฟโฟร่แมน ช็อป` (type `admin`, ขายบนเว็บได้ ค่าส่ง 50) · ย้ายค่าส่ง/QR/เลขบัญชีจาก `settings.shipping_fee` + hardcode ใน checkout มาอยู่ที่แถว `sellers` (เก็บ `settings.shipping_fee` ไว้เป็นสำเนาผ่าน trigger เพราะระบบแลกแต้มยังอ่าน key นี้) · `orders.seller_id` + 1 ออเดอร์ต่อร้าน (`place_order_multi`) · webhook Discord แยกตามร้านโดย DB เก็บแค่ "ชื่อ env" · เหตุที่ยังเก็บ `place_order` ลายเซ็นเดิมไว้: ให้โค้ดเวอร์ชันก่อนหน้าที่ยัง deploy อยู่สั่งซื้อได้ระหว่างสลับเวอร์ชัน |
| commit ล่าสุด `c0dae1c` | เปิดร้านตามปกติ `SHOP_CLOSED = false` (ก่อนหน้านี้เคยปิดร้านชั่วคราวเพราะน้ำท่วม — เก็บระบบประกาศไว้ใช้ครั้งหน้า) |

## เรื่องที่ต้องเข้าใจก่อนแก้

### 1. ทำไม `/catalog` ถึงตั้งใจให้ build ล้ม (12 ก.ย. 2026)
- อาการเดิม: หน้า `/catalog` ว่าง ไม่มีสินค้า ทั้งที่หน้าอื่นปกติ
- ต้นเหตุ: PostgREST ตอบ 504 เป็นครั้งคราว (แค่ query `sellers`) ตอน ISR regenerate · โค้ดเดิมไม่เช็ค error → `sellers = null` → ไม่มีสินค้าไหนเข้ากลุ่ม → render หน้าว่าง แล้ว **ISR cache หน้าว่างไว้ 1 ชั่วโมง**
- แก้: เช็ค error ทั้ง 3 query แล้ว `throw` (Next.js จะเก็บ cache หน้าเดิมที่ดีไว้) + retry 5 ครั้ง backoff 1/2/4/8 วิ + ยิงพร้อมกันด้วย `Promise.all` + สินค้าที่หา seller ไม่เจอให้ไปอยู่กลุ่ม "สินค้ากลุ่ม"
- ผลข้างเคียงที่ตั้งใจ: ถ้า 504 ตอน Vercel build → build ล้ม แต่เว็บเดิมยังอยู่ → **กด Redeploy ใน Vercel ไม่ต้องแก้โค้ด**
- แก้ด่วนถ้าหน้าว่างอีก: ไป `/admin` กดสลับซ่อน/แสดงสินค้าอะไรก็ได้ (เรียก `revalidateCatalog()`) หรือ Redeploy
- **ห้ามเอา throw/retry ออก**

### 2. โหมด "จัดชั้นวาง" ใน `/admin` (12 ก.ย. 2026)
- `sort_order` คำนวณจากตำแหน่งในรายการที่แสดงบนจอ — ถ้าลากตอนกรองอยู่ สินค้าที่ถูกซ่อนจากตัวกรองจะโดนเขียนลำดับเพี้ยน จึงแยกโหมดจัดชั้นวางที่ล้างตัวกรองก่อนเสมอ
- ลากได้เฉพาะภายในกลุ่ม (official / admin / vendor / ยังไม่กำหนดร้าน) ต้องกด "บันทึกลำดับ" (ไม่บันทึกทันที) เขียนเฉพาะแถวที่เปลี่ยน ทีละชุด 10
- ตัวเลือกที่เจ้าของเลือกไว้: การ์ดมีรูปแบบหน้าลูกค้า · ตัวกรอง = แสดงอยู่/ซ่อนอยู่/ของหมด (ไม่เอากรองพรี/แลกแต้ม/ร้าน) · แก้สต็อกในหน้าต่างซ้อน · แถบบนสีเข้ม + พื้นเทาแยกหลังบ้าน · `/admin/preorders` ไม่มีตัวกรอง
- `/admin/orders` "ค้างอยู่" = status ไม่ใช่ `delivered` และไม่ใช่ `cancelled` (ต่างจาก `/admin/redeems` ที่ "ค้างอยู่" = ไม่ใช่ `ส่งแล้ว`)

### 3. พรีออเดอร์
- `products.is_preorder` → snapshot ลง `order_items.is_preorder` ตอนสั่ง
- ออเดอร์ปน (มีทั้งพรีและพร้อมส่ง):
  - ไม่ติ๊กส่งพร้อมกัน = แยก 2 รอบ ค่าส่ง ×2 → ของพร้อมส่งอยู่ `/admin/orders` (ใช้ `status`), ของพรีอยู่ `/admin/preorders` (ใช้ `preorder_status`, `preorder_tracking_number`)
  - ติ๊กส่งพร้อมกัน = ค่าส่งรอบเดียว ทั้งออเดอร์ไปอยู่ `/admin/preorders` (ใช้ `status`)
- พรีล้วน → `/admin/preorders` (ใช้ `status`)

### 4. แต้ม / EXP มี 2 แหล่ง
- ยังไม่ claim → ข้อมูลจริงอยู่ `legacy_accounts`
- claim แล้ว → `customers.points/exp` + `player_stats` (แถว legacy ถูกแช่แข็ง)
- `/admin/players` และ `/api/bot-bridge` (`get_profile`, `get_leaderboard`) จัดการเลือกแหล่งให้อัตโนมัติด้วย `discord_id`
- เกณฑ์ให้แต้ม/EXP ทัวร์นาเมนต์เป็นของระบบ Khosok ไม่ใช่ของเว็บนี้

### 5. รูปย้ายจาก Supabase Storage ไป R2
- `r2-migration.patch` + `scripts/migrate-to-r2.mjs` — ทำไปแล้ว (ตรวจ 16 ต.ค. 2026: ไม่มี URL `supabase.co` เหลือใน `products`/`product_variants`) และ `next.config.ts` เอา host supabase ออกแล้ว
- `/api/upload` ปัจจุบันเพิ่มการเช็ค login ซึ่งไม่มีใน patch → patch เป็นแค่ประวัติ ห้าม apply

## สิ่งที่ยังไม่ทราบ (ต้องถามเจ้าของ ห้ามเดา)
- Vercel: deploy อัตโนมัติจาก `main` หรือไม่, มี preview deploy ไหม, env ไหนตั้งแล้วบ้าง (โดยเฉพาะ `BOT_BRIDGE_SECRET`)
- ระบบ Google Apps Script เดิมยังเปิดใช้อยู่หรือไม่
- repo ของบอท Khosok และเว็บจัดทัวร์อยู่ที่ไหน
- seller type `admin` ยังใช้อยู่ไหม (ตอนนี้ไม่มี seller type นี้ใน DB แต่โค้ดยังรองรับ)
- งานถัดไปที่เจ้าของอยากทำ — ไม่มีบันทึก roadmap ใน repo หรือ Project
