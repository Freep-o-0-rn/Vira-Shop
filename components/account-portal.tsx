"use client";
import {useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import {DELIVERY_LABELS,LOGISTICS_LABELS,type DeliveryMethod,type LogisticsStatus} from "@/lib/logistics";
type Customer={id:string;name:string;email:string};
type Address={id:string;recipient:string;phone:string;city:string;street:string;building:string;apartment:string;comment:string};
type Item={id:string;variantId:string|null;selection:{name:string;value:string}[];title:string;quantity:number;unitMinor:string;lineMinor:string};
type Order={id:string;status:string;paymentStatus:string;paymentMethod:string;
  deliveryMethod:DeliveryMethod;logisticsStatus:LogisticsStatus;carrierCode:string|null;
  trackingNumber:string|null;deliveryPoint:{name:string;address:string}|null;
  deliveryFeeMinor:string|null;subtotalMinor:string;totalMinor:string;
  createdAt:string;address:Address;items:Item[]};
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
 const [confirmPassword,setConfirmPassword]=useState("");
 const [verificationOn,setVerificationOn]=useState(false);
 const [verificationEmail,setVerificationEmail]=useState(""),[verificationCode,setVerificationCode]=useState("");
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
  api<{customer:Customer|null;verificationEnabled?:boolean}>("/api/account/session").then(async x=>{
   if(!active)return;
   setCustomer(x.customer);setVerificationOn(Boolean(x.verificationEnabled));
   if(x.customer)await refresh();
  }).catch(e=>{if(active)setError(String(e.message))}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");setNotice("");
  try{
   if(tab==="register"){
    if(password!==confirmPassword)throw Error("Пароли не совпадают.");
    const result=await api<{verificationRequired?:boolean;email?:string}>("/api/account/register",{
     method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({name,email,password})});
    if(result.verificationRequired){
     setVerificationEmail(result.email||email.trim().toLowerCase());
     setPassword("");setConfirmPassword("");
     setNotice("Код отправлен на электронную почту и действует 10 минут.");
     return;
    }
   }else await api("/api/account/session",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email,password})});
   setPassword("");setConfirmPassword("");await refresh();setNotice("Вход выполнен.");
  }catch(e){setError(e instanceof Error?e.message:"Ошибка входа.");}
  finally{setBusy(false);}
 }
 async function verifyEmail(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");setNotice("");
  try{
   await api("/api/account/verify",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email:verificationEmail,code:verificationCode})});
   setVerificationEmail("");setVerificationCode("");await refresh();
   setNotice("Почта подтверждена, аккаунт создан.");
  }catch(e){setError(e instanceof Error?e.message:"Ошибка подтверждения.");}
  finally{setBusy(false);}
 }
 async function resendCode(){
  setBusy(true);setError("");setNotice("");
  try{
   await api("/api/account/resend",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email:verificationEmail})});
   setNotice("Новое письмо отправлено. Код действует 10 минут.");
  }catch(e){setError(e instanceof Error?e.message:"Не удалось отправить письмо.");}
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
   verificationEmail?
   <section className="buyer-auth buyer-panel">
    <h2>Подтвердите почту</h2>
    <p className="buyer-muted">Введите код из письма на <strong>{verificationEmail}</strong>. Он действителен 10 минут.</p>
    <form className="buyer-form" onSubmit={e=>void verifyEmail(e)}>
     <label>Шестизначный код<input required autoComplete="one-time-code" inputMode="numeric"
      pattern="[0-9]{6}" maxLength={6} placeholder="000000"
      value={verificationCode} onChange={e=>setVerificationCode(e.target.value.replace(/\D/g,"").slice(0,6))}/></label>
     <button type="submit" className="buyer-primary" disabled={busy||verificationCode.length!==6}>
      {busy?"Проверяем…":"Подтвердить email"}</button>
    </form>
    <div className="buyer-auth-actions">
     <button type="button" disabled={busy} onClick={()=>void resendCode()}>Отправить код повторно</button>
     <button type="button" disabled={busy} onClick={()=>{setVerificationEmail("");setVerificationCode("");setError("");setNotice("");}}>Изменить email</button>
    </div>
   </section>:
   <section className="buyer-auth buyer-panel">
    <div className="buyer-tabs"><button type="button" className={tab==="login"?"selected":""} onClick={()=>{setTab("login");setError("");}}>Войти</button>
     <button type="button" className={tab==="register"?"selected":""} onClick={()=>{setTab("register");setError("");}}>Регистрация</button></div>
    <h2>{tab==="login"?"С возвращением":"Создать аккаунт"}</h2>
    <p className="buyer-muted">{tab==="register"&&verificationOn?"После заполнения формы подтвердите email кодом из письма.":
     tab==="register"?"Для покупок и отслеживания заказов.":"Введите email и пароль, чтобы увидеть свои заказы."}</p>
    <form onSubmit={e=>void submit(e)} className="buyer-form">
     {tab==="register"&&<label>Имя<input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>}
     <label>Email<input required type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={e=>setEmail(e.target.value)}/></label>
     <label>Пароль<input required type="password" minLength={tab==="register"&&verificationOn?8:6} maxLength={256}
      autoComplete={tab==="register"?"new-password":"current-password"}
      placeholder={tab==="register"?"Минимум 8 символов":"Ваш пароль"} value={password} onChange={e=>setPassword(e.target.value)}/></label>
     {tab==="register"&&<label>Повторите пароль<input required type="password" minLength={verificationOn?8:6} maxLength={256}
      autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label>}
     <button type="submit" disabled={busy} className="buyer-primary">{busy?"Обработка…":tab==="register"?"Продолжить":"Войти"}</button>
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
       <p className="order-delivery-description">
         <strong>{DELIVERY_LABELS[o.deliveryMethod]}</strong>
         {" · "+o.address.recipient+", "+o.address.phone}
         {o.deliveryMethod==="pickup"?" · Точка выдачи согласуется отдельно":
         o.deliveryMethod==="ozon_pvz"&&o.deliveryPoint?" · "+o.deliveryPoint.address:
          " · "+[o.address.city,o.address.street,"д. "+o.address.building].filter(Boolean).join(", ")}
       </p>
       <p className="order-delivery-description">
        Статус получения: <strong>{LOGISTICS_LABELS[o.logisticsStatus]??"Уточняется"}</strong>
        {o.trackingNumber&&<span> · Трек-номер: {o.trackingNumber}</span>}
       </p>
       <div className="buyer-order-items">{o.items.map((i,k)=><p key={k}>{i.title}{i.variantId?" · арт. "+i.variantId:""}{i.selection?.length?" ("+i.selection.map(s=>s.value).join(" / ")+")":""} × {i.quantity} — {money(i.lineMinor)}</p>)}</div>
       <div><strong>{o.deliveryMethod==="pickup"?"Итого: ":"Товары: "}{money(o.totalMinor)}</strong>
         {o.deliveryFeeMinor===null?<p className="buyer-muted">Доставка: стоимость уточняется</p>:
           <p className="buyer-muted">Самовывоз: бесплатно</p>}
         <small>Статус оплаты: не оплачено · Платёжная система не подключена</small>
       </div>
      </article>):
      <div className="buyer-muted"><p>Пока нет заказов.</p><Link href="/checkout" className="buyer-link">Оформить первый заказ →</Link></div>}
     </section>
    </div>
   </>}
 </main>;
}
