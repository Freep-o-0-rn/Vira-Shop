import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
const base = "http://127.0.0.1:3000";
let ready=false;
for(let i=0;i<50;i++){
 try{const r=await fetch(base+"/api/products",{signal:AbortSignal.timeout(3000)});if(r.ok){ready=true;break;}}catch{}
 await delay(1000);
}
assert.ok(ready,"Next.js did not start");
async function check(path, {status=200,method="GET",body,cookie,origin=base}={}){
 const headers={};
 if(method!=="GET")headers.Origin=origin;
 if(cookie)headers.Cookie=cookie;
 if(body!==undefined)headers["Content-Type"]="application/json";
 const res=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const data=await res.json();
 assert.equal(res.status,status,`${method} ${path} -> ${JSON.stringify(data)}`);
 return {data,cookie:res.headers.get("set-cookie")};
}
const publicProducts=await check("/api/products?limit=100");
assert.equal(publicProducts.data.source,"database");
assert.equal(publicProducts.data.total,12);
await check("/api/admin/products",{status:401});
await check("/api/admin/categories",{status:401});
await check("/api/admin/session",{status:200});
await check("/api/admin/session",{status:403,method:"POST",origin:"https://attacker.example",body:{login:"testadmin",password:"wrong"}});
await check("/api/admin/session",{status:401,method:"POST",body:{login:"testadmin",password:"wrong"}});
const login=await check("/api/admin/session",{method:"POST",body:{login:"testadmin",password:"test-only-strong-password-123"}});
assert.ok(login.cookie?.includes("vira_admin_session="));
assert.ok(login.cookie?.includes("HttpOnly"));
const cookie=login.cookie.split(";")[0];
const auth={cookie};
const cats=await check("/api/admin/categories",{...auth});
assert.equal(cats.data.items.length,5);
const products=await check("/api/admin/products",{...auth});
assert.equal(products.data.items.length,12);
const category={id:"test_c",title:"Проверочная категория",emoji:"🧪",tone:"green",active:true};
await check("/api/admin/categories",{status:201,method:"POST",body:category,...auth});
let active=await check("/api/categories");
assert.ok(active.data.items.some(c=>c.id==="test_c"));
const product={id:"test_sku",category:"test_c",title:"Проверочный товар",subtitle:"Тест",description:"Проверка API",image:"https://images.unsplash.com/photo-1505740420928-5e560c06d30e",images:["https://images.unsplash.com/photo-1505740420928-5e560c06d30e","https://images.unsplash.com/photo-1523275335684-37898b6baf30"],specs:[{name:"Материал",value:"Пластик"},{name:"Цвет",value:"Чёрный"}],badge:"Новинка",price:"1499.50",oldPrice:"1899.99",stock:7,active:true};
await check("/api/admin/products",{status:201,method:"POST",body:product,...auth});
let c=await check("/api/products?q=%D0%9F%D1%80%D0%BE%D0%B2%D0%B5%D1%80%D0%BE%D1%87%D0%BD%D1%8B%D0%B9");
assert.equal(c.data.total,1);
assert.equal(c.data.items[0].price,1499.5);
assert.equal(c.data.items[0].stock,7);
assert.equal(c.data.items[0].images.length,2);
assert.equal(c.data.items[0].image,"/api/demo-image/photo-1505740420928-5e560c06d30e");
assert.equal(c.data.items[0].images[1],"/api/demo-image/photo-1523275335684-37898b6baf30");
assert.equal(c.data.items[0].specs[1].value,"Чёрный");
const details=await check("/api/products/test_sku");
assert.equal(details.data.item.images.length,2);
assert.equal(details.data.item.specs[0].name,"Материал");
await check("/api/admin/products/test_sku",{method:"PUT",body:{...product,price:"1550.25",stock:2},...auth});
c=await check("/api/products?category=test_c");
assert.equal(c.data.items[0].price,1550.25);
assert.equal(c.data.items[0].stock,2);
await check("/api/admin/categories/test_c",{method:"DELETE",status:409,...auth});
await check("/api/admin/products/test_sku",{method:"PATCH",status:401,body:{active:false}});
await check("/api/admin/products/test_sku",{method:"PATCH",status:403,body:{active:false},cookie,origin:"https://attacker.example"});
await check("/api/admin/products/test_sku",{method:"PATCH",status:400,body:{active:"yes"},...auth});
await check("/api/admin/products/test_sku",{method:"PATCH",body:{active:false},...auth});
c=await check("/api/products?category=test_c");
assert.equal(c.data.total,0);
await check("/api/products/test_sku",{status:404});
await check("/api/admin/products/test_sku",{method:"PATCH",body:{active:true},...auth});
c=await check("/api/products?category=test_c");
assert.equal(c.data.total,1);
assert.equal((await check("/api/products/test_sku")).data.item.id,"test_sku");
await check("/api/admin/products/test_sku",{method:"DELETE",...auth});
c=await check("/api/products?category=test_c");
assert.equal(c.data.total,0);
await check("/api/admin/categories/test_c",{method:"PUT",body:{...category,active:false},...auth});
const visible=await check("/api/categories");
assert.equal(visible.data.items.some(c=>c.id==="test_c"),false);
await check("/api/admin/products",{method:"POST",body:product,status:403,cookie,origin:"https://attacker.example"});
// Preserve legacy alphanumeric ids but issue new SKUs server-side.
const oldNumeric={...product,id:"10000000",title:"Legacy numeric item"};
const legacy=await check("/api/admin/products",{method:"POST",status:201,body:oldNumeric,...auth});
assert.equal(legacy.data.id,"10000000");
await check("/api/admin/products",{method:"POST",status:409,body:oldNumeric,...auth});
const generated={...product,id:"",title:"Article from sequence"};
const firstGenerated=await check("/api/admin/products",{method:"POST",status:201,body:generated,...auth});
assert.match(firstGenerated.data.id,/^[0-9]{8,12}$/);
assert.ok(BigInt(firstGenerated.data.id)>10000000n,"Automatically allocated SKU must skip existing numeric ID");
assert.equal(firstGenerated.data.article,firstGenerated.data.id);
const autoProducts=await Promise.all(Array.from({length:4},(_,i)=>
  check("/api/admin/products",{method:"POST",status:201,body:{...generated,id:undefined,title:"Generated "+i},...auth})));
const ids=autoProducts.map(x=>x.data.id);
assert.equal(new Set([firstGenerated.data.id,...ids]).size,5);
assert.ok(ids.every(id=>/^[0-9]{8,12}$/.test(id)));
await check("/api/admin/products/"+firstGenerated.data.id,{
  method:"PUT",status:400,body:{...generated,id:"changed_article"},...auth
});
const adminList=await check("/api/admin/products",{...auth});
assert.ok(adminList.data.items.some(p=>p.id===firstGenerated.data.id));
// Local upload tests: authenticated multipart, magic bytes, size, CSRF and
// consistent gallery order, without exposing filesystem paths to clients.
const tinyPng=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/gv8AAAAASUVORK5CYII=","base64");
async function uploadFile(bytes,{session=cookie,origin=base,type="image/png"}={}){
  const form=new FormData();
  form.set("image",new File([bytes],"test-image.png",{type}));
  const response=await fetch(base+"/api/admin/upload",{
    method:"POST",
    headers:{...session?{Cookie:session}:{},Origin:origin},
    body:form,signal:AbortSignal.timeout(10000)
  });
  const json=await response.json();
  return {status:response.status,json};
}
assert.equal((await uploadFile(tinyPng,{session:""})).status,401);
assert.equal((await uploadFile(tinyPng,{origin:"https://attacker.invalid"})).status,403);
assert.equal((await uploadFile(Buffer.from("this-is-not-a-png"))).status,415);
assert.equal((await uploadFile(Buffer.alloc(5*1024*1024+1))).status,413);
const uploaded=await uploadFile(tinyPng);
assert.equal(uploaded.status,201,JSON.stringify(uploaded.json));
assert.match(uploaded.json.url,/^\/uploads\/[a-f0-9-]{36}\.png$/);
const galleryProduct=await check("/api/admin/products",{
  method:"POST",status:201,
  body:{...generated,id:"",category:"electronics",title:"Photo upload and gallery",image:uploaded.json.url,
    images:[uploaded.json.url,product.image]},...auth
});
const galleryDetails=(await check("/api/products/"+galleryProduct.data.id)).data.item;
assert.equal(galleryDetails.image,uploaded.json.url);
assert.deepEqual(galleryDetails.images,[uploaded.json.url,"/api/demo-image/photo-1505740420928-5e560c06d30e"]);
await check("/api/admin/products/"+galleryProduct.data.id,{
  method:"PUT",body:{...generated,id:galleryProduct.data.id,category:"electronics",image:product.image,
    images:[product.image,uploaded.json.url]},...auth
});
const reordered=(await check("/api/products/"+galleryProduct.data.id)).data.item;
assert.equal(reordered.image,"/api/demo-image/photo-1505740420928-5e560c06d30e");
assert.deepEqual(reordered.images,["/api/demo-image/photo-1505740420928-5e560c06d30e",uploaded.json.url]);

await check("/api/admin/session",{method:"DELETE",...auth});
await check("/api/admin/products",{status:401,cookie});
console.log("Admin + PostgreSQL integration tests passed.");
