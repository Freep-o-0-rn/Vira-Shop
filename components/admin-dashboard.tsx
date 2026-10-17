"use client";
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";

type Category = { id: string; title: string; emoji: string; tone: string; active: boolean; productCount: number };
type Product = {
  id: string; category: string; title: string; subtitle: string; description: string;
  image: string; badge: string | null; price: string; oldPrice: string | null; stock: number; active: boolean;
};
type FormProduct = { id: string; category: string; title: string; subtitle: string; description: string;
  image: string; badge: string; price: string; oldPrice: string; stock: string; active: boolean };
type FormCategory = { id: string; title: string; emoji: string; tone: string; active: boolean };
const blankProduct = (): FormProduct => ({ id:"", category:"",title:"",subtitle:"",description:"",image:"",badge:"",price:"",oldPrice:"",stock:"0",active:true });
const blankCategory = (): FormCategory => ({ id:"",title:"",emoji:"📦",tone:"blue",active:true });
const price = (s: string | null) => s === null ? "—" : new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:2}).format(Number(s));
async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res=await fetch(url,{cache:"no-store",...init});
  let data: { error?: string } & Record<string, unknown>;
  try { data=await res.json(); } catch { throw new Error("Сервер вернул некорректный ответ."); }
  if(res.status===401){window.location.assign("/admin/login");throw new Error("Сессия завершилась.")}
  if(!res.ok)throw new Error(data.error || "Серверная ошибка.");
  return data as T;
}
export default function AdminDashboard({login}:{login:string}) {
  const [tab,setTab]=useState<"products"|"categories">("products");
  const [products,setProducts]=useState<Product[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [pending,setPending]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [editingProduct,setEditingProduct]=useState<FormProduct|null>(null);
  const [existingProduct,setExistingProduct]=useState(false);
  const [editingCategory,setEditingCategory]=useState<FormCategory|null>(null);
  const [existingCategory,setExistingCategory]=useState(false);
  const [filter,setFilter]=useState("");
  const refresh=useCallback(async()=>{
    const [p,c]=await Promise.all([
      api<{items:Product[]}>("/api/admin/products"),
      api<{items:Category[]}>("/api/admin/categories")
    ]);
    setProducts(p.items);setCategories(c.items);
  },[]);
  useEffect(()=>{
    let active=true;
    (async()=>{
      try{await refresh();}
      catch(e){if(active)setError(e instanceof Error?e.message:"Не удалось загрузить данные.");}
      finally{if(active)setLoading(false);}
    })();
    return ()=>{active=false};
  },[refresh]);
  const notice=(message:string)=>{setError("");setSuccess(message);};
  const startAddProduct=()=>{setEditingProduct({...blankProduct(),category:categories.find(c=>c.active)?.id || categories[0]?.id || ""});setExistingProduct(false);setError("");setSuccess("");};
  const editProduct=(p:Product)=>{setEditingProduct({...p,oldPrice:p.oldPrice??"",badge:p.badge??"",stock:String(p.stock)});setExistingProduct(true);setError("");setSuccess("");};
  const startAddCategory=()=>{setEditingCategory(blankCategory());setExistingCategory(false);setError("");setSuccess("");};
  const editCategory=(c:Category)=>{setEditingCategory({...c});setExistingCategory(true);setError("");setSuccess("");};
  async function saveProduct(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!editingProduct)return;
    setPending(true);setError("");setSuccess("");
    try{
      const payload={...editingProduct,stock:Number(editingProduct.stock)};
      await api(existingProduct ? "/api/admin/products/"+encodeURIComponent(editingProduct.id):"/api/admin/products",{
        method:existingProduct?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)
      });
      setEditingProduct(null);await refresh();notice(existingProduct?"Товар обновлён.":"Товар создан.");
    }catch(e){setError(e instanceof Error?e.message:"Ошибка сохранения.");}
    finally{setPending(false);}
  }
  async function hideProduct(p:Product){
    if(!confirm("Скрыть товар «"+p.title+"» из публичного каталога? Запись останется в базе."))return;
    setPending(true);setError("");setSuccess("");
    try{await api("/api/admin/products/"+encodeURIComponent(p.id),{method:"DELETE"});await refresh();notice("Товар скрыт. Его можно снова включить через редактирование.");}
    catch(e){setError(e instanceof Error?e.message:"Ошибка.");}finally{setPending(false);}
  }
  async function saveCategory(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!editingCategory)return;
    setPending(true);setError("");setSuccess("");
    try{
      await api(existingCategory?"/api/admin/categories/"+encodeURIComponent(editingCategory.id):"/api/admin/categories",{
        method:existingCategory?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(editingCategory)
      });
      setEditingCategory(null);await refresh();notice(existingCategory?"Категория обновлена.":"Категория добавлена.");
    }catch(e){setError(e instanceof Error?e.message:"Ошибка.");}finally{setPending(false);}
  }
  async function deleteCategory(c:Category){
    if(!confirm("Удалить категорию «"+c.title+"»? Если в ней есть товары, удаление будет запрещено."))return;
    setPending(true);setError("");setSuccess("");
    try{await api("/api/admin/categories/"+encodeURIComponent(c.id),{method:"DELETE"});await refresh();notice("Категория удалена.");}
    catch(e){setError(e instanceof Error?e.message:"Ошибка удаления.");}finally{setPending(false);}
  }
  async function upload(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];if(!file)return;
    if(file.size>5*1024*1024){setError("Файл должен быть не больше 5 МБ.");return;}
    setPending(true);setError("");
    try{
      const body=new FormData();body.set("image",file);
      const result=await api<{url:string}>("/api/admin/upload",{method:"POST",body});
      setEditingProduct(old=>old?{...old,image:result.url}:old);
      setSuccess("Фотография загружена. Нажмите «Сохранить товар», чтобы привязать её.");
    }catch(e){setError(e instanceof Error?e.message:"Ошибка загрузки.");}
    finally{setPending(false);event.target.value="";}
  }
  async function logout(){
    try{await api("/api/admin/session",{method:"DELETE"});window.location.assign("/admin/login");}
    catch(e){setError(e instanceof Error?e.message:"Ошибка выхода.");}
  }
  const visible=products.filter(p=>(p.title+" "+p.id).toLocaleLowerCase("ru").includes(filter.trim().toLocaleLowerCase("ru")));
  const active=products.filter(p=>p.active).length;
  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <a href="/" className="admin-logo"><span>v.</span> vira shop <small>admin</small></a>
      <p className="admin-sidebar-label">УПРАВЛЕНИЕ</p>
      <button className={tab==="products"?"selected":""} onClick={()=>{setTab("products");setEditingCategory(null);setError("");}}>📦 Товары</button>
      <button className={tab==="categories"?"selected":""} onClick={()=>{setTab("categories");setEditingProduct(null);setError("");}}>▦ Категории</button>
      <a href="/" className="admin-store-link">↗ Открыть магазин</a>
      <div className="admin-profile">Администратор <strong>{login}</strong><button onClick={()=>void logout()}>Выйти</button></div>
    </aside>
    <section className="admin-content">
      <div className="admin-topline"><span>VIRA SHOP / АДМИНИСТРИРОВАНИЕ</span><span>Приватная панель</span></div>
      <div className="admin-title-row"><div><h1>{tab==="products"?"Управление товарами":"Категории товаров"}</h1><p>{tab==="products"?"Добавляйте товары, редактируйте цены, остатки и фотографии.":"Создавайте категории для магазина и настраивайте их видимость."}</p></div>
      <button className="admin-primary" onClick={tab==="products"?startAddProduct:startAddCategory}>{tab==="products"?"+ Новый товар":"+ Новая категория"}</button></div>
      {error&&<p className="admin-alert" role="alert">{error}</p>}
      {success&&<p className="admin-success" role="status">{success}</p>}
      {loading?<div className="admin-panel">Загружаем данные…</div>:<>
        {tab==="products"&&<>
          <div className="admin-stat-row"><div><strong>{products.length}</strong><span>Всего товаров</span></div><div><strong>{active}</strong><span>В каталоге</span></div><div><strong>{products.length-active}</strong><span>Скрыто</span></div></div>
          <div className="admin-panel">
            <div className="admin-toolbar"><h2>Каталог</h2><input aria-label="Поиск товаров в админ-панели" placeholder="Поиск по названию или ID" value={filter} onChange={e=>setFilter(e.target.value)}/></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Товар</th><th>Цена</th><th>Остаток</th><th>Статус</th><th>Действия</th></tr></thead><tbody>{visible.map(p=><tr key={p.id}>
              <td><div className="admin-product-name">{p.image?<img src={p.image} alt="" loading="lazy"/>:<span>📦</span>}<div><strong>{p.title}</strong><small>{p.id} · {categories.find(c=>c.id===p.category)?.title??p.category}</small></div></div></td>
              <td><strong>{price(p.price)}</strong></td><td>{p.stock} шт.</td><td><span className={"admin-pill "+(p.active?"is-active":"")}>{p.active?"В каталоге":"Скрыт"}</span></td>
              <td><div className="admin-actions"><button disabled={pending} onClick={()=>editProduct(p)}>Изменить</button>{p.active&&<button disabled={pending} onClick={()=>void hideProduct(p)}>Скрыть</button>}</div></td>
            </tr>)}</tbody></table></div>
            {visible.length===0&&<p className="admin-help">Товары не найдены.</p>}
          </div>
        </>}
        {tab==="categories"&&<div className="admin-panel"><h2>Категории</h2><div className="admin-category-list">{categories.map(c=><div className="admin-category-item" key={c.id}><div className="admin-category-icon">{c.emoji||"📦"}</div><div><strong>{c.title}</strong><small>{c.id} · товаров: {c.productCount} · {c.active?"активна":"скрыта"}</small></div><div className="admin-actions"><button disabled={pending} onClick={()=>editCategory(c)}>Изменить</button><button disabled={pending||c.productCount>0} title={c.productCount?"Сначала перенесите товары":""} onClick={()=>void deleteCategory(c)}>Удалить</button></div></div>)}</div></div>}
      </>}
    </section>
    {editingProduct&&<div className="admin-modal-overlay" onClick={()=>{if(!pending)setEditingProduct(null)}}><div className="admin-modal" role="dialog" aria-modal="true" aria-label="Редактор товара" onClick={e=>e.stopPropagation()}>
      <div className="admin-modal-heading"><div><span className="admin-eyebrow">КАТАЛОГ</span><h2>{existingProduct?"Редактировать товар":"Новый товар"}</h2></div><button disabled={pending} aria-label="Закрыть" onClick={()=>setEditingProduct(null)}>×</button></div>
      <form onSubmit={e=>void saveProduct(e)}>
        <div className="admin-form-grid">
          <label>ID товара<input required readOnly={existingProduct} value={editingProduct.id} placeholder="sku_001" maxLength={64} onChange={e=>setEditingProduct({...editingProduct,id:e.target.value})}/></label>
          <label>Категория<select value={editingProduct.category} required onChange={e=>setEditingProduct({...editingProduct,category:e.target.value})}><option value="">Выберите категорию</option>{categories.map(c=><option value={c.id} key={c.id}>{c.title}</option>)}</select></label>
          <label className="full">Название товара<input required maxLength={200} value={editingProduct.title} onChange={e=>setEditingProduct({...editingProduct,title:e.target.value})}/></label>
          <label className="full">Краткая характеристика<input maxLength={500} value={editingProduct.subtitle} onChange={e=>setEditingProduct({...editingProduct,subtitle:e.target.value})}/></label>
          <label>Цена, ₽<input type="number" required min="0" max="9000000000" step=".01" value={editingProduct.price} onChange={e=>setEditingProduct({...editingProduct,price:e.target.value})}/></label>
          <label>Старая цена, ₽<input type="number" min="0" max="9000000000" step=".01" value={editingProduct.oldPrice} onChange={e=>setEditingProduct({...editingProduct,oldPrice:e.target.value})}/></label>
          <label>Остаток, шт.<input type="number" required min="0" max="100000000" step="1" value={editingProduct.stock} onChange={e=>setEditingProduct({...editingProduct,stock:e.target.value})}/></label>
          <label>Плашка (необязательно)<input maxLength={50} value={editingProduct.badge} placeholder="Новинка" onChange={e=>setEditingProduct({...editingProduct,badge:e.target.value})}/></label>
          <label className="full">Описание<textarea rows={3} value={editingProduct.description} maxLength={10000} onChange={e=>setEditingProduct({...editingProduct,description:e.target.value})}/></label>
          <label className="full">URL изображения (HTTPS или /uploads/)<input value={editingProduct.image} placeholder="https://..." onChange={e=>setEditingProduct({...editingProduct,image:e.target.value})}/></label>
          <label className="full">Или загрузите фотографию (PNG/JPEG/WebP, до 5 МБ; локально)<input disabled={pending} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e)}/></label>
          {editingProduct.image&&<div className="admin-preview"><img src={editingProduct.image} alt="Предпросмотр товара"/></div>}
          <label className="admin-check full"><input type="checkbox" checked={editingProduct.active} onChange={e=>setEditingProduct({...editingProduct,active:e.target.checked})}/> Показывать товар в магазине</label>
        </div>
        <div className="admin-form-bottom"><button type="button" disabled={pending} onClick={()=>setEditingProduct(null)}>Отмена</button><button type="submit" className="admin-primary" disabled={pending}>{pending?"Сохраняем…":"Сохранить товар"}</button></div>
      </form>
    </div></div>}
    {editingCategory&&<div className="admin-modal-overlay" onClick={()=>{if(!pending)setEditingCategory(null)}}><div className="admin-modal admin-modal-small" role="dialog" aria-modal="true" aria-label="Редактор категории" onClick={e=>e.stopPropagation()}>
      <div className="admin-modal-heading"><div><span className="admin-eyebrow">КАТЕГОРИИ</span><h2>{existingCategory?"Изменить категорию":"Новая категория"}</h2></div><button disabled={pending} aria-label="Закрыть" onClick={()=>setEditingCategory(null)}>×</button></div>
      <form onSubmit={e=>void saveCategory(e)}><div className="admin-form-grid">
        <label className="full">Идентификатор<input required readOnly={existingCategory} value={editingCategory.id} placeholder="new_category" onChange={e=>setEditingCategory({...editingCategory,id:e.target.value})}/></label>
        <label className="full">Название<input required maxLength={120} value={editingCategory.title} onChange={e=>setEditingCategory({...editingCategory,title:e.target.value})}/></label>
        <label>Иконка / emoji<input maxLength={16} value={editingCategory.emoji} onChange={e=>setEditingCategory({...editingCategory,emoji:e.target.value})}/></label>
        <label>Цвет<select value={editingCategory.tone} onChange={e=>setEditingCategory({...editingCategory,tone:e.target.value})}><option value="blue">Голубой</option><option value="peach">Персиковый</option><option value="pink">Розовый</option><option value="green">Зелёный</option><option value="lilac">Сиреневый</option></select></label>
        <label className="admin-check full"><input type="checkbox" checked={editingCategory.active} onChange={e=>setEditingCategory({...editingCategory,active:e.target.checked})}/> Категория активна</label>
      </div><div className="admin-form-bottom"><button type="button" disabled={pending} onClick={()=>setEditingCategory(null)}>Отмена</button><button type="submit" className="admin-primary" disabled={pending}>{pending?"Сохраняем…":"Сохранить"}</button></div></form>
    </div></div>}
  </main>;
}
