import assert from "node:assert/strict";
import {distanceKm,recommendPickupPoint,validLogisticsTransition,isDeliveryPoint} from "../lib/logistics.ts";
const p=(id,latitude,longitude)=>({
 provider:"ozon",id,name:"Тестовый ПВЗ "+id,address:"Тестовый адрес "+id,
 city:"Учебный город",latitude,longitude
});
const near=p("near",55.75,37.62);
const far=p("far",55.91,37.75);
const wrong={...p("invalid",200,200)};
assert.equal(isDeliveryPoint(wrong),false);
assert.equal(distanceKm({latitude:55.75,longitude:37.62},near),0);
assert.ok(distanceKm({latitude:55.75,longitude:37.62},far)>0);
assert.equal(recommendPickupPoint({latitude:55.75,longitude:37.62},[far,wrong,near])?.id,"near");
assert.equal(recommendPickupPoint({latitude:55.75,longitude:37.62},[]),null);
assert.equal(validLogisticsTransition("preparing","ready_for_pickup","pickup"),true);
assert.equal(validLogisticsTransition("preparing","ready_for_pickup","transport"),false);
assert.equal(validLogisticsTransition("preparing","handed_over","pickup"),false);
assert.equal(validLogisticsTransition("preparing","handed_over","transport"),true);
assert.equal(validLogisticsTransition("delivered","in_transit","transport"),false);
console.log("Logistics: verified nearest point algorithm and method-specific transitions passed.");
