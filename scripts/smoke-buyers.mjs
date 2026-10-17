import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const base="http://127.0.0.1:3000";
async function call(path,{method="GET",cookie,body,status=200,sendOrigin=base}={}){
 const headers={};if(cookie)headers.Cookie=cookie;
 if(method!=="GET")headers.Origin=sendOrigin;
 if(body!==undefined)headers["Content-Type"]="application/json";
 const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 const j=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(j)}`);
 return {data:j,cookie:r.headers.get("set-cookie")?.split(";")[0]};
}
const admin=await call("/api/admin/session",{method:"POST",body:{login:"testadmin",password:"test-only-strong-password-123"}});
assert.ok(admin.cookie?.includes("vira_admin_session="));
const productId="buyer_ci_sku";
const fixture={id:productId,category:"electronics",title:"Test product",subtitle:"CI",
 description:"Reserved inventory",price:"150.75",oldPrice:"",stock:2,active:true,
 image:"",images:[],specs:[],badge:""};
await call("/api/admin/products",{method:"POST",body:fixture,cookie:admin.cookie,status:201});
const getProduct=async()=> (await call("/api/products/"+productId)).data.item;
assert.equal((await getProduct()).stock,2);
const pass="Test-customer-password-123";
const signup=async prefix=>{
 const email=`buyer_${prefix}_${randomUUID().slice(0,8)}@example.test`;
 const r=await call("/api/account/register",{method:"POST",status:201,body:{email,name:"Test Buyer",password:pass}});
 assert.ok(r.cookie?.includes("vira_customer_session="));return {email,cookie:r.cookie};
};
const a=await signup("a"),b=await signup("b");
await call("/api/account/register",{method:"POST",status:409,body:{email:a.email,name:"Another",password:pass}});
await call("/api/account/cart",{status:401});
await call("/api/account/orders",{status:401});
await call("/api/account/cart",{method:"PUT",status:403,cookie:a.cookie,body:{productId,quantity:1},sendOrigin:"https://evil.invalid"});
const session=await call("/api/account/session",{cookie:a.cookie});assert.equal(session.data.customer.email,a.email);
await call("/api/account/session",{method:"POST",status:401,body:{email:a.email,password:"Wrong-password-12345"}});
const login=await call("/api/account/session",{method:"POST",body:{email:a.email,password:pass}});
assert.ok(login.cookie?.includes("vira_customer_session="));
const address={recipient:"Иван Петров",phone:"+7 999 111-22-33",city:"Новосибирск",street:"Ленина",building:"12",apartment:"5",comment:"Домофон 5"};
const aa=await call("/api/account/addresses",{method:"POST",cookie:a.cookie,body:address,status:201});
const ab=await call("/api/account/addresses",{method:"POST",cookie:b.cookie,body:address,status:201});
await call("/api/account/cart",{method:"POST",cookie:a.cookie,body:{items:[{id:productId,quantity:2}]}});
await call("/api/account/cart",{method:"PUT",cookie:b.cookie,body:{productId,quantity:2}});
const cartA=await call("/api/account/cart",{cookie:a.cookie});assert.equal(cartA.data.items[0].quantity,2);
const key=randomUUID();
const order=await call("/api/account/orders",{method:"POST",cookie:a.cookie,status:201,body:{key,addressId:aa.data.id,note:"Testing"}});
assert.equal(order.data.totalMinor,"30150");assert.equal(order.data.paymentStatus,"unpaid");
const again=await call("/api/account/orders",{method:"POST",cookie:a.cookie,body:{key,addressId:aa.data.id}});
assert.equal(again.data.id,order.data.id);assert.equal(again.data.reused,true);
assert.equal((await getProduct()).stock,0);
await call("/api/account/orders",{method:"POST",cookie:b.cookie,status:409,body:{key:randomUUID(),addressId:ab.data.id}});
assert.equal((await call("/api/account/orders",{cookie:b.cookie})).data.items.length,0);
assert.equal((await call("/api/account/orders",{cookie:a.cookie})).data.items[0].id,order.data.id);
await call("/api/account/addresses",{method:"DELETE",cookie:a.cookie,body:{id:aa.data.id}});
assert.equal((await call("/api/account/orders",{cookie:a.cookie})).data.items[0].address.city,"Новосибирск");
const orders=await call("/api/admin/orders",{cookie:admin.cookie});
assert.ok(orders.data.items.some(o=>o.id===order.data.id));
await call("/api/admin/orders/"+order.data.id,{method:"PATCH",cookie:admin.cookie,body:{status:"cancelled"}});
await call("/api/admin/orders/"+order.data.id,{method:"PATCH",cookie:admin.cookie,status:409,body:{status:"cancelled"}});
assert.equal((await getProduct()).stock,2);
const orderB=await call("/api/account/orders",{method:"POST",cookie:b.cookie,status:201,body:{key:randomUUID(),addressId:ab.data.id}});
assert.equal(orderB.data.totalMinor,"30150");
for(const status of ["confirmed","packing","shipped","completed"]){
 await call("/api/admin/orders/"+orderB.data.id,{method:"PATCH",cookie:admin.cookie,body:{status}});
}
await call("/api/account/session",{method:"DELETE",cookie:a.cookie});
await call("/api/account/cart",{status:401,cookie:a.cookie});
console.log("Embedded DB buyer/auth/order stock transactions and admin statuses passed.");
