# LAVOSE 2.4 — подготовка к запуску Mini App на VPS

Статус: в репозитории **подготовлены конфигурация и инструкции**, но публичный сервер, домен и Mini App в MAX **ещё не развернуты**.

## Инфраструктура
- web: Caddy с автоматическим HTTPS, React-сайт по / и проксирование /api/* и /health на Fastify.
- api: Node.js 22 / Fastify, без публичного порта, с безопасной проверкой MAX initData.
- db: PostgreSQL 17 во внутренней Docker-сети, данные в постоянном volume.
- migrate: миграции с журналом и checksum, **без демопользователей и демонстрационных объявлений**.

## Что нужно до запуска

1. Linux VPS с Docker Engine и плагином Docker Compose.
2. Домен с DNS A-записью на IP VPS и открытыми TCP 80/443 (для автоматического TLS Caddy).
3. Токен созданного бота LAVOSE из MAX для партнёров.
4. Новый сильный пароль PostgreSQL. Локальный пароль из dev-compose использовать нельзя.

## Команды на VPS

Склонировать репозиторий https://github.com/bz1kie/YONVI и выполнить:

~~~sh
cp deploy/production.env.example .env.production
chmod 600 .env.production
# Отредактировать YONVI_DOMAIN, POSTGRES_PASSWORD, MAX_YONVI_TOKEN
docker compose --env-file .env.production -f compose.production.yml config --quiet
docker compose --env-file .env.production -f compose.production.yml up -d --build
~~~

Запуск предполагает, что выбранный домен указывает на этот VPS. Без действующего DNS и портов 80/443 автоматический HTTPS не заработает.

**Не публиковать** содержимое .env.production или полный вывод docker compose config и docker inspect: переменные окружения содержат секреты. GitHub Secret MAX_YONVI_TOKEN сам по себе не передается на VPS. Токен следует задать в локальном защищенном окружении сервера.

## Контроль

~~~sh
docker compose --env-file .env.production -f compose.production.yml ps
curl -fsS https://ВАШ-ДОМЕН/health
curl -I https://ВАШ-ДОМЕН/
curl -i https://ВАШ-ДОМЕН/api/auth/me
~~~

Ожидание: health возвращает ok, сайт отвечает по HTTPS, гость получает 401 от /api/auth/me.

После этого в кабинете MAX для партнёров → «Чат-боты» → «LAVOSE | Объявления» → «Настройки» указать HTTPS-адрес приложения, выбрать кнопку «Открыть» и сохранить. Проверить на реальном телефоне авторизацию, карточку товара, круги, независимую модерацию и выход.

Официальная инструкция: https://dev.max.ru/help/miniapps

## Ограничения

- Production-хранилище S3 **не включено**: без HTTPS S3-бакета, ключей и CORS API загрузки фото вернет 503.
- Часть старых экранов всё ещё использует localStorage-демосценарии. До публичного пилота нужно отключить/перенести их на сервер.
- Не завершены аудит безопасности, ограничение запросов, антиспам, мониторинг, политика обработки персональных данных и резервное копирование БД.
- Это **пилотная конфигурация**, а не подтверждение готовности к массовому запуску.
- Локальный scripts/prepare-db.mjs вставляет демоданные. В production использовать **только** scripts/migrate-db.mjs.
- Для будущих обновлений БД добавлять новый файл миграции и его имя в scripts/migrate-db.mjs. Уже применённые SQL-миграции не изменять.

## Обновления

~~~sh
git pull --ff-only
docker compose --env-file .env.production -f compose.production.yml up -d --build
~~~

Не выполнять docker compose down -v в production: это удалит постоянный volume PostgreSQL. Настроить отдельные регулярные резервные копии за пределами VPS и периодически тестировать их восстановление.
