// Logistics status is independent of the shop's commercial order status.
// Automated moves require a verified event (e.g. manager confirmation or carrier webhook).
export type DeliveryMethod="pickup"|"courier"|"transport"|"ozon_pvz";
export type LogisticsStatus="awaiting_confirmation"|"sourcing"|"preparing"|
 "ready_for_pickup"|"handed_over"|"in_transit"|"ready_for_collection"|"delivered"|"cancelled";
export type FulfillmentSource="own_stock"|"purchase_to_order";
export const LOGISTICS_LABELS:Record<LogisticsStatus,string>={
 awaiting_confirmation:"Ожидает подтверждения",sourcing:"Ожидает закупки",
 preparing:"Подготовка",ready_for_pickup:"Готов к самовывозу",
 handed_over:"Передан перевозчику",in_transit:"В пути",
 ready_for_collection:"Готов к получению",delivered:"Получен покупателем",cancelled:"Отменён"
};
export const DELIVERY_LABELS:Record<DeliveryMethod,string>={
 pickup:"Самовывоз",courier:"Доставка по адресу",transport:"Транспортная компания",ozon_pvz:"ПВЗ Ozon"
};
export const CARRIER_CODES=["ozon","cdek","russian_post","other"] as const;
export const ALLOWED_LOGISTICS:Record<LogisticsStatus,LogisticsStatus[]>={
 awaiting_confirmation:["sourcing","preparing","cancelled"],
 sourcing:["preparing","cancelled"],
 preparing:["ready_for_pickup","handed_over","cancelled"],
 ready_for_pickup:["delivered","cancelled"],
 handed_over:["in_transit","ready_for_collection","cancelled"],
 in_transit:["ready_for_collection","delivered","cancelled"],
 ready_for_collection:["delivered","cancelled"],delivered:[],cancelled:[]
};
export function validLogisticsTransition(current:LogisticsStatus,next:LogisticsStatus,method:DeliveryMethod):boolean{
 if(!ALLOWED_LOGISTICS[current]?.includes(next))return false;
 if(next==="ready_for_pickup"&&method!=="pickup")return false;
 if((next==="handed_over"||next==="in_transit"||next==="ready_for_collection")&&method==="pickup")return false;
 return true;
}
export type DeliveryPoint={provider:"ozon";id:string;name:string;address:string;city:string;
 latitude:number;longitude:number};
export function isDeliveryPoint(value:unknown):value is DeliveryPoint{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const p=value as Record<string,unknown>;
 return p.provider==="ozon"&&typeof p.id==="string"&&p.id.length>0&&p.id.length<=120&&
 typeof p.name==="string"&&p.name.length>0&&p.name.length<=160&&
 typeof p.address==="string"&&p.address.length>0&&p.address.length<=300&&
 typeof p.city==="string"&&p.city.length>0&&p.city.length<=120&&
 typeof p.latitude==="number"&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&
 typeof p.longitude==="number"&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180;
}
export function distanceKm(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}):number{
 const rad=Math.PI/180,dLat=(b.latitude-a.latitude)*rad,dLon=(b.longitude-a.longitude)*rad;
 const x=Math.sin(dLat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dLon/2)**2;
 return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));
}
export function recommendPickupPoint(origin:{latitude:number;longitude:number},
 points:DeliveryPoint[]):DeliveryPoint|null{
 const verified=points.filter(isDeliveryPoint);
 return verified.sort((a,b)=>distanceKm(origin,a)-distanceKm(origin,b))[0]??null;
}
