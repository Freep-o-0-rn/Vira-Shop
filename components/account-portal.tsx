"use client";
import {normalizeVerificationCode} from "@/lib/verification-code";
import OtpCodeInput from "@/components/otp-code-input";
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
const PENDING_KEY="vira_shop_pending_signup_v1";
type PendingSignup={email:string;resumeToken:string};
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
 const [signupResumeToken,setSignupResumeToken]=useState("");
 const [signupExpiresAt,setSignupExpiresAt]=useState(0),[codeExpiresAt,setCodeExpiresAt]=useState(0);
 const [clock,setClock]=useState(0);
 const [addresses,setAddresses]=useState<Address[]>([]),[orders,setOrders]=useState<Order[]>([]);
 const [section,setSection]=useState<"orders"|"addresses"|"profile"|"security">("orders");
 const [addressOpen,setAddressOpen]=useState(false),[editAddressId,setEditAddressId]=useState<string|null>(null);
 const [profileName,setProfileName]=useState("");
 const [oldPassword,setOldPassword]=useState(""),[nextPassword,setNextPassword]=useState(""),[repeatPassword,setRepeatPassword]=useState("");
 const [deletionStarted,setDeletionStarted]=useState(false),[deletionCode,setDeletionCode]=useState("");
 const [deletionAgreed,setDeletionAgreed]=useState(false);
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
   if(x.customer){localStorage.removeItem(PENDING_KEY);await refresh();}
   else if(x.verificationEnabled){
    try{
     const pending=JSON.parse(localStorage.getItem(PENDING_KEY)||"null") as PendingSignup|null;
     if(pending && typeof pending.email==="string" && /^[a-f0-9]{64}$/.test(pending.resumeToken)){
      const result=await api<{pending:boolean;email?:string;registrationExpiresInSeconds?:number;codeExpiresInSeconds?:number}>(
       "/api/account/pending",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(pending)});
      if(!active)return;
      if(result.pending&&((result.registrationExpiresInSeconds||0)>0||(result.codeExpiresInSeconds||0)>0)){
       setVerificationEmail(result.email||pending.email);
       setEmail(result.email||pending.email);
       setSignupResumeToken(pending.resumeToken);
       setVerificationCode("");
       setSignupExpiresAt(Date.now()+result.registrationExpiresInSeconds*1000);
       setCodeExpiresAt(Date.now()+(result.codeExpiresInSeconds||0)*1000);
      }else localStorage.removeItem(PENDING_KEY);
     }
    }catch{localStorage.removeItem(PENDING_KEY);}
   }
  }).catch(e=>{if(active)setError(String(e.message))}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[]);
 useEffect(()=>{
  if(!verificationEmail)return;
  const timer=setInterval(()=>{
   const now=Date.now();
   setClock(now);
   if(signupExpiresAt&&now>=signupExpiresAt&&now>=codeExpiresAt){
    localStorage.removeItem(PENDING_KEY);
    setVerificationEmail("");setVerificationCode("");setSignupResumeToken("");
    setSignupExpiresAt(0);setCodeExpiresAt(0);
    setTab("register");
    setNotice("30 минут истекли. Заполните форму регистрации заново.");
   }
  },1000);
  return()=>clearInterval(timer);
 },[verificationEmail,signupExpiresAt,codeExpiresAt]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");setNotice("");
  try{
   if(tab==="register"){
    if(password!==confirmPassword)throw Error("Пароли не совпадают.");
    const result=await api<{verificationRequired?:boolean;email?:string;resumeToken?:string;
      registrationExpiresInSeconds?:number;expiresInSeconds?:number}>("/api/account/register",{
     method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({name,email,password})});
    if(result.verificationRequired){
     const pendingEmail=result.email||email.trim().toLowerCase();
     setVerificationEmail(pendingEmail);
     setSignupResumeToken(result.resumeToken||"");
     setSignupExpiresAt(Date.now()+(result.registrationExpiresInSeconds||1800)*1000);
     setCodeExpiresAt(Date.now()+(result.expiresInSeconds||600)*1000);
     if(result.resumeToken)localStorage.setItem(PENDING_KEY,JSON.stringify({
      email:pendingEmail,resumeToken:result.resumeToken
     } satisfies PendingSignup));
     setVerificationCode("");
     setPassword("");setConfirmPassword("");
     setNotice("Код отправлен на электронную почту и действует 10 минут.");
     return;
    }
   }else await api("/api/account/session",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email,password})});
   setDeletionStarted(false);setDeletionCode("");setDeletionAgreed(false);
   setPassword("");setConfirmPassword("");await refresh();setNotice("Вход выполнен.");
  }catch(e){setError(e instanceof Error?e.message:"Ошибка входа.");}
  finally{setBusy(false);}
 }
 async function verifyEmail(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");setNotice("");
  try{
   await api("/api/account/verify",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email:verificationEmail,code:verificationCode})});
   localStorage.removeItem(PENDING_KEY);
   setVerificationEmail("");setVerificationCode("");setSignupResumeToken("");
   setSignupExpiresAt(0);setCodeExpiresAt(0);await refresh();
   setNotice("Почта подтверждена, аккаунт создан.");
  }catch(e){setError(e instanceof Error?e.message:"Ошибка подтверждения.");}
  finally{setBusy(false);}
 }
 async function resendCode(){
  setBusy(true);setError("");setNotice("");
  try{
   const result=await api<{expiresInSeconds:number;registrationExpiresInSeconds:number}>(
    "/api/account/resend",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email:verificationEmail,resumeToken:signupResumeToken})});
   setVerificationCode("");
   setCodeExpiresAt(Date.now()+result.expiresInSeconds*1000);
   setSignupExpiresAt(Date.now()+result.registrationExpiresInSeconds*1000);
   setNotice("Новый код отправлен. Проверьте почту и папку «Спам».");
  }catch(e){setError(e instanceof Error?e.message:"Не удалось отправить письмо.");}
  finally{setBusy(false);}
 }
 function changeSignupEmail(){
  // Leave the temporary signup to expire server-side. It can no longer be
  // resumed in this browser once a new email is selected.
  localStorage.removeItem(PENDING_KEY);
  setVerificationEmail("");setVerificationCode("");setSignupResumeToken("");
  setSignupExpiresAt(0);setCodeExpiresAt(0);
  setTab("register");setNotice("Укажите другой email для регистрации.");setError("");
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
   setDeletionStarted(false);setDeletionCode("");setDeletionAgreed(false);
   setNotice("Пароль обновлён. Для безопасности войдите заново.");
  }catch(e){setError(e instanceof Error?e.message:"Не удалось изменить пароль.");}
  finally{setBusy(false);}
 }
 async function requestAccountDeletion(){
  setBusy(true);setError("");setNotice("");
  try{
   await api("/api/account/delete/request",{method:"POST"});
   setDeletionCode("");setDeletionAgreed(false);setDeletionStarted(true);
   setNotice("Письмо с кодом отправлено на "+customer?.email+". Проверьте также папку «Спам».");
  }catch(e){setError(e instanceof Error?e.message:"Не удалось отправить письмо.");}
  finally{setBusy(false);}
 }
 async function confirmAccountDeletion(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");setNotice("");
  try{
   await api("/api/account/delete/confirm",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({code:deletionCode,confirm:deletionAgreed})});
   setDeletionStarted(false);setDeletionCode("");setDeletionAgreed(false);
   setCustomer(null);setAddresses([]);setOrders([]);setTab("login");
   setSection("orders");
   setNotice("Ваш аккаунт удалён. История завершённых заказов остаётся в учётных записях магазина.");
  }catch(e){setError(e instanceof Error?e.message:"Не удалось удалить аккаунт.");}
  finally{setBusy(false);}
 }
 async function logout(){
  setBusy(true);try{
   await api("/api/account/session",{method:"DELETE"});
   setCustomer(null);setAddresses([]);setOrders([]);setNotice("");setError("");
   setDeletionStarted(false);setDeletionCode("");setDeletionAgreed(false);
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
    <p className="buyer-muted">Мы отправили код на <strong>{verificationEmail}</strong>.
     Новый код можно запросить в течение 30 минут с начала регистрации. Последний код действует полные 10 минут, даже если 30 минут уже прошли.</p>
    <p className="buyer-otp-timer">{codeExpiresAt>clock
     ?"Код действует ещё "+Math.max(0,Math.ceil((codeExpiresAt-Date.now())/60000))+" мин."
     :"Код истёк. Запросите новый."}</p>
    <form className="buyer-form" onSubmit={e=>void verifyEmail(e)}>
     <label htmlFor="account-signup-code">Шестизначный код</label>
     <OtpCodeInput id="account-signup-code" value={verificationCode} onChange={setVerificationCode}
      disabled={busy} autoFocus/>
     <p className="buyer-otp-tip" id="account-signup-code-hint">Можно вставить код целиком из письма или использовать подсказку телефона.</p>
     <button type="submit" className="buyer-primary" disabled={busy||verificationCode.length!==6}>
      {busy?"Проверяем…":"Подтвердить email"}</button>
    </form>
    <p className="buyer-spam-hint"><span aria-hidden="true">✉️</span> Не нашли письмо? Проверьте папки <strong>«Спам»</strong> и <strong>«Рассылки»</strong>. Доставка может занять несколько минут.</p>
    <div className="buyer-auth-actions">
     <button type="button" disabled={busy||(signupExpiresAt>0&&Date.now()>=signupExpiresAt)} onClick={()=>void resendCode()}>Отправить код повторно</button>
     <button type="button" disabled={busy} onClick={changeSignupEmail}>Изменить email</button>
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
      <div className="buyer-danger-zone">
       <h3>Удаление аккаунта</h3>
       <p className="buyer-muted">Аккаунт, сохранённые адреса, корзина и сеансы входа будут удалены.
        Завершённые и отменённые заказы сохранятся в истории магазина, включая контактные данные из оформления.
        При наличии незавершённых заказов удаление недоступно.</p>
       {!deletionStarted?
        <button type="button" className="buyer-danger-button" disabled={busy}
         onClick={()=>void requestAccountDeletion()}>Удалить аккаунт</button>:
        <form className="buyer-form" onSubmit={e=>void confirmAccountDeletion(e)}>
         <p className="buyer-muted">Мы отправили код подтверждения на <strong>{customer.email}</strong>.
          Он действителен 10 минут. Проверьте также папку «Спам».</p>
         <label htmlFor="account-deletion-code">Код из письма</label>
         <OtpCodeInput id="account-deletion-code" value={deletionCode} onChange={setDeletionCode} disabled={busy}/>
         <p className="buyer-otp-tip" id="account-deletion-code-hint">Шесть цифр можно вставить одним действием.</p>
         <label className="buyer-delete-confirm">
          <input type="checkbox" checked={deletionAgreed} onChange={e=>setDeletionAgreed(e.target.checked)}/>
          Я понимаю, что восстановить аккаунт после удаления нельзя.
         </label>
         <button type="submit" className="buyer-danger-button" disabled={busy||!deletionAgreed||deletionCode.length!==6}>
          {busy?"Удаление…":"Подтвердить удаление аккаунта"}</button>
         <div className="buyer-auth-actions">
          <button type="button" disabled={busy} onClick={()=>void requestAccountDeletion()}>Отправить код повторно</button>
          <button type="button" disabled={busy} onClick={()=>{setDeletionStarted(false);setDeletionCode("");setDeletionAgreed(false);}}>Отмена</button>
         </div>
        </form>}
      </div>
     </section>}
    </div>
   </>}
 </main>;
}
