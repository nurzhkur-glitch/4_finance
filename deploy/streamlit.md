# Streamlit Community Cloud (GitHub)

Приложение: [`streamlit_app/app.py`](../streamlit_app/app.py), зависимости: [`streamlit_app/requirements.txt`](../streamlit_app/requirements.txt).

## Поведение

- Запросы к API выполняются **с серверов Streamlit** (`requests` в Python), а не из браузера пользователя. **CORS на FastAPI для этого не обязателен**, но в [`backend/main.py`](../backend/main.py) по-прежнему можно задать `CORS_ORIGINS` под ваш домен и при необходимости regex для `*.streamlit.app` (например, для отладки из браузера или других клиентов).
- API должен быть доступен **из интернета по HTTPS** (или HTTP только для тестов).

## GitHub

1. Создайте репозиторий на GitHub и запушьте проект (ветка `main`).
2. Войдите на [share.streamlit.io](https://share.streamlit.io), привяжите GitHub.
3. **New app**: выберите репозиторий, ветку `main`, **Main file path**: `streamlit_app/app.py`.
4. **Advanced settings** → **Python version** при необходимости; зависимости подхватятся из `streamlit_app/requirements.txt` (файл рядом с entrypoint).

## Secrets (обязательно в облаке)

В настройках приложения на Streamlit Cloud → **Secrets** (формат TOML):

```toml
API_BASE_URL = "https://your-api.example.com"
```

Без слэша в конце. Без ключа `DATABASE_URL` — доступ к БД только на стороне FastAPI.

Интерфейс: фильтры и кнопка **«Обновить данные»** (сброс кэша API) в **левой панели**; графики и KPI — в основной области.

## Локальный запуск

```bash
cd streamlit_app
pip install -r requirements.txt
export STREAMLIT_API_BASE_URL=http://127.0.0.1:8000
streamlit run app.py
```

Либо создайте `streamlit_app/.streamlit/secrets.toml` (не коммитьте):

```toml
API_BASE_URL = "http://127.0.0.1:8000"
```

## FastAPI в проде

- Задайте `DATABASE_URL`, HTTPS (см. [deploy/README.md](README.md)).
- Для явного списка `CORS_ORIGINS` по умолчанию добавляется regex под `https://<app>.streamlit.app` (`CORS_AUTO_STREAMLIT=true`). Отключить: `CORS_AUTO_STREAMLIT=false`. Свой regex: `CORS_ORIGIN_REGEX=^https://...$`.
