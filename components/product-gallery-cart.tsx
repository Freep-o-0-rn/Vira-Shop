"use client";
import {useEffect,useState} from "react";
import type {Product} from "@/lib/catalog";
import type {VariantGroup,StoreVariant} from "@/lib/variants";
import {rub} from "@/lib/catalog";
import {chooseVariant,optionAvailability} from "@/lib/variant-selection";

const CART_KEY="vira-shop:cart:v1";
const VARIANT_KEY="vira-shop:variant-cart:v1";
const FAV_KEY="vira-shop:favorites:v1";
type GuestVariants=Record<string,{productId:string;quantity:number}>;
function readJSON<T>(key:string,fallback:T):T{
 try{return JSON.parse(localStorage.getItem(key)||"") as T;}catch{return fallback;}
}
function cart():Record<string,number>{
 const v=readJSON<Record<string,unknown>>(CART_KEY,{});
 if(!v||typeof v!=="object"||Array.isArray(v))return {};
 return Object.fromEntries(Object.entries(v).filter(([k,q])=>/^[A-Za-z0-9_-]{1,64}$/.test(k)&&
  typeof q==="number"&&Number.isInteger(q)&&q>=1&&q<=99)) as Record<string,number>;
}
function variantCart():GuestVariants{
 const v=readJSON<GuestVariants>(VARIANT_KEY,{});
 return v&&typeof v==="object"&&!Array.isArray(v)?v:{};
}
function favorites():string[]{
 const list=readJSON<unknown>(FAV_KEY,[]);
 return Array.isArray(list)?list.filter((v):v is string=>typeof v==="string"):[];
}
export default function ProductGalleryAndCart({product,variantData}:{product:Product;variantData:{groups:VariantGroup[];variants:StoreVariant[]}}){
 const hasVariants=variantData.groups.length>0;
 const variants=variantData.variants;
 const [chosen,setChosen]=useState<StoreVariant|null>(
   variants.find(v=>v.stock>0&&v.active)??variants.find(v=>v.active)??null
 );
 const [activeImage,setActiveImage]=useState(0);
 const [quantity,setQuantity]=useState(0);
 const [liked,setLiked]=useState(false);
 const [notice,setNotice]=useState("");
 useEffect(()=>{
  if(!hasVariants)return;
  const sku=new URLSearchParams(window.location.search).get("sku");
  const saved=variants.find(v=>v.active&&v.article===sku);
  if(saved){setChosen(saved);setActiveImage(0);}
 // On product navigation a new component is mounted for each page.
 },[product.id]);
 const images=(chosen?.images.length?chosen.images:(product.images?.length?product.images:[product.image])).filter(Boolean);
 const stock=hasVariants?(chosen?.stock??0):(product.stock??0);
 const price=hasVariants&&chosen?Number(chosen.priceMinor)/100:product.price;
 const oldPrice=hasVariants&&chosen?(chosen.oldPriceMinor?Number(chosen.oldPriceMinor)/100:undefined):product.oldPrice;
 const article=chosen?.article??product.id;
 useEffect(()=>{
  setQuantity(hasVariants?(variantCart()[article]?.quantity??0):(cart()[product.id]??0));
  setLiked(favorites().includes(product.id));
 },[article,hasVariants,product.id]);
 function select(groupIndex:number,label:string){
  const next=chooseVariant(variants,chosen,groupIndex,label);
  if(!next)return;
  setChosen(next);setActiveImage(0);setNotice("");
  const url=new URL(window.location.href);
  url.searchParams.set("sku",next.article);
  window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);
 }
 async function copyVariantLink(){
  if(!chosen)return;
  const url=new URL(window.location.href);
  url.searchParams.set("sku",chosen.article);
  try{await navigator.clipboard.writeText(url.toString());setNotice("Ссылка на выбранный вариант скопирована.");}
  catch{setNotice("Не удалось скопировать ссылку в этом браузере.");}
 }
 function add(){
  if(hasVariants&&!chosen){setNotice("Выберите доступную комбинацию.");return;}
  if(stock===0)return;
  try{
   if(hasVariants&&chosen){
    const items=variantCart();
    const current=items[chosen.article]?.quantity??0;
    const next=Math.min(current+1,Math.min(stock,99));
    items[chosen.article]={productId:product.id,quantity:next};
    localStorage.setItem(VARIANT_KEY,JSON.stringify(items));
    setQuantity(next);
   }else{
    const items=cart();
    const next=Math.min((items[product.id]||0)+1,Math.min(stock,99));
    items[product.id]=next;
    localStorage.setItem(CART_KEY,JSON.stringify(items));setQuantity(next);
   }
   setNotice("Выбранный товар добавлен в корзину.");
  }catch{setNotice("Не удалось сохранить корзину.");}
 }
 function toggleLike(){
  const all=favorites(),next=liked?all.filter(x=>x!==product.id):[...new Set([...all,product.id])];
  try{localStorage.setItem(FAV_KEY,JSON.stringify(next));setLiked(!liked);}
  catch{setNotice("Не удалось сохранить избранное.");}
 }
 return <div className="product-detail-grid">
  <div className="product-detail-media">
   <div className="product-detail-main-photo">
    {images.length?<img src={images[activeImage]??images[0]} alt={product.title}/>:
     <div className="product-image-placeholder">📦</div>}
   </div>
   {images.length>1&&<div className="product-gallery-thumbs" aria-label="Фотографии товара">
    {images.map((src,i)=><button key={src+i} type="button" aria-label={"Показать фото "+(i+1)}
      aria-pressed={i===activeImage} className={i===activeImage?"selected":""} onClick={()=>setActiveImage(i)}>
       <img src={src} alt=""/></button>)}
   </div>}
  </div>
  <div className="product-detail-info">
   <div className="product-detail-rating">★ {product.rating.toFixed(1)} · {product.reviews} отзывов (демо)</div>
   {product.badge&&<span className="product-detail-badge">{product.badge}</span>}
   {hasVariants&&<div className="product-variant-controls">
     {variantData.groups.map((group,i)=><fieldset className="product-variant-group" key={group.name}>
       <legend><strong>{group.name}</strong>
        <span>{chosen?.selection[i]?.value??"Выберите"}</span></legend>
       <div className="product-variant-options">{group.values.map(value=>{
        const selected=chosen?.selection[i]?.value===value.label;
        const availability=optionAvailability(variants,chosen,group,i,value.label);
        const unavailable=availability==="unavailable";
        const label=availability==="sold-out"?"Нет в наличии":
          availability==="changes-other-options"?"При выборе изменятся другие параметры":
          unavailable?"Комбинация недоступна":value.label;
        return <button key={value.label} type="button" disabled={unavailable}
          aria-pressed={selected} aria-label={value.label+": "+label}
          title={label} data-availability={availability}
          className={"product-variant-option "+group.type+(selected?" selected":"")}
          onClick={()=>select(i,value.label)}>
          {group.type==="color"&&<span className="product-variant-dot" style={{backgroundColor:value.color??"#cccccc"}}/>}
          {group.type==="image"&&value.image&&<img src={value.image} alt=""/>}
          <span>{value.label}</span>
          {availability==="sold-out"&&<small aria-hidden="true">Нет</small>}
          {availability==="changes-other-options"&&<small aria-hidden="true">↗</small>}
        </button>;
       })}</div>
     </fieldset>)}
     <div className="product-variant-meta">
       <p className="product-variant-article">Артикул: {chosen?.article??"Нет активной комбинации"}</p>
       {chosen&&<button type="button" className="product-variant-copy" onClick={()=>void copyVariantLink()}>
         Скопировать ссылку на вариант ↗
       </button>}
     </div>
     <p className="product-variant-hint">↗ — при выборе этого параметра другие параметры могут измениться автоматически.</p>
   </div>}
   <div className="product-detail-prices"><strong>{hasVariants&&!chosen?"—":rub(price)}</strong>
     {oldPrice!==undefined&&<s>{rub(oldPrice)}</s>}</div>
   <p className="product-detail-stock">{stock===0?"Нет в наличии":"В наличии: "+stock+" шт."}</p>
   <button type="button" className="product-detail-buy" disabled={stock===0||!chosen&&hasVariants||quantity>=Math.min(stock,99)}
    onClick={add}>
     {stock===0?"Нет в наличии":quantity>=Math.min(stock,99)?"Максимальное количество добавлено":"Добавить в корзину"}
   </button>
   <button type="button" className="product-detail-favorite" aria-pressed={liked} onClick={toggleLike}>
     {liked?"♥ В избранном":"♡ Добавить в избранное"}</button>
   <a className="product-detail-checkout" href="/checkout">Перейти к оформлению →</a>
   {notice&&<p role="status" className="product-detail-notice">{notice}</p>}
   <div className="product-detail-benefits">
    <span>✓ Цена, фотографии и наличие учитывают выбранный вариант</span>
    <span>✓ Корзина сохраняется в браузере</span><span>ⓘ Онлайн-оплата пока не подключена</span>
   </div>
  </div>
 </div>;
}
