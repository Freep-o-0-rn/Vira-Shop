"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
type Address={id:string;recipient:string;phone:string;city:string;street:string;building:string;apartment:string};
type CartItem={id:string;variantId:string|null;selection:{name:string;value:string}[];quantity:number;title:string;image:string;priceMinor:string;stock:number;available:boolean};
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
  if(!addressId)return setError("Сначала добавьте адрес в личном кабинете.");
  if(!requestKey.current)requestKey.current=crypto.randomUUID();
  setBusy(true);setError("");
  try{
   const result=await api<{id:string}>("/api/account/orders",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({addressId,note,key:requestKey.current})
   });
   setSuccess(result.id);requestKey.current=null;localStorage.removeItem(KEY);localStorage.removeItem(VARIANT_KEY);setCart([]);
  }catch(e){setError(e instanceof Error?e.message:"Не удалось создать заказ.");}
  finally{setBusy(false);}
 }
 const available=cart.every(x=>x.available&&x.stock>=x.quantity);
 const total=cart.reduce((sum,i)=>sum+Number(i.priceMinor)*i.quantity,0);
 return <main className="container buyer-page">
  <div className="buyer-crumb"><Link href="/">Vira Shop</Link> / Оформление</div>
  <div className="buyer-heading"><h1>Оформление заявки</h1><Link href="/" className="buyer-link">← В магазин</Link></div>
  {error&&<p className="buyer-error" role="alert">{error}</p>}
  {loading?<div className="buyer-panel">Загрузка корзины…</div>:!customer?
   <section className="buyer-panel"><h2>Войдите в аккаунт</h2>
    <p>Для оформления заказа требуется регистрация и PostgreSQL.</p>
    <Link href="/account" className="buyer-link">Войти или зарегистрироваться →</Link></section>:
   success?<section className="buyer-panel buyer-confirmed"><h2>Заявка № {success} создана</h2>
     <p>Товары зарезервированы в базе. Оплата онлайн не подключена — никаких списаний не было.</p>
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
     <h2>Доставка и итог</h2>
     <p className="buyer-muted">Это тестовая заявка. Стоимость и сроки доставки пока не рассчитываются.</p>
     <label>Адрес получателя<select value={addressId} onChange={e=>setAddressId(e.target.value)}>
      <option value="">Выберите адрес</option>{addresses.map(a=><option key={a.id} value={a.id}>{a.city}, {a.street}, д. {a.building}</option>)}
     </select></label>
     <Link href="/account" className="buyer-link">Добавить или изменить адрес →</Link>
     <label>Комментарий к заявке<textarea rows={3} maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
     <div className="checkout-total"><span>Товары (без доставки)</span><strong>{money(total)}</strong></div>
     <button className="buyer-primary" disabled={busy||!available||!cart.length||!addressId}
       onClick={()=>void create()}>{busy?"Оформляем…":"Создать заявку без оплаты"}</button>
     <p className="buyer-muted">Перед созданием заявки цены и остатки будут проверены сервером. Деньги не списываются.</p>
    </section>
   </div>}
 </main>;
}
