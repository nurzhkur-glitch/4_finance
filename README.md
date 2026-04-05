# Finance Dashboard

Финансовый дашборд: **React** (Vite) + **FastAPI** + PostgreSQL; отдельное приложение **Streamlit** для быстрого шаринга через облако.

| Часть | Описание |
|--------|----------|
| `frontend/` | Основной UI, `npm run dev` → http://localhost:3000 |
| `backend/` | API, `uvicorn main:app --port 8000` |
| `streamlit_app/` | Облачная версия для [Streamlit Community Cloud](https://share.streamlit.io) |

**Опубликовать Streamlit и получить ссылку `.streamlit.app`:** см. [STREAMLIT_CLOUD.md](STREAMLIT_CLOUD.md).

Деплой API + Docker/nginx: [deploy/README.md](deploy/README.md).

Контекст проекта: [CLAUDE.md](CLAUDE.md).
