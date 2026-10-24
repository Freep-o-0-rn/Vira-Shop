"use client";
import { publicImageUrl } from "@/lib/public-image-url";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {EMOJI_CHOICES,suggestCategoryEmoji,suggestedSpecs,fillMissingSpecs,type Specification} from "@/lib/admin-form-helpers";
import dynamic from "next/dynamic";
import AdminImageManager from "@/components/admin-image-manager";
const AdminOrdersPanel=dynamic(()=>import("@/components/admin-orders-panel"),{
 ssr:false,loading:()=> <p className="admin-help">Открываем управление заказами…</p>
});
const AdminVariantsEditor=dynamic(()=>import("@/components/admin-variants-editor"),{
 ssr:false,loading:()=> <p role="status">Открываем варианты…</p>
});

const FullEmojiPicker=dynamic(()=>import("@/components/admin-emoji-picker"),{
  ssr:false,
  loading:()=> <p className="admin-emoji-loading" role="status">Загружаем эмодзи…</p>
});

type Category = { id: string; title: string; emoji: string; tone: string; active: boolean; productCount: number };
type Product = {
  id: string; category: string; title: string; subtitle: string; description: string;
  image: string; images: string[]; specs: {name:string;value:string}[]; badge: string | null; price: string; oldPrice: string | null; stock: number; active: boolean; hasVariants:boolean; variantCount:number; variantArticles:string[];
};
type FormProduct = { id: string; category: string; title: string; subtitle: string; description: string;
  image: string; images: string[]; specs: Specification[]; badge: string; price: string; oldPrice: string; stock: string; active: boolean };
type FormCategory = { id: string; title: string; emoji: string; tone: string; active: boolean };
const blankProduct = (): FormProduct => ({ id:"", category:"",title:"",subtitle:"",description:"",image:"",images:[],specs:[],badge:"",price:"",oldPrice:"",stock:"0",active:true });
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
  const [tab,setTab]=useState<"products"|"categories"|"orders">("products");
  const [products,setProducts]=useState<Product[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [pending,setPending]=useState(false);
  const [imageUploading,setImageUploading]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [editingProduct,setEditingProduct]=useState<FormProduct|null>(null);
  const [existingProduct,setExistingProduct]=useState(false);
  const [editingCategory,setEditingCategory]=useState<FormCategory|null>(null);
  const [existingCategory,setExistingCategory]=useState(false);
  const [emojiAuto,setEmojiAuto]=useState(true);
  const [emojiPickerOpen,setEmojiPickerOpen]=useState(false);
  const [filter,setFilter]=useState("");
  const [stockFilter,setStockFilter]=useState<"all"|"low"|"zero"|"hidden"|"active"|"variants">("all");
  const [categoryFilter,setCategoryFilter]=useState("all");
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [bulkPrice,setBulkPrice]=useState("");
  const [bulkStock,setBulkStock]=useState("");
  const [variantProduct,setVariantProduct]=useState<Product|null>(null);
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
  const startAddProduct=()=>{setEditingProduct({...blankProduct(),category:categories.find(c=>c.active)?.id || categories[0]?.id || ""});setExistingProduct(false);setImageUploading(false);setError("");setSuccess("");};
  const editProduct=(p:Product)=>{setEditingProduct({...p,
    images:[...new Set([p.image,...(p.images||[])].filter(Boolean))].slice(0,8),
    specs:p.specs??[],oldPrice:p.oldPrice??"",badge:p.badge??"",stock:String(p.stock)});
    setExistingProduct(true);setImageUploading(false);setError("");setSuccess("");};
  const startAddCategory=()=>{setEditingCategory(blankCategory());setExistingCategory(false);setEmojiAuto(true);setEmojiPickerOpen(false);setError("");setSuccess("");};
  const editCategory=(c:Category)=>{setEditingCategory({...c});setExistingCategory(true);setEmojiAuto(c.emoji===suggestCategoryEmoji(c.title));setEmojiPickerOpen(false);setError("");setSuccess("");};
  async function saveProduct(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!editingProduct||imageUploading)return;
    setPending(true);setError("");setSuccess("");
    try{
      const specs=editingProduct.specs.map(item=>({name:item.name.trim(),value:item.value.trim()}))
        .filter(item=>item.name||item.value);
      if(specs.some(item=>!item.name||!item.value))throw Error("Заполните название и значение каждой характеристики.");
      if(specs.length>20)throw Error("Не более 20 характеристик.");
      if(new Set(specs.map(item=>item.name.toLocaleLowerCase("ru"))).size!==specs.length)
        throw Error("Названия характеристик не должны повторяться.");
      const images=[...new Set(editingProduct.images.map(x=>x.trim()).filter(Boolean))];
      if(images.length>8)throw Error("Можно добавить не более 8 фотографий.");
      const payload={...editingProduct,image:images[0]||"",images,specs,stock:Number(editingProduct.stock)};
      const saved=await api<{id:string}>(existingProduct ? "/api/admin/products/"+encodeURIComponent(editingProduct.id):"/api/admin/products",{
        method:existingProduct?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)
      });
      setEditingProduct(null);await refresh();notice(existingProduct?"Товар обновлён: "+saved.id:"Товар создан. Артикул № "+saved.id);
    }catch(e){setError(e instanceof Error?e.message:"Ошибка сохранения.");}
    finally{setPending(false);}
  }
  async function duplicateProduct(p:Product){
    if(!confirm("Создать копию товара «"+p.title+"» с новыми артикулами, нулевыми остатками и скрытым статусом?"))return;
    setPending(true);setError("");setSuccess("");
    try{
      const result=await api<{id:string;variantCount:number}>(
        "/api/admin/products/"+encodeURIComponent(p.id)+"/duplicate",{method:"POST"});
      await refresh();
      setFilter(result.id);setStockFilter("all");setCategoryFilter("all");setSelectedIds([]);
      notice("Создана скрытая копия с артикулом "+result.id+
       (result.variantCount?" (вариантов: "+result.variantCount+").":"." )+
       " Проверьте цену и остатки перед публикацией.");
    }catch(e){setError(e instanceof Error?e.message:"Не удалось скопировать товар.");}
    finally{setPending(false);}
  }
  async function applyBulk(action:"price"|"stock"|"visibility",active?:boolean){
    if(!selectedIds.length)return;
    const raw=action==="price"?bulkPrice.trim().replace(",","."):bulkStock.trim();
    if(action==="price"&&(!/^\\d{1,10}(\\.\\d{1,2})?$/.test(raw)||Number(raw)>9000000000)){
      setError("Укажи корректную цену в рублях (максимум две цифры после запятой).");return;
    }
    if(action==="stock"&&(!/^\\d+$/.test(raw)||Number(raw)>100000000)){
      setError("Укажи целый остаток от 0 до 100 000 000.");return;
    }
    if(!confirm("Изменить "+selectedIds.length+" выбранных товаров? Изменение выполняется сразу."))return;
    setPending(true);setError("");setSuccess("");
    try{
      const payload={ids:selectedIds,action,...(action==="price"?{price:Number(raw)}:
        action==="stock"?{stock:Number(raw)}:{active})};
      const result=await api<{updated:number}>("/api/admin/products/bulk",{
        method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)
      });
      await refresh();setSelectedIds([]);
      notice("Массовая операция выполнена. Обновлено товаров: "+result.updated+".");
    }catch(e){setError(e instanceof Error?e.message:"Ошибка массового изменения.");}
    finally{setPending(false);}
  }
  async function toggleProductVisibility(p:Product){
    const active=!p.active;
    if(!active && !confirm("Скрыть товар «"+p.title+"» из публичного каталога? Запись останется в базе."))return;
    setPending(true);setError("");setSuccess("");
    try{
      await api("/api/admin/products/"+encodeURIComponent(p.id),{
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({active})
      });
      await refresh();
      notice(active?"Товар снова включён в каталог. Если категория скрыта, откройте и её.":"Товар скрыт из магазина.");
    }catch(e){setError(e instanceof Error?e.message:"Ошибка изменения видимости.");}
    finally{setPending(false);}
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
  async function logout(){
    try{await api("/api/admin/session",{method:"DELETE"});window.location.assign("/admin/login");}
    catch(e){setError(e instanceof Error?e.message:"Ошибка выхода.");}
  }
  const visible=products.filter(p=>{
    const search=(p.title+" "+p.id+" "+(p.variantArticles??[]).join(" ")).toLocaleLowerCase("ru");
    const q=filter.trim().toLocaleLowerCase("ru");
    if(!search.includes(q))return false;
    if(categoryFilter!=="all"&&p.category!==categoryFilter)return false;
    if(stockFilter==="low"&&!(p.stock>0&&p.stock<=5))return false;
    if(stockFilter==="zero"&&p.stock!==0)return false;
    if(stockFilter==="hidden"&&p.active)return false;
    if(stockFilter==="active"&&!p.active)return false;
    if(stockFilter==="variants"&&!p.hasVariants)return false;
    return true;
  });
  const visibleIds=visible.map(p=>p.id);
  const selectedSet=new Set(selectedIds);
  const lowCount=products.filter(p=>p.stock>0&&p.stock<=5).length;
  const emptyCount=products.filter(p=>p.stock===0).length;
  const active=products.filter(p=>p.active).length;
  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <a href="/" className="admin-logo"><span>v.</span> vira shop <small>admin</small></a>
      <p className="admin-sidebar-label">УПРАВЛЕНИЕ</p>
      <button className={tab==="products"?"selected":""} onClick={()=>{setTab("products");setEditingCategory(null);setError("");}}>📦 Товары</button>
      <button className={tab==="categories"?"selected":""} onClick={()=>{setTab("categories");setEditingProduct(null);setError("");}}>▦ Категории</button>
      <button className={tab==="orders"?"selected":""} onClick={()=>{setTab("orders");setEditingProduct(null);setEditingCategory(null);setError("");}}>🧾 Заказы</button>
      <a href="/" className="admin-store-link">↗ Открыть магазин</a>
      <div className="admin-profile">Администратор <strong>{login}</strong><button onClick={()=>void logout()}>Выйти</button></div>
    </aside>
    <section className="admin-content">
      <div className="admin-topline"><span>VIRA SHOP / АДМИНИСТРИРОВАНИЕ</span><span>Приватная панель</span></div>
      <div className="admin-title-row"><div><h1>{tab==="products"?"Управление товарами":tab==="categories"?"Категории товаров":"Заказы покупателей"}</h1><p>{tab==="products"?"Добавляйте товары, редактируйте цены, остатки и фотографии.":tab==="categories"?"Создавайте категории для магазина и настраивайте их видимость.":"Просмотр новых заявок, обработка статусов и отмена с возвратом остатков."}</p></div>
      {tab!=="orders"&&<button className="admin-primary" onClick={tab==="products"?startAddProduct:startAddCategory}>{tab==="products"?"+ Новый товар":"+ Новая категория"}</button>}</div>
      {error&&<p className="admin-alert" role="alert">{error}</p>}
      {success&&<p className="admin-success" role="status">{success}</p>}
      {loading?<div className="admin-panel">Загружаем данные…</div>:<>
        {tab==="products"&&<>
          <div className="admin-stat-row">
            <div><strong>{products.length}</strong><span>Всего товаров</span></div>
            <div><strong>{active}</strong><span>В каталоге</span></div>
            <div><strong>{lowCount}</strong><span>Заканчиваются (1–5 шт.)</span></div>
            <div><strong>{emptyCount}</strong><span>Нет в наличии</span></div>
          </div>
          <div className="admin-panel">
            <div className="admin-toolbar"><h2>Каталог</h2>
              <input aria-label="Поиск товаров в админ-панели"
                placeholder="Поиск по названию, артикулу товара или варианта"
                value={filter} onChange={e=>setFilter(e.target.value)}/>
            </div>
            <div className="admin-catalog-filters">
              <label>Категория
                <select aria-label="Фильтр категории" value={categoryFilter}
                  onChange={e=>setCategoryFilter(e.target.value)}>
                  <option value="all">Все категории</option>
                  {categories.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </label>
              <label>Состояние склада
                <select aria-label="Фильтр остатков" value={stockFilter}
                  onChange={e=>setStockFilter(e.target.value as typeof stockFilter)}>
                  <option value="all">Все товары</option>
                  <option value="low">Заканчиваются (1–5 шт.)</option>
                  <option value="zero">Нет в наличии</option>
                  <option value="active">В каталоге</option>
                  <option value="hidden">Скрытые</option>
                  <option value="variants">С вариациями</option>
                </select>
              </label>
              <span>Найдено: {visible.length}</span>
            </div>
            <div className="admin-bulk-panel">
              <div className="admin-bulk-top">
                <strong>Массовое изменение · выбрано {selectedIds.length}</strong>
                <button type="button" disabled={!selectedIds.length||pending}
                  onClick={()=>setSelectedIds([])}>Снять выделение</button>
              </div>
              <p>Выдели товары галочками. Для товаров с вариациями цену и остаток меняй через «Варианты» — здесь можно менять только общую видимость.</p>
              <div className="admin-bulk-fields">
                <label>Цена, ₽ <input inputMode="decimal" placeholder="Например, 1490"
                  value={bulkPrice} onChange={e=>setBulkPrice(e.target.value)}/></label>
                <button type="button" disabled={pending||!selectedIds.length} onClick={()=>void applyBulk("price")}>Применить цену</button>
                <label>Остаток, шт. <input type="number" min="0" step="1" placeholder="Например, 25"
                  value={bulkStock} onChange={e=>setBulkStock(e.target.value)}/></label>
                <button type="button" disabled={pending||!selectedIds.length} onClick={()=>void applyBulk("stock")}>Применить остаток</button>
              </div>
              <div className="admin-bulk-actions">
                <button type="button" disabled={pending||!selectedIds.length} onClick={()=>void applyBulk("visibility",true)}>Показать выбранные</button>
                <button type="button" disabled={pending||!selectedIds.length} onClick={()=>void applyBulk("visibility",false)}>Скрыть выбранные</button>
              </div>
            </div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr>
              <th><input type="checkbox" aria-label="Выбрать все отфильтрованные товары"
                checked={visibleIds.length>0&&visibleIds.every(id=>selectedSet.has(id))}
                disabled={pending||!visibleIds.length}
                onChange={e=>setSelectedIds(prev=>e.target.checked?
                   [...new Set([...prev,...visibleIds])]:prev.filter(id=>!visibleIds.includes(id)))}/></th>
              <th>Товар</th><th>Цена</th><th>Остаток</th><th>Статус</th><th>Действия</th>
            </tr></thead><tbody>{visible.map(p=><tr key={p.id}>
              <td><input type="checkbox" aria-label={"Выбрать товар "+p.id}
                checked={selectedSet.has(p.id)} disabled={pending}
                onChange={e=>setSelectedIds(prev=>e.target.checked?
                   [...new Set([...prev,p.id])]:prev.filter(id=>id!==p.id))}/></td>
              <td><div className="admin-product-name">
                {p.active?
                  <a className="admin-product-link" href={"/product/"+encodeURIComponent(p.id)}
                     target="_blank" rel="noopener noreferrer" title="Открыть карточку товара в магазине (новая вкладка)">
                    {p.image?<img src={publicImageUrl(p.image)} alt="" loading="lazy"/>:<span className="admin-product-icon">📦</span>}
                    <span className="admin-product-meta"><strong>{p.title}</strong><small>{p.id} · {categories.find(c=>c.id===p.category)?.title??p.category}</small></span>
                  </a>:
                  <div className="admin-product-link admin-product-hidden" title="Сначала нажмите «Показать», чтобы открыть карточку в магазине">
                    {p.image?<img src={publicImageUrl(p.image)} alt="" loading="lazy"/>:<span className="admin-product-icon">📦</span>}
                    <span className="admin-product-meta"><strong>{p.title}</strong><small>{p.id} · {categories.find(c=>c.id===p.category)?.title??p.category}</small></span>
                  </div>}
              </div></td>
              <td><strong>{p.hasVariants?"от ":""}{price(p.price)}</strong></td>
              <td><span className={p.stock===0?"admin-no-stock":p.stock<=5?"admin-low-stock":""}>{p.stock} шт.</span>
                {p.hasVariants&&<small className="admin-stock-detail">По {p.variantCount} вариантам</small>}
              </td><td><span className={"admin-pill "+(p.active?"is-active":"")}>{p.active?"В каталоге":"Скрыт"}</span></td>
              <td><div className="admin-actions">
                <button disabled={pending} onClick={()=>editProduct(p)}>Изменить</button>
                <button disabled={pending} onClick={()=>setVariantProduct(p)}>Варианты{p.hasVariants?" ("+p.variantCount+")":""}</button>
                <button disabled={pending} onClick={()=>void duplicateProduct(p)}>Копировать</button>
                <button disabled={pending} onClick={()=>void toggleProductVisibility(p)}>{p.active?"Скрыть":"Показать"}</button>
              </div></td>
            </tr>)}</tbody></table></div>
            {visible.length===0&&<p className="admin-help">Товары не найдены.</p>}
          </div>
        </>}
        {tab==="categories"&&<div className="admin-panel"><h2>Категории</h2><div className="admin-category-list">{categories.map(c=><div className="admin-category-item" key={c.id}><div className="admin-category-icon">{c.emoji||"📦"}</div><div><strong>{c.title}</strong><small>{c.id} · товаров: {c.productCount} · {c.active?"активна":"скрыта"}</small></div><div className="admin-actions"><button disabled={pending} onClick={()=>editCategory(c)}>Изменить</button><button disabled={pending||c.productCount>0} title={c.productCount?"Сначала перенесите товары":""} onClick={()=>void deleteCategory(c)}>Удалить</button></div></div>)}</div></div>}
        {tab==="orders"&&<AdminOrdersPanel onChanged={refresh}/>}
      </>}
    </section>
    {variantProduct&&<AdminVariantsEditor key={variantProduct.id}
      productId={variantProduct.id} price={variantProduct.price} stock={variantProduct.stock}
      onClose={()=>setVariantProduct(null)} onSaved={()=>void refresh()}/>}
    {editingProduct&&<div className="admin-modal-overlay" onClick={()=>{if(!pending&&!imageUploading)setEditingProduct(null)}}><div className="admin-modal" role="dialog" aria-modal="true" aria-label="Редактор товара" onClick={e=>e.stopPropagation()}>
      <div className="admin-modal-heading"><div><span className="admin-eyebrow">КАТАЛОГ</span><h2>{existingProduct?"Редактировать товар":"Новый товар"}</h2></div><button disabled={pending||imageUploading} aria-label="Закрыть" onClick={()=>setEditingProduct(null)}>×</button></div>
      <form onSubmit={e=>void saveProduct(e)}>
        <div className="admin-form-grid">
          <label>Артикул товара
            <input readOnly tabIndex={-1} className="admin-article-readonly"
              value={existingProduct?editingProduct.id:"Присвоится автоматически"}/>
            <small className="admin-field-help">{existingProduct?"Неизменяемый артикул — используется в ссылках и заказах.":"Уникальный числовой артикул создаётся сервером после сохранения."}</small>
          </label>
          <label>Категория<select value={editingProduct.category} required onChange={e=>setEditingProduct({...editingProduct,category:e.target.value})}><option value="">Выберите категорию</option>{categories.map(c=><option value={c.id} key={c.id}>{c.title}</option>)}</select></label>
          <label className="full">Название товара<input required maxLength={200} value={editingProduct.title} onChange={e=>setEditingProduct({...editingProduct,title:e.target.value})}/></label>
          <label className="full">Краткая характеристика<input maxLength={500} value={editingProduct.subtitle} onChange={e=>setEditingProduct({...editingProduct,subtitle:e.target.value})}/></label>
          <label>Цена, ₽<input type="number" required min="0" max="9000000000" step=".01" value={editingProduct.price} onChange={e=>setEditingProduct({...editingProduct,price:e.target.value})}/></label>
          <label>Старая цена, ₽<input type="number" min="0" max="9000000000" step=".01" value={editingProduct.oldPrice} onChange={e=>setEditingProduct({...editingProduct,oldPrice:e.target.value})}/></label>
          <label>Остаток, шт.<input type="number" required min="0" max="100000000" step="1" value={editingProduct.stock} onChange={e=>setEditingProduct({...editingProduct,stock:e.target.value})}/></label>
          <label>Плашка (необязательно)<input maxLength={50} value={editingProduct.badge} placeholder="Новинка" onChange={e=>setEditingProduct({...editingProduct,badge:e.target.value})}/></label>
          <label className="full">Описание<textarea rows={3} value={editingProduct.description} maxLength={10000} onChange={e=>setEditingProduct({...editingProduct,description:e.target.value})}/></label>
          <AdminImageManager images={editingProduct.images}
            disabled={pending} onBusyChange={setImageUploading}
            onChange={images=>setEditingProduct(current=>current?{...current,
              image:images[0]||"",images}:current)}/>
          <div className="admin-spec-editor full">
            <div className="admin-spec-top"><div><strong>Характеристики товара</strong>
              <small>Используются для фильтрации товаров в каталоге.</small></div>
              <button type="button" className="admin-soft-button" disabled={pending||editingProduct.specs.length>=20}
                onClick={()=>setEditingProduct({...editingProduct,specs:fillMissingSpecs(editingProduct.specs,
                  suggestedSpecs(categories.find(c=>c.id===editingProduct.category)?.title??""))})}>
                ✨ Шаблон категории
              </button>
            </div>
            {editingProduct.specs.map((item,i)=><div className="admin-spec-row" key={i}>
              <input aria-label={"Название характеристики "+(i+1)} placeholder="Например: Цвет" maxLength={80}
                value={item.name} onChange={e=>setEditingProduct({...editingProduct,specs:editingProduct.specs.map((spec,k)=>k===i?{...spec,name:e.target.value}:spec)})}/>
              <input aria-label={"Значение характеристики "+(i+1)} placeholder="Например: Чёрный" maxLength={200}
                value={item.value} onChange={e=>setEditingProduct({...editingProduct,specs:editingProduct.specs.map((spec,k)=>k===i?{...spec,value:e.target.value}:spec)})}/>
              <button type="button" title="Удалить характеристику" aria-label={"Удалить характеристику "+(i+1)} disabled={pending}
                onClick={()=>setEditingProduct({...editingProduct,specs:editingProduct.specs.filter((_,k)=>k!==i)})}>×</button>
            </div>)}
            {editingProduct.specs.length===0&&<p className="admin-spec-empty">Характеристик пока нет. Добавьте строку или используйте шаблон.</p>}
            <button type="button" className="admin-soft-button" disabled={pending||editingProduct.specs.length>=20}
              onClick={()=>setEditingProduct({...editingProduct,specs:[...editingProduct.specs,{name:"",value:""}]})}>
              + Добавить характеристику ({editingProduct.specs.length}/20)
            </button>
          </div>
          <label className="admin-check full"><input type="checkbox" checked={editingProduct.active} onChange={e=>setEditingProduct({...editingProduct,active:e.target.checked})}/> Показывать товар в магазине</label>
        </div>
        <div className="admin-form-bottom"><button type="button" disabled={pending||imageUploading} onClick={()=>setEditingProduct(null)}>Отмена</button><button type="submit" className="admin-primary" disabled={pending||imageUploading}>{imageUploading?"Загружаем фото…":pending?"Сохраняем…":"Сохранить товар"}</button></div>
      </form>
    </div></div>}
    {editingCategory&&<div className="admin-modal-overlay" onClick={()=>{if(!pending)setEditingCategory(null)}}><div className="admin-modal admin-modal-small" role="dialog" aria-modal="true" aria-label="Редактор категории" onClick={e=>e.stopPropagation()}>
      <div className="admin-modal-heading"><div><span className="admin-eyebrow">КАТЕГОРИИ</span><h2>{existingCategory?"Изменить категорию":"Новая категория"}</h2></div><button disabled={pending} aria-label="Закрыть" onClick={()=>setEditingCategory(null)}>×</button></div>
      <form onSubmit={e=>void saveCategory(e)}><div className="admin-form-grid">
        <label className="full">Идентификатор<input required readOnly={existingCategory} value={editingCategory.id} placeholder="new_category" onChange={e=>setEditingCategory({...editingCategory,id:e.target.value})}/></label>
        <label className="full">Название<input required maxLength={120} value={editingCategory.title}
          placeholder="Например: Электроника" onChange={e=>{
            const title=e.target.value;
            setEditingCategory({...editingCategory,title,emoji:emojiAuto?suggestCategoryEmoji(title):editingCategory.emoji});
          }}/></label>
        <div className="admin-emoji-field">
          <label htmlFor="admin-category-emoji">Иконка / эмодзи</label>
          <div className="admin-emoji-controls">
            <input id="admin-category-emoji" maxLength={48} value={editingCategory.emoji} aria-label="Эмодзи категории"
              onChange={e=>{setEmojiAuto(false);setEditingCategory({...editingCategory,emoji:e.target.value});}}/>
            <button type="button" aria-expanded={emojiPickerOpen} aria-controls="admin-emoji-picker"
              className="admin-emoji-toggle" onClick={()=>setEmojiPickerOpen(!emojiPickerOpen)}>😀 Выбрать</button>
          </div>
          <button type="button" className="admin-emoji-autofill" onClick={()=>{
            setEmojiAuto(true);
            setEditingCategory({...editingCategory,emoji:suggestCategoryEmoji(editingCategory.title)});
            setEmojiPickerOpen(false);
          }}>✨ {emojiAuto?"Подбирается автоматически":"Подобрать по названию"}</button>
          {emojiPickerOpen&&<div className="admin-emoji-picker" id="admin-emoji-picker" aria-label="Выбор эмодзи">
            <div className="admin-emoji-picker-title"><strong>Выбери иконку категории</strong>
              <span>Поиск на русском • категории • оттенки кожи</span></div>
            <div className="admin-emoji-favorites" aria-label="Быстрые эмодзи">
              {EMOJI_CHOICES[0].items.map(emoji=><button key={emoji} type="button"
                aria-label={"Выбрать "+emoji} title={"Выбрать "+emoji}
                onClick={()=>{setEditingCategory({...editingCategory,emoji});setEmojiAuto(false);setEmojiPickerOpen(false);}}>
                {emoji}</button>)}
            </div>
            <FullEmojiPicker onSelect={emoji=>{
              setEditingCategory(current=>current?{...current,emoji}:current);
              setEmojiAuto(false);
              setEmojiPickerOpen(false);
            }}/>
          </div>}
        </div>
        <label>Цвет<select value={editingCategory.tone} onChange={e=>setEditingCategory({...editingCategory,tone:e.target.value})}><option value="blue">Голубой</option><option value="peach">Персиковый</option><option value="pink">Розовый</option><option value="green">Зелёный</option><option value="lilac">Сиреневый</option></select></label>
        <label className="admin-check full"><input type="checkbox" checked={editingCategory.active} onChange={e=>setEditingCategory({...editingCategory,active:e.target.checked})}/> Категория активна</label>
      </div><div className="admin-form-bottom"><button type="button" disabled={pending} onClick={()=>setEditingCategory(null)}>Отмена</button><button type="submit" className="admin-primary" disabled={pending}>{pending?"Сохраняем…":"Сохранить"}</button></div></form>
    </div></div>}
  </main>;
}
