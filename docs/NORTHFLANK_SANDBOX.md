# LAVOSE — бесплатный тест на Northflank Sandbox

Статус: **Dockerfile подготовлены, ресурсы в Northflank не создавались**.

Связка: 2 **Combined services** (`yonvi-api`, `yonvi-web`) + 1 PostgreSQL **Addon** (`yonvi-db`). Проект и сервисы должны находиться в **одном Northflank project**. Бесплатный план Sandbox ограничен ресурсами/квотами, а для создания ресурсов учётная запись может запросить способ оплаты: https://northflank.com/pricing

## Шаг 1. PostgreSQL Addon

В проекте Northflank выберите **Create new → Addon → PostgreSQL**:
- Name: `yonvi-db`
- Version: 17
- Public access: **OFF**
- Реплики и размер: минимальные в пределах Sandbox

В **Secrets → Secret groups** добавьте secret group, связанный с `yonvi-db`. Возьмите **внутренний** `POSTGRES_URI` (не административный) и назначьте alias `DATABASE_URL`. Ограничьте наследование секрета **только** сервисом `yonvi-api`. Не копируйте строку подключения в чат или GitHub.

Официально: https://northflank.com/docs/v1/application/databases-and-persistence/deploy-databases-on-northflank/deploy-postgresql-on-northflank

## Шаг 2. Сервис backend API

На /project/default/create/service создайте:
- Type: **Combined service** — чтобы Northflank строил Docker-образ из GitHub и запускал контейнер.
- Name: `yonvi-api` (важно: используется web reverse proxy).
- Repository: `bz1kie/YONVI`
- Branch: `main`
- Build method: **Dockerfile**, НЕ buildpack
- Dockerfile location: `/deploy/Dockerfile.northflank.api`
- Build context / Work dir: `/` (корень репозитория)
- Networking: HTTP / порт `3001` / **private / internal**, без public domain
- Resource: минимальный доступный по Sandbox, 1 replica
- Runtime variables: `NODE_ENV=production`, `ALLOW_DEMO_AUTH=false`, `PORT=3001`, `MAX_YONVI_TOKEN` = токен через секретное хранилище (не build argument).
- `WEB_ORIGIN` задайте **после** получения адреса публичного web сервиса, например `https://yonvi-web--project.code.run`, точно как будет выдан Northflank, без конечного `/`.
- Database: runtime переменная `DATABASE_URL` наследуется из связанной secret group PostgreSQL.

Контейнер сначала запускает `node scripts/migrate-db.mjs` с идемпотентными миграциями и только после успешной инициализации запускает Fastify. Демо-данные не добавляет.

**Секрет MAX передавать в runtime variables через интерфейс, не в build arguments или исходники.** Секрет GitHub Actions `MAX_YONVI_TOKEN` не попадает автоматически на Northflank.

После создания проверьте logs: `Migration finished without loading demo data.`, затем запуск Fastify на `0.0.0.0:3001`. При отсутствии БД контейнер завершится; сначала устраните проблему связи/секрета.

## Шаг 3. Публичный web сервис

Ещё один **Combined service** в том же проекте:
- Name: `yonvi-web`
- Repository: `bz1kie/YONVI`
- Branch: `main`
- Build method: **Dockerfile**
- Dockerfile location: `/deploy/Dockerfile.northflank.web`
- Build context / Work dir: `/`
- Networking: HTTP / порт `8080` / **public** (HTTPS URL Northflank)
- Resource: минимальный доступный, 1 replica

Это отдельный Caddy-конфиг без попытки выпустить TLS-сертификат внутри контейнера: публичный HTTPS предоставляет Northflank. По внутреннему имени `yonvi-api:3001` Caddy проксирует `/api/*` и `/health` на Fastify. В браузере frontend вызывает /api на **том же домене**, что критично для сессионной cookie MAX.

Скопируйте созданный URL (как есть). Вернитесь в переменные `yonvi-api`, выставьте **WEB_ORIGIN** равным этому URL, сохраните и перезапустите API.

## Шаг 4. Проверить

Из браузера на публичном URL:
- `/` — сайт LAVOSE
- `/health` — JSON с `ok:true`
- `/api/auth/me` — 401 для неавторизованного гостя

Если /health не работает — проверить имя `yonvi-api`, приватный порт 3001 и состояние БД/миграций. Если Caddy отвечает 502 — internal proxy не видит API. Не включайте публичный порт API ради обхода проблемы.

## Шаг 5. Подключить MAX

После проверки сайта укажите адрес web-сервиса в MAX для партнёров → «Чат-боты» → LAVOSE → настройки Mini App, включите кнопку «Открыть». Протестируйте реальную авторизацию в MAX WebView. Без реального токена и настройки в MAX авторизация в приложении работать не будет.

## Пока не готово

- Постоянное S3-хранилище для загрузки изображений; без него фото-API вернет 503.
- Удаление/миграция всех localStorage демосценариев.
- Антиспам, защитные ограничения, резервное копирование и публичный запуск в РФ с реальными персональными данными.
- Эти инструкции описывают пилот с тестовыми данными. Northflank Sandbox не является заявлением о бесплатной production-эксплуатации.

Официальная инструкция Northflank для Combined service: https://northflank.com/docs/v1/application/getting-started/build-and-deploy-your-code
