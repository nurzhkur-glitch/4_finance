# Публикация дашборда (Streamlit Community Cloud)

После деплоя приложение будет доступно по ссылке **`https://<имя>.streamlit.app`**.

## Требования

- Аккаунт **GitHub** (бесплатный)
- Аккаунт **Streamlit Community Cloud** (бесплатный, вход через GitHub)
- Один из источников данных:
  - **Вариант A (рекомендуется):** PostgreSQL база данных, доступная из интернета  
    (Neon, Supabase, Railway, RDS, VPS — любой публичный PostgreSQL)
  - **Вариант B:** FastAPI backend, развёрнутый с публичным HTTPS

---

## 1. Репозиторий на GitHub

```bash
cd /path/to/4_finance
git add -A
git commit -m "Finance dashboard"
```

Создайте репозиторий на [github.com/new](https://github.com/new) и запушьте:

```bash
git remote add origin https://github.com/<логин>/<репо>.git
git branch -M main
git push -u origin main
```

> Не коммитьте `backend/.env` и `.streamlit/secrets.toml` — они в `.gitignore`.

---

## 2. Деплой на Streamlit Cloud

1. Перейдите на [share.streamlit.io](https://share.streamlit.io), войдите через GitHub
2. **New app** → выберите ваш репозиторий, ветка `main`
3. **Main file path:** `streamlit_app/app.py`
4. Нажмите **Deploy**

Зависимости устанавливаются из `streamlit_app/requirements.txt` автоматически.

---

## 3. Секреты (подключение к данным)

В интерфейсе Streamlit Cloud: **⋮ → Settings → Secrets**

### Вариант A — прямое подключение к PostgreSQL (рекомендуется)

```toml
DATABASE_URL = "postgresql://user:password@host:5432/dbname"
```

Приложение подключится напрямую к БД — FastAPI backend не нужен.

### Вариант B — FastAPI backend

```toml
API_BASE_URL = "https://ваш-api.example.com"
```

Backend должен быть доступен публично по HTTPS. CORS для `*.streamlit.app`
включён автоматически в `backend/main.py`.

После сохранения нажмите **Reboot app**.

---

## 4. Ссылка для коллег

После деплоя в панели Cloud будет ссылка вида `https://....streamlit.app`.

- **Публичное приложение** — можно открыть без входа
- **Приватное** — настройте Viewer access в настройках приложения

---

## 5. Обновление данных

- Данные **обновляются автоматически** каждые 2 минуты (кэш TTL=120s)
- Кнопка **«🔄 Обновить данные»** в боковой панели — сбрасывает кэш немедленно
- При `git push` в ветку `main` Streamlit Cloud пересобирает приложение

---

## 6. Локальная проверка перед публикацией

```bash
cd streamlit_app
pip install -r requirements.txt

# Вариант A: прямой PostgreSQL
export DATABASE_URL="postgresql://user:pass@host:5432/db"

# Вариант B: FastAPI backend
export API_BASE_URL="http://localhost:8000"

streamlit run app.py
```

Без переменных окружения — запустится в **demo-режиме** с тестовыми данными.
