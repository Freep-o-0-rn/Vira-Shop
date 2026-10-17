import assert from "node:assert/strict";
import {chooseVariant,optionAvailability} from "../lib/variant-selection.ts";
const groups=[
 {name:"Цвет",type:"color",values:[{label:"Красный"},{label:"Синий"},{label:"Зелёный"}]},
 {name:"Длина",type:"text",values:[{label:"20 м"},{label:"50 м"}]}
];
const mk=(article,color,length,stock,active=true)=>({
 article,selection:[{name:"Цвет",value:color},{name:"Длина",value:length}],
 priceMinor:"10000",oldPriceMinor:null,stock,images:[],active
});
const red20=mk("200000001","Красный","20 м",0);
const red50=mk("200000002","Красный","50 м",3);
const blue50=mk("200000003","Синий","50 м",9);
const blue20=mk("200000004","Синий","20 м",5,false);
const variants=[red20,red50,blue50,blue20];
assert.equal(chooseVariant(variants,red20,0,"Синий")?.article,blue50.article,
 "Changing color must select a real available combination");
assert.equal(chooseVariant(variants,blue50,0,"Красный")?.article,red50.article,
 "Keep length when possible");
assert.equal(chooseVariant(variants,red20,1,"50 м")?.article,red50.article);
assert.equal(chooseVariant(variants,red20,0,"Зелёный"),null);
assert.equal(optionAvailability(variants,red20,groups[0],0,"Зелёный"),"unavailable");
assert.equal(optionAvailability(variants,red20,groups[0],0,"Синий"),"changes-other-options");
assert.equal(optionAvailability(variants,red20,groups[1],1,"20 м"),"sold-out");
assert.equal(optionAvailability(variants,red20,groups[1],1,"50 м"),"available");
assert.equal(optionAvailability(variants,blue50,groups[0],0,"Синий"),"available");
console.log("Variant switching: real combinations, incompatibility, and stock states passed.");
