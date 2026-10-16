-- นิยาม _apply_stock_delta เดิม (ก่อนข้อ 1)
CREATE OR REPLACE FUNCTION public._apply_stock_delta(p_order_id uuid, p_only_preorder boolean, p_all boolean, p_sign integer, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
begin
  for r in
    select variant_id, quantity from order_items
    where order_id = p_order_id and variant_id is not null
      and (p_all or is_preorder = p_only_preorder)
  loop
    update product_variants set stock = stock + (p_sign * r.quantity) where id = r.variant_id;
    update stock_transactions set reason = p_reason || ' ' || left(p_order_id::text, 8)
    where id = (select id from stock_transactions
                where variant_id = r.variant_id order by created_at desc limit 1);
  end loop;
end;
$function$;
