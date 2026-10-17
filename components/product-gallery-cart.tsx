"use client";
import { useEffect, useState } from "react";
import type { Product } from "@/lib/catalog";
import { rub } from "@/lib/catalog";

const CART_KEY="vira-shop:cart:v1";
const FAV_KEY="vira-shop:favorites:v1";
function existingCart():Record<string,number>{
  try {
    const raw:unknown=JSON.parse(localStorage.getItem(CART_KEY)||"{}");
    if(!raw || typeof raw!=="object" || Array.isArray(raw))return {};
    return Object.fromEntries(Object.entries(raw).filter(([k,v])=>
      /^[A-Za-z0-9_-]{1,64}$/.test(k)&&typeof v==="number"&&Number.isSafeInteger(v)&&v>=1&&v<=99
    ));
  }catch{return {};}
}
function existingFavorites():string[]{
  try {
    const raw:unknown=JSON.parse(localStorage.getItem(FAV_KEY)||"[]");
    return Array.isArray(raw)?raw.filter((v):v is string=>typeof v==="string" && /^[A-Za-z0-9_-]{1,64}$/.test(v)):[];
  }catch{return []}
}
export default function ProductGalleryAndCart({product}:{product:Product}){
  const images=(product.images?.length?product.images:[product.image]).filter(Boolean);
  const [active,setActive]=useState(0);
  const [quantity,setQuantity]=useState(0);
  const [liked,setLiked]=useState(false);
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    setQuantity(existingCart()[product.id]||0);
    setLiked(existingFavorites().includes(product.id));
  },[product.id]);
  function add(){
    if(product.stock===0)return;
    const cart=existingCart();
    const next=Math.min((cart[product.id]||0)+1,Math.min(product.stock??99,99));
    cart[product.id]=next;
    try {
      localStorage.setItem(CART_KEY,JSON.stringify(cart));
      setQuantity(next);setNotice("Товар добавлен в корзину");
    }catch{setNotice("Не удалось сохранить корзину в браузере");}
  }
  function toggleLike(){
    const list=existingFavorites(),next=liked?list.filter(id=>id!==product.id):[...new Set([...list,product.id])];
    try{localStorage.setItem(FAV_KEY,JSON.stringify(next));setLiked(!liked);}
    catch{setNotice("Не удалось сохранить избранное");}
  }
  return <div className="product-detail-grid">
    <div className="product-detail-media">
      <div className="product-detail-main-photo">
        {images.length?<img src={images[active] ?? images[0]} alt={product.title}/>:
          <div className="product-image-placeholder">📦</div>}
      </div>
      {images.length>1 && <div className="product-gallery-thumbs" aria-label="Фотографии товара">
        {images.map((src,i)=><button key={src+i} type="button" aria-label={"Показать фото "+(i+1)}
          aria-pressed={i===active} className={i===active?"selected":""} onClick={()=>setActive(i)}>
          <img src={src} alt={""}/></button>)}
      </div>}
    </div>
    <div className="product-detail-info">
      <div className="product-detail-rating">★ {product.rating.toFixed(1)} · {product.reviews} отзывов (демо)</div>
      {product.badge&&<span className="product-detail-badge">{product.badge}</span>}
      <div className="product-detail-prices"><strong>{rub(product.price)}</strong>
        {product.oldPrice!==undefined&&<s>{rub(product.oldPrice)}</s>}</div>
      <p className="product-detail-stock">{product.stock===0?"Нет в наличии":product.stock===undefined?"Количество уточняется":"В наличии: "+product.stock+" шт."}</p>
      <button type="button" className="product-detail-buy" disabled={product.stock===0 ||
        quantity>=Math.min(product.stock??99,99)} onClick={add}>
        {product.stock===0?"Нет в наличии":quantity>=Math.min(product.stock??99,99)?
          "Максимальное количество добавлено":"Добавить в корзину"}
      </button>
      <button type="button" className="product-detail-favorite" aria-pressed={liked}
        onClick={toggleLike}>{liked?"♥ В избранном":"♡ Добавить в избранное"}</button>
      {notice&&<p role="status" className="product-detail-notice">{notice}</p>}
      <div className="product-detail-benefits"><span>✓ Характеристики товара на отдельной странице</span>
        <span>✓ Корзина сохраняется в браузере</span><span>ⓘ Заказы пока недоступны</span></div>
    </div>
  </div>;
}
