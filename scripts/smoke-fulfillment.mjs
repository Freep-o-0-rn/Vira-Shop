import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const root="http://127.0.0.1:3000";
async function api(path,options={}){
 const {method="GET",cookie,body,status=200,origin=root}=options;
 const headers={};if(cookie)headers.Cookie=cookie;if(method!=="GET")headers.Origin=origin;
 if(body!==undefined)headers["Content-Type"]="application/json";
 const r=await fetch(root+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();
 assert.equal(r.status,status,method+" "+path+" "+JSON.stringify(data));
 return {data,cookie:r.headers.get("set-cookie")?.split(";")[0]};
}
const admin=(await api("/api/admin/session",{method:"POST",body:{
 login:process.env.VIRA_ADMIN_LOGIN,password:process.env.VIRA_ADMIN_PASSWORD
}})).cookie;
const product="checkout_"+randomUUID().slice(0,9);
await api("/api/admin/products",{method:"POST",cookie:admin,status:201,body:{
 id:product,title:"Checkout item",subtitle:"",description:"",category:"electronics",
 price:"250",oldPrice:"",stock:6,active:true,image:"",images:[],specs:[],badge:""
}});
const user=(await api("/api/account/register",{method:"POST",status:201,body:{
 email:product+"@example.test",name:"Checkout Test",password:"Local-Test-Only-456789"
}})).cookie;
const address=(await api("/api/account/addresses",{method:"POST",cookie:user,status:201,body:{
 recipient:"Ivan Test",phone:"+7 999 100 12 34",city:"Novosibirsk",street:"Lenina",
 building:"5",apartment:"",comment:""
}})).data.id;
await api("/api/account/cart",{method:"PUT",cookie:user,body:{productId:product,quantity:2}});
await api("/api/account/checkout/quote?method=pickup",{status:401});
await api("/api/account/checkout/quote?method=invalid",{cookie:user,status:400});
const pickup=(await api("/api/account/checkout/quote?method=pickup",{cookie:user})).data;
assert.equal(pickup.subtotalMinor,"50000");
assert.equal(pickup.deliveryFeeMinor,"0");
assert.equal(pickup.totalMinor,"50000");
assert.equal(pickup.canPlace,true);
assert.equal(pickup.paymentEnabled,false);
const delivery=(await api("/api/account/checkout/quote?method=courier",{cookie:user})).data;
assert.equal(delivery.deliveryFeeMinor,null);
assert.equal(delivery.totalMinor,null);
assert.equal(delivery.deliveryPricePending,true);
const key=randomUUID();
await api("/api/account/orders",{method:"POST",cookie:user,status:400,body:{
 key,deliveryMethod:"pickup",pickupContact:{recipient:"X",phone:"0"}
}});
await api("/api/account/orders",{method:"POST",cookie:user,status:400,body:{
 key,deliveryMethod:"unknown"
}});
const ordered=(await api("/api/account/orders",{method:"POST",cookie:user,status:201,body:{
 key,deliveryMethod:"pickup",pickupContact:{recipient:"Test Buyer",phone:"+7 999 100 12 34"}
}})).data;
assert.equal(ordered.deliveryFeeMinor,"0");
assert.equal(ordered.paymentStatus,"unpaid");
assert.equal(ordered.paymentEnabled,false);
assert.equal((await api("/api/account/orders",{method:"POST",cookie:user,body:{key,
 deliveryMethod:"courier",addressId:address}})).data.reused,true);
const history=(await api("/api/account/orders",{cookie:user})).data.items;
assert.equal(history[0].deliveryMethod,"pickup");
assert.equal(history[0].address.city,"");
assert.equal(history[0].paymentMethod,"not_configured");
assert.equal((await api("/api/admin/orders",{cookie:admin})).data.items
  .find(x=>x.id===ordered.id).deliveryMethod,"pickup");
await api("/api/admin/orders/"+ordered.id,{method:"PATCH",cookie:admin,
 body:{status:"cancelled"}});
await api("/api/account/cart",{method:"PUT",cookie:user,body:{productId:product,quantity:3}});
const courier=(await api("/api/account/orders",{method:"POST",cookie:user,status:201,body:{
 key:randomUUID(),deliveryMethod:"courier",addressId:address
}})).data;
assert.equal(courier.totalMinor,"75000");
assert.equal(courier.deliveryFeeMinor,null);
assert.equal(courier.deliveryPricePending,true);
const orders=(await api("/api/account/orders",{cookie:user})).data.items;
assert.equal(orders[0].deliveryMethod,"courier");
assert.equal(orders[0].address.city,"Novosibirsk");
assert.equal(orders[0].deliveryFeeMinor,null);
assert.equal((await api("/api/account/checkout/quote?method=pickup",{cookie:user})).data.canPlace,false);
console.log("Checkout fulfillment: pickup, courier, server quote, no payments, snapshots and idempotency passed.");
