import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const root="http://127.0.0.1:3000";
async function api(path,{method="GET",cookie,body,status=200,origin=root}={}){
 const headers={};if(cookie)headers.Cookie=cookie;if(method!=="GET")headers.Origin=origin;
 if(body!==undefined)headers["Content-Type"]="application/json";
 const res=await fetch(root+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),
 signal:AbortSignal.timeout(20000)});
 const data=await res.json();assert.equal(res.status,status,method+" "+path+" "+JSON.stringify(data));
 return {data,cookie:res.headers.get("set-cookie")?.split(";")[0]};
}
const admin=await api("/api/admin/session",{method:"POST",body:{login:"testadmin",password:"test-only-strong-password-123"}});
const c=admin.cookie;
const prod="ci_variant_"+randomUUID().slice(0,10);
await api("/api/admin/products",{method:"POST",cookie:c,status:201,body:{
 id:prod,category:"electronics",title:"CI Шпагат",subtitle:"Длина и диаметр",description:"",
 image:"",images:[],specs:[],badge:"",price:"500.00",oldPrice:"",stock:10,active:true
}});
const path="/api/admin/products/"+prod+"/variants";
const groups=[
 {name:"Цвет",type:"color",values:[{label:"Красный",color:"#ff2222"},{label:"Синий",color:"#0022ff"}]},
 {name:"Длина",type:"text",values:[{label:"20 м"},{label:"50 м"}]}
];
const pairs=[
 ["Красный","20 м","100.00",2,true],
 ["Красный","50 м","150.00",1,true],
 ["Синий","20 м","300.00",0,true],
 ["Синий","50 м","400.00",2,false],
];
const drafts=pairs.map(([color,length,price,stock,active])=>({
 selection:[{name:"Цвет",value:color},{name:"Длина",value:length}],
 price,oldPrice:"",stock,active,images:[]
}));
await api(path,{method:"PUT",body:{groups,variants:drafts},status:401});
await api(path,{method:"PUT",cookie:c,body:{groups,variants:drafts},status:200});
const editor=(await api(path,{cookie:c})).data;
assert.equal(editor.groups.length,2);assert.equal(editor.variants.length,4);
assert.equal(new Set(editor.variants.map(x=>x.article)).size,4);
const storefront=(await api("/api/products/"+prod+"/variants")).data;
assert.equal(storefront.variants.length,3); // fourth combination is hidden
assert.equal((await api("/api/products/"+prod)).data.item.hasVariants,true);
const art=(color,len)=>editor.variants.find(v=>v.selection[0].value===color&&v.selection[1].value===len).article;
const red20=art("Красный","20 м"),red50=art("Красный","50 м"),blue50=art("Синий","50 м");
const customer=await api("/api/account/register",{method:"POST",status:201,body:{
 email:"variant_"+randomUUID().slice(0,10)+"@example.test",name:"Покупатель",password:"Secure-Test-Pass-111"
}});
const user=customer.cookie;
const address=await api("/api/account/addresses",{method:"POST",cookie:user,status:201,
 body:{recipient:"Покупатель",phone:"+7 999 100 00 01",city:"Новосибирск",street:"Ленина",building:"10",apartment:"",comment:""}});
await api("/api/account/cart",{method:"PUT",cookie:user,status:409,body:{productId:prod,quantity:1}});
await api("/api/account/cart",{method:"PUT",cookie:user,status:409,body:{productId:prod,variantId:blue50,quantity:1}});
await api("/api/account/cart",{method:"POST",cookie:user,body:{items:[
 {id:prod,variantId:red20,quantity:2},{id:prod,variantId:red50,quantity:1}
]}});
const cart=(await api("/api/account/cart",{cookie:user})).data.items;
assert.equal(cart.length,2);assert.notEqual(cart[0].variantId,cart[1].variantId);
assert.ok(cart.every(x=>x.selection.length===2));
const key=randomUUID();
const placed=await api("/api/account/orders",{method:"POST",cookie:user,status:201,
 body:{key,addressId:address.data.id,note:"Варианты"}});
assert.equal(placed.data.totalMinor,"35000");
const repeated=await api("/api/account/orders",{method:"POST",cookie:user,
 body:{key,addressId:address.data.id}});
assert.equal(repeated.data.id,placed.data.id);
const history=(await api("/api/account/orders",{cookie:user})).data.items[0].items;
assert.equal(history.length,2);
assert.ok(history.every(x=>x.variantId&&x.selection.length===2));
const after=(await api(path,{cookie:c})).data.variants;
assert.equal(after.find(x=>x.article===red20).stock,0);
assert.equal(after.find(x=>x.article===red50).stock,0);
await api("/api/admin/orders/"+placed.data.id,{method:"PATCH",cookie:c,body:{status:"cancelled"}});
const restored=(await api(path,{cookie:c})).data.variants;
assert.equal(restored.find(x=>x.article===red20).stock,2);
assert.equal(restored.find(x=>x.article===red50).stock,1);
await api("/api/admin/orders/"+placed.data.id,{method:"PATCH",cookie:c,body:{status:"cancelled"},status:409});
// Variant articles remain stable when configuration is saved again.
await api(path,{method:"PUT",cookie:c,body:{groups,variants:drafts}});
const again=(await api(path,{cookie:c})).data.variants;
assert.deepEqual(again.map(x=>x.article),editor.variants.map(x=>x.article));
await api(path,{method:"PUT",cookie:c,body:{groups,variants:drafts.slice(0,3)},status:400});
await api(path,{method:"PUT",cookie:c,body:{groups:[],variants:[]}});
assert.equal((await api("/api/products/"+prod+"/variants")).data.groups.length,0);
console.log("Variant combinations, SKU uniqueness, cart isolation, price snapshots, stock and cancellation pass.");
