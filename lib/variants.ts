// Stable structures shared between product pages and admin forms.
export type VariantOption={label:string;color?:string;image?:string};
export type VariantGroup={name:string;type:"text"|"color"|"image";values:VariantOption[]};
export type VariantSelection={name:string;value:string};
export type StoreVariant={
  article:string;selection:VariantSelection[];
  priceMinor:string;oldPriceMinor:string|null;stock:number;images:string[];active:boolean;
};
export function signature(selection:VariantSelection[]):string{
  return JSON.stringify(selection.map(x=>[x.name,x.value]));
}
export function combinations(groups:VariantGroup[]):VariantSelection[][]{
  if(!groups.length)return [];
  return groups.reduce<VariantSelection[][]>((acc,g)=>
    acc.flatMap(row=>g.values.map(value=>[...row,{name:g.name,value:value.label}])),[[]]);
}
