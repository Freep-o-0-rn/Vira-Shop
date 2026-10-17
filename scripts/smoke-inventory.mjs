import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const base="http://127.0.0.1:3000";
async function api(path,{method="GET",cookie,body,status=200,origin=base}={}){
 const headers={};if(method!=="GET")headers.Origin=origin;
 if(cookie)headers.Cookie=cookie;
 if(body!==undefined)headers["Content-Type"]="application/json";
 const response=await fetch(base+path,{method,headers,
   body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const data=await response.json();
 assert.equal(response.status,status,method+" "+path+" => "+JSON.stringify(data));
 return {data,cookie:response.headers.get("set-cookie")?.split(";")[0]};
}
const session=await api("/api/admin/session",{method:"POST",
 body:{login:"testadmin",password:"test-only-strong-password-123"}});
const cookie=session.cookie;
const source="test_copy_"+randomUUID().slice(0,9);
const product={
 id:source,category:"electronics",title:"CI test stock keeper",subtitle:"",description:"",
 image:"",images:[],specs:[{name:"Цвет",value:"Зелёный"}],
 badge:"",price:"999.00",oldPrice:"1200",stock:13,active:true
};
await api("/api/admin/products",{method:"POST",cookie,body:product,status:201});
const groups=[{name:"Комплектация",type:"text",values:[{label:"1 шт."},{label:"2 шт."}]}];
const variants=[
 {selection:[{name:"Комплектация",value:"1 шт."}],price:"123.00",oldPrice:"",stock:4,images:[],active:true},
 {selection:[{name:"Комплектация",value:"2 шт."}],price:"200.00",oldPrice:"",stock:8,images:[],active:false}
];
await api("/api/admin/products/"+source+"/variants",{method:"PUT",cookie,body:{groups,variants}});
const old=(await api("/api/admin/products/"+source+"/variants",{cookie})).data.variants;
assert.equal(old.length,2);
assert.equal(new Set(old.map(v=>v.article)).size,2);
const dupPath="/api/admin/products/"+source+"/duplicate";
await api(dupPath,{method:"POST",status:401});
await api(dupPath,{method:"POST",cookie,origin:"https://other.invalid",status:403});
const copied=(await api(dupPath,{method:"POST",cookie,status:201})).data;
assert.match(copied.id,/^[0-9]{8,12}$/);
assert.notEqual(copied.id,source);
assert.equal(copied.variantCount,2);
assert.equal(copied.stock,0);
assert.equal(copied.active,false);
const copyVariants=(await api("/api/admin/products/"+copied.id+"/variants",{cookie})).data;
assert.deepEqual(copyVariants.groups,groups);
assert.equal(copyVariants.variants.length,2);
assert.ok(copyVariants.variants.every(v=>v.stock===0));
assert.deepEqual(copyVariants.variants.map(v=>v.selection),old.map(v=>v.selection));
assert.deepEqual(copyVariants.variants.map(v=>v.active),old.map(v=>v.active));
assert.ok(copyVariants.variants.every(v=>!old.some(o=>o.article===v.article)));
assert.equal((await api("/api/products/"+copied.id,{status:404})).data.error!==undefined,true);
const products=(await api("/api/admin/products",{cookie})).data.items;
const sourceRow=products.find(p=>p.id===source);
const copiedRow=products.find(p=>p.id===copied.id);
assert.ok(sourceRow&&copiedRow);
assert.equal(sourceRow.hasVariants,true);
assert.equal(sourceRow.variantCount,1);
assert.equal(sourceRow.stock,4);
assert.equal(sourceRow.price,"123.00");
assert.ok(old.every(v=>sourceRow.variantArticles.includes(v.article)));
assert.ok(copyVariants.variants.every(v=>copiedRow.variantArticles.includes(v.article)));
assert.equal(copiedRow.stock,0);
assert.equal(copiedRow.active,false);

const simpleA="test_bulk_a_"+randomUUID().slice(0,9);
const simpleB="test_bulk_b_"+randomUUID().slice(0,9);
for(const id of [simpleA,simpleB]){
 await api("/api/admin/products",{method:"POST",cookie,status:201,body:{...product,id,stock:2}});
}
const bulk="/api/admin/products/bulk";
await api(bulk,{method:"PATCH",body:{ids:[simpleA],action:"stock",stock:10},status:401});
await api(bulk,{method:"PATCH",cookie,origin:"https://evil.invalid",body:{ids:[simpleA],action:"stock",stock:10},status:403});
await api(bulk,{method:"PATCH",cookie,body:{ids:[simpleA,simpleA],action:"stock",stock:10},status:400});
await api(bulk,{method:"PATCH",cookie,body:{ids:[simpleA],action:"price",price:1.234},status:400});
await api(bulk,{method:"PATCH",cookie,body:{ids:[simpleA,"does_not_exist"],action:"stock",stock:50},status:404});
await api(bulk,{method:"PATCH",cookie,body:{ids:[simpleA,source],action:"stock",stock:50},status:409});
const unchanged=(await api("/api/admin/products",{cookie})).data.items.find(p=>p.id===simpleA);
assert.equal(unchanged.stock,2,"Mixed variant bulk change must be atomic");
const updated=await api(bulk,{method:"PATCH",cookie,body:{ids:[simpleA,simpleB],action:"stock",stock:7}});
assert.equal(updated.data.updated,2);
await api(bulk,{method:"PATCH",cookie,body:{ids:[simpleA,simpleB],action:"price",price:1234.56}});
await api(bulk,{method:"PATCH",cookie,body:{ids:[simpleA,source],action:"visibility",active:false}});
const after=(await api("/api/admin/products",{cookie})).data.items;
assert.ok([simpleA,simpleB].every(id=>after.find(p=>p.id===id).stock===7));
assert.ok([simpleA,simpleB].every(id=>after.find(p=>p.id===id).price==="1234.56"));
assert.equal(after.find(p=>p.id===simpleA).active,false);
assert.equal(after.find(p=>p.id===source).active,false);
assert.equal(after.find(p=>p.id===simpleB).active,true);
const still=(await api("/api/admin/products/"+source+"/variants",{cookie})).data.variants;
assert.deepEqual(still.map(v=>v.article),old.map(v=>v.article));
assert.deepEqual(still.map(v=>v.stock),old.map(v=>v.stock));
console.log("Inventory: safe duplication, new variant articles, SKU search, stock counters, atomic bulk updates, CSRF/auth passed.");
