import type {StoreVariant,VariantGroup} from "./variants";

// These selectors are deterministic and independent of React; user selection must
// never invent a combination that was not explicitly saved by the seller.
export function chooseVariant(variants:StoreVariant[],current:StoreVariant|null,groupIndex:number,label:string):StoreVariant|null{
  const list=variants.filter(v=>v.active&&v.selection[groupIndex]?.value===label);
  if(!list.length)return null;
  const previous=current?.selection??[];
  const score=(v:StoreVariant)=>v.selection.reduce((acc,item,index)=>
    acc+(index!==groupIndex&&item.name===previous[index]?.name&&item.value===previous[index]?.value?1:0),0);
  return [...list].sort((a,b)=>score(b)-score(a)||
    Number(b.stock>0)-Number(a.stock>0)||a.article.localeCompare(b.article))[0];
}
export type OptionAvailability="unavailable"|"available"|"sold-out"|"changes-other-options";
export function optionAvailability(variants:StoreVariant[],current:StoreVariant|null,group:VariantGroup,
  groupIndex:number,label:string):OptionAvailability{
  const possible=variants.filter(v=>v.active&&v.selection[groupIndex]?.name===group.name&&
    v.selection[groupIndex]?.value===label);
  if(!possible.length)return "unavailable";
  if(!current)return possible.some(v=>v.stock>0)?"available":"sold-out";
  const compatible=possible.filter(v=>v.selection.every((item,index)=>
    index===groupIndex||(item.name===current.selection[index]?.name&&item.value===current.selection[index]?.value)));
  if(compatible.length){
    return compatible.some(v=>v.stock>0)?"available":"sold-out";
  }
  return "changes-other-options";
}
