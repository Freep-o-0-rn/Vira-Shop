import {NextRequest,NextResponse} from "next/server";
import {customerGuard,noStore,publicError} from "@/lib/server/customer-auth";
export const runtime="nodejs";export const dynamic="force-dynamic";

/** Ozon adapter boundary. No storefront PVZ can be selected unless official
 * provider data and buyer address geocoding are available. Never invent points.
 */
export async function GET(req:NextRequest){
 try{
  const auth=await customerGuard(req);if(auth.response)return auth.response;
  return NextResponse.json({
    available:false,provider:"ozon",points:[],recommended:null,
    code:"OZON_PROVIDER_NOT_CONNECTED",
    error:"ПВЗ Ozon станут доступны после подключения Ozon Доставки и проверки адреса покупателя."
  },{status:503,headers:noStore});
 }catch(err){return publicError(err);}
}
