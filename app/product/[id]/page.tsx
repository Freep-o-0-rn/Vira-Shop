import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, listProducts } from "@/lib/server/store";
import { listCategories } from "@/lib/server/store";
import { rub } from "@/lib/catalog";
import ProductGalleryAndCart from "@/components/product-gallery-cart";

export const dynamic="force-dynamic";
type Params={params:Promise<{id:string}>};

export async function generateMetadata({params}:Params): Promise<Metadata> {
  const {id}=await params;
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(id))return {title:"Товар не найден"};
  const product=await getProduct(id).catch(()=>null);
  if(!product)return {title:"Товар не найден"};
  return {title:product.title,description:product.description.slice(0,160),robots:{index:false,follow:false}};
}

export default async function ProductPage({params}:Params) {
  const {id}=await params;
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(id))notFound();
  let product;
  try {product=await getProduct(id);}
  catch {
    return <main className="container product-unavailable">
      <h1>Каталог временно недоступен</h1>
      <p>Проверьте подключение к базе данных и повторите попытку.</p>
      <Link href="/catalog">Вернуться в каталог</Link>
    </main>;
  }
  if(!product)notFound();
  const [categoryData,similarData]=await Promise.all([
    listCategories().catch(()=>({items:[],source:"demo" as const})),
    listProducts({search:"",category:product.category,sort:"popular",page:1,limit:12,
      minPrice:null,maxPrice:null,inStock:false}).catch(()=>null)
  ]);
  const category=categoryData.items.find(c=>c.id===product.category);
  const similar=(similarData?.items ?? []).filter(p=>p.id!==id).slice(0,4);
  return <main className="container product-page">
    <nav className="product-breadcrumb">
      <Link href="/">Главная</Link><span>›</span><Link href={"/catalog?category="+encodeURIComponent(product.category)}>{category?.title || "Каталог"}</Link>
      <span>›</span><span>{product.title}</span>
    </nav>
    <h1>{product.title}</h1>
    <p className="product-page-subtitle">{product.subtitle}</p>
    <ProductGalleryAndCart product={product}/>
    <section className="product-description-section">
      <h2>О товаре</h2>
      <p>{product.description || "Описание товара пока не добавлено."}</p>
    </section>
    <section className="product-specs-section">
      <h2>Характеристики</h2>
      {product.specs?.length?<dl className="product-specs-list">
        {product.specs.map((s,i)=><div key={i}><dt>{s.name}</dt><dd>{s.value}</dd></div>)}
      </dl>:<p className="product-empty-specs">Продавец ещё не заполнил характеристики.</p>}
    </section>
    {similar.length>0 && <section className="product-related">
      <h2>Похожие товары</h2>
      <div className="product-related-grid">{similar.map(p=>
        <Link href={"/product/"+encodeURIComponent(p.id)} className="product-related-item" key={p.id}>
          {p.image?<img src={p.image} alt={p.title} loading="lazy"/>:<div className="product-image-placeholder">📦</div>}
          <strong>{rub(p.price)}</strong><span>{p.title}</span>
        </Link>
      )}</div>
    </section>}
    <p className="product-page-note">Демонстрационная версия Vira Shop. Тестовые заявки доступны; онлайн-оплата отключена.</p>
  </main>;
}
