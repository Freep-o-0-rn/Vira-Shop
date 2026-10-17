import assert from "node:assert/strict";
import {setTimeout as sleep} from "node:timers/promises";
const base="http://127.0.0.1:3000";
let ready=false;
for(let i=0;i<50;i++){
 try{if((await fetch(base+"/api/products?limit=1")).ok){ready=true;break;}}catch{}
 await sleep(1000);
}
assert.ok(ready,"Server not ready");
const api=async(path,{method="GET",cookie,body,status=200}={})=>{
 const headers={};if(cookie)headers.Cookie=cookie;
 if(method!=="GET")headers.Origin=base;
 if(body!==undefined)headers["Content-Type"]="application/json";
 const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 const data=await r.json();
 assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(data)}`);
 return {data,cookie:r.headers.get("set-cookie")?.split(";")[0]};
};
const admin=await api("/api/admin/session",{method:"POST",body:{login:"testadmin",password:"test-only-strong-password-123"}});
const cookie=admin.cookie;assert.ok(cookie);
await api("/api/admin/categories",{method:"POST",cookie,status:201,body:{id:"integration_bulk",title:"CI Bulk",emoji:"",tone:"blue",active:true}});
const items=Array.from({length:125},(_,i)=>({
 id:"bulk_"+(i+1),title:"Тестовый товар "+(i+1),category:"integration_bulk",
 subtitle:"Demo",description:"CI fixture",image:"",badge:"",
 price:String(1000+i+1),oldPrice:"",stock:(i+1)%2?5:0,active:true,
 specs:[{name:"Материал",value:"Пластик"}],images:[]
}));
for(let i=0;i<items.length;i+=8){
 await Promise.all(items.slice(i,i+8).map(p=>api("/api/admin/products",{method:"POST",cookie,body:p,status:201})));
}
const first=(await api("/api/products?category=integration_bulk&limit=12&page=1&sort=cheap")).data;
assert.equal(first.total,125);assert.equal(first.totalPages,11);assert.equal(first.items.length,12);
assert.equal(first.items[0].id,"bulk_1");
const last=(await api("/api/products?category=integration_bulk&limit=12&page=11&sort=cheap")).data;
assert.equal(last.total,125);assert.equal(last.items.length,5);
const empty=(await api("/api/products?category=integration_bulk&limit=12&page=25")).data;
assert.equal(empty.total,125);assert.equal(empty.items.length,0);
const inStock=(await api("/api/products?category=integration_bulk&limit=100&inStock=true")).data;
assert.equal(inStock.total,63);assert.ok(inStock.items.every(p=>p.stock>0));
const range=(await api("/api/products?category=integration_bulk&minPrice=1005&maxPrice=1007&limit=100")).data;
assert.equal(range.total,3);
const detail=(await api("/api/products/bulk_11")).data;
assert.equal(detail.item.id,"bulk_11");assert.equal(detail.item.specs[0].name,"Материал");
const lookup=(await api("/api/products/lookup?ids=bulk_1,bulk_120,bulk_1,no_such_id")).data;
assert.deepEqual(lookup.items.map(p=>p.id),["bulk_1","bulk_120"]);
await api("/api/products?minPrice=100&maxPrice=1",{status:400});
await api("/api/products?inStock=invalid",{status:400});
await api("/api/products/lookup?ids=invalid%3Bid",{status:400});
await api("/api/products/no_such_id",{status:404});
const webpage=await fetch(base+"/product/bulk_11",{signal:AbortSignal.timeout(12000)});
assert.equal(webpage.status,200);assert.ok((await webpage.text()).includes("Тестовый товар 11"));
// Each storefront view must have a direct, reloadable URL.
for(const [path,title] of [
  ["/catalog?category=integration_bulk&page=2&sort=cheap","Каталог товаров"],
  ["/favorites","Избранное"],
  ["/cart","Корзина"],
]){
 const response=await fetch(base+path,{signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200,path);
 const html=await response.text();
 assert.ok(html.includes(title),`Expected ${title} at ${path}`);
}
assert.ok((await fetch(base+"/product/bulk_11")).ok);
console.log("Embedded DB catalog API + 125 rows + product pages passed.");
