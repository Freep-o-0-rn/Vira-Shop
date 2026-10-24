import { localDemoPhoto } from "@/lib/demo-image-url";
// Демонстрационные данные. Цены, скидки, наличие и отзывы вымышлены.
export type Category = string;
export type ProductSpec = { name: string; value: string };
export type Product = { images?: string[]; specs?: ProductSpec[]; id: string; title: string; subtitle: string; category: Category; price: number; oldPrice?: number; rating: number; reviews: number; image: string; badge?: string; description: string; stock?: number; hasVariants?: boolean };
export type StoreCategory = { id: Category; title: string; emoji: string; tone: string };
export const categories: StoreCategory[] = [
  { id: "electronics", title: "Электроника", emoji: "🎧", tone: "blue" },
  { id: "home", title: "Дом и уют", emoji: "🛋️", tone: "peach" },
  { id: "beauty", title: "Красота", emoji: "🧴", tone: "pink" },
  { id: "sports", title: "Спорт", emoji: "👟", tone: "green" },
  { id: "accessories", title: "Аксессуары", emoji: "⌚", tone: "lilac" },
];
const u = (id: string) => localDemoPhoto("https://images.unsplash.com/" + id + "?auto=format&fit=crop&w=650&q=80");
export const products: Product[] = [
  { id:"p1", title:"Беспроводные наушники", subtitle:"Шумоподавление · до 30 часов", category:"electronics", price:3490, oldPrice:5990, rating:4.9, reviews:248, image:u("photo-1505740420928-5e560c06d30e"), badge:"Хит", description:"Удобные наушники для музыки, работы и поездок. Учебная карточка товара." },
  { id:"p2", title:"Умные часы", subtitle:"Мониторинг активности · Bluetooth", category:"electronics", price:4990, oldPrice:7490, rating:4.8, reviews:187, image:u("photo-1523275335684-37898b6baf30"), badge:"−33%", description:"Стильные часы для уведомлений и повседневной активности. Учебная карточка." },
  { id:"p3", title:"Городские кроссовки", subtitle:"Лёгкая подошва · унисекс", category:"sports", price:2890, oldPrice:4290, rating:4.7, reviews:391, image:u("photo-1542291026-7eec264c27ff"), badge:"Выгодно", description:"Лёгкая обувь для прогулок и города. Учебная карточка." },
  { id:"p4", title:"Настольная лампа", subtitle:"Мягкий свет · минимализм", category:"home", price:1790, oldPrice:2390, rating:4.8, reviews:83, image:u("photo-1507473885765-e6ed057f782c"), description:"Минималистичная лампа для дома и рабочего места." },
  { id:"p5", title:"Цифровая фотокамера", subtitle:"Компактная · фото и видео", category:"electronics", price:16990, oldPrice:19990, rating:4.9, reviews:129, image:u("photo-1516035069371-29a1b244cc32"), badge:"Новинка", description:"Камера для путешествий и творчества. Учебная карточка." },
  { id:"p6", title:"Декоративная подушка", subtitle:"Мягкий текстиль · 45 × 45 см", category:"home", price:890, oldPrice:1390, rating:4.6, reviews:56, image:u("photo-1584100936595-c0654b55a2e2"), description:"Подушка для уютного интерьера. Учебная карточка." },
  { id:"p7", title:"Сыворотка для лица", subtitle:"Уход · 30 мл", category:"beauty", price:1190, oldPrice:1590, rating:4.8, reviews:218, image:u("photo-1608248543803-ba4f8c70ae0b"), description:"Демонстрационный косметический продукт без подтверждённых заявлений о свойствах." },
  { id:"p8", title:"Чехол для ноутбука", subtitle:"Водоотталкивающая ткань", category:"accessories", price:1490, oldPrice:2190, rating:4.7, reviews:74, image:u("photo-1498050108023-c5249f4df085"), description:"Аксессуар для переноски и защиты ноутбука." },
  { id:"p9", title:"Солнцезащитные очки", subtitle:"Лёгкая оправа · унисекс", category:"accessories", price:1290, oldPrice:1990, rating:4.5, reviews:92, image:u("photo-1511499767150-a48a237f0083"), description:"Повседневные очки. Учебная карточка." },
  { id:"p10", title:"Коврик для фитнеса", subtitle:"Нескользящий · для тренировок", category:"sports", price:1990, oldPrice:2990, rating:4.8, reviews:146, image:u("photo-1599447421416-3414500d18a5"), description:"Коврик для домашних тренировок." },
  { id:"p11", title:"Домашняя кофеварка", subtitle:"Компактная · для кухни", category:"home", price:5490, oldPrice:6990, rating:4.9, reviews:203, image:u("photo-1517256673644-36ad11246d21"), badge:"Популярное", description:"Компактная кофеварка для домашней кухни." },
  { id:"p12", title:"Подарочный набор", subtitle:"Аксессуары для ухода", category:"beauty", price:2390, oldPrice:3490, rating:4.7, reviews:164, image:u("photo-1596462502278-27bfdc403348"), description:"Демонстрационный набор косметических принадлежностей." },
];
export const rub = (price: number) => new Intl.NumberFormat("ru-RU").format(price) + " ₽";
