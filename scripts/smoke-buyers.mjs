import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
const origin="http://127.0.0.1:3000";
const pool=new Pool({connectionString:process.env.DATABASE_URL});
async function call(path,{method="GET",cookie,body,status=200,sendOrigin=origin}={}){
 const headers={};if(cookie)headers.Cookie=cookie;
 if(method!=="GET")headers.Origin=sendOrigin;
 if(body!==undefined)headers["Content-Type"]="application/json";
 const r=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
 const j=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(j)}`);
 return {data:j,cookie:r.headers.get("set-cookie")?.split(";")[0]};
}
const productId="buyer_ci_sku";
try{
 await pool.query(`INSERT INTO shop_products(id,category_id,title,subtitle,description,price_minor,image_url,stock_count)
   VALUES($1,'electronics','CI test product','','',15075,'',2) ON CONFLICT(id) DO NOTHING`,[productId]);
 const buyerPassword="Test-customer-password-123";
 const signup=async suffix=>{
  const email=`buyer_${suffix}_${randomUUID().slice(0,8)}@example.test`;
  const user=await call("/api/account/register",{method:"POST",status:201,body:{email,name:"Test Buyer",password:buyerPassword}});
  assert.ok(user.cookie?.includes("vira_customer_session="));
  return {email,cookie:user.cookie};
 };
 const a=await signup("a");
 const b=await signup("b");
 await call("/api/account/register",{method:"POST",status:409,body:{email:a.email,name:"Again",password:buyerPassword}});
 await call("/api/account/cart",{status:401});
 await call("/api/account/orders",{status:401});
 await call("/api/account/cart",{method:"PUT",status:403,cookie:a.cookie,body:{productId,quantity:1},sendOrigin:"https://evil.invalid"});
 const sessionA=await call("/api/account/session",{cookie:a.cookie});assert.equal(sessionA.data.customer.email,a.email);
 const wrong=await call("/api/account/session",{method:"POST",status:401,body:{email:a.email,password:"Wrong-password-12345"}});
 assert.ok(wrong.data.error);
 const login=await call("/api/account/session",{method:"POST",body:{email:a.email,password:buyerPassword}});
 assert.ok(login.cookie?.includes("vira_customer_session="));
 const address={recipient:"Иван Петров",phone:"+7 999 111-22-33",city:"Новосибирск",street:"Ленина",building:"12",apartment:"5",comment:"Домофон 5"};
 const aa=await call("/api/account/addresses",{method:"POST",cookie:a.cookie,body:address,status:201});
 const ab=await call("/api/account/addresses",{method:"POST",cookie:b.cookie,body:address,status:201});
 assert.ok(aa.data.id);
 await call("/api/account/cart",{method:"POST",cookie:a.cookie,body:{items:[{id:productId,quantity:2}]}});
 await call("/api/account/cart",{method:"PUT",cookie:b.cookie,body:{productId,quantity:2}});
 const cartA=await call("/api/account/cart",{cookie:a.cookie});assert.equal(cartA.data.items[0].quantity,2);
 const keyA=randomUUID();
 const placed=await call("/api/account/orders",{method:"POST",cookie:a.cookie,status:201,body:{key:keyA,addressId:aa.data.id,note:"Testing"}});
 assert.equal(placed.data.totalMinor,"30150");assert.equal(placed.data.paymentStatus,"unpaid");
 const replay=await call("/api/account/orders",{method:"POST",cookie:a.cookie,body:{key:keyA,addressId:aa.data.id,note:"Testing"}});
 assert.equal(replay.data.id,placed.data.id);assert.equal(replay.data.reused,true);
 const remaining=await pool.query("SELECT stock_count FROM shop_products WHERE id=$1",[productId]);assert.equal(remaining.rows[0].stock_count,0);
 await call("/api/account/orders",{method:"POST",cookie:b.cookie,status:409,body:{key:randomUUID(),addressId:ab.data.id}});
 const listB=await call("/api/account/orders",{cookie:b.cookie});assert.equal(listB.data.items.length,0);
 const listA=await call("/api/account/orders",{cookie:a.cookie});
 assert.equal(listA.data.items[0].id,placed.data.id);
 await call("/api/account/addresses",{method:"DELETE",cookie:a.cookie,body:{id:aa.data.id}});
 const afterDelete=await call("/api/account/orders",{cookie:a.cookie});assert.equal(afterDelete.data.items[0].address.city,"Новосибирск");
 const admin=await call("/api/admin/session",{method:"POST",body:{login:"testadmin",password:"test-only-strong-password-123"}});
 const adminOrders=await call("/api/admin/orders",{cookie:admin.cookie});
 assert.ok(adminOrders.data.items.some(o=>o.id===placed.data.id));
 await call("/api/admin/orders/"+placed.data.id,{method:"PATCH",cookie:admin.cookie,body:{status:"cancelled"}});
 await call("/api/admin/orders/"+placed.data.id,{method:"PATCH",cookie:admin.cookie,status:409,body:{status:"cancelled"}});
 const restored=await pool.query("SELECT stock_count FROM shop_products WHERE id=$1",[productId]);assert.equal(restored.rows[0].stock_count,2);
 const placedB=await call("/api/account/orders",{method:"POST",cookie:b.cookie,status:201,body:{key:randomUUID(),addressId:ab.data.id}});
 assert.equal(placedB.data.totalMinor,"30150");
 await call("/api/admin/orders/"+placedB.data.id,{method:"PATCH",cookie:admin.cookie,body:{status:"confirmed"}});
 await call("/api/admin/orders/"+placedB.data.id,{method:"PATCH",cookie:admin.cookie,body:{status:"packing"}});
 await call("/api/admin/orders/"+placedB.data.id,{method:"PATCH",cookie:admin.cookie,body:{status:"shipped"}});
 await call("/api/admin/orders/"+placedB.data.id,{method:"PATCH",cookie:admin.cookie,status:409,body:{status:"cancelled"}});
 await call("/api/admin/orders/"+placedB.data.id,{method:"PATCH",cookie:admin.cookie,body:{status:"completed"}});
 await call("/api/account/session",{method:"DELETE",cookie:a.cookie});
 await call("/api/account/cart",{status:401,cookie:a.cookie});
 console.log("Buyer auth, address snapshots, stock reservations, idempotency, cancellation and status tests passed.");
}finally{
 // Deletes are confined to CI fixtures; do not use this script against real data.
 await pool.query("DELETE FROM shop_order_items WHERE order_id IN (SELECT id FROM shop_orders WHERE customer_id IN (SELECT id FROM shop_customers WHERE email LIKE 'buyer_%@example.test'))");
 await pool.query("DELETE FROM shop_orders WHERE customer_id IN (SELECT id FROM shop_customers WHERE email LIKE 'buyer_%@example.test')");
 await pool.query("DELETE FROM shop_customer_addresses WHERE customer_id IN (SELECT id FROM shop_customers WHERE email LIKE 'buyer_%@example.test')");
 await pool.query("DELETE FROM shop_customer_cart WHERE customer_id IN (SELECT id FROM shop_customers WHERE email LIKE 'buyer_%@example.test')");
 await pool.query("DELETE FROM shop_customers WHERE email LIKE 'buyer_%@example.test'");
 await pool.query("DELETE FROM shop_products WHERE id=$1",[productId]);
 await pool.end();
}
