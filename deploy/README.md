# Публикация дашборда по HTTPS

Стек по умолчанию: **Docker Compose** — контейнер `web` (nginx + собранный React) и контейнер `backend` (FastAPI). Один origin: браузер ходит на `https://ваш-домен`, nginx отдаёт статику и проксирует `/api/*` и `/ws` на uvicorn.

## 1. Домен и DNS (todo: domain-dns)

1. Зарегистрируйте домен или поддомен (например `finance.example.com`).
2. В панели DNS создайте **A-запись**: имя (или `@` для корня) → **публичный IPv4** вашего VPS.
3. Дождитесь распространения DNS (часто до 24 ч, обычно быстрее).

## 2. Сборка и прокси (todo: build-proxy)

На сервере с установленным Docker и Docker Compose v2:

```bash
cd /path/to/4_finance
cp env.docker.example .env
# Отредактируйте .env (DATABASE_URL, CORS_ORIGINS под ваш домен)
docker compose up -d --build
```

Локально для API по-прежнему можно использовать [`backend/.env`](../backend/.env.example); для контейнеров продакшена удобнее дублировать нужные ключи в корневой `.env`.

По умолчанию HTTP доступен на порту **8080** хоста (`http://SERVER_IP:8080`). Для продакшена перед контейнерами ставят **TLS**.

### HTTPS через Caddy на хосте (рекомендуется)

1. Установите [Caddy](https://caddyserver.com/docs/install) на VPS.
2. Скопируйте [`Caddyfile.example`](Caddyfile.example) в `/etc/caddy/Caddyfile`, подставьте свой домен.
3. Убедитесь, что `reverse_proxy` указывает на `localhost:8080` (порт из `docker-compose.yml`).
4. `sudo systemctl reload caddy` — Caddy сам получит сертификат Let’s Encrypt.

Альтернатива: **nginx + certbot** на хосте с тем же `proxy_pass` на `127.0.0.1:8080`.

## 3. База данных (todo: env-db)

- В `backend/.env` или в переменных окружения для Compose задайте **`DATABASE_URL`** (PostgreSQL должен принимать подключения **с IP VPS** — firewall / `pg_hba.conf`).
- Без `DATABASE_URL` бэкенд уйдёт в **DEMO_MODE** (синтетические данные), если не задан `DEMO_MODE=true` явно.

Пример для compose из файла в корне репозитория:

```bash
# .env рядом с docker-compose.yml
DATABASE_URL=postgresql://user:pass@db-host:5432/dbname
CORS_ORIGINS=https://finance.example.com
HTTP_PORT=8080
```

Docker Compose подхватывает `.env` в том же каталоге, что и `docker-compose.yml`.

## 4. CORS (todo: cors-prod)

В продакшене задайте **`CORS_ORIGINS`** списком через запятую (схема `https://` и домен):

```env
CORS_ORIGINS=https://finance.example.com
```

Для локальной разработки можно не задавать или указать `CORS_ORIGINS=*` (по умолчанию).

## 5. Проверка после выкладки

- Откройте `https://ваш-домен` — загружается UI.
- `https://ваш-домен/api/filters` — JSON с годами/филиалами.
- В DevTools → Network: WebSocket `wss://ваш-домен/ws` — соединение устанавливается (код 101), без бесконечных ошибок.

## 6. Без Docker (опционально)

- Соберите фронт: `cd frontend && npm ci && npm run build`, раздайте `dist` через nginx.
- Пример конфигурации прокси — [`nginx.conf`](nginx.conf) (замените `backend:8000` на `127.0.0.1:8000`).
- Пример systemd для API — [`systemd/finance-api.service.example`](systemd/finance-api.service.example).

## Выбор хостинга (todo: choose-hosting)

Этот репозиторий ориентирован на **VPS + Docker + TLS на границе (Caddy/nginx)**. PaaS (Railway, Render, Fly) возможны, но потребуют адаптации под их сетевые имена и переменные окружения; текущий `docker-compose.yml` — готовый эталон для одного сервера.
