"""
Finance Dashboard API — FastAPI + PostgreSQL
=============================================
Замените параметры подключения к БД в .env файле.
"""

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import asyncpg
import os
from dotenv import load_dotenv
from typing import Optional
from contextlib import asynccontextmanager

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://user:password@localhost:5432/finance"
)

pool = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL)
    yield
    await pool.close()


app = FastAPI(title="Finance Dashboard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Справочные эндпоинты ───

@app.get("/api/filters")
async def get_filters():
    """Возвращает доступные годы, месяцы и точки продаж для фильтров."""
    async with pool.acquire() as conn:
        years = await conn.fetch("SELECT DISTINCT year FROM finance_data ORDER BY year")
        months = await conn.fetch("SELECT DISTINCT month FROM finance_data ORDER BY month")
        locations = await conn.fetch("SELECT DISTINCT location FROM finance_data ORDER BY location")
    return {
        "years": [r["year"] for r in years],
        "months": [r["month"] for r in months],
        "locations": [r["location"] for r in locations],
    }


# ─── Основной эндпоинт данных ───

@app.get("/api/data")
async def get_data(
    year: Optional[int] = Query(None),
    month: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
):
    """
    Возвращает агрегированные финансовые данные с фильтрацией.
    
    Адаптируйте SQL под вашу реальную структуру таблиц.
    """
    conditions = []
    params = []
    idx = 1

    if year:
        conditions.append(f"year = ${idx}")
        params.append(year)
        idx += 1
    if month:
        conditions.append(f"month = ${idx}")
        params.append(month)
        idx += 1
    if location:
        conditions.append(f"location = ${idx}")
        params.append(location)
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    query = f"""
        SELECT
            year,
            month,
            location,
            COALESCE(SUM(total_assets), 0)          AS total_assets,
            COALESCE(SUM(store_lombard_assets), 0)   AS store_lombard_assets,
            COALESCE(SUM(lombard_assets), 0)         AS lombard_assets,
            COALESCE(SUM(store_assets), 0)           AS store_assets,
            COALESCE(SUM(cash), 0)                   AS cash,
            COALESCE(SUM(total_income), 0)           AS total_income,
            COALESCE(SUM(lombard_income), 0)         AS lombard_income,
            COALESCE(SUM(store_income), 0)           AS store_income,
            COALESCE(SUM(other_income), 0)           AS other_income,
            COALESCE(SUM(expenses), 0)               AS expenses,
            COALESCE(SUM(profit), 0)                 AS profit,
            CASE
                WHEN SUM(total_income) > 0
                THEN ROUND(SUM(profit)::numeric / SUM(total_income)::numeric * 100, 1)
                ELSE 0
            END AS profit_pct
        FROM finance_data
        {where}
        GROUP BY year, month, location
        ORDER BY year DESC, month, location
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)

    return {"data": [dict(r) for r in rows]}


# ─── Агрегация по месяцам (для графиков) ───

@app.get("/api/monthly-summary")
async def monthly_summary(year: Optional[int] = Query(None)):
    """Помесячная сводка для графиков."""
    condition = f"WHERE year = $1" if year else ""
    params = [year] if year else []

    query = f"""
        SELECT
            month,
            SUM(total_income)  AS total_income,
            SUM(expenses)      AS expenses,
            SUM(profit)        AS profit,
            SUM(total_assets)  AS total_assets,
            SUM(lombard_income) AS lombard_income,
            SUM(store_income)  AS store_income,
            SUM(other_income)  AS other_income
        FROM finance_data
        {condition}
        GROUP BY month
        ORDER BY month
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)

    return {"data": [dict(r) for r in rows]}


# ─── Агрегация по точкам продаж ───

@app.get("/api/location-summary")
async def location_summary(
    year: Optional[int] = Query(None),
    month: Optional[str] = Query(None),
):
    """Сводка по точкам продаж для диаграмм."""
    conditions = []
    params = []
    idx = 1

    if year:
        conditions.append(f"year = ${idx}")
        params.append(year)
        idx += 1
    if month:
        conditions.append(f"month = ${idx}")
        params.append(month)
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    query = f"""
        SELECT
            location,
            SUM(total_income)  AS total_income,
            SUM(profit)        AS profit,
            SUM(total_assets)  AS total_assets
        FROM finance_data
        {where}
        GROUP BY location
        ORDER BY SUM(profit) DESC
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)

    return {"data": [dict(r) for r in rows]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
