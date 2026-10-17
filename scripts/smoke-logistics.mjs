import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const base="http://127.0.0.1:3000";
async function api(path,{method="GET",body,cookie,status=200,origin=base}={}){
 const headers={};if(cookie)headers.Cookie=cookie;if(method!=="GET")headers.Origin=origin;
 if(body!==undefined)headers["Content-Type"]="application/json";
 const response=await fetch(base+path,{method,headers,
  body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
 const data=await response.json();
 assert.equal(response.status,status,method+" "+path+" -> "+JSON.stringify(data));
 return {data,cookie:response.headers.get("set-cookie")?.split(";")[0]};
}
const admin=(await api("/api/admin/session",{method:"POST",body:{
 login:process.env.VIRA_ADMIN_LOGIN,password:process.env.VIRA_ADMIN_PASSWORD
}})).cookie;
const id="logistics_"+randomUUID().slice(0,9);
await api("/api/admin/products",{method:"POST",cookie:admin,status:201,body:{
 id,title:"Logistics test product",category:"electronics",subtitle:"",description:"",
 image:"",images:[],specs:[],price:"99",oldPrice:"",badge:"",stock:12,active:true
}});
const customer=(await api("/api/account/register",{method:"POST",status:201,body:{
 email:id+"@example.test",name:"Logistics Buyer",password:"Test-only-strong-password-3456"
}})).cookie;
const contact={recipient:"Test Buyer",phone:"+7 999 555 12 34"};
const address=(await api("/api/account/addresses",{method:"POST",cookie:customer,status:201,body:{
 ...contact,city:"Novosibirsk",street:"Lenina",building:"1",apartment:"",comment:""
}})).data.id;
const pvz="/api/account/checkout/pickup-points";
await api(pvz,{status:401});
const disabled=(await api(pvz,{cookie:customer,status:503})).data;
assert.equal(disabled.available,false);
assert.equal(disabled.points.length,0);
assert.equal(disabled.recommended,null);
assert.equal((await api("/api/account/checkout/quote?method=ozon_pvz",{cookie:customer,status:503})).data.available,false);
await api("/api/account/orders",{method:"POST",cookie:customer,status:409,body:{
 key:randomUUID(),deliveryMethod:"ozon_pvz"
}});
await api("/api/account/cart",{method:"PUT",cookie:customer,body:{productId:id,quantity:2}});
const pickupId=(await api("/api/account/orders",{method:"POST",cookie:customer,status:201,body:{
 key:randomUUID(),deliveryMethod:"pickup",pickupContact:contact
}})).data.id;
const l=(id)=>"/api/admin/orders/"+id+"/logistics";
let detail=(await api("/api/admin/orders/"+pickupId,{cookie:admin})).data.order;
assert.equal(detail.logisticsStatus,"awaiting_confirmation");
assert.equal(detail.logisticsHistory.length,1);
await api(l(pickupId),{method:"PATCH",cookie:admin,status:403,origin:"https://attacker.invalid",
 body:{status:"preparing"}});
await api(l(pickupId),{method:"PATCH",status:401,body:{status:"preparing"}});
await api(l(pickupId),{method:"PATCH",cookie:admin,status:409,body:{status:"preparing"}});
await api(l(pickupId),{method:"PATCH",cookie:admin,body:{
 fulfillmentSource:"purchase_to_order",purchaseReference:"INTERNAL-OZON-ORDER-001",
 note:"Awaiting own procurement"
}});
await api("/api/admin/orders/"+pickupId,{method:"PATCH",cookie:admin,body:{status:"confirmed"}});
detail=(await api("/api/admin/orders/"+pickupId,{cookie:admin})).data.order;
assert.equal(detail.logisticsStatus,"sourcing");
assert.equal(detail.fulfillmentSource,"purchase_to_order");
assert.equal(detail.purchaseReference,"INTERNAL-OZON-ORDER-001");
const publicOrder=(await api("/api/account/orders",{cookie:customer})).data.items.find(x=>x.id===pickupId);
assert.equal(publicOrder.logisticsStatus,"sourcing");
assert.ok(!Object.hasOwn(publicOrder,"fulfillmentSource"));
assert.ok(!Object.hasOwn(publicOrder,"purchaseReference"));
await api("/api/admin/orders/"+pickupId,{method:"PATCH",cookie:admin,body:{status:"packing"}});
assert.equal((await api("/api/admin/orders/"+pickupId,{cookie:admin})).data.order.logisticsStatus,"sourcing");
await api(l(pickupId),{method:"PATCH",cookie:admin,body:{status:"preparing",
 note:"Received and checked item"}});
await api(l(pickupId),{method:"PATCH",cookie:admin,body:{status:"ready_for_pickup"}});
await api(l(pickupId),{method:"PATCH",cookie:admin,status:409,body:{status:"handed_over"}});
await api(l(pickupId),{method:"PATCH",cookie:admin,body:{status:"delivered",note:"Handed to buyer"}});
detail=(await api("/api/admin/orders/"+pickupId,{cookie:admin})).data.order;
assert.equal(detail.status,"completed");
assert.equal(detail.logisticsStatus,"delivered");
assert.ok(detail.history.some(x=>x.actor==="system"&&x.toStatus==="completed"));
assert.ok(detail.logisticsHistory.some(x=>x.toStatus==="ready_for_pickup"));
await api(l(pickupId),{method:"PATCH",cookie:admin,status:409,body:{status:"delivered"}});
assert.equal((await api("/api/products/"+id)).data.item.stock,10);

await api("/api/account/cart",{method:"PUT",cookie:customer,body:{productId:id,quantity:2}});
const transportId=(await api("/api/account/orders",{method:"POST",cookie:customer,status:201,
 body:{key:randomUUID(),deliveryMethod:"transport",addressId:address}})).data.id;
assert.equal((await api("/api/account/orders",{cookie:customer})).data.items.find(x=>x.id===transportId).deliveryMethod,"transport");
await api("/api/admin/orders/"+transportId,{method:"PATCH",cookie:admin,body:{status:"confirmed"}});
await api("/api/admin/orders/"+transportId,{method:"PATCH",cookie:admin,body:{status:"packing"}});
await api(l(transportId),{method:"PATCH",cookie:admin,status:409,body:{status:"handed_over"}});
await api(l(transportId),{method:"PATCH",cookie:admin,body:{
 status:"handed_over",carrierCode:"cdek",trackingNumber:"TRACK-123-ABC",note:"Carrier accepted shipment"
}});
detail=(await api("/api/admin/orders/"+transportId,{cookie:admin})).data.order;
assert.equal(detail.status,"shipped");
assert.equal(detail.logisticsStatus,"handed_over");
assert.equal(detail.trackingNumber,"TRACK-123-ABC");
const buyerView=(await api("/api/account/orders",{cookie:customer})).data.items.find(x=>x.id===transportId);
assert.equal(buyerView.trackingNumber,"TRACK-123-ABC");
assert.ok(!Object.hasOwn(buyerView,"purchaseReference"));
await api(l(transportId),{method:"PATCH",cookie:admin,body:{status:"in_transit"}});
await api(l(transportId),{method:"PATCH",cookie:admin,body:{status:"ready_for_collection"}});
await api(l(transportId),{method:"PATCH",cookie:admin,body:{status:"delivered"}});
detail=(await api("/api/admin/orders/"+transportId,{cookie:admin})).data.order;
assert.equal(detail.status,"completed");
assert.equal(detail.logisticsStatus,"delivered");
assert.equal((await api("/api/products/"+id)).data.item.stock,8);

await api("/api/account/cart",{method:"PUT",cookie:customer,body:{productId:id,quantity:1}});
const cancelId=(await api("/api/account/orders",{method:"POST",cookie:customer,status:201,
 body:{key:randomUUID(),deliveryMethod:"courier",addressId:address}})).data.id;
await api("/api/admin/orders/"+cancelId,{method:"PATCH",cookie:admin,body:{status:"cancelled"}});
assert.equal((await api("/api/admin/orders/"+cancelId,{cookie:admin})).data.order.logisticsStatus,"cancelled");
assert.equal((await api("/api/products/"+id)).data.item.stock,8);
await api("/api/admin/orders/"+cancelId,{method:"PATCH",cookie:admin,status:409,body:{status:"cancelled"}});
console.log("Logistics: manual milestones, automatic order transitions, Ozon fail-closed, supplier privacy, transport tracking and stock passed.");
