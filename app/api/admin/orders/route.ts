import {NextRequest,NextResponse} from "next/server";
import {adminGuard} from "@/lib/server/admin-guard";
import {failureResponse} from "@/lib/server/admin-auth";
import {getPool} from "@/lib/server/db";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 try{
  const denied=await adminGuard(req);if(denied)return denied;
  const result=await getPool().query(`SELECT o.id::text,o.status,o.payment_status AS "paymentStatus",
   o.total_minor::text AS "totalMinor",
   o.subtotal_minor::text AS "subtotalMinor",
   o.delivery_fee_minor::text AS "deliveryFeeMinor",
   o.delivery_method AS "deliveryMethod",o.payment_method AS "paymentMethod",
   o.delivery_address AS address,o.buyer_note AS note,
   o.created_at AS "createdAt",c.name AS "customerName",c.email AS "customerEmail",
   COALESCE(jsonb_agg(jsonb_build_object('id',i.product_id,'title',i.title,'quantity',i.quantity,
     'unitMinor',i.unit_price_minor::text,'lineMinor',i.line_total_minor::text,'variantId',i.variant_id,'selection',i.variant_selection)
     ORDER BY i.id) FILTER(WHERE i.id IS NOT NULL),'[]'::jsonb) AS items
   FROM shop_orders o JOIN shop_customers c ON c.id=o.customer_id
   LEFT JOIN shop_order_items i ON i.order_id=o.id
   GROUP BY o.id,c.id ORDER BY o.created_at DESC LIMIT 100`);
  return NextResponse.json({items:result.rows},{headers:{"Cache-Control":"no-store"}});
 }catch(err){return failureResponse(err);}
}
