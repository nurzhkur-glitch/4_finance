# Finance Dashboard -- Plan

## Текущее состояние

Прототип в папке `files/`:
- `main.py` -- FastAPI backend, 4 API эндпоинта, asyncpg
- `FinanceDashboard.jsx` -- React дашборд, hardcoded demo-данные, Recharts
- `migration.sql` -- таблица `finance_data` + индексы
- `requirements.txt`, `.env.example`, `.gitignore`, `README.md`

### Проблемы в прототипе

- Frontend использует захардкоженные `MONTHLY_DATA`, не подключен к API
- `/api/monthly-summary` не возвращает колонки: `store_lombard_assets`, `lombard_assets`, `store_assets`, `cash`
- Месяцы сортируются по алфавиту, а не хронологически
- Нет NRT-механизма
- Нет структуры проекта (все файлы в одной папке)

## Целевая архитектура

```
External System --INSERT/UPDATE--> PostgreSQL
PostgreSQL --LISTEN/NOTIFY--> FastAPI Backend
FastAPI --REST API--> React Frontend
FastAPI --WebSocket push--> React Frontend
```

## Phase 1: Структура проекта

```
4_finance/
  backend/
    main.py
    requirements.txt
    migration.sql
    .env.example
    .env
  frontend/
    package.json          (Vite + React)
    vite.config.js
    index.html
    src/
      App.jsx
      FinanceDashboard.jsx
      api.js              (API клиент + WebSocket хук)
  plan.md
  claude.md
  .gitignore
  README.md
```

Используем **Vite** вместо create-react-app.

## Phase 2: Backend -- исправления и NRT

### 2a. Исправить баги в main.py

- Добавить недостающие колонки в `/api/monthly-summary`: `store_lombard_assets`, `lombard_assets`, `store_assets`, `cash`
- Исправить сортировку месяцев -- CASE-выражение для хронологического порядка (Янв -> Дек)
- Добавить `profit_pct` в `monthly-summary`

### 2b. WebSocket + LISTEN/NOTIFY

- Добавить WebSocket эндпоинт `/ws` в `main.py`
- В `lifespan` подписаться на канал `finance_updates` через `asyncpg.add_listener`
- При получении NOTIFY -- отправить всем подключенным WS-клиентам `{"event": "data_changed"}`

### 2c. Триггер в PostgreSQL

Добавить в `migration.sql`:
- Функция `notify_finance_change()` -- вызывает `pg_notify('finance_updates', ...)`
- Триггер `AFTER INSERT OR UPDATE OR DELETE ON finance_data`

## Phase 3: Frontend -- подключение к API

### 3a. api.js -- централизованный API-клиент

- `fetchFilters()` -- GET `/api/filters`
- `fetchMonthlySummary(year)` -- GET `/api/monthly-summary?year=...`
- `fetchLocationSummary(year, month)` -- GET `/api/location-summary`
- `fetchData(params)` -- GET `/api/data`
- `useFinanceWebSocket(onDataChanged)` -- хук, подключается к `ws://localhost:8000/ws`, при получении сообщения вызывает callback, авто-реконнект

### 3b. Переработать FinanceDashboard.jsx

- Убрать захардкоженные `MONTHLY_DATA`, `YEARS`, `LOCATIONS`
- Добавить `useEffect` + `useState` для загрузки с API при смене фильтров
- Подключить `useFinanceWebSocket` для авто-обновления при изменении данных в БД
- Добавить loading-состояния и обработку ошибок
- Сохранить весь существующий UI (фильтры, KPI, графики, таблица)

## Phase 4: Запуск и проверка

- Создать `.env` с реальным `DATABASE_URL`
- Применить миграцию (триггер + функция уведомления)
- Запустить backend: `uvicorn main:app --reload --port 8000`
- Запустить frontend: `npm run dev`
- Проверить: API возвращает реальные данные, WebSocket подключается, NRT работает

## Phase 5 (позже): Визуал

- Доработка UI, адаптивность
- Новые типы графиков
- Темная/светлая тема
- Экспорт в PDF/Excel
