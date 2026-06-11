'use client'

import { useState } from 'react'

export default function Footer() {
  const [showTerms, setShowTerms] = useState(false)

  return (
    <>
      <footer className="bg-white border-t border-blue-100 mt-12">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">

            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-bold">D</span>
                </div>
                <span className="font-bold text-blue-900">DMT Shop</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                ร้านค้าออนไลน์อย่างเป็นทางการของกลุ่ม Dinomaster Club จำหน่ายสินค้าและโปรโมชั่นการ์ดเกมคุณภาพ
              </p>
            </div>

            {/* ช่องทางติดตาม */}
            <div>
              <h3 className="font-semibold text-gray-800 mb-3 text-sm">ติดตามเรา</h3>
              <div className="space-y-2">
                <a href="https://www.facebook.com/DinomasterPlayground" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-gray-500 hover:text-blue-600">
                  <span className="text-lg">📘</span> Dinomaster Playground
                </a>
                <a href="https://discord.com/invite/7yuNfuaYza" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-gray-500 hover:text-indigo-600">
                  <span className="text-lg">🎮</span> Discord Community
                </a>
              </div>
            </div>

            {/* ข้อมูลเพิ่มเติม */}
            <div>
              <h3 className="font-semibold text-gray-800 mb-3 text-sm">ข้อมูล</h3>
              <div className="space-y-2">
                <button onClick={() => setShowTerms(true)}
                  className="block text-xs text-gray-500 hover:text-blue-600">
                  ข้อกำหนดการใช้งาน
                </button>
                <a href="/catalog" className="block text-xs text-gray-500 hover:text-blue-600">
                  แคตตาล็อกสินค้า
                </a>
                <a href="/orders" className="block text-xs text-gray-500 hover:text-blue-600">
                  ติดตามคำสั่งซื้อ
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 flex flex-col md:flex-row justify-between items-center gap-2">
            <p className="text-xs text-gray-400">
              © {new Date().getFullYear()} Dinomaster Club. All rights reserved.
            </p>
            <p className="text-xs text-gray-400">
              พัฒนาโดย <span className="text-blue-500">@Oat</span> · Dinomaster Playground
            </p>
          </div>
        </div>
      </footer>

      {showTerms && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowTerms(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="font-bold text-gray-800">ข้อกำหนดการใช้งาน</h2>
              <button onClick={() => setShowTerms(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-5 text-xs text-gray-600 space-y-4 leading-relaxed">
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">1. การยอมรับข้อกำหนด</h3>
                <p>การใช้งานเว็บไซต์และบริการซื้อขายถือเป็นการยอมรับข้อกำหนดและเงื่อนไขทั้งหมด หากท่านมีอายุต่ำกว่า 20 ปี ต้องได้รับความยินยอมจากผู้ปกครองก่อนใช้งาน</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">2. การสั่งซื้อและชำระเงิน</h3>
                <p>การสั่งซื้อจะสมบูรณ์เมื่อได้รับการยืนยันจากทีมงาน หลังจากท่านชำระเงินและส่งหลักฐานการโอนแล้ว ทีมงานจะตรวจสอบและดำเนินการจัดส่งภายในเวลาที่กำหนด</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">3. การจัดส่งสินค้า</h3>
                <p>ค่าจัดส่งคิดตามอัตราที่กำหนด ทีมงานจะแจ้งเลขพัสดุผ่านระบบหลังจากจัดส่งแล้ว ท่านสามารถติดตามพัสดุได้ผ่านเว็บไซต์ของบริษัทขนส่ง</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">4. การคืนสินค้า</h3>
                <p>สินค้าโปรโมชั่นและการ์ดที่เปิดแล้วไม่รับคืนในทุกกรณี หากสินค้าเสียหายระหว่างขนส่ง กรุณาติดต่อทีมงานภายใน 24 ชั่วโมงพร้อมหลักฐาน</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">5. กฎระเบียบการใช้งาน</h3>
                <p>ห้ามพยายามเจาะระบบหรือใช้โปรแกรมอัตโนมัติ ห้ามสร้างบัญชีปลอมหรือสั่งซื้อโดยไม่มีเจตนาชำระเงิน ทีมงานสงวนสิทธิ์ระงับบัญชีผู้ใช้ที่ละเมิดข้อกำหนดโดยไม่ต้องแจ้งล่วงหน้า</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">6. ทรัพย์สินทางปัญญา</h3>
                <p>รูปภาพการ์ดและเครื่องหมายการค้าที่เกี่ยวข้องกับ Dinomaster เป็นลิขสิทธิ์ของเจ้าของลิขสิทธิ์นั้นๆ เว็บไซต์นี้จัดทำขึ้นเพื่อสนับสนุนชุมชนเท่านั้น</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">7. การจำกัดความรับผิด</h3>
                <p>เว็บไซต์ให้บริการ "ตามที่เป็นอยู่" เราไม่รับประกันว่าระบบจะทำงานได้โดยไม่มีข้อผิดพลาดตลอดเวลา และไม่รับผิดชอบต่อความเสียหายที่เกิดจากเหตุสุดวิสัย</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">8. กฎหมายที่ใช้บังคับ</h3>
                <p>ข้อกำหนดนี้อยู่ภายใต้กฎหมายของราชอาณาจักรไทย หากมีข้อพิพาทให้ใช้ศาลไทยเป็นเขตอำนาจศาล</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">9. ติดต่อเรา</h3>
                <p>Facebook: <a href="https://www.facebook.com/DinomasterPlayground" target="_blank" className="text-blue-500">Dinomaster Playground</a><br />
                Discord: <a href="https://discord.com/invite/7yuNfuaYza" target="_blank" className="text-blue-500">Dinomaster Club</a></p>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  )
}