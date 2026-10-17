import assert from "node:assert/strict";
import {EMOJI_CHOICES,suggestCategoryEmoji,suggestedSpecs,fillMissingSpecs} from "../lib/admin-form-helpers.ts";
import {categoryInput} from "../lib/server/admin-validation.ts";
assert.equal(suggestCategoryEmoji("Беспроводные наушники"),"🎧");
assert.equal(suggestCategoryEmoji("Смартфоны"),"📱");
assert.equal(suggestCategoryEmoji("Ноутбуки"),"💻");
assert.equal(suggestCategoryEmoji("Товары для дома"),"🏠");
assert.equal(suggestCategoryEmoji("Коврики для фитнеса"),"🏋️");
assert.equal(suggestCategoryEmoji("Автозапчасти"),"🚗");
assert.equal(suggestCategoryEmoji("Подарки"),"🎁");
assert.equal(suggestCategoryEmoji("Несуществующая категория"),"📦");
for(const [category,expected] of [["Стиральные машины","🧺"],["Смартфоны и телефоны","📱"],["Компьютерные мыши","🖱️"],["Ноутбуки","💻"],["Кофеварки","☕"],["Чайники","☕"],["Случайные вещи","📦"],["Часы наручные","⌚"],["Автозапчасти","🚗"],["Кошки и коты","🐱"],["Шампуни","🧴"],["Сковороды","🍳"],["Холодильники","🧊"],["Детские игрушки","🧸"],["Мебель","🛋️"],["Подарочные наборы","🎁"],["Сумки","👜"],["Клавиатуры","⌨️"],["Роутеры","📡"],["Рыбалка","🎣"],["Пазлы","🧩"],["Кроссовки","👟"],["Книги","📚"],["Молочные продукты","🥛"],["Садовые растения","🪴"],["Строительные инструменты","🛠️"],["Электроника","💻"],["Товары для дома","🏠"],["ВЕЛОСИПЕДЫ","🚴"],["Цветы","🪴"]]) {
 assert.equal(suggestCategoryEmoji(category),expected,"Emoji for "+category);
}
assert.ok(EMOJI_CHOICES.reduce((n,g)=>n+g.items.length,0)>=45);
assert.ok(suggestedSpecs("Электроника").includes("Модель"));
const specs=fillMissingSpecs([{name:"Материал",value:"Дерево"}],["Материал","Цвет"]);
assert.deepEqual(specs,[{name:"Материал",value:"Дерево"},{name:"Цвет",value:""}]);
assert.equal(fillMissingSpecs(Array.from({length:20},(_,i)=>({name:String(i),value:"x"})),["Бренд"]).length,20);
const category={id:"test-category",title:"Тест",emoji:"👩🏽‍💻",tone:"blue",active:true};
assert.ok("data" in categoryInput(category));
assert.ok("data" in categoryInput({...category,emoji:"👨‍👩‍👧‍👦"}));
assert.ok("error" in categoryInput({...category,emoji:"😀".repeat(49)}));
console.log("Russian emoji matching, composite emoji validation and specs pass.");
