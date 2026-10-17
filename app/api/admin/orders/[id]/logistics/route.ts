import {NextRequest,NextResponse} from "next/server";
import {adminGuard,readJson} from "@/lib/server/admin-guard";
import {failureResponse} from "@/lib/server/admin-auth";
import {getPool} from "@/lib/server/db";
import {ALLOWED_LOGISTICS,CARRIER_CODES,validLogisticsTransition,
 type LogisticsStatus,type DeliveryMethod,type FulfillmentSource} from "@/lib/logistics";
export const runtime="nodejs";export const dynamic="force-dynamic";
type Ctx={params:Promise<{id:string}>};
type Row={status:string;logistics_status:LogisticsStatus;delivery_method:DeliveryMethod;
 fulfillment_source:FulfillmentSource;carrier_code:string|null;tracking_number:string|null;purchase_reference:string|null};
const responseHeaders={"Cache-Control":"no-store"};

export async function PATCH(req:NextRequest,{params}:Ctx){
 try{
  const denied=await adminGuard(req,true);if(denied)return denied;
  const {id}=await params;
  if(!/^[0-9]{1,19}$/.test(id))return NextResponse.json({error:"Неверный номер заказа."},{status:400});
  let body:unknown;try{body=await readJson(req);}catch{return NextResponse.json({error:"Некорректный JSON."},{status:400});}
  if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({error:"Некорректный запрос."},{status:400});
  const b=body as Record<string,unknown>;
  const next=b.status,source=b.fulfillmentSource,carrier=b.carrierCode,tracking=b.trackingNumber,
    purchase=b.purchaseReference,note=b.note??"";
  const statuses=Object.keys(ALLOWED_LOGISTICS);
  if((next!==undefined&&(typeof next!=="string"||!statuses.includes(next)))||
    (source!==undefined&&source!=="own_stock"&&source!=="purchase_to_order")||
    (carrier!==undefined&&carrier!==null&&(!CARRIER_CODES.includes(carrier as typeof CARRIER_CODES[number])))||
    (tracking!==undefined&&tracking!==null&&(typeof tracking!=="string"||tracking.trim().length>100))||
    (purchase!==undefined&&purchase!==null&&(typeof purchase!=="string"||purchase.trim().length>400))||
    typeof note!=="string"||note.trim().length>500||
    (next===undefined&&source===undefined&&carrier===undefined&&tracking===undefined&&purchase===undefined))
    return NextResponse.json({error:"Некорректный статус или сведения о доставке."},{status:400});
  const client=await getPool().connect();
  try{
   await client.query("BEGIN");
   const result=await client.query<Row>(`SELECT status,logistics_status,delivery_method,
      fulfillment_source,carrier_code,tracking_number,purchase_reference FROM shop_orders WHERE id=$1 FOR UPDATE`,[id]);
   if(!result.rowCount){await client.query("ROLLBACK");return NextResponse.json({error:"Заказ не найден."},{status:404});}
   const row=result.rows[0];
   if(row.status==="cancelled"||row.status==="completed"||row.logistics_status==="cancelled"||row.logistics_status==="delivered"){
    await client.query("ROLLBACK");return NextResponse.json({error:"Завершённый или отменённый заказ нельзя изменить."},{status:409});
   }
   const target=(next??row.logistics_status) as LogisticsStatus;
   const changing=target!==row.logistics_status;
   if(changing&&(target==="cancelled"||!validLogisticsTransition(row.logistics_status,target,row.delivery_method))){
    await client.query("ROLLBACK");return NextResponse.json({error:"Недопустимый переход. Отменяйте заказ через статус заказа."},{status:409});
   }
   if(changing&&row.status==="new"){
    await client.query("ROLLBACK");return NextResponse.json({error:"Сначала подтвердите заказ."},{status:409});
   }
   if((target==="handed_over"||target==="in_transit")&&row.status!=="packing"&&row.status!=="shipped"){
    await client.query("ROLLBACK");return NextResponse.json({error:"Сначала переведите заказ в сборку."},{status:409});
   }
   if(target==="delivered"&&row.status!=="shipped"&&
      !(row.delivery_method==="pickup"&&row.status==="packing")){
    await client.query("ROLLBACK");return NextResponse.json({error:"Для подтверждения вручения заказ должен быть в сборке (самовывоз) или отправлен."},{status:409});
   }
   const newSource=(source??row.fulfillment_source) as FulfillmentSource;
   const newCarrier=(carrier===undefined?row.carrier_code:carrier) as string|null;
   const newTracking=(tracking===undefined?row.tracking_number:tracking===null?null:tracking.trim()) as string|null;
   const newPurchase=(purchase===undefined?row.purchase_reference:purchase===null?null:purchase.trim()) as string|null;
   if(row.delivery_method==="pickup"&&(newCarrier||newTracking)){
     await client.query("ROLLBACK");return NextResponse.json({error:"Для самовывоза не нужен перевозчик или трек-номер."},{status:409});
   }
   if(target==="handed_over"&&row.delivery_method==="transport"&&!newCarrier){
     await client.query("ROLLBACK");return NextResponse.json({error:"Укажите перевозчика до передачи транспортной компании."},{status:409});
   }
   if(target==="sourcing"&&newSource!=="purchase_to_order"){
     await client.query("ROLLBACK");return NextResponse.json({error:"Ожидание закупки доступно только при источнике «Закупка под заказ»."},{status:409});
   }
   if(!changing&&newSource===row.fulfillment_source&&newCarrier===row.carrier_code&&newTracking===row.tracking_number&&newPurchase===row.purchase_reference){
     await client.query("ROLLBACK");return NextResponse.json({error:"Данные не изменились."},{status:409});
   }
   await client.query(`UPDATE shop_orders SET logistics_status=$2,fulfillment_source=$3,
     carrier_code=$4,tracking_number=$5,purchase_reference=$6,
     logistics_updated_at=NOW(),updated_at=NOW()
     WHERE id=$1`,[id,target,newSource,newCarrier,newTracking,newPurchase]);
   await client.query(`INSERT INTO shop_logistics_events
     (order_id,kind,from_status,to_status,actor_type,note)
     VALUES($1,$2,$3,$4,'admin',$5)`,
     [id,changing?"status_changed":"details_updated",row.logistics_status,target,note.trim()]);
   // Confirmed handoff and verified receipt are real admin events; automate only
   // commercial steps made true by these explicit events. No timer-based fiction.
   let orderStatus=row.status;
   if(target==="handed_over"&&row.status==="packing"){
     orderStatus="shipped";
   }else if(target==="delivered"){
     orderStatus="completed";
   }
   if(orderStatus!==row.status){
     await client.query("UPDATE shop_orders SET status=$2,updated_at=NOW() WHERE id=$1",[id,orderStatus]);
     await client.query(`INSERT INTO shop_order_events
       (order_id,kind,from_status,to_status,actor_type,note)
       VALUES($1,'status_changed',$2,$3,'system',$4)`,[id,row.status,orderStatus,
        target==="handed_over"?"Автоматически после подтверждения передачи перевозчику.":
        "Автоматически после подтверждения вручения получателю."]);
   }
   await client.query("COMMIT");
   return NextResponse.json({id,logisticsStatus:target,status:orderStatus,fulfillmentSource:newSource},{headers:responseHeaders});
  }catch(err){try{await client.query("ROLLBACK");}catch{}throw err;}
  finally{client.release();}
 }catch(err){return failureResponse(err);}
}
