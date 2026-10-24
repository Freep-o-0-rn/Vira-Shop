import { randomBytes } from "node:crypto";
import tls, { type TLSSocket } from "node:tls";

type Reply = {code:number;text:string};

// SMTPS (port 465). No dependency on an external Node package or a local mail client.
// SMTP credentials must only come from environment variables on the server.
export function mailConfigured():boolean {
 return Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASSWORD &&
                (process.env.SMTP_HOST?.trim() || "smtp.yandex.ru"));
}
export function verificationEnabled():boolean {
 return process.env.ACCOUNT_EMAIL_VERIFICATION==="1";
}
export function verificationReady():boolean {
 return verificationEnabled() && mailConfigured();
}

function smtpAddress(value:string):string {
 const email=value.trim();
 if(email.length>254||! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))
  throw new Error("Invalid SMTP address");
 return email;
}
function smtpInput(value:string,name:string):string {
 if(!value||/[\r\n\u0000]/.test(value))throw new Error("Invalid SMTP "+name);
 return value;
}
function mimeSubject(text:string):string {
 return "=?UTF-8?B?"+Buffer.from(text,"utf8").toString("base64")+"?=";
}
function body64(text:string):string {
 const encoded=Buffer.from(text,"utf8").toString("base64");
 return encoded.match(/.{1,76}/g)?.join("\r\n")??"";
}

// This store currently runs a single Next.js process. Cap aggregate outgoing
// verification email so arbitrary internet traffic cannot exhaust the mailbox quota.
// Persistent per-address throttling is enforced separately in the database.
let hourStart=Date.now(),dayStart=Date.now(),hourCount=0,dayCount=0;
function checkOutgoingQuota(){
 const now=Date.now();
 if(now-hourStart>=3600000){hourStart=now;hourCount=0;}
 if(now-dayStart>=86400000){dayStart=now;dayCount=0;}
 if(hourCount>=30||dayCount>=120)throw new Error("SMTP verification sending quota reached");
 hourCount++;dayCount++;
}

// One SMTP connection per email: properly handle multiline responses and TLS failures.
export async function sendVerificationEmail(recipient:string,code:string,purpose:"signup"|"account-delete"|"password-reset"="signup"):Promise<void>{
 const host=smtpInput(process.env.SMTP_HOST?.trim()||"smtp.yandex.ru","host");
 const port=Number(process.env.SMTP_PORT||"465");
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error("Invalid SMTP port");
 const user=smtpAddress(process.env.SMTP_USER||"");
 const password=process.env.SMTP_PASSWORD||"";
 if(!password)throw new Error("Missing SMTP password");
 const to=smtpAddress(recipient);
 if(!/^\d{6}$/.test(code))throw new Error("Invalid verification code");
 checkOutgoingQuota();
 const socket:TLSSocket=tls.connect({host,port,servername:host,rejectUnauthorized:true});
 socket.setTimeout(15000,()=>socket.destroy(new Error("SMTP response timeout")));
 const queue:Reply[]=[];
 let pending:((v:Reply)=>void)|null=null;
 let failPending:((e:Error)=>void)|null=null;
 let failure:Error|null=null;
 let fragment="";
 let multi:string[]=[];
 const receive=(reply:Reply)=>{
  if(pending){const resolve=pending;pending=null;failPending=null;resolve(reply);}
  else queue.push(reply);
 };
 socket.on("error",(e:Error)=>{failure=e;if(failPending){const reject=failPending;pending=null;failPending=null;reject(e);}});
 socket.on("close",()=>{if(failPending){const reject=failPending;pending=null;failPending=null;reject(new Error("SMTP connection closed"));}});
 socket.on("data",(chunk:Buffer)=>{
  fragment+=chunk.toString("utf8");
  if(fragment.length>20000){socket.destroy(new Error("SMTP response too large"));return;}
  let newline:number;
  while((newline=fragment.indexOf("\n"))>=0){
   const line=fragment.slice(0,newline).replace(/\r$/,"");
   fragment=fragment.slice(newline+1);
   if(!/^\d{3}[ -]/.test(line)){socket.destroy(new Error("Invalid SMTP response"));return;}
   multi.push(line);
   if(line[3]===" "){
    const lines=multi;multi=[];
    receive({code:Number(line.slice(0,3)),text:lines.join("\n")});
   }
  }
 });
 const read=()=>new Promise<Reply>((resolve,reject)=>{
  if(failure){reject(failure);return;}
  if(queue.length){resolve(queue.shift()!);return;}
  pending=resolve;failPending=reject;
 });
 const expect=async(command:string|null,codes:number[])=>{
  if(command!==null)socket.write(command+"\r\n");
  const reply=await read();
  if(!codes.includes(reply.code))throw new Error("SMTP rejected operation (code "+reply.code+")");
  return reply;
 };
 try{
  await expect(null,[220]);
  await expect("EHLO v54.shop",[250]);
  await expect("AUTH LOGIN",[334]);
  await expect(Buffer.from(user).toString("base64"),[334]);
  await expect(Buffer.from(password).toString("base64"),[235]);
  await expect("MAIL FROM:<"+user+">",[250]);
  await expect("RCPT TO:<"+to+">",[250,251]);
  await expect("DATA",[354]);
  const deletion=purpose==="account-delete";
  const recovery=purpose==="password-reset";
  const subject=deletion?"Подтверждение удаления аккаунта Vira Shop":
   recovery?"Восстановление пароля Vira Shop":"Ваш код подтверждения Vira Shop";
  const headline=deletion?"Подтвердите удаление аккаунта":
   recovery?"Восстановите доступ к Vira Shop":"Подтвердите вашу почту";
  const description=deletion?
   "Введите этот код в личном кабинете, чтобы подтвердить удаление аккаунта Vira Shop.":
   recovery?"Используйте этот код, чтобы установить новый пароль для аккаунта Vira Shop.":
   "Введите этот код на сайте, чтобы завершить регистрацию в Vira Shop.";
  const text=deletion?
   "Код подтверждения удаления аккаунта Vira Shop: "+code+
   "\n\nСрок действия: 10 минут. Никому не сообщайте этот код."+
   "\nЕсли вы не запрашивали удаление, никому не сообщайте код и проверьте безопасность аккаунта.":
   recovery?
   "Код восстановления пароля Vira Shop: "+code+
   "\n\nСрок действия: 10 минут. Никому не сообщайте этот код."+
   "\nЕсли вы не запрашивали восстановление пароля, просто проигнорируйте письмо.":
   "Код подтверждения регистрации в Vira Shop: "+code+
   "\n\nСрок действия: 10 минут. Никому не сообщайте этот код."+
   "\nЕсли вы не регистрировались, просто проигнорируйте письмо.";
  const html=`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f4f7ff;font-family:Arial,Helvetica,sans-serif;color:#132443">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;width:100%;margin:0 auto;border-collapse:separate;background:#ffffff;border:1px solid #e2e9f7;border-radius:18px">
<tr><td style="background:#2864ff;height:5px;font-size:0;line-height:5px;border-radius:18px 18px 0 0">&nbsp;</td></tr>
<tr><td style="padding:32px 30px">
<p style="margin:0 0 28px;font-size:20px;font-weight:bold;color:#142448"><span style="display:inline-block;background:#2864ff;color:#fff;border-radius:10px;padding:9px 12px;margin-right:9px;font-size:17px">V.</span> vira<span style="color:#2864ff">shop</span></p>
<h1 style="font-size:24px;line-height:1.25;margin:0 0 14px;color:#132443">${headline}</h1>
<p style="font-size:14px;line-height:1.7;color:#657690;margin:0 0 22px">${description}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-radius:14px;background:#eff4ff;border:1px solid #d4e1ff">
<tr><td style="text-align:center;padding:26px 12px">
<p style="color:#687da5;font-size:11px;font-weight:bold;letter-spacing:1.3px;margin:0 0 13px">ВАШ КОД ПОДТВЕРЖДЕНИЯ</p>
<p style="font-size:36px;line-height:1.2;letter-spacing:5px;font-weight:bold;color:#2864ff;margin:0;font-variant-numeric:tabular-nums">${code}</p>
<p style="font-size:12px;color:#677b9a;margin:13px 0 0">Действует 10 минут</p>
</td></tr></table>
<p style="font-size:13px;line-height:1.6;color:#4c5f7c;margin:24px 0 8px"><strong>Не сообщайте этот код никому.</strong> Сотрудники Vira Shop никогда не запрашивают его.</p>
<p style="font-size:12px;line-height:1.6;color:#8190a8;margin:0 0 24px">${deletion?"Если это действие запросили не вы — просто не вводите код.":recovery?"Если вы не запрашивали восстановление пароля — проигнорируйте письмо.":"Если вы не регистрировались — просто проигнорируйте письмо."}</p>
<p style="border-top:1px solid #edf1f8;padding-top:20px;font-size:12px;color:#8696ae;margin:0;text-align:center">Vira Shop · v54.shop<br>Автоматическое сообщение, отвечать не нужно.</p>
</td></tr></table>
</body></html>`;
  const boundary="vira_"+randomBytes(12).toString("hex");
  const headers=[
   "From: Vira Shop <"+user+">",
   "To: <"+to+">",
   "Subject: "+mimeSubject(subject),
   "Date: "+new Date().toUTCString(),
   "Message-ID: <"+randomBytes(12).toString("hex")+"@v54.shop>",
   "MIME-Version: 1.0",
   "Content-Type: multipart/alternative; boundary=\""+boundary+"\""
  ];
  const msg=headers.join("\r\n")+"\r\n\r\n"+
   "--"+boundary+"\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"+
   body64(text)+"\r\n"+
   "--"+boundary+"\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"+
   body64(html)+"\r\n--"+boundary+"--\r\n.";
  await expect(msg,[250]);
  try{socket.write("QUIT\r\n");}catch{}
 } finally{socket.destroy();}
}
