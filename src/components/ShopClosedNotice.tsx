import { SHOP_CLOSED, SHOP_CLOSED_CONTACT_URL } from '@/lib/shopStatus'

export default function ShopClosedNotice() {
  if (!SHOP_CLOSED) return null
  return (
    <div role="alert" className="bg-amber-50 border-b-2 border-amber-300">
      <div className="max-w-5xl mx-auto px-4 py-4 text-amber-900">
        <p className="font-bold text-base">⚠️ ประกาศยุติการขายสินค้าชั่วคราว</p>
        <p className="text-sm mt-1 leading-relaxed">
          เนื่องจากติดปัญหาน้ำท่วม ทำให้ไม่สามารถจัดส่งสินค้าได้ ทางร้านขอยุติการขายสินค้าทั้งหมดชั่วคราว
        </p>
        <p className="text-sm mt-1 leading-relaxed">
          สำหรับท่านที่สั่งซื้อสินค้าไปแล้วและยังไม่ได้รับสินค้า สามารถแคปหลักฐานคำสั่งซื้อเพื่อขอคืนเงินได้ที่แชทเพจ{' '}
          <a
            href={SHOP_CLOSED_CONTACT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline text-blue-700 hover:text-blue-900"
          >
            Dinomaster Playground
          </a>
        </p>
      </div>
    </div>
  )
}
