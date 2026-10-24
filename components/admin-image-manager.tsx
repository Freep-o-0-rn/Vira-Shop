"use client";
import { publicImageUrl } from "@/lib/public-image-url";
import {useRef,useState,type DragEvent,type ChangeEvent} from "react";

const MAX_IMAGES=8;
const MAX_BYTES=5*1024*1024;
type Props={
  images:string[];
  onChange:(images:string[])=>void;
  onBusyChange:(busy:boolean)=>void;
  disabled?:boolean;
};

export default function AdminImageManager({images,onChange,onBusyChange,disabled=false}:Props){
  const inputRef=useRef<HTMLInputElement>(null);
  const [url,setUrl]=useState("");
  const [uploading,setUploading]=useState(false);
  const [progress,setProgress]=useState("");
  const [error,setError]=useState("");
  const [dropActive,setDropActive]=useState(false);
  const [dragIndex,setDragIndex]=useState<number|null>(null);
  const busy=disabled||uploading;

  async function addFiles(selected:File[]){
    if(busy||!selected.length)return;
    setError("");
    if(images.length+selected.length>MAX_IMAGES){
      setError("Можно хранить максимум 8 фотографий. Освободите место перед загрузкой.");
      return;
    }
    if(selected.some(f=>f.size>MAX_BYTES || f.size<12)){
      setError("Каждый файл должен иметь размер не больше 5 МБ и быть непустым.");return;
    }
    if(selected.some(f=>!["image/png","image/jpeg","image/webp"].includes(f.type))){
      setError("Разрешены PNG, JPEG и WebP. HEIC сначала преобразуйте в JPEG.");return;
    }
    setUploading(true);onBusyChange(true);
    let next=[...images];
    try{
      for(let i=0;i<selected.length;i++){
        setProgress("Загрузка "+(i+1)+" из "+selected.length+": "+selected[i].name);
        const form=new FormData();form.set("image",selected[i]);
        const response=await fetch("/api/admin/upload",{method:"POST",body:form,cache:"no-store"});
        let data:{url?:string;error?:string}={};
        try{data=await response.json() as {url?:string;error?:string};}catch{}
        if(response.status===401){window.location.assign("/admin/login");throw new Error("Сессия администратора завершилась.");}
        if(!response.ok||typeof data.url!=="string")throw new Error(data.error||"Не удалось загрузить "+selected[i].name);
        next=[...next,data.url];onChange(next);
      }
      setProgress("Фотографии загружены. Нажмите «Сохранить товар», чтобы привязать их к карточке.");
    }catch(err){
      setError((err instanceof Error?err.message:"Ошибка загрузки.")+
        (next.length>images.length?" Уже загруженные фото сохранены в форме.":""));
      setProgress("");
    }finally{
      setUploading(false);onBusyChange(false);
    }
  }

  async function addUrl(){
    if(busy)return;
    const value=url.trim();
    if(!value)return;
    if(images.length>=MAX_IMAGES){setError("Достигнут лимит 8 фотографий.");return;}
    setError("");
    try{
      if(value.startsWith("/uploads/")){
        if(!/^\/uploads\/[a-f0-9-]{36}\.(png|jpe?g|webp)$/.test(value))
          throw new Error("Некорректная локальная ссылка.");
        if(images.includes(value))throw new Error("Это изображение уже добавлено.");
        onChange([...images,value]);setUrl("");return;
      }
      const parsed=new URL(value);
      if(parsed.protocol!=="https:"||parsed.username||parsed.password||value.length>1500)
        throw new Error("Введите HTTPS-ссылку на изображение.");
      setUploading(true);onBusyChange(true);
      setProgress("Сохраняем изображение с сайта-источника...");
      const response=await fetch("/api/admin/import-image",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({url:value}),cache:"no-store"
      });
      let data:{url?:string;error?:string}={};
      try{data=await response.json() as {url?:string;error?:string};}catch{}
      if(response.status===401){
        window.location.assign("/admin/login");
        throw new Error("Сессия администратора завершилась.");
      }
      if(!response.ok||typeof data.url!=="string")
        throw new Error(data.error||"Не удалось скачать изображение.");
      if(images.includes(data.url))throw new Error("Изображение уже добавлено.");
      onChange([...images,data.url]);setUrl("");
      setProgress("Фотография сохранена на сервере. Нажмите «Сохранить товар».");
    }catch(err){
      setError(err instanceof Error?err.message:"Не удалось добавить изображение.");
      setProgress("");
    }finally{setUploading(false);onBusyChange(false);}
  }

  function move(from:number,to:number){
    if(busy||from===to||to<0||to>=images.length)return;
    const next=[...images];const [selected]=next.splice(from,1);next.splice(to,0,selected);
    onChange(next);
  }
  function onFilesSelected(e:ChangeEvent<HTMLInputElement>){
    const files=Array.from(e.target.files??[]);
    e.target.value="";
    void addFiles(files);
  }
  function onDropFiles(e:DragEvent<HTMLElement>){
    e.preventDefault();setDropActive(false);
    if(e.dataTransfer.files.length)void addFiles(Array.from(e.dataTransfer.files));
  }

  return <section className="admin-images full" aria-label="Фотографии товара">
    <div className="admin-images-heading">
      <div><strong>Фотографии товара</strong><p>Главная фотография всегда первая. Перетащите миниатюры для изменения порядка.</p></div>
      <span className="admin-images-count">{images.length}/{MAX_IMAGES}</span>
    </div>
    <div className={"admin-image-dropzone "+(dropActive?"is-dragging":"")}
      onDragOver={e=>{if(e.dataTransfer.types.includes("Files")){e.preventDefault();setDropActive(true);}}}
      onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDropActive(false);}}
      onDrop={onDropFiles}>
      <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="admin-image-input"
        ref={inputRef} onChange={onFilesSelected} disabled={busy||images.length>=MAX_IMAGES}
        aria-label="Выбрать фотографии на компьютере"/>
      <div className="admin-image-drop-icon" aria-hidden="true">🖼️</div>
      <strong>Перетащите сюда фотографии</strong>
      <p>или выберите их на компьютере · PNG, JPEG, WebP · до 5 МБ · максимум 8</p>
      <button type="button" className="admin-soft-button" disabled={busy||images.length>=MAX_IMAGES}
        onClick={()=>inputRef.current?.click()}>+ Выбрать файлы</button>
    </div>
    {images.length>0&&<div className="admin-image-gallery" role="list" aria-label="Порядок фотографий">
      {images.map((src,i)=><div className={"admin-image-tile "+(i===0?"is-cover":"")} key={src}
        role="listitem" draggable={!busy}
        onDragStart={e=>{
          setDragIndex(i);e.dataTransfer.effectAllowed="move";
          e.dataTransfer.setData("text/plain",String(i));
        }}
        onDragEnd={()=>setDragIndex(null)}
        onDragOver={e=>{if(dragIndex!==null){e.preventDefault();e.dataTransfer.dropEffect="move";}}}
        onDrop={e=>{if(dragIndex!==null){e.preventDefault();e.stopPropagation();move(dragIndex,i);setDragIndex(null);}}}>
        <div className="admin-image-preview"><img src={publicImageUrl(src)} alt={"Фотография товара "+(i+1)}
          loading="lazy" onError={e=>{e.currentTarget.style.opacity="0.25";}}/>
          {i===0&&<span className="admin-image-cover-badge">Главная</span>}
          <span className="admin-image-order-badge">{i+1}</span>
        </div>
        <div className="admin-image-tile-actions">
          <button type="button" disabled={busy||i===0} onClick={()=>move(i,0)} title="Сделать главной"
            aria-label={"Сделать фото "+(i+1)+" главным"}>★</button>
          <button type="button" disabled={busy||i===0} onClick={()=>move(i,i-1)} title="Сдвинуть влево"
            aria-label={"Сдвинуть фото "+(i+1)+" влево"}>←</button>
          <button type="button" disabled={busy||i===images.length-1} onClick={()=>move(i,i+1)} title="Сдвинуть вправо"
            aria-label={"Сдвинуть фото "+(i+1)+" вправо"}>→</button>
          <button type="button" className="admin-image-remove" disabled={busy}
            title="Убрать из карточки" aria-label={"Убрать фото "+(i+1)+" из товара"}
            onClick={()=>onChange(images.filter((_,index)=>index!==i))}>×</button>
        </div>
      </div>)}
    </div>}
    <details className="admin-image-url">
      <summary>Добавить изображение по ссылке (необязательно)</summary>
      <div><input type="url" placeholder="https://example.com/photo.jpg" value={url}
        onChange={e=>setUrl(e.target.value)} disabled={busy}/>
        <button type="button" disabled={busy||images.length>=MAX_IMAGES||!url.trim()}
          onClick={addUrl}>Добавить</button></div>
    </details>
    {progress&&<p role="status" className="admin-image-status">{progress}</p>}
    {error&&<p role="alert" className="admin-image-error">{error}</p>}
    <p className="admin-image-note">Удаление миниатюры убирает фото из карточки после сохранения. Загруженные оригиналы сохраняются в <code>public/uploads/</code>.</p>
  </section>;
}
