# Публикация дашборда (Streamlit Community Cloud)

После шагов ниже приложение будет доступно по ссылке вида **`https://<имя-приложения>.streamlit.app`** — ею можно делиться.

## Что нужно заранее

1. Аккаунт **GitHub**.
2. Публичный **HTTPS-адрес вашего FastAPI** (VPS, Docker и т.д.), открытый из интернета.  
   Проверка: в браузере открывается `https://ваш-домен/api/filters` и отдаётся JSON.
3. В проде в `CORS_ORIGINS` указан ваш домен API; для поддоменов `*.streamlit.app` при явном списке CORS в [`backend/main.py`](backend/main.py) по умолчанию включён regex (см. `CORS_AUTO_STREAMLIT` в [`backend/.env.example`](backend/.env.example)).

## 1. Репозиторий на GitHub

На своей машине (если ещё не сделано):

```bash
cd /path/to/4_finance
git init
git add -A
git commit -m "Initial commit: finance dashboard + Streamlit"
```

Создайте **новый репозиторий** на [github.com/new](https://github.com/new) (без README, если уже есть коммит).

```bash
git remote add origin https://github.com/<ваш-логин>/<имя-репо>.git
git branch -M main
git push -u origin main
```

**Не коммитьте** файлы с паролями: `backend/.env`, `streamlit_app/.streamlit/secrets.toml` — они в [.gitignore](.gitignore).

## 2. Streamlit Community Cloud

1. Зайдите на [share.streamlit.io](https://share.streamlit.io) и войдите через **GitHub**.
2. **New app** → выберите репозиторий и ветку **`main`**.
3. **Main file path:** `streamlit_app/app.py`
4. В **Advanced settings** при желании выберите **Python 3.11** (или оставьте по умолчанию, если сборка проходит).
5. **Deploy.**

Зависимости: [`streamlit_app/requirements.txt`](streamlit_app/requirements.txt) (в той же папке, что и `app.py`).

## 3. Секреты (обязательно)

В приложении на Cloud: **⋮ → Settings → Secrets** вставьте (подставьте свой URL, **без** слэша в конце):

```toml
API_BASE_URL = "https://ваш-api.example.com"
```

Сохраните и нажмите **Reboot app** (или дождитесь перезапуска).

## 4. Ссылка для коллег

После деплоя в интерфейсе Cloud будет ссылка **`https://....streamlit.app`**. Её можно отправлять тем, кому нужен доступ к дашборду (при **публичном** приложении вход не нужен).

Чтобы приложение было **приватным**, настройте доступ в Streamlit Cloud (зависит от типа аккаунта / команды).

## 5. Обновления

После `git push` в `main` Cloud обычно **пересобирает приложение сам**. Кнопка **«Обновить данные»** в сайдбаре сбрасывает только кэш запросов к API на стороне Streamlit, не передеплой.

## Локальная проверка перед публикацией

```bash
cd streamlit_app
pip install -r requirements.txt
export STREAMLIT_API_BASE_URL=https://ваш-api.example.com
streamlit run app.py
```

Подробнее: [deploy/streamlit.md](deploy/streamlit.md).
