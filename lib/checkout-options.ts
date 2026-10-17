// No payment provider is configured in Vira Shop 0.14.
// Prices and availability must always be rechecked in the server transaction.
import type {DeliveryMethod} from "@/lib/logistics";
export type {DeliveryMethod} from "@/lib/logistics";
export type PickupContact={recipient:string;phone:string};
export const PAYMENT_METHOD="not_configured" as const;
export const PAYMENT_STATUS="unpaid" as const;
export const DELIVERY_PENDING="pending" as const;
export function deliveryMethod(value:unknown):DeliveryMethod|null{
 return value==="pickup"||value==="courier"||value==="transport"||value==="ozon_pvz"?value:null;
}
export function pickupContact(value:unknown):PickupContact|null{
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const row=value as Record<string,unknown>;
 if(typeof row.recipient!=="string"||typeof row.phone!=="string")return null;
 const recipient=row.recipient.trim(),phone=row.phone.trim();
 if(recipient.length<2||recipient.length>120||!/^[+0-9()\s-]{6,32}$/.test(phone))return null;
 return {recipient,phone};
}
export function deliveryPrice(method:DeliveryMethod):number|null{
 // Pickup is free; courier terms will be agreed by the seller, not billed here.
 return method==="pickup"?0:null;
}
