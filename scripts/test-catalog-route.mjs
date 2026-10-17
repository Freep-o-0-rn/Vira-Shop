import assert from "node:assert/strict";
import {catalogHref,defaultCatalogRoute,parseCatalogRoute,pathToView} from "../lib/catalog-route.ts";

assert.equal(pathToView("/"),"home");
assert.equal(pathToView("/catalog"),"catalog");
assert.equal(pathToView("/catalog/"),"catalog");
assert.equal(pathToView("/favorites"),"favorites");
assert.equal(pathToView("/cart"),"cart");

const filters={
 q:"беспроводные наушники",category:"electronics",sort:"cheap",
 page:3,minPrice:"1200.50",maxPrice:"9500",inStock:true
};
const href=catalogHref(filters);
assert.ok(href.startsWith("/catalog?"));
assert.deepEqual(parseCatalogRoute(href.split("?")[1]),filters);
assert.equal(catalogHref(defaultCatalogRoute),"/catalog");
assert.deepEqual(parseCatalogRoute(""),defaultCatalogRoute);
assert.equal(catalogHref({...defaultCatalogRoute,category:"sports"}),"/catalog?category=sports");
assert.equal(catalogHref({...defaultCatalogRoute,page:2}),"/catalog?page=2");

const invalid=parseCatalogRoute("category=xyz%2Fsomething&sort=DROP+TABLE&page=-1&minPrice=foo&maxPrice=-20&inStock=maybe");
assert.equal(invalid.category,"");
assert.equal(invalid.sort,"popular");
assert.equal(invalid.page,1);
assert.equal(invalid.minPrice,"");
assert.equal(invalid.maxPrice,"");
assert.equal(invalid.inStock,false);

const range=parseCatalogRoute("minPrice=500&maxPrice=300");
assert.equal(range.minPrice,"");
assert.equal(range.maxPrice,"");
assert.equal(parseCatalogRoute("page=100001").page,1);
assert.equal(parseCatalogRoute("page=100000").page,100000);
assert.equal(parseCatalogRoute("q=%D1%87%D0%B0%D1%81%D1%8B").q,"часы");
assert.equal(parseCatalogRoute("inStock=true").inStock,true);
console.log("Catalog URL navigation tests passed.");
