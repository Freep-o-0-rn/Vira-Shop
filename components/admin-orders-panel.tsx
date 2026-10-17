"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
type Status="new"|"confirmed"|"packing"|"shipped"|"completed"|"cancelled";
type OrderItem={id:string;title:string;quantity:number;variantId:string|null;
 selection:{name:string;value:string}[];unitMinor:string;lineMinor:string};
type Address={recipient:string;phone:string;city:string;street:string;building:string;apartment:string;comment?:string;pickupPoint?:string};
type Order={
 id:string;status:Status;paymentStatus:string;paymentMethod:string;
 deliveryMethod:"courier"|"pickup";subtotalMinor:string;deliveryFeeMinor:string|null;
 totalMinor:string;address:Address;note:string;createdAt:string;updatedAt?:string;
 customerName:string;customerEmail:string;items:OrderItem[];
};
type Event={id:string;kind:"created"|"status_changed";fromStatus:Status|null;
 toStatus:Status;actor:string;note:string;createdAt:string};
const labels:Record<Status,string>={new:"Новый",confirmed:"Подтверждён",packing:"Сборка",
 shipped:"Отправлен",completed:"Завершён",cancelled:"Отменён"};
const steps:Record<Status,Status[]>={new:["confirmed","cancelled"],confirmed:["packing","cancelled"],
 packing:["shipped","cancelled"],shipped:["completed"],completed:[],cancelled:[]};
const methods={courier:"Доставка по адресу",pickup:"Самовывоз"};
const currency=(s:string)=>new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB"}).format(Number(s)/100);
async function call<T>(path:string,options?:RequestInit):Promise<T>{
 const response=await fetch(path,{cache:"no-store",...options});
 const data=await response.json() as T&{error?:string};
 if(response.status===401){window.location.assign("/admin/login");throw Error("Требуется повторный вход.");}
 if(!response.ok)throw Error(data.error??"Серверная ошибка");
 return data;
}
export default function AdminOrdersPanel({onChanged}:{onChanged?:()=>Promise<void>}){
 const [input,setInput]=useState(""),[search,setSearch]=useState("");
 const [status,setStatus]=useState<"all"|Status>("all"),[page,setPage]=useState(1);
 const [rows,setRows]=useState<Order[]>([]),[total,setTotal]=useState(0);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 const [details,setDetails]=useState<Order&{history:Event[]}|null>(null);
 const [detailId,setDetailId]=useState<string|null>(null);
 const [detailLoading,setDetailLoading]=useState(false),[saving,setSaving]=useState(false);
 const [note,setNote]=useState(""),[detailError,setDetailError]=useState("");
 const [refreshKey,setRefreshKey]=useState(0);
 const reload=useCallback(()=>setRefreshKey(x=>x+1),[]);
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);setError("");
  const params=new URLSearchParams({q:search,status,page:String(page),limit:"20"});
  void call<{items:Order[];total:number}>("/api/admin/orders?"+params,{signal:controller.signal})
   .then(data=>{if(!controller.signal.aborted){setRows(data.items);setTotal(data.total);}})
   .catch(err=>{if(!controller.signal.aborted)setError(err instanceof Error?err.message:"Ошибка получения заказов.");})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[search,status,page,refreshKey]);
 useEffect(()=>{
  if(!detailId){setDetails(null);return;}
  const controller=new AbortController();
  setDetailLoading(true);setDetailError("");
  void call<{order:Order&{history:Event[]}}>("/api/admin/orders/"+detailId,{signal:controller.signal})
   .then(data=>{if(!controller.signal.aborted)setDetails(data.order);})
   .catch(err=>{if(!controller.signal.aborted)setDetailError(err instanceof Error?err.message:"Ошибка получения заказа.");})
   .finally(()=>{if(!controller.signal.aborted)setDetailLoading(false);});
  return ()=>controller.abort();
 },[detailId,refreshKey]);
 function searchOrders(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setSearch(input.trim());setPage(1);
 }
 async function advance(next:Status){
  if(!details||saving)return;
  if(next==="cancelled"&&!window.confirm("Отменить заказ № "+details.id+
    " и вернуть все зарезервированные позиции на склад? Это действие нельзя отменить."))return;
  setSaving(true);setDetailError("");
  try{
   await call("/api/admin/orders/"+details.id,{
     method:"PATCH",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({status:next,note:note.trim()})
   });
   setNote("");reload();
   if(onChanged)await onChanged();
  }catch(err){setDetailError(err instanceof Error?err.message:"Ошибка изменения статуса.");}
  finally{setSaving(false);}
 }
 const pages=Math.max(1,Math.ceil(total/20));
 const newest=rows.filter(x=>x.status==="new").length;
 return <div className="admin-orders-workspace">
   <div className="admin-orders-toolbar">
     <div><h2>Заказы покупателей</h2>
       <p>Поиск, обработка заявок и журнал переходов статуса.</p></div>
     <button type="button" disabled={loading} onClick={reload}>↻ Обновить</button>
   </div>
   <div className="admin-order-stats">
     <div><strong>{total}</strong><span>Найдено заказов</span></div>
     <div><strong>{newest}</strong><span>Новых на этой странице</span></div>
     <div><strong>{page}</strong><span>Страница из {pages}</span></div>
   </div>
   <div className="admin-orders-filters">
     <form onSubmit={searchOrders}>
       <label htmlFor="admin-order-search">Номер заказа, покупатель или e-mail</label>
       <div><input id="admin-order-search" type="search" maxLength={100}
         placeholder="Например: 10025 или Иван" value={input}
         onChange={e=>setInput(e.target.value)}/>
         <button type="submit">Найти</button>
         {(search||input)&&<button type="button" className="admin-order-clear"
           onClick={()=>{setInput("");setSearch("");setPage(1)}}>Сбросить</button>}
       </div>
     </form>
     <label>Статус
       <select value={status} onChange={e=>{setStatus(e.target.value as typeof status);setPage(1);}}>
         <option value="all">Все статусы</option>
         {(Object.keys(labels) as Status[]).map(s=><option key={s} value={s}>{labels[s]}</option>)}
       </select>
     </label>
   </div>
   {error&&<p className="admin-alert" role="alert">{error}</p>}
   {loading?<p className="admin-help">Загружаем заказы…</p>:
   rows.length?<div className="admin-orders-table-wrap">
     <table className="admin-table admin-orders-table">
       <thead><tr><th>Номер / дата</th><th>Покупатель</th><th>Получение</th><th>Товары</th><th>Сумма товаров</th><th>Статус</th><th></th></tr></thead>
       <tbody>{rows.map(order=><tr key={order.id}>
         <td><strong>№ {order.id}</strong><small>{new Date(order.createdAt).toLocaleString("ru-RU")}</small></td>
         <td><strong>{order.customerName}</strong><small>{order.customerEmail}</small></td>
         <td>{methods[order.deliveryMethod]}</td>
         <td>{order.items.reduce((n,i)=>n+i.quantity,0)} шт.</td>
         <td><strong>{currency(order.totalMinor)}</strong>
            {order.deliveryFeeMinor===null&&<small>Доставка уточняется</small>}</td>
         <td><span className={"admin-order-status status-"+order.status}>{labels[order.status]}</span></td>
         <td><button type="button" className="admin-order-details-button"
           onClick={()=>{setDetails(null);setDetailId(order.id);setNote("");}}>Открыть →</button></td>
       </tr>)}</tbody>
     </table>
   </div>:<p className="admin-help">По указанным условиям заказов нет.</p>}
   {pages>1&&<div className="admin-orders-pages">
     <button type="button" disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)}>← Назад</button>
     <span>Страница {page} из {pages}</span>
     <button type="button" disabled={loading||page>=pages} onClick={()=>setPage(p=>p+1)}>Вперёд →</button>
   </div>}
   {detailId&&<div className="admin-modal-overlay" onClick={()=>{if(!saving)setDetailId(null);}}>
     <div className="admin-modal admin-order-modal" role="dialog" aria-modal="true"
       aria-label={"Детали заказа "+detailId} onClick={e=>e.stopPropagation()}>
       <div className="admin-modal-heading">
         <div><span className="admin-eyebrow">ЗАЯВКА ПОКУПАТЕЛЯ</span><h2>Заказ № {detailId}</h2></div>
         <button type="button" disabled={saving} aria-label="Закрыть" onClick={()=>setDetailId(null)}>×</button>
       </div>
       {detailError&&<p className="admin-alert" role="alert">{detailError}</p>}
       {detailLoading?<p className="admin-help">Открываем заказ…</p>:details&&<>
         <div className="admin-order-summary">
           <span className={"admin-order-status status-"+details.status}>{labels[details.status]}</span>
           <span>{new Date(details.createdAt).toLocaleString("ru-RU")}</span>
           <span>Оплата: не подключена</span>
         </div>
         <section className="admin-order-detail-section">
           <h3>Товары · {details.items.length} позиций</h3>
           <div className="admin-order-lines">
             {details.items.map((item,index)=><div key={index}>
               <div><strong>{item.title}</strong>
                 <small>Артикул: {item.variantId??item.id}</small>
                 {item.selection?.length>0&&<small>{item.selection.map(x=>x.name+": "+x.value).join(" · ")}</small>}
               </div>
               <span>{item.quantity} × {currency(item.unitMinor)}</span>
               <strong>{currency(item.lineMinor)}</strong>
             </div>)}
           </div>
           <div className="admin-order-total"><span>Товары</span><strong>{currency(details.subtotalMinor)}</strong></div>
           <div className="admin-order-total"><span>Доставка</span>
             <strong>{details.deliveryFeeMinor===null?"Не рассчитана":currency(details.deliveryFeeMinor)}</strong></div>
         </section>
         <section className="admin-order-detail-section">
           <h3>Получение и покупатель</h3>
           <p><strong>{methods[details.deliveryMethod]}</strong> · {details.customerName}</p>
           <p>{details.address.recipient}, {details.address.phone}</p>
           {details.deliveryMethod==="courier"?
             <p>{[details.address.city,details.address.street,"д. "+details.address.building,
               details.address.apartment?"кв. "+details.address.apartment:""].filter(Boolean).join(", ")}</p>:
             <p>Место и время самовывоза согласуются отдельно.</p>}
           <p>{details.customerEmail}</p>
           {details.note&&<p>Комментарий покупателя: {details.note}</p>}
         </section>
         <section className="admin-order-detail-section">
           <h3>История обработки</h3>
           <ol className="admin-order-history">
            {details.history.map(event=><li key={event.id}>
              <div><strong>{event.kind==="created"?"Заявка создана":
                (event.fromStatus?labels[event.fromStatus]+" → ":"")+labels[event.toStatus]}</strong>
                <small>{new Date(event.createdAt).toLocaleString("ru-RU")} ·
                  {event.actor==="admin"?"Администратор":event.actor==="customer"?"Покупатель":"Перенос данных"}</small>
              </div>
              {event.note&&<p>{event.note}</p>}
            </li>)}
           </ol>
         </section>
         {!!steps[details.status].length&&<section className="admin-order-detail-section">
           <h3>Изменить статус</h3>
           <label className="admin-order-note">Комментарий к действию (необязательно)
             <textarea maxLength={500} rows={2} value={note} disabled={saving}
               placeholder="Например, подтвердили заказ по телефону" onChange={e=>setNote(e.target.value)}/>
           </label>
           <div className="admin-actions">
             {steps[details.status].map(next=><button type="button" key={next} disabled={saving}
               className={next==="cancelled"?"admin-order-cancel":""} onClick={()=>void advance(next)}>
               {saving?"Сохраняем…":next==="cancelled"?"Отменить и вернуть остатки":"Перевести: "+labels[next]}
             </button>)}
           </div>
         </section>}
         {details.status==="cancelled"&&<p className="admin-order-reservation">Резерв отменён; количество возвращено на склад.</p>}
         {details.status==="completed"&&<p className="admin-order-reservation">Обработка завершена. Оплата не подключена и не отмечена полученной.</p>}
       </>}
     </div>
   </div>}
 </div>;
}
