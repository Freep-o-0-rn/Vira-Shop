// No external emoji service is required. Categories stay editable by the admin.
export const EMOJI_CHOICES=[
  {label:"Магазин",items:["📦","🛍️","🎁","🔥","⭐","💎"]},
  {label:"Электроника",items:["📱","💻","🖥️","⌨️","🎧","⌚","📷","🔌","🎮","📺"]},
  {label:"Дом",items:["🏠","🛋️","🛏️","🍳","☕","💡","🧹","🪴","🛠️","🧺"]},
  {label:"Одежда и красота",items:["👗","👕","👟","👠","🧥","👜","💄","💅","🧴","💍"]},
  {label:"Спорт и хобби",items:["⚽","🏋️","🚴","🏃","🏕️","🎣","📚","🎨","🎵","🧸"]},
  {label:"Разное",items:["🚗","🛞","🐶","🐱","🌿","🌸","👶","🍼","🍎","🥫"]},
] as const;

// More specific subjects must be checked before general category names.
const EMOJI_RULES:[RegExp,string][]=[
  [/наушник|гарнитур|headphone/i,"🎧"],
  [/телефон|смартфон|iphone|android|phone/i,"📱"],
  [/ноутбук|laptop|macbook/i,"💻"],
  [/телевизор|экран|tv\b/i,"📺"],
  [/компьютер|монитор|комплектующ|электроник|гаджет|техник/i,"💻"],
  [/час(?!т)|watch/i,"⌚"],
  [/фото|камер/i,"📷"],
  [/игр|gaming|гейм|консол/i,"🎮"],
  [/кофе|чай|напит/i,"☕"],
  [/кух|посуда|готовк/i,"🍳"],
  [/мебел|диван|кресл/i,"🛋️"],
  [/ламп|свет|освещен/i,"💡"],
  [/растен|цветы|сад|огород/i,"🪴"],
  [/дом|уют|интерьер|быт/i,"🏠"],
  [/кроссов|обув|ботин/i,"👟"],
  [/сумк|рюкзак|кошел/i,"👜"],
  [/одежд|футбол|куртк|плать|fashion/i,"👗"],
  [/косметик|макияж|красот|бьюти|уход|парфюм/i,"💄"],
  [/маникюр|ногт/i,"💅"],
  [/украшен|бижутер|ювелир/i,"💍"],
  [/фитнес|тренаж|гантел|спортзал/i,"🏋️"],
  [/велосипед|велоспорт/i,"🚴"],
  [/спорт|футбол|мяч/i,"⚽"],
  [/туризм|поход|кемпинг|палатк/i,"🏕️"],
  [/рыбалк|рыболов/i,"🎣"],
  [/книг|литератур|учебник/i,"📚"],
  [/детск|ребен|малыш|игруш|конструктор/i,"🧸"],
  [/авто|машин|запчаст|транспорт/i,"🚗"],
  [/питом|животн|зоотовар/i,"🐶"],
  [/еда|продукт|питани|бакале/i,"🍎"],
  [/подар|сувенир/i,"🎁"],
  [/аксессуар/i,"👜"],
];
export function suggestCategoryEmoji(title:string):string{
  const name=title.normalize("NFKC").toLocaleLowerCase("ru").trim();
  return EMOJI_RULES.find(([pattern])=>pattern.test(name))?.[1]??"📦";
}
export type Specification={name:string;value:string};
export function suggestedSpecs(category:string):string[]{
  const name=category.toLocaleLowerCase("ru");
  if(/электрон|телефон|ноутбук|техник|компьютер|гаджет/.test(name))
    return ["Бренд","Модель","Цвет","Материал","Гарантия"];
  if(/одежд|обув|мод|fashion/.test(name))
    return ["Бренд","Размер","Цвет","Материал","Сезон"];
  if(/красот|косметик|уход/.test(name))
    return ["Бренд","Тип","Объём","Состав","Страна производства"];
  if(/спорт|фитнес|туризм/.test(name))
    return ["Бренд","Размер","Материал","Цвет","Назначение"];
  if(/дом|уют|кухн|мебел/.test(name))
    return ["Бренд","Материал","Цвет","Размеры","Страна производства"];
  return ["Бренд","Материал","Цвет","Размеры"];
}
export function fillMissingSpecs(current:Specification[],names:string[]):Specification[]{
  const seen=new Set(current.map(s=>s.name.trim().toLocaleLowerCase("ru")).filter(Boolean));
  const out=[...current];
  for(const name of names){
    if(out.length>=20)break;
    const key=name.toLocaleLowerCase("ru");
    if(!seen.has(key)){out.push({name,value:""});seen.add(key);}
  }
  return out;
}
