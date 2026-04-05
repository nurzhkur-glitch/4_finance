# Finance Dashboard

Финансовый дашборд для замены Power BI. React + Recharts (фронтенд) и FastAPI + PostgreSQL (бэкенд).

## 📸 Возможности

- **Фильтры**: по году, месяцу, точке продаж и категории
- **KPI-карточки**: общий актив, доход, прибыль, затраты, касса, актив ломбарда
- **Графики**: доходы vs расходы (area chart), структура дохода (pie chart), прибыльность (bar chart)
- **Таблица**: детализация по месяцам с итогами

## 🚀 Быстрый старт

### 1. Бэкенд (FastAPI)

```bash
cd backend

# Создайте виртуальное окружение
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# Установите зависимости
pip install -r requirements.txt

# Настройте подключение к БД
cp .env.example .env
# Отредактируйте .env — укажите ваш PostgreSQL connection string

# Создайте таблицу (если нужно)
psql -U your_user -d your_db -f migration.sql

# Запустите сервер
uvicorn main:app --reload --port 8000
```

API будет доступно на `http://localhost:8000`
Документация: `http://localhost:8000/docs`

### 2. Фронтенд (React)

```bash
# Создайте проект
npx create-react-app frontend
cd frontend

# Установите зависимости
npm install recharts

# Скопируйте FinanceDashboard.jsx в src/
# Замените содержимое App.js:
```

```jsx
import FinanceDashboard from './FinanceDashboard';

function App() {
  return <FinanceDashboard />;
}

export default App;
```

```bash
# Запустите
npm start
```

### 3. Подключение к реальным данным

В `FinanceDashboard.jsx` замените демо-данные на fetch-вызовы:

```jsx
// Вместо MONTHLY_DATA используйте:
useEffect(() => {
  fetch(`http://localhost:8000/api/monthly-summary?year=${selectedYear}`)
    .then(r => r.json())
    .then(d => setMonthlyData(d.data));
}, [selectedYear]);
```

## 📁 Структура проекта

```
finance-dashboard/
├── backend/
│   ├── main.py              # FastAPI сервер
│   ├── requirements.txt     # Python зависимости
│   ├── migration.sql        # SQL для создания таблицы
│   └── .env.example         # Шаблон переменных окружения
├── frontend/
│   └── src/
│       └── FinanceDashboard.jsx  # Главный компонент
└── README.md
```

## 🔧 Адаптация под вашу БД

Если ваша таблица называется иначе или имеет другую структуру,
отредактируйте SQL-запросы в `backend/main.py`.

Текущая схема ожидает таблицу `finance_data` с колонками:
`year`, `month`, `location`, `total_assets`, `store_lombard_assets`,
`lombard_assets`, `store_assets`, `cash`, `total_income`,
`lombard_income`, `store_income`, `other_income`, `expenses`, `profit`

## 📦 Git

```bash
git init
git add .
git commit -m "Initial: Finance Dashboard (React + FastAPI)"
git remote add origin https://github.com/YOUR_USER/finance-dashboard.git
git push -u origin main
```
