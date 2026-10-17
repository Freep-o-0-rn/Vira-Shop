import {NextRequest,NextResponse} from "next/server";
import {adminGuard} from "@/lib/server/admin-guard";
import {failureResponse} from "@/lib/server/admin-auth";
import {getPool} from "@/lib/server/db";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 try{
  const denied=await adminGuard(req);if(denied)return denied;
  const url=req.nextUrl.searchParams;
  const q=(url.get("q")||"").trim(),status=url.get("status")||"all";
  const pageRaw=url.get("page")??"1",limitRaw=url.get("limit")??"100";
  if(q.length>100||!["all","new","confirmed","packing","shipped","completed","cancelled"].includes(status)||
     !/^\d{1,6}$/.test(pageRaw)||!/^\d{1,3}$/.test(limitRaw)){
    return NextResponse.json({error:"Некорректные параметры поиска."},{status:400});
  }
  const page=Number(pageRaw),limit=Number(limitRaw);
  if(page<1||limit<1||limit>100)return NextResponse.json({error:"Неверный номер страницы или лимит."},{status:400});
  const params:unknown[]=[],where:string[]=[];
  if(q){
    if(/^[0-9]+$/.test(q)){
      params.push(q);
      where.push("o.id::text=$"+params.length);
    }else{
      params.push("%"+q.replace(/[\\%_]/g,"\\  if(q){
    params.push("%"+q.replace(/[\\%_]/g,"\\$&")+"%");
    const p="$"+params.length;
    where.push(`(o.id::text ILIKE ${p} ESCAPE '\\' OR c.name ILIKE ${p} ESCAPE '\\' OR c.email ILIKE ${p} ESCAPE '\\')`);
  }")+"%");
      const p="$"+params.length;
      where.push(`(c.name ILIKE ${p} ESCAPE '\\' OR c.email ILIKE ${p} ESCAPE '\\')`);
    }
  }
  if(status!=="all"){params.push(status);where.push("o.status=$"+params.length);}
  const condition=where.length?" WHERE "+where.join(" AND "):"";
  const count=await getPool().query<{total:number}>(`SELECT COUNT(*)::int AS total
    FROM shop_orders o JOIN shop_customers c ON c.id=o.customer_id${condition}`,params);
  const offset=(page-1)*limit;
  const result=await getPool().query(`SELECT o.id::text,o.status,o.payment_status AS "paymentStatus",
   o.total_minor::text AS "totalMinor",
   o.subtotal_minor::text AS "subtotalMinor",
   o.delivery_fee_minor::text AS "deliveryFeeMinor",
   o.delivery_method AS "deliveryMethod",o.payment_method AS "paymentMethod",
   o.delivery_address AS address,o.buyer_note AS note,
   o.created_at AS "createdAt",c.name AS "customerName",c.email AS "customerEmail",
   COALESCE(jsonb_agg(jsonb_build_object('id',i.product_id,'title',i.title,'quantity',i.quantity,
     'unitMinor',i.unit_price_minor::text,'lineMinor',i.line_total_minor::text,
     'variantId',i.variant_id,'selection',i.variant_selection)
     ORDER BY i.id) FILTER(WHERE i.id IS NOT NULL),'[]'::jsonb) AS items
   FROM shop_orders o JOIN shop_customers c ON c.id=o.customer_id
   LEFT JOIN shop_order_items i ON i.order_id=o.id
   ${condition}
   GROUP BY o.id,c.id ORDER BY o.created_at DESC,o.id DESC LIMIT ${limit} OFFSET ${offset}`,params);
  return NextResponse.json({items:result.rows,total:count.rows[0].total,page,limit},
    {headers:{"Cache-Control":"no-store"}});
 }catch(err){return failureResponse(err);}
}
