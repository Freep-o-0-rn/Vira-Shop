import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {bad,customerGuard,noStore,publicError} from "@/lib/server/customer-auth";
import {deliveryMethod,deliveryPrice,PAYMENT_METHOD,PAYMENT_STATUS} from "@/lib/checkout-options";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 try{
  const a=await customerGuard(req);if(a.response)return a.response;
  const method=deliveryMethod(req.nextUrl.searchParams.get("method")??"courier");
  if(!method)return bad("Недопустимый способ получения.");
  if(method==="ozon_pvz")return NextResponse.json({
    code:"OZON_PROVIDER_NOT_CONNECTED",available:false,
    error:"ПВЗ Ozon не подключены. Выберите другой способ получения."
  },{status:503,headers:noStore});
  const items=await getPool().query<{id:string;variantId:string|null;quantity:number;
     priceMinor:string;stock:number;available:boolean}>(`
    SELECT p.id,c.variant_id AS "variantId",c.quantity,
      COALESCE(v.price_minor,p.price_minor)::text AS "priceMinor",
      COALESCE(v.stock_count,p.stock_count) AS stock,
      (p.is_active AND cat.is_active
       AND (c.variant_id IS NOT NULL OR p.variant_groups='[]'::jsonb)
       AND (c.variant_id IS NULL OR (v.article IS NOT NULL AND v.is_active))) AS available
    FROM shop_customer_cart c
    JOIN shop_products p ON p.id=c.product_id
    JOIN shop_categories cat ON cat.id=p.category_id
    LEFT JOIN shop_product_variants v ON v.article=c.variant_id AND v.product_id=c.product_id
    WHERE c.customer_id=$1 ORDER BY c.product_id,c.variant_key`,[a.customer!.id]);
  let subtotal=0;
  const problems:string[]=[];
  for(const item of items.rows){
    const amount=Number(item.priceMinor);
    if(!Number.isSafeInteger(amount)||amount<0||!Number.isSafeInteger(subtotal+amount*item.quantity))
      throw new Error("Invalid cart value");
    subtotal+=amount*item.quantity;
    if(!item.available||item.stock<item.quantity)
      problems.push(item.variantId??item.id);
  }
  const fee=deliveryPrice(method);
  return NextResponse.json({
    method,itemsCount:items.rows.length,subtotalMinor:String(subtotal),
    deliveryFeeMinor:fee===null?null:String(fee),
    totalMinor:fee===null?null:String(subtotal+fee),
    deliveryPricePending:fee===null,canPlace:items.rows.length>0&&!problems.length,
    unavailableArticles:problems,paymentStatus:PAYMENT_STATUS,paymentMethod:PAYMENT_METHOD,
    paymentEnabled:false
  },{headers:noStore});
 }catch(err){return publicError(err);}
}
