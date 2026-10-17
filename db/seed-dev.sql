-- Demo-only fixtures. Do not treat stock, prices or product descriptions as real offers.
INSERT INTO shop_categories (id, title, emoji, tone, display_order)
VALUES
  ('electronics', 'Электроника', '🎧', 'blue', 0),
  ('home', 'Дом и уют', '🛋️', 'peach', 1),
  ('beauty', 'Красота', '🧴', 'pink', 2),
  ('sports', 'Спорт', '👟', 'green', 3),
  ('accessories', 'Аксессуары', '⌚', 'lilac', 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO shop_products
(id, category_id, title, subtitle, description, price_minor, old_price_minor, rating, reviews, image_url, badge, stock_count)
VALUES
  ('p1', 'electronics', 'Беспроводные наушники', 'Шумоподавление · до 30 часов', 'Удобные наушники для музыки, работы и поездок. Учебная карточка товара.', 349000, 599000, 4.9, 248, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=650&q=80', 'Хит', 25),
  ('p2', 'electronics', 'Умные часы', 'Мониторинг активности · Bluetooth', 'Стильные часы для уведомлений и повседневной активности. Учебная карточка.', 499000, 749000, 4.8, 187, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=650&q=80', '−33%', 25),
  ('p3', 'sports', 'Городские кроссовки', 'Лёгкая подошва · унисекс', 'Лёгкая обувь для прогулок и города. Учебная карточка.', 289000, 429000, 4.7, 391, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=650&q=80', 'Выгодно', 25),
  ('p4', 'home', 'Настольная лампа', 'Мягкий свет · минимализм', 'Минималистичная лампа для дома и рабочего места.', 179000, 239000, 4.8, 83, 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=650&q=80', NULL, 25),
  ('p5', 'electronics', 'Цифровая фотокамера', 'Компактная · фото и видео', 'Камера для путешествий и творчества. Учебная карточка.', 1699000, 1999000, 4.9, 129, 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=650&q=80', 'Новинка', 25),
  ('p6', 'home', 'Декоративная подушка', 'Мягкий текстиль · 45 × 45 см', 'Подушка для уютного интерьера. Учебная карточка.', 89000, 139000, 4.6, 56, 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=650&q=80', NULL, 25),
  ('p7', 'beauty', 'Сыворотка для лица', 'Уход · 30 мл', 'Демонстрационный косметический продукт без подтверждённых заявлений о свойствах.', 119000, 159000, 4.8, 218, 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=650&q=80', NULL, 25),
  ('p8', 'accessories', 'Чехол для ноутбука', 'Водоотталкивающая ткань', 'Аксессуар для переноски и защиты ноутбука.', 149000, 219000, 4.7, 74, 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=650&q=80', NULL, 25),
  ('p9', 'accessories', 'Солнцезащитные очки', 'Лёгкая оправа · унисекс', 'Повседневные очки. Учебная карточка.', 129000, 199000, 4.5, 92, 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=650&q=80', NULL, 25),
  ('p10', 'sports', 'Коврик для фитнеса', 'Нескользящий · для тренировок', 'Коврик для домашних тренировок.', 199000, 299000, 4.8, 146, 'https://images.unsplash.com/photo-1599447421416-3414500d18a5?auto=format&fit=crop&w=650&q=80', NULL, 25),
  ('p11', 'home', 'Домашняя кофеварка', 'Компактная · для кухни', 'Компактная кофеварка для домашней кухни.', 549000, 699000, 4.9, 203, 'https://images.unsplash.com/photo-1517256673644-36ad11246d21?auto=format&fit=crop&w=650&q=80', 'Популярное', 25),
  ('p12', 'beauty', 'Подарочный набор', 'Аксессуары для ухода', 'Демонстрационный набор косметических принадлежностей.', 239000, 349000, 4.7, 164, 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=650&q=80', NULL, 25)
ON CONFLICT (id) DO NOTHING;
