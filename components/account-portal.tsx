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
 const [section,setSection]=useState<"orders"|"addresses"|"profile"|"security">("orders");
 const [addressOpen,setAddressOpen]=useState(false),[editAddressId,setEditAddressId]=useState<string|null>(null);
 const [profileName,setProfileName]=useState("");
 const [oldPassword,setOldPassword]=useState(""),[nextPassword,setNextPassword]=useState(""),[repeatPassword,setRepeatPassword]=useState("");
 const [address,setAddress]=useState({...EMPTY}),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function refresh(){
  const [session,a,o]=await Promise.all([
   api<{customer:Customer|null}>("/api/account/session"),
   api<{items:Address[]}>("/api/account/addresses"),
   api<{items:Order[]}>("/api/account/orders")
  ]);
  setCustomer(session.customer);if(session.customer)setProfileName(session.customer.name);setAddresses(a.items);setOrders(o.items);
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
   await api("/api/account/addresses",{method:editAddressId?"PUT":"POST",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({...address,...(editAddressId?{id:editAddressId}:{})})});
   setAddress({...EMPTY});setAddressOpen(false);setEditAddressId(null);
   await refresh();setNotice("Адрес сохранён.");
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
 async function saveProfile(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");setNotice("");
  try{
   const result=await api<{customer:Customer}>("/api/account/profile",{method:"PATCH",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({name:profileName})});
   setCustomer(result.customer);setNotice("Имя обновлено.");
  }catch(e){setError(e instanceof Error?e.message:"Не удалось изменить профиль.");}
  finally{setBusy(false);}
 }
 async function changePassword(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError("");setNotice("");
  if(nextPassword!==repeatPassword){setError("Новые пароли не совпадают.");return;}
  setBusy(true);
  try{
   await api("/api/account/password",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({currentPassword:oldPassword,newPassword:nextPassword})});
   setOldPassword("");setNextPassword("");setRepeatPassword("");
   setCustomer(null);setAddresses([]);setOrders([]);setTab("login");
   setNotice("Пароль обновлён. Для безопасности войдите заново.");
  }catch(e){setError(e instanceof Error?e.message:"Не удалось изменить пароль.");}
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
      placeholder={tab==="register"?(verificationOn?"Минимум 8 символов":"Минимум 6 символов"):"Ваш пароль"} value={password} onChange={e=>setPassword(e.target.value)}/></label>
     {tab==="register"&&<label>Повторите пароль<input required type="password" minLength={verificationOn?8:6} maxLength={256}
      autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label>}
     <button type="submit" disabled={busy} className="buyer-primary">{busy?"Обработка…":tab==="register"?"Продолжить":"Войти"}</button>
    </form>
   </section>:
   <>
    <section className="buyer-profile buyer-panel"><div><h2>{customer.name}</h2><p>{customer.email}</p></div>
      <button type="button" disabled={busy} onClick={()=>void logout()}>Выйти</button></section>
    <nav className="buyer-tabs buyer-dashboard-tabs" aria-label="Разделы кабинета">
     {([["orders","Мои заказы"],["addresses","Адреса"],["profile","Личные данные"],["security","Безопасность"]] as const).map(([key,label])=>
      <button type="button" key={key} className={section===key?"selected":""}
       onClick={()=>{setSection(key);setError("");setNotice("");}}>{label}</button>)}
    </nav>
    <div className="buyer-layout buyer-layout-single">
     {section==="addresses"&&<section className="buyer-panel"><div className="buyer-panel-head"><h2>Мои адреса</h2><span>{addresses.length}</span></div>
      {addresses.length?addresses.map(a=><div className="buyer-address" key={a.id}>
       <div><strong>{a.recipient} · {a.phone}</strong>
        <p>{a.city}, {a.street}, д. {a.building}{a.apartment?", кв. "+a.apartment:""}</p></div>
       <div className="buyer-address-actions"><button type="button" disabled={busy} onClick={()=>{setAddress({...a});setEditAddressId(a.id);setAddressOpen(true);}}>Изменить</button>
       <button type="button" disabled={busy} onClick={()=>void remove(a.id)}>Удалить</button></div></div>):
       <p className="buyer-muted">Сохранённых адресов пока нет.</p>}
      {!addressOpen?<button type="button" className="buyer-primary" disabled={busy} onClick={()=>{setEditAddressId(null);setAddress({...EMPTY});setAddressOpen(true);}}>+ Добавить адрес</button>:<>
      <h3>{editAddressId?"Изменить адрес":"Новый адрес"}</h3>
      <form className="buyer-form buyer-address-form" onSubmit={e=>void saveAddress(e)}>
       {([["recipient","ФИО получателя"],["phone","Телефон"],["city","Город"],["street","Улица"],["building","Дом"],["apartment","Квартира"],["comment","Комментарий"]] as const).map(([key,label])=>
        <label key={key}>{label}<input required={!["apartment","comment"].includes(key)}
         maxLength={key==="comment"?500:key==="street"?160:key==="recipient"||key==="city"?120:32}
         value={address[key]} onChange={e=>setAddress({...address,[key]:e.target.value})}/></label>)}
       <button className="buyer-primary" disabled={busy} type="submit">Сохранить адрес</button>
       <button type="button" disabled={busy} onClick={()=>{setEditAddressId(null);setAddressOpen(false);}}>Отмена</button>
      </form></>}
     </section>}
     {section==="orders"&&<section className="buyer-panel"><div className="buyer-panel-head"><h2>Мои заказы</h2>
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
     </section>}
     {section==="profile"&&<section className="buyer-panel"><h2>Личные данные</h2>
      <form className="buyer-form" onSubmit={e=>void saveProfile(e)}>
       <label>Имя<input required minLength={2} maxLength={120} autoComplete="name"
        value={profileName} onChange={e=>setProfileName(e.target.value)}/></label>
       <label>Email<input value={customer.email} disabled readOnly/></label>
       <p className="buyer-muted">Смена email будет доступна после подтверждения нового адреса.</p>
       <button type="submit" className="buyer-primary" disabled={busy}>Сохранить</button>
      </form>
     </section>}
     {section==="security"&&<section className="buyer-panel"><h2>Безопасность</h2>
      <p className="buyer-muted">После смены пароля все устройства выйдут из аккаунта.</p>
      <form className="buyer-form" onSubmit={e=>void changePassword(e)}>
       <label>Текущий пароль<input type="password" required minLength={6} autoComplete="current-password" value={oldPassword} onChange={e=>setOldPassword(e.target.value)}/></label>
       <label>Новый пароль<input type="password" required minLength={8} autoComplete="new-password" value={nextPassword} onChange={e=>setNextPassword(e.target.value)}/></label>
       <label>Повтор нового пароля<input type="password" required minLength={8} autoComplete="new-password" value={repeatPassword} onChange={e=>setRepeatPassword(e.target.value)}/></label>
       <button type="submit" className="buyer-primary" disabled={busy}>Сменить пароль</button>
      </form>
     </section>}
    </div>
   </>}
 </main>;
}
