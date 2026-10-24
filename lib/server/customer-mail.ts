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
export async function sendVerificationEmail(recipient:string,code:string):Promise<void>{
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
  const headers=[
   "From: Vira Shop <"+user+">",
   "To: <"+to+">",
   "Subject: "+mimeSubject("Код подтверждения Vira Shop"),
   "Date: "+new Date().toUTCString(),
   "Message-ID: <"+randomBytes(12).toString("hex")+"@v54.shop>",
   "MIME-Version: 1.0",
   "Content-Type: text/plain; charset=UTF-8",
   "Content-Transfer-Encoding: base64"
  ];
  const body="Код подтверждения регистрации в Vira Shop: "+code+
   "\n\nСрок действия: 10 минут. Никому не сообщайте этот код."+
   "\nЕсли вы не регистрировались, просто проигнорируйте письмо.";
  const msg=headers.join("\r\n")+"\r\n\r\n"+body64(body)+"\r\n.";
  await expect(msg,[250]);
  try{socket.write("QUIT\r\n");}catch{}
 } finally{socket.destroy();}
}
