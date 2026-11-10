# YORI 2.1 — S3-совместимое хранилище и галерея товаров

## Локальная инфраструктура

В `docker-compose.yml` находятся PostgreSQL 17 и локальный **SeaweedFS S3** (вместо недоступного публичного MinIO Docker-образа). S3 API слушает **только localhost**:

- S3 endpoint `http://127.0.0.1:8333`
- отдельной MinIO Console нет
- test access key `yorvi_local_access`
- test secret `yorvi_local_secret_change_before_deploy`
- bucket `yorvi-private` (создаёт setup script)

**Только для локального тестирования!** Не используйте эти пароли в интернете, production или общедоступных машинах.

```bash
npm install
docker compose up -d
export DATABASE_URL='postgresql://yorvi:yorvi_local_password@127.0.0.1:5432/yorvi'
node scripts/prepare-db.mjs
S3_ENDPOINT=http://127.0.0.1:8333 node scripts/setup-minio.mjs

export NODE_ENV=development
export ALLOW_DEMO_AUTH=true
export S3_ENDPOINT='http://127.0.0.1:8333'
export S3_BUCKET=yorvi-private
export S3_REGION=us-east-1
export S3_ACCESS_KEY_ID=yorvi_local_access
export S3_SECRET_ACCESS_KEY=yorvi_local_secret_change_before_deploy
npm run dev:api
```

Во втором терминале: `npm run dev:web`.

Для Windows PowerShell используйте `$env:VARIABLE='value'` вместо `export VARIABLE='value'`.

## Работа с файлами

1. В личном кабинете создайте объявление. Выберите фотографию JPEG, PNG либо WebP до 5 МБ.
2. Frontend получает короткую подписанную ссылку, загружает файл в MinIO по прямому PUT.
3. Backend сверяет содержимое объекта, записывает фото как `ready`; для уже одобренного товара вновь требуется модерация.
4. После одобрения каталог возвращает `photo_url`, а карточка товара — упорядоченное поле `images` со списком URL.
5. В модальном просмотре листайте фотографии через миниатюры.
6. При отметке «Продано» публичный доступ к фото должен прекратиться (владелец по-прежнему может видеть собственные фото).

### Что проверяет GitHub Actions

После установки зависимостей и подготовки PostgreSQL:
- `docker run ... chrislusf/seaweedfs` запускает изолированное S3-совместимое хранилище;
- `node scripts/setup-minio.mjs` создаёт закрытый bucket;
- `node scripts/integration-photo-minio-test.mjs` проверяет выдачу presigned PUT, загрузку объекта, подтверждение, ограничения доступа, публикацию после модерации, галерею, скрытие после продажи.

## Ограничения

S3 тест подтверждает **базовый** цикл загрузки и доступа. Для production ещё нужны: нормализация/полное декодирование, удаление EXIF, ресайз и миниатюры, очистка заброшенных pending объектов, квоты, модерация изображений, обобщённая обработка недоступности хранилища, anti-malware pipeline. Публичный HTTPS, реальный MAX бот и production домен не подключены. Старые экраны демонстрационного прототипа могут содержать localStorage — нельзя считать готовой всю платформу.

## Производственное окружение

Для продакшена нужен **другой** закрытый S3 бакет и индивидуальные секреты только в backend env. Публичный endpoint подписанного PUT должен быть доступен браузеру через HTTPS; разрешите в CORS бакета только проверенные origin YORI, PUT и необходимые headers. MinIO локального Compose не является production-хранилищем.

**Примечание:** MinIO остаётся поддерживаемым вариантом для отдельного S3 endpoint, но его Docker-образ недоступен анонимно в окружении GitHub Actions (Docker Hub 404, Quay 401). Текущий автоматический тест выполняется на SeaweedFS, реальную совместимость с MinIO и выбранным production S3 нужно проверять отдельно.
