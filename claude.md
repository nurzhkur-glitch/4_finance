# Finance Dashboard -- Project Context

## О проекте

Финансовый дашборд для замены Power BI. Отображает данные по точкам продаж (ломбарды + магазины): активы, доходы, расходы, прибыль. Данные хранятся в PostgreSQL, обновляются внешней системой напрямую в БД.

## Стек

- **Backend**: Python 3.11+, FastAPI, asyncpg, uvicorn
- **Frontend**: React 18, Vite, Recharts
- **Database**: PostgreSQL (существующая БД с данными)
- **NRT**: PostgreSQL LISTEN/NOTIFY -> asyncpg listener -> WebSocket push

## Структура проекта

```
4_finance/
  backend/           # FastAPI сервер
    main.py          # Основной файл, все эндпоинты
    requirements.txt # Python зависимости
    migration.sql    # DDL + триггеры
    .env.example     # Шаблон переменных
  frontend/          # React приложение (Vite)
    src/
      App.jsx
      FinanceDashboard.jsx  # Главный компонент дашборда
      api.js                # API клиент + WebSocket хук
  files/             # Исходный прототип (reference only)
  plan.md            # План проекта
  claude.md          # Этот файл
```

## База данных (продакшен)

Таблица **`unpacked_smart_lombard_analytic_data`** (EAV):
- `date` TEXT -- формат `"2025 Январь"` (год + русский месяц)
- `metric` TEXT -- `assets_general`, `assets_lombard`, `assets_com_shop`, `profit_general`, `profit_lombard`, `profit_com_shop`, `profit_clean`, и т.д.
- `value` NUMERIC
- `branch` TEXT -- филиал (сейчас API агрегирует по `date` без разбивки по branch)

Backend в [backend/main.py](backend/main.py) делает pivot (CASE WHEN) и отдаёт плоские поля как раньше. Месяцы в API -- английские (`January` ...).

Прототип в `files/` и `migration.sql` описывают плоскую таблицу `finance_data` (reference / локальная разработка).

## API эндпоинты (backend)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/filters` | Доступные годы, месяцы, точки для фильтров |
| GET | `/api/data?year=&month=&location=` | Агрегированные данные с фильтрацией |
| GET | `/api/monthly-summary?year=` | Помесячная сводка для графиков |
| GET | `/api/location-summary?year=&month=` | Сводка по точкам продаж |
| WS | `/ws` | WebSocket для NRT-уведомлений |

## Соглашения

- Язык кода: английский (имена переменных, функций, комментарии в коде)
- Язык UI: русский (все надписи в интерфейсе на русском)
- Форматирование чисел: русская локаль (1 000 000, разделитель пробел)
- Сокращения сумм: тыс, млн, млрд
- Месяцы в UI: сокращенные русские (Янв, Фев, Мар, ...)

## NRT (Near-Real-Time)

Механизм обновления данных в реальном времени:
1. Внешняя система пишет данные в `finance_data`
2. PostgreSQL триггер вызывает `pg_notify('finance_updates', payload)`
3. FastAPI слушает канал через `asyncpg.add_listener`
4. При получении уведомления -- рассылает всем WebSocket-клиентам `{"event": "data_changed"}`
5. React получает сообщение через WebSocket хук и перезапрашивает данные с API

## Важно при разработке

- Все суммы в БД -- в тенге (KZT), целые числа (BIGINT)
- `profit_pct` вычисляется на лету: `profit / total_income * 100`
- Фронтенд должен работать и при отсутствии WebSocket (graceful degradation)
- CORS открыт для всех origins (разработка), в продакшене нужно ограничить
- Папка `files/` -- исходный прототип, не трогать (reference)
