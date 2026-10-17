"use client";
import {useEffect,useState} from "react";
import {ALLOWED_LOGISTICS,DELIVERY_LABELS,LOGISTICS_LABELS,validLogisticsTransition,
 type DeliveryMethod,type FulfillmentSource,type LogisticsStatus} from "@/lib/logistics";

type Event={id:string;kind:string;fromStatus:LogisticsStatus|null;
 toStatus:LogisticsStatus;actor:string;note:string;createdAt:string};
export type LogisticsOrder={
 id:string;status:string;deliveryMethod:DeliveryMethod;logisticsStatus:LogisticsStatus;
 fulfillmentSource:FulfillmentSource;carrierCode:string|null;trackingNumber:string|null;
 purchaseReference:string|null;logisticsHistory:Event[];
};
const carriers:Record<string,string>={ozon:"Ozon Доставка",cdek:"СДЭК",
 russian_post:"Почта России",other:"Другой перевозчик / ручная отправка"};
export default function AdminOrderLogistics({order,onSaved}:{order:LogisticsOrder;onSaved:()=>void}){
 const [source,setSource]=useState<FulfillmentSource>(order.fulfillmentSource);
 const [carrier,setCarrier]=useState(order.carrierCode??"");
 const [tracking,setTracking]=useState(order.trackingNumber??"");
 const [purchase,setPurchase]=useState(order.purchaseReference??"");
 const [note,setNote]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  setSource(order.fulfillmentSource);setCarrier(order.carrierCode??"");
  setTracking(order.trackingNumber??"");setPurchase(order.purchaseReference??"");
  setNote("");setError("");
 },[order.id,order.logisticsStatus,order.fulfillmentSource,
   order.carrierCode,order.trackingNumber,order.purchaseReference]);
 const frozen=order.status==="cancelled"||order.status==="completed"||
  order.logisticsStatus==="cancelled"||order.logisticsStatus==="delivered";
 const transport=order.deliveryMethod!=="pickup";
 const next=(ALLOWED_LOGISTICS[order.logisticsStatus]??[]).filter(step=>step!=="cancelled"&&
   validLogisticsTransition(order.logisticsStatus,step,order.deliveryMethod));
 const changed=source!==order.fulfillmentSource||carrier!==(order.carrierCode??"")||
   tracking!==(order.trackingNumber??"")||purchase!==(order.purchaseReference??"");
 async function save(nextStatus?:LogisticsStatus){
  if(busy||frozen)return;
  if(!nextStatus&&!changed)return;
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/admin/orders/"+order.id+"/logistics",{
    method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     ...(nextStatus?{status:nextStatus}:{}),
     fulfillmentSource:source,
     carrierCode:carrier||null,
     trackingNumber:tracking.trim()||null,
     purchaseReference:purchase.trim()||null,
     note:note.trim()
    })
   });
   const data=await response.json() as {error?:string};
   if(response.status===401){window.location.assign("/admin/login");return;}
   if(!response.ok)throw Error(data.error??"Не удалось сохранить логистику.");
   onSaved();
  }catch(err){setError(err instanceof Error?err.message:"Ошибка изменения логистики.");}
  finally{setBusy(false);}
 }
 return <section className="admin-order-detail-section admin-logistics-section">
  <h3>Логистика и закупка</h3>
  <div className="admin-logistics-status">
    <strong>{LOGISTICS_LABELS[order.logisticsStatus]}</strong>
    <span>{DELIVERY_LABELS[order.deliveryMethod]}</span>
  </div>
  <p className="admin-logistics-hint">Смена логистического статуса происходит только после фактического действия.
    Подтверждённая передача и вручение автоматически обновят статус заказа.</p>
  <div className="admin-logistics-fields">
    <label>Источник товара <select disabled={busy||frozen} value={source}
       onChange={e=>setSource(e.target.value as FulfillmentSource)}>
      <option value="own_stock">Свой склад</option>
      <option value="purchase_to_order">Закупка под заказ</option>
    </select></label>
    {transport&&<label>Перевозчик <select disabled={busy||frozen} value={carrier}
       onChange={e=>setCarrier(e.target.value)}>
      <option value="">Не выбран</option>
      {Object.entries(carriers).map(([key,title])=><option key={key} value={key}>{title}</option>)}
    </select></label>}
    {transport&&<label>Трек-номер <input maxLength={100} disabled={busy||frozen}
      placeholder="Появится после оформления отправки" value={tracking} onChange={e=>setTracking(e.target.value)}/></label>}
    <label className="full">Внутренний номер закупки / ссылка (скрыто от покупателя)
      <input maxLength={400} disabled={busy||frozen} placeholder="Номер заказа поставщика или URL"
        value={purchase} onChange={e=>setPurchase(e.target.value)}/></label>
  </div>
  {!frozen&&<label className="admin-logistics-note">Примечание для журнала событий
    <textarea maxLength={500} rows={2} disabled={busy} value={note}
      placeholder="Например: закуплен, проверен, упакован или передан курьеру"
      onChange={e=>setNote(e.target.value)}/>
  </label>}
  {error&&<p role="alert" className="admin-alert">{error}</p>}
  {!frozen&&<div className="admin-logistics-actions">
    <button type="button" disabled={busy||!changed} onClick={()=>void save()}>Сохранить данные</button>
    {next.map(target=><button type="button" key={target} disabled={busy||order.status==="new"}
      onClick={()=>void save(target)}>{LOGISTICS_LABELS[target]} →</button>)}
  </div>}
  <h3>Журнал логистики</h3>
  <ol className="admin-order-history">
   {order.logisticsHistory?.map(e=><li key={e.id}>
    <strong>{e.kind==="created"?"Создана логистика":e.kind==="details_updated"?
      "Обновлены сведения":LOGISTICS_LABELS[e.toStatus]}</strong>
    <small>{new Date(e.createdAt).toLocaleString("ru-RU")} · {e.actor==="admin"?"Администратор":e.actor==="customer"?"Покупатель":"Система"}</small>
    {e.note&&<p>{e.note}</p>}
   </li>)}
  </ol>
 </section>;
}
