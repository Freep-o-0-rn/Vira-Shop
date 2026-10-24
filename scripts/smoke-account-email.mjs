import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";

const base="http://127.0.0.1:3000";
const outbox=process.env.MOCK_SMTP_MAIL_FILE;
async function call(path,{method="GET",body,cookie,status=200}={}){
 const headers={};
 if(cookie)headers.Cookie=cookie;
 if(method!=="GET")headers.Origin=base;
 if(body!==undefined)headers["Content-Type"]="application/json";
 const response=await fetch(base+path,{
  method,headers,body:body===undefined?undefined:JSON.stringify(body),
  signal:AbortSignal.timeout(20000),
 });
 const json=await response.json();
 assert.equal(response.status,status,method+" "+path+": "+JSON.stringify(json));
 return {data:json,cookie:response.headers.get("set-cookie")?.split(";")[0]};
}
let ready=false;
for(let i=0;i<30;i++){
 try{const r=await call("/api/account/session");if(r.data.verificationEnabled){ready=true;break;}}
 catch{}
 await delay(500);
}
assert.ok(ready,"Verified signup test server did not start");
const email="verify_"+randomUUID().slice(0,8)+"@example.test";
const password="Test-email-pass-2026";
const register=await call("/api/account/register",{method:"POST",status:202,
 body:{name:"Покупатель",email,password}});
assert.equal(register.data.verificationRequired,true);
assert.ok(!register.cookie,"Registration must not create session before code validation");
assert.equal((await call("/api/account/session")).data.customer,null);
await call("/api/account/session",{method:"POST",status:401,body:{email,password}});
const {code,to}=JSON.parse(readFileSync(outbox,"utf8"));
assert.equal(to,email);
assert.match(code,/^\d{6}$/);
await call("/api/account/verify",{method:"POST",status:400,body:{email,code:code==="111111"?"222222":"111111"}});
const verified=await call("/api/account/verify",{method:"POST",status:201,body:{email,code}});
assert.ok(verified.cookie?.includes("vira_customer_session="));
assert.equal((await call("/api/account/session",{cookie:verified.cookie})).data.customer.email,email);
await call("/api/account/verify",{method:"POST",status:400,body:{email,code}});
await call("/api/account/register",{method:"POST",status:409,body:{email,name:"Other",password}});
const rename=await call("/api/account/profile",{method:"PATCH",cookie:verified.cookie,
 body:{name:"Новое имя"}});
assert.equal(rename.data.customer.name,"Новое имя");
const address={recipient:"Покупатель",phone:"+7 912 000 00 00",city:"Новосибирск",
 street:"Ленина",building:"5",apartment:"2",comment:""};
const added=await call("/api/account/addresses",{method:"POST",status:201,cookie:verified.cookie,body:address});
await call("/api/account/addresses",{method:"PUT",cookie:verified.cookie,
 body:{id:added.data.id,...address,building:"10"}});
assert.equal((await call("/api/account/addresses",{cookie:verified.cookie})).data.items[0].building,"10");
await call("/api/account/password",{method:"POST",status:401,cookie:verified.cookie,
 body:{currentPassword:"wrong-old-password",newPassword:"Changed-test-pass-2026"}});
await call("/api/account/password",{method:"POST",cookie:verified.cookie,
 body:{currentPassword:password,newPassword:"Changed-test-pass-2026"}});
assert.equal((await call("/api/account/session",{cookie:verified.cookie})).data.customer,null);
const login=await call("/api/account/session",{method:"POST",body:{email,password:"Changed-test-pass-2026"}});
assert.ok(login.cookie);
console.log("Verified customer registration, profile, address edit and password rotation passed.");
