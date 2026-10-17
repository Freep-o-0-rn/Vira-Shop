"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { categories as demoCategories, products as demoProducts, rub, type Category, type Product, type StoreCategory } from "@/lib/catalog";

type View = "home" | "catalog" | "favorites" | "cart";
type Sort = "popular" | "cheap" | "expensive" | "rating";
type Cart = Record<string, number>;
const CART_KEY = "vira-shop:cart:v1";
const FAVORITES_KEY = "vira-shop:favorites:v1";
const validId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

function restoreCart(): Cart {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(CART_KEY) || "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const next: Cart = {};
    for (const [id, qty] of Object.entries(raw)) {
      if (validId(id) && typeof qty === "number" && Number.isSafeInteger(qty) && qty >= 1 && qty <= 99) next[id] = qty;
    }
    return next;
  } catch { return {}; }
}
function restoreFavorites(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(raw) ? [...new Set(raw.filter((id): id is string => typeof id === "string" && validId(id)))] : [];
  } catch { return []; }
}
function Icon({ name }: { name: "heart" | "bag" | "search" | "grid" | "arrow" | "user" }) {
  const d: Record<string, string> = {
    heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
    bag: "M5 8h14l1 13H4L5 8Zm4 0V6a3 3 0 0 1 6 0v2",
    search: "m21 21-4.5-4.5M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
    arrow: "M4 12h16m-6-6 6 6-6 6",
    user: "M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  };
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d[name]}/></svg>;
}
function ProductCard({ p, liked, quantity, onLike, onAdd, onOpen }: { p: Product; liked: boolean; quantity: number; onLike: () => void; onAdd: () => void; onOpen: () => void }) {
  return <article className="product-card">
    <div className="product-visual" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <img src={p.image} alt={p.title} loading="lazy"/>
      {p.badge && <span className="product-badge">{p.badge}</span>}
      <button type="button" className={"like-button " + (liked ? "liked" : "")} aria-label={liked ? "Удалить из избранного" : "В избранное"} aria-pressed={liked} onClick={(e) => { e.stopPropagation(); onLike(); }}><Icon name="heart"/></button>
    </div>
    <div className="product-body">
      <div className="prices"><strong>{rub(p.price)}</strong>{p.oldPrice && <s>{rub(p.oldPrice)}</s>}</div>
      <button type="button" className="product-name" onClick={onOpen}>{p.title}</button>
      <p>{p.subtitle}</p>
      <div className="rating"><span>★ {p.rating.toFixed(1)}</span> <span className="muted">· {p.reviews} отзывов</span></div>
      <button type="button" className={"buy-button " + (quantity ? "in-cart" : "")} disabled={p.stock === 0 || (p.stock !== undefined && quantity >= p.stock)} onClick={onAdd}>{p.stock === 0 ? "Нет в наличии" : (p.stock !== undefined && quantity >= p.stock) ? "Доступное количество в корзине" : quantity ? "Добавить ещё · " + quantity : "В корзину"}</button>
    </div>
  </article>;
}
export default function Shop() {
  const [catalog, setCatalog] = useState<Product[]>(demoProducts);
  const [storeCategories, setStoreCategories] = useState<StoreCategory[]>(demoCategories);
  const [catalogSource, setCatalogSource] = useState<"loading" | "demo" | "database" | "error">("loading");
  const [view, setView] = useState<View>("home");
  const [category, setCategory] = useState<Category | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("popular");
  const [cart, setCart] = useState<Cart>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  useEffect(() => { setCart(restoreCart()); setFavorites(restoreFavorites()); setReady(true); }, []);
  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        const [productsResponse, categoriesResponse] = await Promise.all([
          fetch("/api/products?limit=100", { cache: "no-store" }),
          fetch("/api/categories", { cache: "no-store" }),
        ]);
        if (!productsResponse.ok || !categoriesResponse.ok) throw new Error("Server catalog is unavailable");
        const productData = await productsResponse.json() as { items?: Product[]; source?: string };
        const categoryData = await categoriesResponse.json() as { items?: StoreCategory[] };
        if (!Array.isArray(productData.items) || !Array.isArray(categoryData.items)) throw new Error("Invalid catalog response");
        if (!cancelled) {
          setCatalog(productData.items);
          setStoreCategories(categoryData.items);
          setCatalogSource(productData.source === "database" ? "database" : "demo");
        }
      } catch (err) {
        console.error("Catalog request failed", err);
        if (!cancelled) setCatalogSource("error");
      }
    }
    void loadCatalog();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { if (ready) { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {} } }, [cart, ready]);
  useEffect(() => { if (ready) { try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch {} } }, [favorites, ready]);
  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);
  const go = (next: View) => { setView(next); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };
  const openCategory = (id: Category | "all") => { setCategory(id); go("catalog"); };
  const add = (id: string) => {
    const product = catalog.find((p) => p.id === id);
    if (!product || product.stock === 0) return;
    setCart((old) => {
      const current = old[id] || 0;
      const max = Math.min(product.stock ?? 99, 99);
      return current >= max ? old : { ...old, [id]: current + 1 };
    });
  };
  const subtract = (id: string) => setCart((old) => { const next = { ...old }; if ((next[id] || 0) <= 1) delete next[id]; else next[id]--; return next; });
  const toggleLike = (id: string) => setFavorites((old) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]);
  const cartItems = catalog.filter((p) => (cart[p.id] || 0) > 0);
  const cartCount = Object.values(cart).reduce((sum, n) => sum + n, 0);
  const total = cartItems.reduce((sum, p) => sum + p.price * cart[p.id], 0);
  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ru");
    const list = catalog.filter((p) => (category === "all" || p.category === category) && (!q || (p.title + " " + p.subtitle).toLocaleLowerCase("ru").includes(q)));
    if (sort === "cheap") return [...list].sort((a, b) => a.price - b.price);
    if (sort === "expensive") return [...list].sort((a, b) => b.price - a.price);
    if (sort === "rating") return [...list].sort((a, b) => b.rating - a.rating);
    return list;
  }, [catalog, category, query, sort]);
  const renderProducts = (items: Product[]) => <div className="product-grid">{items.map((p) => <ProductCard key={p.id} p={p} liked={favorites.includes(p.id)} quantity={cart[p.id] || 0} onLike={() => toggleLike(p.id)} onAdd={() => add(p.id)} onOpen={() => setSelected(p)}/>)}</div>;
  const searchSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setCategory("all"); go("catalog"); };
  return <>
    <div className="announcement"><span>Vira Shop · создаём удобные покупки</span><span>Демонстрационная версия — заказы пока не принимаются</span></div>
    <header className="site-header">
      <div className="container header-inner">
        <button type="button" className="brand" onClick={() => go("home")} aria-label="Vira Shop — главная"><span className="brand-mark">v.</span><span className="brand-name">vira<span>shop</span></span></button>
        <button type="button" className="catalog-trigger" onClick={() => openCategory("all")}><Icon name="grid"/> <span>Каталог</span></button>
        <form className="search-form" onSubmit={searchSubmit}><input type="search" aria-label="Поиск товаров" placeholder="Искать товары и категории" value={query} onChange={(event) => setQuery(event.target.value)}/><button type="submit" aria-label="Найти"><Icon name="search"/> <span>Найти</span></button></form>
        <nav className="header-nav" aria-label="Разделы магазина">
          <button type="button" onClick={() => go("favorites")} className={view === "favorites" ? "active" : ""}><Icon name="heart"/><span>Избранное</span>{favorites.length > 0 && <small>{favorites.length}</small>}</button>
          <button type="button" onClick={() => go("cart")} className={view === "cart" ? "active" : ""}><Icon name="bag"/><span>Корзина</span>{cartCount > 0 && <small>{cartCount}</small>}</button>
        </nav>
      </div>
    </header>
    <main className="container main-content">
      <div className={"data-status status-" + catalogSource} role="status">
        {catalogSource === "loading" ? "Загружаем каталог…" :
          catalogSource === "database" ? "Каталог подключён к PostgreSQL · товары пока демонстрационные" :
          catalogSource === "error" ? "Серверный каталог недоступен · временно показаны демонстрационные товары" :
          "Демонстрационный каталог · подключение к PostgreSQL пока не настроено"}
      </div>
      {view === "home" && <>
        <div className="breadcrumb">Главная <span>·</span> Выбирайте то, что нравится</div>
        <section className="hero">
          <div className="hero-main"><div className="hero-copy"><span className="eyebrow">НОВОЕ ПРОСТРАНСТВО ПОКУПОК</span><h1>Хорошие находки.<br/><em>Каждый день.</em></h1><p>Всё для дома, технологий, спорта и просто для настроения — в одном удобном месте.</p><button type="button" className="hero-button" onClick={() => openCategory("all")}>Смотреть каталог <Icon name="arrow"/></button></div><div className="hero-art"><div className="hero-ring ring-one"/><div className="hero-ring ring-two"/><div className="hero-bag">🛍️</div><span className="floating-note">✦ сделано для вас</span></div></div>
          <button type="button" className="hero-side" onClick={() => openCategory("electronics")}><span>ЛУЧШЕЕ ДЛЯ ВАС</span><h2>Умная<br/>техника</h2><p>Откройте новое</p><strong>🎧</strong><i>↗</i></button>
        </section>
        <div className="feature-row"><div><span>✦</span><p><strong>Большой выбор</strong><small>Каталог уже доступен</small></p></div><div><span>♻</span><p><strong>Удобная корзина</strong><small>Сохранение в браузере</small></p></div><div><span>◇</span><p><strong>Простой поиск</strong><small>По названиям товаров</small></p></div><div><span>✓</span><p><strong>Продуманный дизайн</strong><small>На телефоне и ПК</small></p></div></div>
        <section className="section"><div className="section-top"><div><span className="kicker">НАВИГАЦИЯ</span><h2>Популярные категории</h2></div><button type="button" className="link-more" onClick={() => openCategory("all")}>Все категории <Icon name="arrow"/></button></div>
          <div className="category-grid">{storeCategories.map((c) => <button type="button" className={"category-card " + c.tone} key={c.id} onClick={() => openCategory(c.id)}><span className="category-emoji">{c.emoji}</span><strong>{c.title}</strong><small>Посмотреть товары ↗</small></button>)}</div>
        </section>
        <section className="section"><div className="section-top"><div><span className="kicker">ПОДБОРКА ДНЯ</span><h2>Популярные товары <span className="title-star">✳</span></h2></div><button type="button" className="link-more" onClick={() => openCategory("all")}>Все товары <Icon name="arrow"/></button></div>{renderProducts(catalog.slice(0, 8))}</section>
        <section className="wide-promo"><div><span>ПРОСТО ВЫБИРАТЬ</span><h2>Вещи, которые делают<br/>каждый день лучше</h2><button type="button" onClick={() => openCategory("home")}>Для дома и уюта <Icon name="arrow"/></button></div><div className="promo-art">✳ <span>📦</span> ✦</div></section>
        <section className="section"><div className="section-top"><div><span className="kicker">ЕЩЁ БОЛЬШЕ ИДЕЙ</span><h2>Вам может понравиться</h2></div></div>{renderProducts(catalog.slice(8))}</section>
      </>}
      {view === "catalog" && <section className="inner-page"><div className="page-heading"><div><span className="kicker">ВЫБИРАЙТЕ С УДОВОЛЬСТВИЕМ</span><h1>Каталог товаров</h1><p>Поиск, категории и сортировка</p></div><span className="count-label">{matches.length} товаров</span></div>
        <div className="catalog-tabs"><button className={category === "all" ? "selected" : ""} onClick={() => setCategory("all")}>Все товары</button>{storeCategories.map((c) => <button key={c.id} className={category === c.id ? "selected" : ""} onClick={() => setCategory(c.id)}>{c.emoji} {c.title}</button>)}</div>
        <div className="catalog-toolbar"><span>Найдено: {matches.length}</span><label>Сортировать <select aria-label="Сортировка товаров" value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value="popular">По популярности</option><option value="cheap">Сначала дешёвые</option><option value="expensive">Сначала дорогие</option><option value="rating">По рейтингу</option></select></label></div>
        {matches.length ? renderProducts(matches) : <div className="empty-panel"><span>🔎</span><h2>Ничего не найдено</h2><p>Измените запрос или выберите другую категорию.</p><button onClick={() => { setQuery(""); setCategory("all"); }}>Сбросить фильтры</button></div>}
      </section>}
      {view === "favorites" && <section className="inner-page"><div className="page-heading"><div><span className="kicker">ВАША ПОДБОРКА</span><h1>Избранное</h1><p>Вещи, которые вам понравились</p></div><span className="count-label">{favorites.length} товаров</span></div>
        {favorites.length ? renderProducts(catalog.filter((p) => favorites.includes(p.id))) : <div className="empty-panel"><span>♡</span><h2>Пока ничего нет</h2><p>Нажимайте сердечко на карточках товаров.</p><button onClick={() => openCategory("all")}>Перейти в каталог</button></div>}
      </section>}
      {view === "cart" && <section className="inner-page"><div className="page-heading"><div><span className="kicker">ВАШИ ПОКУПКИ</span><h1>Корзина</h1><p>Соберите товары в одном месте</p></div><span className="count-label">{cartCount} шт.</span></div>
        {cartItems.length ? <div className="cart-layout"><div className="cart-list">{cartItems.map((p) => <div className="cart-row" key={p.id}><img src={p.image} alt={p.title}/><div className="cart-description"><strong>{p.title}</strong><small>{p.subtitle}</small><button type="button" className="remove-link" onClick={() => setCart((old) => { const next = { ...old }; delete next[p.id]; return next; })}>Удалить</button></div><div className="cart-controls"><div><button onClick={() => subtract(p.id)} aria-label={"Уменьшить количество " + p.title}>−</button><span>{cart[p.id]}</span><button onClick={() => add(p.id)} aria-label={"Увеличить количество " + p.title}>+</button></div><strong>{rub(p.price * cart[p.id])}</strong></div></div>)}</div>
          <aside className="cart-summary"><h2>Ваш заказ</h2><div><span>Товаров: {cartCount}</span><strong>{rub(total)}</strong></div><div className="summary-total"><span>Итого</span><strong>{rub(total)}</strong></div><button type="button" disabled>Оформление скоро появится</button><p>Это демонстрация. Реальная оплата и заказы отключены.</p></aside></div>
          : <div className="empty-panel"><span>🛒</span><h2>Корзина пуста</h2><p>Добавьте товары из каталога, чтобы увидеть их здесь.</p><button onClick={() => openCategory("all")}>Перейти в каталог</button></div>}
      </section>}
    </main>
    <footer className="site-footer"><div className="container footer-body"><div><div className="footer-logo">v.<span>vira shop</span></div><p>Удобный магазин начинается с мелочей. Мы только начинаем.</p></div><div><strong>Покупателям</strong><button onClick={() => openCategory("all")}>Каталог</button><button onClick={() => go("favorites")}>Избранное</button><button onClick={() => go("cart")}>Корзина</button></div><div><strong>О проекте</strong><p>Этап 1 · Прототип</p><p>Оплата и реальные заказы ещё не доступны.</p></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} Vira Shop</span><span>Next.js · React · TypeScript</span></div></footer>
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><div className="product-modal" role="dialog" aria-modal="true" aria-label={selected.title} onClick={(e) => e.stopPropagation()}><button type="button" className="modal-close" onClick={() => setSelected(null)} aria-label="Закрыть">×</button><img src={selected.image} alt={selected.title}/><div className="modal-info"><span className="kicker">КАРТОЧКА ТОВАРА</span><h2>{selected.title}</h2><p className="modal-subtitle">{selected.subtitle}</p><div className="rating">★ {selected.rating.toFixed(1)} · {selected.reviews} отзывов</div><p className="description">{selected.description}</p><div className="prices"><strong>{rub(selected.price)}</strong>{selected.oldPrice && <s>{rub(selected.oldPrice)}</s>}</div><button type="button" className="buy-button" onClick={() => add(selected.id)}>Добавить в корзину{cart[selected.id] ? " · " + cart[selected.id] : ""}</button><p className="modal-disclaimer">Демонстрационный товар, не предложение о продаже.</p></div></div></div>}
  </>;
}
