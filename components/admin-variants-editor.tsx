"use client";
import {useEffect,useMemo,useState} from "react";
import AdminImageManager from "@/components/admin-image-manager";
import {combinations,signature,type VariantGroup,type VariantSelection,type StoreVariant} from "@/lib/variants";

type Row={selection:VariantSelection[];price:string;oldPrice:string;stock:number;active:boolean;images:string[];article?:string};
const asMoney=(minor:string)=> (Number(minor)/100).toFixed(2);
const makeRow=(selection:VariantSelection[],price:string,stock:number):Row=>({selection,price,oldPrice:"",stock,active:true,images:[]});
const GROUP_TEMPLATES:VariantGroup[]=[
 {name:"Цвет",type:"color",values:[{label:"Чёрный",color:"#222222"},{label:"Белый",color:"#ffffff"}]},
 {name:"Размер",type:"text",values:[{label:"S"},{label:"M"},{label:"L"}]},
 {name:"Длина",type:"text",values:[{label:"20 м"},{label:"50 м"}]},
 {name:"Комплектация",type:"text",values:[{label:"1 шт."},{label:"2 шт."}]},
];
const validMoney=(value:string)=>/^\d{1,10}(\.\d{1,2})?$/.test(value);
export default function AdminVariantsEditor({productId,price,stock,onClose,onSaved}:{
 productId:string;price:string;stock:number;onClose:()=>void;onSaved:()=>void;
}){
 const [groups,setGroups]=useState<VariantGroup[]>([]);
 const [rows,setRows]=useState<Row[]>([]);
 const [selected,setSelected]=useState<number|null>(null);
 const [busy,setBusy]=useState(true),[uploading,setUploading]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [dirty,setDirty]=useState(false);
 const [modified,setModified]=useState(false);
 const [checked,setChecked]=useState<string[]>([]);
 const [bulkPrice,setBulkPrice]=useState("");
 const [bulkStock,setBulkStock]=useState("");
 const [filterRows,setFilterRows]=useState("");
 useEffect(()=>{
  let mounted=true;
  fetch("/api/admin/products/"+encodeURIComponent(productId)+"/variants",{cache:"no-store"})
   .then(async response=>{
     const data=await response.json() as {groups?:VariantGroup[];variants?:StoreVariant[];error?:string};
     if(!response.ok)throw Error(data.error||"Ошибка загрузки вариантов.");
     if(!mounted)return;
     setGroups(data.groups??[]);
     setRows((data.variants??[]).map(x=>({article:x.article,
       selection:x.selection,price:asMoney(x.priceMinor),oldPrice:x.oldPriceMinor?asMoney(x.oldPriceMinor):"",
       stock:x.stock,images:x.images,active:x.active})));
     setSelected(null);setModified(false);
  }).catch(e=>{if(mounted)setError(e instanceof Error?e.message:"Ошибка загрузки.");})
   .finally(()=>{if(mounted)setBusy(false);});
  return()=>{mounted=false};
 },[productId]);
 const combos=useMemo(()=>combinations(groups),[groups]);
 function updateGroups(groups:VariantGroup[]){setGroups(groups);setDirty(true);setModified(true);setNotice("");}
 function updateGroup(i:number,patch:Partial<VariantGroup>){
  updateGroups(groups.map((g,j)=>j===i?{...g,...patch}:g));
 }
 function updateOption(i:number,j:number,patch:Partial<VariantGroup["values"][number]>){
  updateGroup(i,{values:groups[i].values.map((v,k)=>k===j?{...v,...patch}:v)});
 }
 function generate(){
  if(!groups.length){setRows([]);setSelected(null);setChecked([]);setDirty(false);setModified(true);return;}
  if(!combos.length||combos.length>100){setError("Нужно от 1 до 100 комбинаций.");return;}
  const existing=new Map(rows.map(r=>[signature(r.selection),r]));
  setRows(combos.map(selection=>existing.get(signature(selection))??makeRow(selection,price,stock)));
  setSelected(null);setChecked([]);setDirty(false);setModified(true);setError("");setNotice("Комбинации сформированы. Проверьте цены и остатки перед сохранением.");
 }
 function patchRow(i:number,patch:Partial<Row>){
  setRows(prev=>prev.map((r,k)=>k===i?{...r,...patch}:r));setModified(true);setNotice("");
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
 const filtered=rows.map((row,index)=>({row,index})).filter(({row})=>boxName(row.selection)
   .toLocaleLowerCase("ru").includes(filterRows.toLocaleLowerCase("ru").trim())||
   row.article?.includes(filterRows.trim()));
 const selectedSet=new Set(checked);
 function toggleRow(key:string,enabled:boolean){
  setChecked(before=>enabled?[...new Set([...before,key])]:before.filter(k=>k!==key));
 }
 function bulkApply(){
  if(!checked.length){setError("Сначала отметьте нужные комбинации.");return;}
  const newPrice=bulkPrice.trim().replace(",",".");
  const newStock=bulkStock.trim();
  if(newPrice&&!validMoney(newPrice)){setError("Цена должна быть в рублях, не больше двух знаков после точки.");return;}
  if(newStock&&(!/^\d+$/.test(newStock)||Number(newStock)>100000000)){setError("Некорректный остаток.");return;}
  if(!newPrice&&!newStock){setError("Укажите цену или остаток для массового изменения.");return;}
  setRows(before=>before.map(r=>selectedSet.has(signature(r.selection))?{
    ...r,...(newPrice?{price:newPrice}:{}),...(newStock?{stock:Number(newStock)}:{})
  }:r));
  setError("");setNotice("Изменены выбранные комбинации. Нажмите «Сохранить варианты».");
  setModified(true);
 }
 function bulkVisibility(active:boolean){
  if(!checked.length){setError("Сначала отметьте нужные комбинации.");return;}
  setRows(before=>before.map(r=>selectedSet.has(signature(r.selection))?{...r,active}:r));
  setModified(true);setError("");setNotice("Статус выбранных комбинаций изменён. Сохраните варианты.");
 }
 function close(){
  if(busy||uploading)return;
  if(modified&&!window.confirm("Есть несохранённые изменения вариантов. Закрыть без сохранения?"))return;
  onClose();
 }
 return <div className="admin-modal-overlay" onClick={close}>
  <div className="admin-modal variant-admin-modal" role="dialog" aria-modal="true"
    aria-label="Редактор вариантов товара" onClick={e=>e.stopPropagation()}>
   <div className="admin-modal-heading"><div><span className="admin-eyebrow">АРТИКУЛ {productId}</span><h2>Варианты товара</h2></div>
     <button onClick={close} disabled={busy||uploading} aria-label="Закрыть">×</button></div>
   {error&&<p role="alert" className="buyer-error">{error}</p>}
   {notice&&<p role="status" className="buyer-notice">{notice}</p>}
   {busy?<p>Загрузка вариантов…</p>:<>
    <p className="variant-help">Создайте до 3 параметров (цвет, длина, размер, комплектация). У каждого до 12 значений. Максимум 100 комбинаций. Если вариантов нет, товар продаётся как раньше.</p>
    <div className="variant-template-row"><span>Добавить шаблон:</span>
      {GROUP_TEMPLATES.map(template=><button key={template.name} type="button"
        disabled={groups.length>=3||groups.some(g=>g.name.toLocaleLowerCase("ru")===template.name.toLocaleLowerCase("ru"))}
        onClick={()=>updateGroups([...groups,{...template,values:template.values.map(v=>({...v}))}])}>
        + {template.name}
      </button>)}
    </div>
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
      <div className="variant-bulk-panel" aria-label="Массовое редактирование комбинаций">
        <strong>Массовое изменение · выбрано {checked.length} из {rows.length}</strong>
        <div className="variant-bulk-fields">
          <label>Цена, ₽ <input type="text" inputMode="decimal" placeholder="Например, 1990"
            value={bulkPrice} onChange={e=>setBulkPrice(e.target.value)} maxLength={15}/></label>
          <label>Остаток, шт. <input type="number" min="0" step="1" max="100000000" placeholder="Например, 25"
            value={bulkStock} onChange={e=>setBulkStock(e.target.value)}/></label>
          <button type="button" disabled={!checked.length} onClick={bulkApply}>Применить</button>
        </div>
        <div className="variant-bulk-actions">
          <button type="button" disabled={!checked.length} onClick={()=>bulkVisibility(true)}>Показать выбранные</button>
          <button type="button" disabled={!checked.length} onClick={()=>bulkVisibility(false)}>Скрыть выбранные</button>
          <button type="button" disabled={!checked.length} onClick={()=>setChecked([])}>Снять выделение</button>
        </div>
      </div>
      <label className="variant-filter-label">Найти комбинацию
        <input type="search" placeholder="Поиск по значению или артикулу" maxLength={120}
          value={filterRows} onChange={e=>setFilterRows(e.target.value)}/>
      </label>
      <div className="variant-table-scroll"><table className="admin-table variant-table">
       <thead><tr><th><input type="checkbox" aria-label="Выбрать все видимые комбинации"
          checked={filtered.length>0&&filtered.every(({row})=>selectedSet.has(signature(row.selection)))}
          onChange={e=>setChecked(before=>e.target.checked?
            [...new Set([...before,...filtered.map(({row})=>signature(row.selection))])]:
            before.filter(key=>!filtered.some(({row})=>signature(row.selection)===key)))}/></th><th>Комбинация / артикул</th><th>Цена ₽</th><th>Старая цена ₽</th><th>Остаток</th><th>Активен</th><th>Фото</th></tr></thead>
       <tbody>{filtered.map(({row:r,index:i})=><tr key={signature(r.selection)}>
        <td><input type="checkbox" aria-label={"Выбрать "+boxName(r.selection)}
          checked={selectedSet.has(signature(r.selection))}
          onChange={e=>toggleRow(signature(r.selection),e.target.checked)}/></td>
        <td><strong>{boxName(r.selection)}</strong><small>{r.article?"Артикул "+r.article:"Новый артикул после сохранения"}</small></td>
        <td><input aria-label={"Цена "+boxName(r.selection)} type="number" min="0" step=".01"
          value={r.price} onChange={e=>patchRow(i,{price:e.target.value})}/></td>
        <td><input aria-label={"Старая цена "+boxName(r.selection)} type="number" min="0" step=".01"
          value={r.oldPrice} onChange={e=>patchRow(i,{oldPrice:e.target.value})}/></td>
        <td><input aria-label={"Остаток "+boxName(r.selection)} type="number" min="0" step="1"
          value={r.stock} onChange={e=>patchRow(i,{stock:Number(e.target.value)})}/></td>
        <td><input type="checkbox" aria-label={"Активность "+boxName(r.selection)} checked={r.active}
          onChange={e=>patchRow(i,{active:e.target.checked})}/></td>
        <td><button type="button" onClick={()=>setSelected(selected===i?null:i)}>
          Фото ({r.images.length})</button></td>
       </tr>)}</tbody>
      </table></div>
      {filtered.length===0&&<p className="variant-help">Комбинации не найдены.</p>}
      {selected!==null&&rows[selected]&&<div className="variant-photo-panel">
       <h3>Фотографии: {boxName(rows[selected].selection)}</h3>
       <p className="variant-help">Если фотографий нет, будет использоваться общая галерея товара.</p>
       <AdminImageManager images={rows[selected].images} disabled={busy} onBusyChange={setUploading}
         onChange={images=>patchRow(selected,{images})}/>
       </div>}
    </>}
    <div className="admin-form-bottom">
      <button type="button" disabled={busy||uploading} onClick={close}>Отмена</button>
      <button type="button" className="admin-primary" disabled={busy||uploading||dirty||combos.length>100}
        onClick={()=>void save()}>{uploading?"Загружаем фото…":"Сохранить варианты"}</button>
    </div>
   </>}
  </div>
 </div>;
}
