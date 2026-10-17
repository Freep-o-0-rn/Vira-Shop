import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const base="http://127.0.0.1:3000";
async function send(path,{method="GET",body,cookie,status=200,origin=base}={}){
 const headers={};if(cookie)headers.Cookie=cookie;if(method!=="GET")headers.Origin=origin;
 if(body!==undefined)headers["Content-Type"]="application/json";
 const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const data=await r.json();assert.equal(r.status,status,method+" "+path+" "+JSON.stringify(data));
 return {data,cookie:r.headers.get("set-cookie")?.split(";")[0]};
}
const admin=(await send("/api/admin/session",{method:"POST",
 body:{login:process.env.VIRA_ADMIN_LOGIN,password:process.env.VIRA_ADMIN_PASSWORD}})).cookie;
const product="audit_"+randomUUID().slice(0,10),email=product+"@example.test";
await send("/api/admin/products",{method:"POST",cookie:admin,status:201,
 body:{id:product,title:"Audit item",category:"electronics",subtitle:"",description:"",
 price:"79.00",oldPrice:"",stock:5,active:true,image:"",images:[],specs:[],badge:""}});
const buyer=(await send("/api/account/register",{method:"POST",status:201,
 body:{email,name:"Audit Buyer",password:"Secure-Test-Password-321"}})).cookie;
const address=(await send("/api/account/addresses",{method:"POST",cookie:buyer,status:201,
 body:{recipient:"Audit Buyer",phone:"+7 999 111 22 33",city:"Novosibirsk",
 street:"Lenina",building:"12",apartment:"",comment:""}})).data.id;
await send("/api/account/cart",{method:"PUT",cookie:buyer,body:{productId:product,quantity:3}});
const id=(await send("/api/account/orders",{method:"POST",cookie:buyer,status:201,
 body:{key:randomUUID(),addressId:address}})).data.id;
assert.equal((await send("/api/products/"+product)).data.item.stock,2);
await send("/api/admin/orders/"+id,{status:401});
await send("/api/admin/orders/"+id,{method:"PATCH",status:401,body:{status:"confirmed"}});
await send("/api/admin/orders/"+id,{method:"PATCH",cookie:admin,status:403,origin:"https://other.invalid",
 body:{status:"confirmed"}});
await send("/api/admin/orders/"+id,{method:"PATCH",cookie:admin,status:400,
 body:{status:"confirmed",note:"A".repeat(501)}});
let detail=(await send("/api/admin/orders/"+id,{cookie:admin})).data.order;
assert.equal(detail.history.length,1);
assert.equal(detail.history[0].actor,"customer");
assert.equal(detail.history[0].kind,"created");
assert.equal(detail.items[0].unitMinor,"7900");
assert.equal(detail.paymentStatus,"unpaid");
const search=(await send("/api/admin/orders?q="+id+"&status=new&page=1&limit=1",{cookie:admin})).data;
assert.equal(search.total,1);assert.equal(search.items[0].id,id);
assert.ok((await send("/api/admin/orders?q="+encodeURIComponent(email),{cookie:admin})).data.items.some(x=>x.id===id));
assert.equal((await send("/api/admin/orders?q="+id+"&status=cancelled",{cookie:admin})).data.total,0);
await send("/api/admin/orders?status=wrong",{cookie:admin,status:400});
await send("/api/admin/orders?page=0",{cookie:admin,status:400});
await send("/api/admin/orders?limit=101",{cookie:admin,status:400});
await send("/api/admin/orders",{status:401});
await send("/api/admin/orders/"+id,{method:"PATCH",cookie:admin,
 body:{status:"confirmed",note:"Confirmed by phone"}});
detail=(await send("/api/admin/orders/"+id,{cookie:admin})).data.order;
assert.equal(detail.history.length,2);
assert.equal(detail.history[1].fromStatus,"new");
assert.equal(detail.history[1].toStatus,"confirmed");
assert.equal(detail.history[1].note,"Confirmed by phone");
const endpoint=base+"/api/admin/orders/"+id;
const concurrent=await Promise.all(Array.from({length:2},()=>fetch(endpoint,{method:"PATCH",
 headers:{Cookie:admin,Origin:base,"Content-Type":"application/json"},
 body:JSON.stringify({status:"cancelled",note:"Restock once"}),signal:AbortSignal.timeout(20000)})));
assert.deepEqual(concurrent.map(x=>x.status).sort((a,b)=>a-b),[200,409]);
detail=(await send("/api/admin/orders/"+id,{cookie:admin})).data.order;
assert.equal(detail.status,"cancelled");
assert.equal(detail.history.length,3);
assert.equal(detail.history[2].fromStatus,"confirmed");
assert.equal(detail.history[2].toStatus,"cancelled");
assert.equal((await send("/api/products/"+product)).data.item.stock,5);
await send("/api/admin/orders/"+id,{method:"PATCH",cookie:admin,status:409,body:{status:"cancelled"}});
assert.equal((await send("/api/products/"+product)).data.item.stock,5);
assert.equal((await send("/api/admin/orders?q="+id+"&status=cancelled",{cookie:admin})).data.total,1);
console.log("Order status audit, admin pagination/search and concurrent cancellation pass.");
