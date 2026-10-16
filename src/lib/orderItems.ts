// เรียงรายการในออเดอร์ให้แถวโปรอยู่ติดกัน: หัวโปร (variant_id = null) แล้วตามด้วยชิ้นในโปร
// (order_items ไม่มีคอลัมน์ลำดับ DB คืนมาแบบไม่รับประกันลำดับ — ใช้ promo_group จับกลุ่ม)
export function sortOrderItems<T extends { promo_group?: string | null, variant_id?: string | null }>(items: T[]): T[] {
  const out: T[] = []
  const done = new Set<string>()
  for (const it of items) {
    if (!it.promo_group) { out.push(it); continue }
    if (done.has(it.promo_group)) continue
    done.add(it.promo_group)
    const group = items.filter(x => x.promo_group === it.promo_group)
    out.push(...group.filter(x => !x.variant_id), ...group.filter(x => x.variant_id))
  }
  return out
}
