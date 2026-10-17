"use client";
import {useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
type Customer={id:string;name:string;email:string};
type Address={id:string;recipient:string;phone:string;city:string;street:string;building:string;apartment:string;comment:string};
type Item={id:string;title:string;quantity:number;unitMinor:string;lineMinor:string};
type Order={id:string;status:string;paymentStatus:string;totalMinor:string;createdAt:string;address:Address;items:Item[]};
const EMPTY={recipient:"",phone:"",city:"",street:"",building:"",apartment:"",comment:""};
const statuses:Record<string,string>={new:"Новая",confirmed:"Подтверждена",packing:"Собирается",shipped:"Отправлена",completed:"Завершена",cancelled:"Отменена"};
const money=(v:string)=>new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB"}).format(Number(v)/100);
async function api<T>(path:string,options?:RequestInit):Promise<T>{
 const res=await fetch(path,{cache:"no-store",...options});
 const data=await res.json() as T&{error?:string};
 if(!res.ok)throw Error(data.error||"Ошибка сервера.");
 return data;
}
export default function AccountPortal(){
 const [customer,setCustomer]=useState<Customer|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [tab,setTab]=useState<"login"|"register">("login");
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[name,setName]=useState("");
 const [addresses,setAddresses]=useState<Address[]>([]),[orders,setOrders]=useState<Order[]>([]);
 const [address,setAddress]=useState({...EMPTY}),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function refresh(){
  const [session,a,o]=await Promise.all([
   api<{customer:Customer|null}>("/api/account/session"),
   api<{items:Address[]}>("/api/account/addresses"),
   api<{items:Order[]}>("/api/account/orders")
  ]);
  setCustomer(session.customer);setAddresses(a.items);setOrders(o.items);
 }
 useEffect(()=>{
  let active=true;
  api<{customer:Customer|null}>("/api/account/session").then(async x=>{
   if(!active)return;
   setCustomer(x.customer);
   if(x.customer)await refresh();
  }).catch(e=>{if(active)setError(String(e.message))}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");setNotice("");
  try{
   if(tab==="register")await api("/api/account/register",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({name,email,password})});
   else await api("/api/account/session",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email,password})});
   setPassword("");await refresh();setNotice("Вход выполнен. Теперь можно оформлять заказы.");
  }catch(e){setError(e instanceof Error?e.message:"Ошибка входа.");}
  finally{setBusy(false);}
 }
 async function saveAddress(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");setNotice("");
  try{
   await api("/api/account/addresses",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(address)});
   setAddress({...EMPTY});await refresh();setNotice("Адрес сохранён.");
  }catch(e){setError(e instanceof Error?e.message:"Ошибка адреса.");}
  finally{setBusy(false);}
 }
 async function remove(id:string){
  if(!confirm("Удалить сохранённый адрес? Уже оформленные заказы сохранят свои адреса."))return;
  setBusy(true);setError("");
  try{await api("/api/account/addresses",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});await refresh();}
  catch(e){setError(e instanceof Error?e.message:"Ошибка.");}
  finally{setBusy(false);}
 }
 async function logout(){
  setBusy(true);try{
   await api("/api/account/session",{method:"DELETE"});
   setCustomer(null);setAddresses([]);setOrders([]);setNotice("");setError("");
  }catch(e){setError(e instanceof Error?e.message:"Ошибка выхода.");}
  finally{setBusy(false);}
 }
 return <main className="container buyer-page">
  <div className="buyer-crumb"><Link href="/">Vira Shop</Link> / Личный кабинет</div>
  <div className="buyer-heading"><div><span className="kicker">VIRA SHOP</span><h1>Личный кабинет</h1></div>
   <Link href="/" className="buyer-link">← В магазин</Link></div>
  {error&&<p className="buyer-error" role="alert">{error}</p>}
  {notice&&<p className="buyer-notice" role="status">{notice}</p>}
  {loading?<div className="buyer-panel">Загрузка профиля…</div>:!customer?
   <section className="buyer-auth buyer-panel">
    <div className="buyer-tabs"><button className={tab==="login"?"selected":""} onClick={()=>setTab("login")}>Войти</button>
     <button className={tab==="register"?"selected":""} onClick={()=>setTab("register")}>Регистрация</button></div>
    <h2>{tab==="login"?"Вход в аккаунт":"Создать аккаунт"}</h2>
    <p>Данные хранятся в вашей локальной PostgreSQL. Пока это тестовая версия без проверки email.</p>
    <form onSubmit={e=>void submit(e)} className="buyer-form">
     {tab==="register"&&<label>Имя<input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>}
     <label>Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
     <label>Пароль (от 12 символов)<input required type="password" minLength={12} maxLength={256} autoComplete={tab==="register"?"new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)}/></label>
     <button type="submit" disabled={busy} className="buyer-primary">{busy?"Обработка…":tab==="register"?"Зарегистрироваться":"Войти"}</button>
    </form>
   </section>:
   <>
    <section className="buyer-profile buyer-panel"><div><h2>{customer.name}</h2><p>{customer.email}</p></div>
      <button type="button" disabled={busy} onClick={()=>void logout()}>Выйти</button></section>
    <div className="buyer-layout">
     <section className="buyer-panel"><div className="buyer-panel-head"><h2>Мои адреса</h2><span>{addresses.length}</span></div>
      {addresses.length?addresses.map(a=><div className="buyer-address" key={a.id}>
       <div><strong>{a.recipient} · {a.phone}</strong>
        <p>{a.city}, {a.street}, д. {a.building}{a.apartment?", кв. "+a.apartment:""}</p></div>
       <button type="button" disabled={busy} onClick={()=>void remove(a.id)}>Удалить</button></div>):
       <p className="buyer-muted">Сохранённых адресов пока нет.</p>}
      <h3>Добавить адрес</h3>
      <form className="buyer-form buyer-address-form" onSubmit={e=>void saveAddress(e)}>
       {([["recipient","ФИО получателя"],["phone","Телефон"],["city","Город"],["street","Улица"],["building","Дом"],["apartment","Квартира"],["comment","Комментарий"]] as const).map(([key,label])=>
        <label key={key}>{label}<input required={!["apartment","comment"].includes(key)}
         maxLength={key==="comment"?500:key==="street"?160:key==="recipient"||key==="city"?120:32}
         value={address[key]} onChange={e=>setAddress({...address,[key]:e.target.value})}/></label>)}
       <button className="buyer-primary" disabled={busy} type="submit">Сохранить адрес</button>
      </form>
     </section>
     <section className="buyer-panel"><div className="buyer-panel-head"><h2>Мои заказы</h2>
      <Link href="/checkout" className="buyer-link">Перейти к оформлению →</Link></div>
      {orders.length?orders.map(o=><article className="buyer-order" key={o.id}>
       <div className="buyer-order-head"><strong>Заказ № {o.id}</strong><span>{statuses[o.status]||o.status}</span></div>
       <small>{new Date(o.createdAt).toLocaleString("ru-RU")} · Оплата не подключена</small>
       <div className="buyer-order-items">{o.items.map((i,k)=><p key={k}>{i.title} × {i.quantity} — {money(i.lineMinor)}</p>)}</div>
       <strong>Итого: {money(o.totalMinor)}</strong>
      </article>):
      <div className="buyer-muted"><p>Пока нет заказов.</p><Link href="/checkout" className="buyer-link">Оформить первый заказ →</Link></div>}
     </section>
    </div>
   </>}
 </main>;
}
