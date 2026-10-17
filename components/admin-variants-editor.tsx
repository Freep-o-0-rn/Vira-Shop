"use client";
import {useEffect,useMemo,useState} from "react";
import AdminImageManager from "@/components/admin-image-manager";
import {combinations,signature,type VariantGroup,type VariantSelection,type StoreVariant} from "@/lib/variants";

type Row={selection:VariantSelection[];price:string;oldPrice:string;stock:number;active:boolean;images:string[];article?:string};
const asMoney=(minor:string)=> (Number(minor)/100).toFixed(2);
const makeRow=(selection:VariantSelection[],price:string,stock:number):Row=>({selection,price,oldPrice:"",stock,active:true,images:[]});
export default function AdminVariantsEditor({productId,price,stock,onClose,onSaved}:{
 productId:string;price:string;stock:number;onClose:()=>void;onSaved:()=>void;
}){
 const [groups,setGroups]=useState<VariantGroup[]>([]);
 const [rows,setRows]=useState<Row[]>([]);
 const [selected,setSelected]=useState<number|null>(null);
 const [busy,setBusy]=useState(true),[uploading,setUploading]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [dirty,setDirty]=useState(false);
 useEffect(()=>{
  let mounted=true;
  fetch("/api/admin/products/"+encodeURIComponent(productId)+"/variants",{cache:"no-store"})
   .then(async response=>{
     const data=await response.json() as {groups?:VariantGroup[];variants?:StoreVariant[];error?:string};
     if(!response.ok)throw Error(data.error||"Ошибка загрузки вариантов.");
     if(!mounted)return;
     setGroups(data.groups??[]);
     setRows((data.variants??[]).filter(x=>x.active||true).map(x=>({article:x.article,
       selection:x.selection,price:asMoney(x.priceMinor),oldPrice:x.oldPriceMinor?asMoney(x.oldPriceMinor):"",
       stock:x.stock,images:x.images,active:x.active})));
     setSelected(null);
  }).catch(e=>{if(mounted)setError(e instanceof Error?e.message:"Ошибка загрузки.");})
   .finally(()=>{if(mounted)setBusy(false);});
  return()=>{mounted=false};
 },[productId]);
 const combos=useMemo(()=>combinations(groups),[groups]);
 function updateGroups(groups:VariantGroup[]){setGroups(groups);setDirty(true);setNotice("");}
 function updateGroup(i:number,patch:Partial<VariantGroup>){
  updateGroups(groups.map((g,j)=>j===i?{...g,...patch}:g));
 }
 function updateOption(i:number,j:number,patch:Partial<VariantGroup["values"][number]>){
  updateGroup(i,{values:groups[i].values.map((v,k)=>k===j?{...v,...patch}:v)});
 }
 function generate(){
  if(!groups.length){setRows([]);setSelected(null);setDirty(false);return;}
  if(!combos.length||combos.length>100){setError("Нужно от 1 до 100 комбинаций.");return;}
  const existing=new Map(rows.map(r=>[signature(r.selection),r]));
  setRows(combos.map(selection=>existing.get(signature(selection))??makeRow(selection,price,stock)));
  setSelected(null);setDirty(false);setError("");setNotice("Комбинации сформированы. Проверьте цены и остатки перед сохранением.");
 }
 function patchRow(i:number,patch:Partial<Row>){
  setRows(prev=>prev.map((r,k)=>k===i?{...r,...patch}:r));setNotice("");
 }
 async function save(){
  if(dirty){setError("Параметры изменились. Нажмите «Сформировать комбинации» перед сохранением.");return;}
  if(uploading||busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/admin/products/"+encodeURIComponent(productId)+"/variants",{
    method:"PUT",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({groups,variants:rows.map(r=>({
     selection:r.selection,price:r.price,oldPrice:r.oldPrice,stock:r.stock,active:r.active,images:r.images
    }))})
   });
   const data=await response.json() as {error?:string};
   if(!response.ok)throw Error(data.error||"Не удалось сохранить.");
   setNotice("Варианты сохранены. У новых комбинаций появились собственные артикулы.");
   setBusy(false);
   onSaved();
   onClose();
  }catch(e){setError(e instanceof Error?e.message:"Ошибка сервера.");setBusy(false);}
 }
 const boxName=(selection:VariantSelection[])=>selection.map(x=>x.value).join(" / ");
 return <div className="admin-modal-overlay" onClick={()=>{if(!busy&&!uploading)onClose();}}>
  <div className="admin-modal variant-admin-modal" role="dialog" aria-modal="true"
    aria-label="Редактор вариантов товара" onClick={e=>e.stopPropagation()}>
   <div className="admin-modal-heading"><div><span className="admin-eyebrow">АРТИКУЛ {productId}</span><h2>Варианты товара</h2></div>
     <button onClick={onClose} disabled={busy||uploading} aria-label="Закрыть">×</button></div>
   {error&&<p role="alert" className="buyer-error">{error}</p>}
   {notice&&<p role="status" className="buyer-notice">{notice}</p>}
   {busy?<p>Загрузка вариантов…</p>:<>
    <p className="variant-help">Создайте до 3 параметров (цвет, длина, размер, комплектация). У каждого до 12 значений. Максимум 100 комбинаций. Если вариантов нет, товар продаётся как раньше.</p>
    {groups.map((g,i)=><section className="variant-group-editor" key={i}>
     <div className="variant-group-heading"><strong>Параметр {i+1}</strong>
       <button type="button" onClick={()=>updateGroups(groups.filter((_,k)=>k!==i))}>Удалить параметр</button></div>
     <div className="variant-inline">
       <label>Название <input maxLength={60} placeholder="Например: Цвет" value={g.name}
         onChange={e=>updateGroup(i,{name:e.target.value})}/></label>
       <label>Вид выбора <select value={g.type} onChange={e=>updateGroup(i,{type:e.target.value as VariantGroup["type"]})}>
         <option value="text">Кнопки</option><option value="color">Цветовые кружки</option><option value="image">Миниатюры</option>
       </select></label>
     </div>
     <div className="variant-option-label">Значения параметра</div>
     {g.values.map((v,j)=><div className="variant-value-row" key={j}>
       <input aria-label={"Значение "+(j+1)} maxLength={80} placeholder="Значение: Чёрный, 20 м, XL" value={v.label}
         onChange={e=>updateOption(i,j,{label:e.target.value})}/>
       {g.type==="color"&&<input type="color" aria-label={"Цвет "+v.label} value={v.color||"#808080"}
         onChange={e=>updateOption(i,j,{color:e.target.value})}/>}
       {g.type==="image"&&<input aria-label={"Миниатюра "+v.label} placeholder="https://... или /uploads/..."
         value={v.image??""} onChange={e=>updateOption(i,j,{image:e.target.value})}/>}
       <button type="button" disabled={g.values.length===1} title="Удалить значение"
         onClick={()=>updateGroup(i,{values:g.values.filter((_,k)=>k!==j)})}>×</button>
     </div>)}
     <button type="button" className="admin-soft-button" disabled={g.values.length>=12}
       onClick={()=>updateGroup(i,{values:[...g.values,{label:""}]})}>+ Значение</button>
    </section>)}
    <div className="variant-buttons">
      <button type="button" className="admin-soft-button" disabled={groups.length>=3}
        onClick={()=>updateGroups([...groups,{name:"",type:"text",values:[{label:""}]}])}>+ Добавить параметр</button>
      <button type="button" className="admin-primary" disabled={combos.length>100}
        onClick={generate}>Сформировать комбинации ({combos.length})</button>
    </div>
    {combos.length>100&&<p role="alert" className="buyer-error">Получается более 100 комбинаций. Сократите число значений.</p>}
    {rows.length>0&&<>
      <h3>Комбинации · {rows.length}</h3>
      <div className="variant-bulk">
        <button type="button" onClick={()=>{
          const val=prompt("Общая цена для всех комбинаций, ₽",price);
          if(val!==null&&/^\d+(\.\d{1,2})?$/.test(val))setRows(rows.map(r=>({...r,price:val})));
        }}>₽ Установить цену всем</button>
        <button type="button" onClick={()=>{
          const val=prompt("Остаток для всех комбинаций",String(stock));
          if(val!==null&&/^\d+$/.test(val)&&Number(val)<=100000000)setRows(rows.map(r=>({...r,stock:Number(val)})));
        }}>📦 Установить остаток всем</button>
      </div>
      <div className="variant-table-scroll"><table className="admin-table variant-table">
       <thead><tr><th>Комбинация / артикул</th><th>Цена ₽</th><th>Остаток</th><th>Активен</th><th>Фото</th></tr></thead>
       <tbody>{rows.map((r,i)=><tr key={signature(r.selection)}>
        <td><strong>{boxName(r.selection)}</strong><small>{r.article?"Артикул "+r.article:"Новый артикул после сохранения"}</small></td>
        <td><input aria-label={"Цена "+boxName(r.selection)} type="number" min="0" step=".01"
          value={r.price} onChange={e=>patchRow(i,{price:e.target.value})}/></td>
        <td><input aria-label={"Остаток "+boxName(r.selection)} type="number" min="0" step="1"
          value={r.stock} onChange={e=>patchRow(i,{stock:Number(e.target.value)})}/></td>
        <td><input type="checkbox" aria-label={"Активность "+boxName(r.selection)} checked={r.active}
          onChange={e=>patchRow(i,{active:e.target.checked})}/></td>
        <td><button type="button" onClick={()=>setSelected(selected===i?null:i)}>
          Фото ({r.images.length})</button></td>
       </tr>)}</tbody>
      </table></div>
      {selected!==null&&rows[selected]&&<div className="variant-photo-panel">
       <h3>Фотографии: {boxName(rows[selected].selection)}</h3>
       <p className="variant-help">Если фотографий нет, будет использоваться общая галерея товара.</p>
       <AdminImageManager images={rows[selected].images} disabled={busy} onBusyChange={setUploading}
         onChange={images=>patchRow(selected,{images})}/>
       </div>}
    </>}
    <div className="admin-form-bottom">
      <button type="button" disabled={busy||uploading} onClick={onClose}>Отмена</button>
      <button type="button" className="admin-primary" disabled={busy||uploading||dirty||combos.length>100}
        onClick={()=>void save()}>{uploading?"Загружаем фото…":"Сохранить варианты"}</button>
    </div>
   </>}
  </div>
 </div>;
}
