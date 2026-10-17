"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
type Address={id:string;recipient:string;phone:string;city:string;street:string;building:string;apartment:string};
type CartItem={id:string;variantId:string|null;selection:{name:string;value:string}[];quantity:number;title:string;image:string;priceMinor:string;stock:number;available:boolean};
type DeliveryMethod="pickup"|"courier";
type Quote={method:DeliveryMethod;itemsCount:number;subtotalMinor:string;deliveryFeeMinor:string|null;
 totalMinor:string|null;deliveryPricePending:boolean;canPlace:boolean;paymentEnabled:boolean;
 unavailableArticles:string[];paymentStatus:string;paymentMethod:string};
const KEY="vira-shop:cart:v1";
const VARIANT_KEY="vira-shop:variant-cart:v1";
const money=(v:number)=>new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB"}).format(v/100);
async function api<T>(url:string,options?:RequestInit):Promise<T>{
 const res=await fetch(url,{cache:"no-store",...options});
 const data=await res.json() as T&{error?:string};
 if(!res.ok)throw Error(data.error||"Ошибка запроса.");
 return data;
}
function guestItems():{id:string;quantity:number}[]{
 try{
  const parsed:unknown=JSON.parse(localStorage.getItem(KEY)||"{}");
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return [];
  return Object.entries(parsed).filter(([id,q])=>/^[a-zA-Z0-9_-]{1,64}$/.test(id) &&
    typeof q==="number" && Number.isInteger(q) && q>=1 && q<=99)
   .map(([id,quantity])=>({id,quantity:quantity as number}));
 }catch{return [];}
}
function guestVariants():{id:string;variantId:string;quantity:number}[]{
 try{
  const saved:unknown=JSON.parse(localStorage.getItem(VARIANT_KEY)||"{}");
  if(!saved||typeof saved!=="object"||Array.isArray(saved))return [];
  return Object.entries(saved).flatMap(([variantId,value])=>{
   if(!value||typeof value!=="object"||Array.isArray(value))return [];
   const row=value as {productId?:unknown;quantity?:unknown};
   return /^[0-9]{8,12}$/.test(variantId)&&
      typeof row.productId==="string"&&/^[A-Za-z0-9_-]{1,64}$/.test(row.productId)&&
      typeof row.quantity==="number"&&Number.isInteger(row.quantity)&&row.quantity>=1&&row.quantity<=99
      ?[{id:row.productId,variantId,quantity:row.quantity}]:[];
  });
 }catch{return [];}
}
export default function Checkout(){
 const [customer,setCustomer]=useState<{name:string}|null>(null);
 const [cart,setCart]=useState<CartItem[]>([]),[addresses,setAddresses]=useState<Address[]>([]);
 const [addressId,setAddressId]=useState(""),[note,setNote]=useState("");
 const [method,setMethod]=useState<DeliveryMethod>("courier");
 const [pickupName,setPickupName]=useState(""),[pickupPhone,setPickupPhone]=useState("");
 const [quote,setQuote]=useState<Quote|null>(null);
 const [quoteError,setQuoteError]=useState(""),[quoteLoading,setQuoteLoading]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[success,setSuccess]=useState<string|null>(null);
 const requestKey=useRef<string|null>(null);
 async function refresh(){
  const [c,a]=await Promise.all([
   api<{items:CartItem[]}>("/api/account/cart"),
   api<{items:Address[]}>("/api/account/addresses")
  ]);
  setCart(c.items);setAddresses(a.items);setAddressId(old=>old||a.items[0]?.id||"");
 }
 useEffect(()=>{
  let active=true;
  (async()=>{
   try{
    const session=await api<{customer:{name:string}|null}>("/api/account/session");
    if(!active)return;
    setCustomer(session.customer);
    if(session.customer)setPickupName(session.customer.name);
    if(session.customer){
      const variants=guestVariants();
      const variantParents=new Set(variants.map(v=>v.id));
      const saved=[...guestItems().filter(v=>!variantParents.has(v.id)),...variants];
      if(saved.length){
       await api("/api/account/cart",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:saved})});
       localStorage.removeItem(KEY);
       localStorage.removeItem(VARIANT_KEY);
      }
      if(active)await refresh();
    }
   }catch(e){if(active)setError(e instanceof Error?e.message:"Ошибка загрузки корзины.");}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false};
 },[]);
 useEffect(()=>{
  if(!customer||loading)return;
  const controller=new AbortController();
  setQuoteLoading(true);setQuoteError("");setQuote(null);
  fetch("/api/account/checkout/quote?method="+method,{cache:"no-store",signal:controller.signal})
    .then(async response=>{
      const data=await response.json() as Quote & {error?:string};
      if(!response.ok)throw Error(data.error||"Не удалось рассчитать заказ.");
      if(!controller.signal.aborted)setQuote(data);
    }).catch(err=>{if(!controller.signal.aborted)setQuoteError(
      err instanceof Error?err.message:"Ошибка расчёта заказа."
    )}).finally(()=>{if(!controller.signal.aborted)setQuoteLoading(false)});
  return ()=>controller.abort();
 },[customer,loading,method,cart]);
 async function change(id:string,variantId:string|null,quantity:number){
  setBusy(true);setError("");
  try{
   const data=await api<{items:CartItem[]}>("/api/account/cart",{
    method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:id,variantId,quantity})
   });setCart(data.items);
  }catch(e){setError(e instanceof Error?e.message:"Ошибка обновления корзины.");}
  finally{setBusy(false);}
 }
 async function create(){
  if(method==="courier"&&!addressId)return setError("Выберите адрес доставки.");
  if(method==="pickup"&&(pickupName.trim().length<2||!/^[+0-9()\s-]{6,32}$/.test(pickupPhone.trim())))
    return setError("Для самовывоза укажите имя получателя и действительный телефон.");
  if(!quote||quoteLoading||quote.method!==method||!quote.canPlace)
    return setError("Дождитесь проверки корзины. Если товары недоступны, измените заказ.");
  if(!requestKey.current)requestKey.current=crypto.randomUUID();
  setBusy(true);setError("");
  try{
   const result=await api<{id:string}>("/api/account/orders",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({addressId:method==="courier"?addressId:undefined,
      pickupContact:method==="pickup"?{recipient:pickupName.trim(),phone:pickupPhone.trim()}:undefined,
      deliveryMethod:method,note,key:requestKey.current})
   });
   setSuccess(result.id);requestKey.current=null;localStorage.removeItem(KEY);localStorage.removeItem(VARIANT_KEY);setCart([]);
  }catch(e){setError(e instanceof Error?e.message:"Не удалось создать заказ.");}
  finally{setBusy(false);}
 }
 const available=cart.every(x=>x.available&&x.stock>=x.quantity);
 const total=cart.reduce((sum,i)=>sum+Number(i.priceMinor)*i.quantity,0);
 const serverTotal=quote?Number(quote.subtotalMinor):total;
 const canPlace=!!quote&&quote.method===method&&quote.canPlace&&!quoteLoading&&!quoteError&&
   !busy&&available&&cart.length>0&&(method==="courier"?!!addressId:
      pickupName.trim().length>=2&&/^[+0-9()\s-]{6,32}$/.test(pickupPhone.trim()));
 return <main className="container buyer-page">
  <div className="buyer-crumb"><Link href="/">Vira Shop</Link> / Оформление</div>
  <div className="buyer-heading"><h1>Оформление заказа</h1><Link href="/" className="buyer-link">← В магазин</Link></div>
  {error&&<p className="buyer-error" role="alert">{error}</p>}
  {loading?<div className="buyer-panel">Загрузка корзины…</div>:!customer?
   <section className="buyer-panel"><h2>Войдите в аккаунт</h2>
    <p>Для оформления заказа нужен аккаунт. Данные хранятся в локальной базе магазина.</p>
    <Link href="/account" className="buyer-link">Войти или зарегистрироваться →</Link></section>:
   success?<section className="buyer-panel buyer-confirmed"><h2>Заявка № {success} создана</h2>
     <p>Заявка записана в базу, товары зарезервированы. Оплата не проводилась.</p>
     <p>Способ получения: {method==="pickup"?"самовывоз":"доставка по адресу"}.
       {method==="courier"?" Стоимость доставки уточняется у продавца.":" Пункт выдачи будет согласован отдельно."}</p>
     <p>Следить за статусом можно в личном кабинете.</p>
     <Link href="/account" className="buyer-primary">Посмотреть заказы</Link></section>:
   <div className="buyer-layout">
    <section className="buyer-panel"><h2>Товары в корзине</h2>
     {cart.length?cart.map(p=><div className="checkout-line" key={p.id+":"+(p.variantId??"")}>
      {p.image?<img src={p.image} alt=""/>:<span>📦</span>}
      <div className="checkout-line-title"><strong>{p.title}</strong>
       <small>{money(Number(p.priceMinor))} / шт.</small>
       {p.variantId&&<small>Артикул: {p.variantId}</small>}
       {!!p.selection?.length&&<small>{p.selection.map(s=>s.name+": "+s.value).join(" · ")}</small>}
       {!p.available||p.stock<p.quantity?<em>Товар недоступен или его недостаточно</em>:null}</div>
      <div className="checkout-quantity">
       <button disabled={busy} onClick={()=>void change(p.id,p.variantId,p.quantity-1)}>−</button>
       <span>{p.quantity}</span>
       <button disabled={busy||p.quantity>=99||p.quantity>=p.stock} onClick={()=>void change(p.id,p.variantId,p.quantity+1)}>+</button></div>
      <strong>{money(Number(p.priceMinor)*p.quantity)}</strong>
     </div>):<div className="buyer-muted"><p>Корзина пуста.</p><Link href="/" className="buyer-link">Выбрать товары →</Link></div>}
    </section>
    <section className="buyer-panel checkout-side">
     <h2>Получение и оформление</h2>
     <fieldset className="checkout-delivery-methods">
      <legend>Как получить заказ?</legend>
      <label className={method==="pickup"?"selected":""}>
        <input type="radio" name="deliveryMethod" value="pickup" checked={method==="pickup"}
          onChange={()=>setMethod("pickup")} disabled={busy}/>
        <span><strong>Самовывоз</strong><small>0 ₽. Место и время выдачи сообщит продавец.</small></span>
      </label>
      <label className={method==="courier"?"selected":""}>
        <input type="radio" name="deliveryMethod" value="courier" checked={method==="courier"}
          onChange={()=>setMethod("courier")} disabled={busy}/>
        <span><strong>Доставка по адресу</strong>
          <small>Стоимость и срок продавец уточнит при подтверждении заявки.</small></span>
      </label>
     </fieldset>
     {method==="courier"?<>
       <label>Адрес доставки<select value={addressId} disabled={busy} onChange={e=>setAddressId(e.target.value)}>
        <option value="">Выберите адрес</option>
        {addresses.map(a=><option key={a.id} value={a.id}>{a.city}, {a.street}, д. {a.building}</option>)}
       </select></label>
       <Link href="/account" className="buyer-link">Добавить или изменить адрес →</Link>
     </>:<div className="checkout-pickup-contact">
       <p className="buyer-muted">Адрес выдачи согласуется отдельно. Укажите получателя — полный адрес доставки не требуется.</p>
       <label>Имя получателя<input maxLength={120} autoComplete="name" value={pickupName}
         onChange={e=>setPickupName(e.target.value)} placeholder="Имя и фамилия" disabled={busy}/></label>
       <label>Телефон получателя<input type="tel" maxLength={32} autoComplete="tel" value={pickupPhone}
         onChange={e=>setPickupPhone(e.target.value)} placeholder="+7 999 123-45-67" disabled={busy}/></label>
     </div>}
     <label>Комментарий к заявке<textarea rows={3} maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
     <div className="checkout-total"><span>Товары</span><strong>{money(serverTotal)}</strong></div>
     <div className="checkout-total checkout-delivery-line"><span>Получение</span>
       <strong>{method==="pickup"?"Бесплатно":"Стоимость уточняется"}</strong></div>
     <div className="checkout-total checkout-order-total"><span>{method==="pickup"?"Итого":"Сумма товаров"}</span>
       <strong>{money(serverTotal)}</strong></div>
     {method==="courier"&&<p className="checkout-unquoted">Итог с доставкой пока неизвестен.
       Перед оплатой продавец должен согласовать с вами полную стоимость.</p>}
     {quoteLoading&&<p className="buyer-muted" role="status">Проверяем цены и наличие на сервере…</p>}
     {quoteError&&<p className="buyer-error" role="alert">{quoteError}</p>}
     {quote&&!quote.canPlace&&<p className="buyer-error" role="alert">
       Некоторые товары уже недоступны. Проверьте корзину.</p>}
     <button className="buyer-primary" disabled={!canPlace}
       onClick={()=>void create()}>{busy?"Оформляем…":"Создать заявку без оплаты"}</button>
     <p className="buyer-muted">Платёжная система не подключена: это заявка без онлайн-оплаты.
       Цены и остатки перепроверяются при сохранении заказа. Деньги не списываются.</p>
    </section>
   </div>}
 </main>;
}
