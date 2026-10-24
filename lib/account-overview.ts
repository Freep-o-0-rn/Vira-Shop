// Presentation-only customer order helpers. No guessed delivery dates or statuses.
export type AccountOrderFilter="all"|"active"|"completed"|"cancelled";
export type OrderStage="active"|"completed"|"cancelled";

export function orderStage(status:string):OrderStage{
 if(status==="completed")return "completed";
 if(status==="cancelled")return "cancelled";
 return "active";
}
export function matchesOrderFilter(status:string,filter:AccountOrderFilter):boolean{
 return filter==="all"||orderStage(status)===filter;
}
export function accountOrderCounts(orders:ReadonlyArray<{status:string}>){
 return {
  all:orders.length,
  active:orders.filter(order=>orderStage(order.status)==="active").length,
  completed:orders.filter(order=>orderStage(order.status)==="completed").length,
  cancelled:orders.filter(order=>orderStage(order.status)==="cancelled").length
 };
}
export const ORDER_FILTERS:{value:AccountOrderFilter;label:string}[]=[
 {value:"all",label:"Все"},
 {value:"active",label:"В работе"},
 {value:"completed",label:"Завершены"},
 {value:"cancelled",label:"Отменены"}
];
