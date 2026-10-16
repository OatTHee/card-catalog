# CLAUDE.md — คู่มือสำหรับ Claude Code (อ่านก่อนแตะอะไรทั้งนั้น)

เว็บร้านขายการ์ด Dinomaster ("DMT Shop") + ระบบแลกแต้ม — Next.js 16 (App Router) บน Vercel, ข้อมูลอยู่ Supabase, รูปอยู่ Cloudflare R2
เว็บจริง: `https://card-catalog-pi.vercel.app` · Supabase project ref: `joceifkrecfcntbjpsvn` (region ap-southeast-1)

เอกสารละเอียดอยู่ใน `docs/`:
- `docs/ARCHITECTURE.md` — หน้า/route ทั้งหมด, flow การสั่งซื้อ/แลกแต้ม, env vars, ระบบภายนอก
- `docs/DATABASE.md` — ตาราง, RPC, trigger, RLS ที่เว็บนี้ใช้ + ตารางของระบบอื่นที่ **ห้ามแตะ**
- `docs/KNOWN_ISSUES.md` — ปัญหาที่ตรวจเจอแล้ว (มีช่องโหว่ระดับร้ายแรง) พร้อมสถานะ
- `docs/HISTORY.md` — การตัดสินใจและเหตุการณ์ที่ผ่านมา (ทำไมโค้ดถึงเป็นแบบนี้)

ข้อมูลในเอกสารทั้งหมดตรวจจากโค้ดและ DB จริงเมื่อ **16 ต.ค. 2026** (commit `c0dae1c`) — ถ้าเวลาผ่านไปนาน ให้ตรวจซ้ำก่อนเชื่อ

---

## กฎเหล็ก (ห้ามฝ่าฝืน)

1. **ห้ามเดา ห้ามคิดเอง** — ถ้าไม่รู้ ให้ตรวจจากโค้ด/DB จริงก่อน ถ้ายังไม่ชัด **ถามเจ้าของ** อย่าสร้างฟีเจอร์ ชื่อคอลัมน์ ชื่อ RPC หรือ business rule ขึ้นมาเอง ทุกอย่างในเอกสารที่เขียนว่า "ไม่ทราบ / ต้องยืนยัน" คือห้ามเดา
2. **ทำเฉพาะสิ่งที่เจ้าของสั่ง** — ห้ามแก้ของที่ไม่ได้ขอ ห้าม refactor/จัด format/แก้ lint ทั้งไฟล์ "ไปด้วย" ห้ามอัปเกรด dependency ถ้าเห็นปัญหาอื่น ให้ **รายงาน** ไม่ใช่แก้เอง
3. **DB จริงคือ production ตัวเดียว ไม่มี staging** — ทุกคำสั่งที่เขียน (INSERT/UPDATE/DELETE/DDL/`apply_migration`) ต้อง
   - เขียน SQL ให้เจ้าของดูก่อน + อธิบายผลกระทบ + วิธีย้อนกลับ
   - รอเจ้าของอนุมัติชัดเจนก่อนรัน
   - อ่าน (`SELECT`, `list_tables`, `pg_get_functiondef`) ทำได้เลยไม่ต้องขอ
4. **ห้ามแตะตาราง/ฟังก์ชันของระบบอื่น** ที่อยู่ DB เดียวกัน: `tournament*`, `t_*`, `bot_finish_tournament`, `finish_tournament`, `award_points`, `credit_wallet`, `record_match_stats` (เป็นของบอท Discord "Khosok" + เว็บจัดทัวร์ ซึ่ง**ไม่ได้อยู่ใน repo นี้**) — ดู `docs/DATABASE.md`
5. **ห้าม push ขึ้น `main` เอง** — `main` น่าจะ deploy ขึ้นเว็บจริงอัตโนมัติ (ยังไม่ได้ยืนยันกับ Vercel) ให้ทำบน branch แยก แล้วให้เจ้าของ merge
6. **ห้ามใส่ secret ลงโค้ด/commit** — ค่าทั้งหมดอยู่ใน env ของ Vercel (`.env*` ถูก gitignore ไว้แล้ว) `SUPABASE_SERVICE_ROLE_KEY` ใช้ได้เฉพาะไฟล์ใต้ `src/app/api/**` ห้าม import เข้า client component
7. **ไม่ส่งงานที่พัง** — ก่อนบอกว่าเสร็จ ต้องผ่าน "ด่านตรวจ" ด้านล่างทุกข้อ และบอกเจ้าของตรง ๆ ว่าทดสอบอะไรไปแล้ว อะไรยังไม่ได้ทดสอบ

## ด่านตรวจก่อนส่งงาน

```bash
npm ci                 # ใช้ lockfile ห้าม npm install แบบอัปเวอร์ชัน
npx tsc --noEmit       # ต้อง 0 error (baseline 16 ต.ค. 2026 = 0)
npx eslint .           # baseline = 152 errors / 44 warnings (เป็นของเดิม ส่วนใหญ่ no-explicit-any)
                       #  -> งานใหม่ห้ามทำให้ตัวเลขเพิ่ม ไม่ต้องไปไล่แก้ของเดิม
npx next build         # ต้องมี env ครบ (ดูด้านล่าง)
```

เรื่อง `next build` ที่ต้องรู้:
- ต้องมี env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (ใส่ค่า placeholder ได้) ไม่งั้นพังตอน "Collecting page data" ที่ `/api/bot-bridge`
- `src/app/layout.tsx` ใช้ `next/font/google` → ถ้าเครื่องต่อ Google Fonts ไม่ได้ build จะพัง (ไม่ใช่บั๊กโค้ด)
- หน้า `/catalog` prerender ตอน build และ **ตั้งใจให้ build ล้ม** ถ้าต่อ Supabase ไม่ได้ (เหตุผลใน `docs/HISTORY.md`) ในเครื่องที่ต่อ DB ไม่ได้ จะได้ 23/24 หน้า แล้วล้มที่ `/catalog` ด้วยข้อความ `[catalog] โหลดข้อมูลจาก Supabase ไม่สำเร็จ` — **ถือว่า baseline ปกติ** ส่วนอื่นต้อง compile + TypeScript ผ่าน
- ไม่มี test อัตโนมัติในโปรเจกต์ — การเปลี่ยน logic ต้องอธิบายวิธีทดสอบด้วยมือให้เจ้าของ

## ข้อเท็จจริงที่ต้องรู้ก่อนเขียนโค้ด

- ทุกหน้าที่โหลดข้อมูลเป็น `'use client'` ยิง Supabase จากเบราว์เซอร์ด้วย anon key — **ยกเว้น** `/catalog` ที่เป็น server component + ISR (`revalidate = 3600`) (ส่วน `/` แค่ redirect ไป `/catalog`)
- Next.js 16: `params` / `searchParams` ต้องใช้แบบ async (`use(params)` หรือ `useParams()`) — แบบ sync ใช้ไม่ได้แล้ว (บั๊กจริงใน `/orders/[id]` ดู `docs/KNOWN_ISSUES.md` B1)
- แต่ละไฟล์สร้าง Supabase client เองที่หัวไฟล์ (`createClient(...)` จาก `@supabase/supabase-js`) — `src/lib/supabase.ts` เป็นไฟล์ว่าง ไม่มีใครใช้ ไม่มี middleware ไม่ใช้ `@supabase/ssr` (ติดตั้งไว้แต่ไม่ได้ใช้)
- **ความปลอดภัยจริงอยู่ที่ RLS + RPC ฝั่ง DB** หน้า admin เช็ค role ฝั่ง client แค่เพื่อ redirect เท่านั้น (บางหน้าไม่เช็คเลย) ห้ามคิดว่าการซ่อนปุ่มคือการกันสิทธิ์
- งานที่แตะเงิน/แต้ม/สต็อก ต้องทำใน RPC ฝั่ง DB แบบ transaction (`place_order`, `redeem_to_bag`, `bridge_bag_to_history`, `admin_*`) ห้ามย้าย logic พวกนี้มาคำนวณฝั่ง client
- ตาราง `wallet_transactions` / `stock_transactions` เป็น ledger แบบ append-only (มี trigger เขียนให้อัตโนมัติ) ห้าม UPDATE/DELETE แถวเก่า
- แอดมินแก้สินค้าแล้วต้องเรียก `revalidateCatalog()` (`src/app/actions/revalidate.ts`) ไม่งั้น `/catalog` ค้าง cache 1 ชม.
- สวิตช์ปิดร้านชั่วคราว: `src/lib/shopStatus.ts` (`SHOP_CLOSED`) ข้อความประกาศอยู่ `src/components/ShopClosedNotice.tsx`
- ประกาศทั่วไป (ไม่ปิดร้าน, เฉพาะ `/catalog`): แอดมินแก้ในหน้า `/admin` เก็บที่ `settings.announcement` — `src/components/AnnouncementBar.tsx` / `AnnouncementEditor.tsx`
- สถานะออเดอร์ (`orders.status`) เป็นภาษาอังกฤษ: `pending_payment | paid | shipping | delivered | cancelled` แต่สถานะการแลก (`redeem_history.status`) เป็น**ภาษาไทย**: `กำลังตรวจสอบสลิป | กำลังเตรียมของ | ส่งแล้ว | สลิปไม่ถูกต้อง` และ `bag.status` = `In Bag | Shipped` — มี CHECK constraint ห้ามสะกดต่าง
- ไฟล์ `r2-migration.patch` และ `revalidate-catalog.patch` ที่ root **ถูก apply ไปแล้ว** (โค้ดปัจจุบันใหม่กว่า patch) ห้าม `git apply` ซ้ำ
- `scripts/migrate-to-r2.mjs` เขียน DB จริงเมื่อรันด้วย `--apply` — ห้ามรันถ้าไม่ได้สั่ง (ตรวจแล้ว: ไม่มี URL รูปที่ชี้ไป supabase.co เหลือใน DB แล้ว)
- ภาษา UI และ comment ในโค้ดเป็นภาษาไทย ให้เขียนต่อเป็นภาษาไทยให้เข้ากัน

## เครื่องมือ Supabase

ถ้ามี Supabase MCP ให้ใช้ project_id `joceifkrecfcntbjpsvn`
- ดูนิยามฟังก์ชันจริง (เชื่อ DB มากกว่าเอกสาร): `select pg_get_functiondef('public.place_order'::regproc);`
- ดู policy: `select * from pg_policies where schemaname='public' and tablename='orders';`
- ฐานข้อมูลส่วนแรก (sellers, products, orders ฯลฯ) สร้างก่อนเริ่มเก็บ migration — `list_migrations` จึง**สร้าง DB ใหม่ซ้ำไม่ได้** ใช้ DB จริงเป็นตัวอ้างอิง
- migration ใหม่: ตั้งชื่อ snake_case สื่อความหมาย (ดูแบบจาก `list_migrations`) และต้องผ่านการอนุมัติตามกฎข้อ 3
