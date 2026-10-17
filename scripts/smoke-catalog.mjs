import assert from "node:assert/strict";
import pg from "pg";
const {Pool}=pg;
const base="http://127.0.0.1:3000";
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const category="integration_bulk";
async function request(path,status=200){
 const res=await fetch(base+path,{signal:AbortSignal.timeout(7000)});
 let data;
 try{data=await res.json();}catch{data=null}
 assert.equal(res.status,status,`${path} returned ${res.status}: ${JSON.stringify(data)}`);
 return data;
}
try{
 await pool.query("INSERT INTO shop_categories (id,title,emoji,tone) VALUES ($1,'Integration fixtures','','blue') ON CONFLICT(id) DO NOTHING",[category]);
 // SQL-generated fixtures test server pagination without shipping massive seed data.
 await pool.query(`INSERT INTO shop_products
 (id,category_id,title,subtitle,description,price_minor,stock_count,image_url,specs,images)
 SELECT 'bulk_' || gs::text,$1,'Тестовый товар ' || gs::text,'Demo','',100000+gs*100,
        CASE WHEN gs%2=0 THEN 0 ELSE 5 END,'','[{"name":"Материал","value":"Пластик"}]'::jsonb,
        ARRAY[]::text[]
 FROM generate_series(1,125) gs ON CONFLICT(id) DO NOTHING`,[category]);
 const first=await request("/api/products?category=integration_bulk&limit=12&page=1&sort=cheap");
 assert.equal(first.total,125);
 assert.equal(first.totalPages,11);
 assert.equal(first.items.length,12);
 assert.equal(first.items[0].id,"bulk_1");
 const last=await request("/api/products?category=integration_bulk&limit=12&page=11&sort=cheap");
 assert.equal(last.total,125);assert.equal(last.items.length,5);
 const empty=await request("/api/products?category=integration_bulk&limit=12&page=25");
 assert.equal(empty.total,125);assert.equal(empty.totalPages,11);assert.equal(empty.items.length,0);
 const stock=await request("/api/products?category=integration_bulk&limit=100&inStock=true");
 assert.equal(stock.total,63);
 assert.ok(stock.items.every(p=>p.stock>0));
 const range=await request("/api/products?category=integration_bulk&minPrice=1005&maxPrice=1007&limit=100");
 assert.equal(range.total,3);
 assert.ok(range.items.every(p=>p.price>=1005&&p.price<=1007));
 const detail=await request("/api/products/bulk_11");
 assert.equal(detail.item.id,"bulk_11");
 assert.equal(detail.item.specs[0].name,"Материал");
 const lookup=await request("/api/products/lookup?ids=bulk_1,bulk_120,bulk_1,not_there");
 assert.deepEqual(lookup.items.map(x=>x.id),["bulk_1","bulk_120"]);
 await request("/api/products?minPrice=100&maxPrice=1",400);
 await request("/api/products?inStock=foo",400);
 await request("/api/products/lookup?ids=bad%3Bid",400);
 await request("/api/products/not_there",404);
 const webpage=await fetch(base+"/product/bulk_11",{signal:AbortSignal.timeout(15000)});
 assert.equal(webpage.status,200);
 const html=await webpage.text();
 assert.ok(html.includes("Тестовый товар 11"));
 assert.ok(html.includes("Характеристики"));
 console.log("Catalog pagination, ranges, stock, details, lookup, and product page passed.");
}finally{
 await pool.query("DELETE FROM shop_products WHERE category_id=$1",[category]);
 await pool.query("DELETE FROM shop_categories WHERE id=$1",[category]);
 await pool.end();
}
