import Link from "next/link";
export default function NotFound(){
  return <main className="container product-unavailable">
    <h1>Товар не найден</h1>
    <p>Возможно, товар скрыт продавцом или ссылка устарела.</p>
    <Link href="/catalog">Вернуться в каталог</Link>
  </main>;
}
