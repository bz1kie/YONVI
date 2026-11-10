# MAX Mini App: серверная авторизация YONVI

Статус: разработческая реализация. Бот YONVI создан и опубликован в MAX по скриншотам владельца; Mini App ещё не подключено к production HTTPS и backend.

**Первичные источники:** [MAX: валидация данных](https://dev.max.ru/docs/webapps/validation/), [MAX Bridge](https://dev.max.ru/docs/webapps/bridge/), [подключение мини-приложения](https://dev.max.ru/docs/webapps/introduction).

## Что реализовано
- HTML включает официальный Bridge `https://st.max.ru/js/max-web-app.js`.
- В React-компоненте `MaxAuthBadge` используется только `window.WebApp.initData` (сырые параметры запуска), **не** `initDataUnsafe`.
- `POST /api/auth/max` проверяет все входящие параметры и точную подпись HMAC-SHA256:
  - `secret_key = HMAC_SHA256(key="WebAppData", message=MAX_BOT_TOKEN)`.
  - `hash = HEX(HMAC_SHA256(key=secret_key, message=sorted_launch_params))`.
  - Сравнение проводится в константное время.
  - Отбрасываются дубликаты параметров, неверный `auth_date`, время старше 3600 секунд и более чем на 60 секунд в будущем.
- Сервер создаёт/обновляет пользователя `users(max_user_id)`.
- Выдаётся случайная 256-битная сессия в HttpOnly cookie `yorvi_session`, хеш токена хранится в PostgreSQL, срок 12 часов.
- `GET /api/auth/me` проверяет сессию, `POST /api/auth/logout` отзывает её.
- Все существующие маршруты публикаций используют серверно подтверждённую сессию.
- Для мутаций с cookie проверяется HTTP `Origin`. `SameSite=Strict` и `Secure` (production) дополняют защиту.
- Локальная тестовая авторизация через `x-demo-user-id` доступна **только** при `NODE_ENV !== production` И `ALLOW_DEMO_AUTH=true`; не включайте на доступном извне сервере.

## Настройка
Создайте бота и мини-приложение по официальной документации MAX, затем задайте секреты на сервере (не в репозитории, не в Vite-переменных):

```env
MAX_YONVI_TOKEN=REPLACE_WITH_REAL_SECRET_IN_SERVER_ENV
DATABASE_URL=postgresql://...
WEB_ORIGIN=https://your-real-yonvi-domain.example
NODE_ENV=production
ALLOW_DEMO_AUTH=false
```

Для local dev: используйте `WEB_ORIGIN=http://localhost:5173` и отдельные тестовые бота/БД. Vite проксирует `/api` на Fastify.

Приложение принимает `MAX_YONVI_TOKEN` либо `MAX_BOT_TOKEN` на сервере; если заданы обе переменные, приоритет у `MAX_BOT_TOKEN`. Имя GitHub Actions Secret `MAX_YONVI_TOKEN` само по себе не устанавливает переменную на production-сервере. Не используйте `VITE_MAX_BOT_TOKEN` или `VITE_MAX_YONVI_TOKEN`: это раскроет токен в браузерной сборке.

Пошаговое подключение: [MAX Mini App Deployment](MAX_DEPLOY.md).

### Логика входа
1. Пользователь открывает YONVI **из MAX**.
2. MAX Bridge выставляет `window.WebApp.initData`.
3. Frontend отправляет эту строку в POST `/api/auth/max`.
4. Сервер сверяет подпись, свежесть, личность пользователя.
5. Только после успешной проверки создаются пользователь в PostgreSQL и сессия.
6. Продавец отправляет запросы к API с HttpOnly cookie; указать произвольный MAX ID в теле недостаточно для входа.
7. Выход удаляет сессию из базы.

## Ограничения
- Не проведён реальный запуск Mini App внутри MAX: бот уже создан, но нужны HTTPS и домен, production API с БД и настройка ссылки открытия приложения в боте.
- MAX user.id обрабатывается лексически после проверки HMAC (BigInt, диапазон положительных signed int64), без округления через Number/JSON.parse. Строковые ID и дубликаты полей отвергаются.
- В базе пока нет устройства/истории сессий, управления всеми сессиями и отдельного фонового удаления просроченных записей.
- Личный кабинет доступен после подтверждённой MAX-сессии: создание, редактирование, размещения и модерация используют Fastify/PostgreSQL. Каталог/главная и некоторые прежние экраны 1.4 по-прежнему содержат демонстрационное состояние localStorage; для полного production нужно завершить миграцию этих экранов.
- Для любого public deployment обязательны HTTPS, строгий WEB_ORIGIN, rate-limiting логина, мониторинг и анализ угроз. Один лишь успешный CI не означает production-ready.

## Тесты
```bash
npm install
npm run build
node --test scripts/max-auth-test.mjs
node scripts/prepare-db.mjs
node scripts/integration-max-auth-test.mjs
```
Интеграционный тест использует только собственный фиктивный токен, подписанные тестовые данные и локальную PostgreSQL.

## Обновление интерфейса (10.11.2026)
Пункт «Личный кабинет» добавлен в боковое меню и доступен на мобильном экране через кнопку профиля в верхней панели. В production без MAX-сессии показывается экран входа, без тестового переключения UUID; в локальном Vite dev сохраняется тестовый переключатель, который сервер принимает только при явно включённом ALLOW_DEMO_AUTH.
