# YONVI — маркетплейс внутри MAX

**YONVI («По лапкам — и по рукам! 🤝»)** — маркетплейс объявлений с каталогом, фотографиями, единой карточкой товара и публикацией в нескольких «кругах» сообществ. Каждый круг модерирует размещение независимо. Маскот — **Йонви-енот**.

## Состояние · 10 ноября 2026: YONVI 2.3 alpha

**Реализовано в репозитории:**
- React 19 + TypeScript + Vite: адаптивный интерфейс, бренд и изображения Йонви.
- Fastify + PostgreSQL: каталог одобренных активных товаров, объявления продавца, создание, редактирование, отметка «Продано», отправка в круги и модерация.
- MAX Mini App: алгоритм проверки подписанного `initData`, серверная идентификация, сессии HttpOnly, выход и защита Origin. Проверено на **подписанных тестовых данных**, не на реальном боте.
- Личный кабинет с серверными объявлениями и проверкой прав.
- Подготовлена интеграция фотографий: приватный S3-совместимый бакет, подписанный PUT, проверка размера/MIME/сигнатуры, обложка в публичном каталоге, повторная модерация после обновления фотографии.
- GitHub Actions: сборка React/Fastify, unit-тесты и интеграционные проверки PostgreSQL/MAX на фиктивных пользователях.

**Пока не готово:** подключение уже созданного MAX-бота к production-домену и запуск Mini App внутри MAX, production S3 credentials и бакет, декодирование/очистка изображений, единая серверная модель для всех старых экранов прототипа, сообщения, доставка, платежи. Основные экраны исходного прототипа 1.4 пока содержат localStorage-демосценарии; production-каталог не подставляет вымышленные товары при пустой или недоступной базе.

## Стек

React + TypeScript + Vite · Fastify + TypeScript · PostgreSQL · Node 22 · Docker Compose · S3 compatible storage · AWS SDK.

Next.js может быть добавлен **позже** для отдельного публичного SEO-сайта.

## Локальный запуск

```bash
npm install
docker compose up -d db
# Нужна переменная DATABASE_URL, например:
# postgresql://yorvi:yorvi_local_password@127.0.0.1:5432/yorvi
node scripts/prepare-db.mjs
npm run dev:api
# в другом терминале
npm run dev:web
```

Web: http://localhost:5173 · API health: http://localhost:3001/health

Для тестового создания объявлений без настоящего MAX задайте в **локальном** окружении API `NODE_ENV=development` и `ALLOW_DEMO_AUTH=true`. Никогда не включайте это на публичном сервере.

Для локального S3: `docker compose up -d` поднимает SeaweedFS (`http://127.0.0.1:8333`), а `S3_ENDPOINT=http://127.0.0.1:8333 node scripts/setup-minio.mjs` создаёт bucket. Для загрузки фотографий настройте `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` и CORS бакета. Без этих параметров фото-API возвращает 503.

## Тесты

```bash
npm test
npm run build
node --test scripts/max-auth-test.mjs scripts/photo-policy-test.mjs
node scripts/prepare-db.mjs
node scripts/integration-test.mjs
node scripts/integration-write-test.mjs
node scripts/integration-max-auth-test.mjs
```

GitHub Actions выполняет те же ключевые проверки на PostgreSQL. Тест реального S3-подключения пока не настроен.

## Документация

[Продукт](docs/PRODUCT.md) · [Архитектура](docs/ARCHITECTURE.md) · [Бренд](docs/BRAND.md) · [Roadmap](docs/ROADMAP.md) · [MAX Auth](docs/MAX_AUTH.md) · [Запуск в MAX](docs/MAX_DEPLOY.md) · [Фотографии](docs/PHOTOS.md) · [Галерея и локальный S3](docs/MINIO_GALLERY.md) · [Server API](docs/API_WRITES.md)

## Канал и бот MAX

Готовые название, описание и приветствие: [профиль YONVI для MAX](docs/MAX_BOT_PROFILE_YONVI.md). Бот в MAX создан, но не подключён к публичному Mini App. Runtime token задаётся серверу как `MAX_YONVI_TOKEN` (или `MAX_BOT_TOKEN`); GitHub Secret с этим именем не передаётся на сервер автоматически.

## Переименование проекта

С 10 ноября 2026 года публичный бренд **YONVI (Йонви)** заменил прежнее имя **YORI**. Изменены интерфейс и коммуникации; технические идентификаторы сохраняются до отдельной контролируемой миграции.

Публичное имя продукта и маскота — **YONVI / Йонви**. Слоган — **«По лапкам — и по рукам! 🤝»**.
Репозиторий пока сохраняет прежний адрес `bz1kie/YORVI` и технические имена `@yorvi/*`, `yorvi_session`, `yorvi_*` для обратной совместимости. Не меняйте их вручную без миграции.
