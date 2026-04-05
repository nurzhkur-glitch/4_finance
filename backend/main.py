"""
Finance Dashboard API — FastAPI + PostgreSQL + WebSocket NRT
Data source: unpacked_smart_lombard_analytic_data (EAV: date, metric, value)
Supports DEMO_MODE=true when DATABASE_URL is unset.
"""

import asyncio
import random
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from dotenv import load_dotenv
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import os

load_dotenv()


def _parse_cors_origins() -> Tuple[List[str], bool]:
    """CORS_ORIGINS: comma-separated list, or * for any. Credentials only with explicit origins."""
    raw = os.getenv("CORS_ORIGINS", "*").strip()
    if raw == "*":
        return ["*"], False
    origins = [x.strip() for x in raw.split(",") if x.strip()]
    if not origins:
        return ["*"], False
    return origins, True


CORS_ALLOW_ORIGINS, CORS_ALLOW_CREDENTIALS = _parse_cors_origins()


def _cors_origin_regex() -> Optional[str]:
    """Allow Streamlit Community Cloud (*.streamlit.app) when using explicit CORS_ORIGINS."""
    custom = os.getenv("CORS_ORIGIN_REGEX", "").strip()
    if custom:
        return custom
    if CORS_ALLOW_ORIGINS == ["*"]:
        return None
    if os.getenv("CORS_AUTO_STREAMLIT", "true").lower() in ("1", "true", "yes"):
        return r"^https://[a-zA-Z0-9._-]+\.streamlit\.app$"
    return None


CORS_ORIGIN_REGEX = _cors_origin_regex()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true" or not DATABASE_URL

ANALYTICS_TABLE = "unpacked_smart_lombard_analytic_data"

pool = None
listener_conn = None
connected_clients: set[WebSocket] = set()

# value is numeric in DB; COALESCE for NULL rows
_VAL = "COALESCE(d.value, 0::numeric)"

# One row per (date, branch); API field `location` = DB column `branch`
FINANCE_ROWS_SQL = f"""
    SELECT
        NULLIF(trim(SPLIT_PART(d.date, ' ', 1)), '')::int AS year,
        CASE trim(SPLIT_PART(d.date, ' ', 2))
            WHEN 'Январь' THEN 'January' WHEN 'Февраль' THEN 'February' WHEN 'Март' THEN 'March'
            WHEN 'Апрель' THEN 'April' WHEN 'Май' THEN 'May' WHEN 'Июнь' THEN 'June'
            WHEN 'Июль' THEN 'July' WHEN 'Август' THEN 'August' WHEN 'Сентябрь' THEN 'September'
            WHEN 'Октябрь' THEN 'October' WHEN 'Ноябрь' THEN 'November' WHEN 'Декабрь' THEN 'December'
            ELSE trim(SPLIT_PART(d.date, ' ', 2))
        END AS month,
        COALESCE(NULLIF(trim(d.branch::text), ''), '(без филиала)') AS location,
        COALESCE(SUM(CASE WHEN d.metric = 'assets_general' THEN {_VAL} ELSE 0 END), 0)::bigint AS total_assets,
        COALESCE(SUM(CASE WHEN d.metric = 'assets_lombard' THEN {_VAL} ELSE 0 END), 0)::bigint AS lombard_assets,
        COALESCE(SUM(CASE WHEN d.metric = 'assets_com_shop' THEN {_VAL} ELSE 0 END), 0)::bigint AS store_assets,
        (
            COALESCE(SUM(CASE WHEN d.metric = 'assets_general' THEN {_VAL} ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN d.metric = 'assets_lombard' THEN {_VAL} ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN d.metric = 'assets_com_shop' THEN {_VAL} ELSE 0 END), 0)
        )::bigint AS cash,
        (
            COALESCE(SUM(CASE WHEN d.metric = 'assets_lombard' THEN {_VAL} ELSE 0 END), 0)
            + COALESCE(SUM(CASE WHEN d.metric = 'assets_com_shop' THEN {_VAL} ELSE 0 END), 0)
        )::bigint AS store_lombard_assets,
        COALESCE(SUM(CASE WHEN d.metric = 'profit_general' THEN {_VAL} ELSE 0 END), 0)::bigint AS total_income,
        COALESCE(SUM(CASE WHEN d.metric = 'profit_lombard' THEN {_VAL} ELSE 0 END), 0)::bigint AS lombard_income,
        COALESCE(SUM(CASE WHEN d.metric = 'profit_com_shop' THEN {_VAL} ELSE 0 END), 0)::bigint AS store_income,
        (
            COALESCE(SUM(CASE WHEN d.metric = 'profit_general' THEN {_VAL} ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN d.metric = 'profit_lombard' THEN {_VAL} ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN d.metric = 'profit_com_shop' THEN {_VAL} ELSE 0 END), 0)
        )::bigint AS other_income,
        (
            COALESCE(SUM(CASE WHEN d.metric = 'profit_general' THEN {_VAL} ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN d.metric = 'profit_clean' THEN {_VAL} ELSE 0 END), 0)
        )::bigint AS expenses,
        COALESCE(SUM(CASE WHEN d.metric = 'profit_clean' THEN {_VAL} ELSE 0 END), 0)::bigint AS profit,
        CASE
            WHEN COALESCE(SUM(CASE WHEN d.metric = 'profit_general' THEN {_VAL} ELSE 0 END), 0) > 0
            THEN ROUND(
                (COALESCE(SUM(CASE WHEN d.metric = 'profit_clean' THEN {_VAL} ELSE 0 END), 0)::numeric
                 / COALESCE(SUM(CASE WHEN d.metric = 'profit_general' THEN {_VAL} ELSE 0 END), 0)::numeric)
                * 100, 1
            )
            ELSE 0::numeric
        END AS profit_pct
    FROM {ANALYTICS_TABLE} d
    GROUP BY d.date, d.branch
"""

MONTH_ORDER_CASE = """
    CASE month
        WHEN 'January'   THEN 1  WHEN 'February'  THEN 2
        WHEN 'March'     THEN 3  WHEN 'April'     THEN 4
        WHEN 'May'       THEN 5  WHEN 'June'      THEN 6
        WHEN 'July'      THEN 7  WHEN 'August'    THEN 8
        WHEN 'September' THEN 9  WHEN 'October'   THEN 10
        WHEN 'November'  THEN 11 WHEN 'December'  THEN 12
        ELSE 99
    END
"""

MONTH_ORDER_FR = """
    CASE fr.month
        WHEN 'January'   THEN 1  WHEN 'February'  THEN 2
        WHEN 'March'     THEN 3  WHEN 'April'     THEN 4
        WHEN 'May'       THEN 5  WHEN 'June'      THEN 6
        WHEN 'July'      THEN 7  WHEN 'August'    THEN 8
        WHEN 'September' THEN 9  WHEN 'October'   THEN 10
        WHEN 'November'  THEN 11 WHEN 'December'  THEN 12
        ELSE 99
    END
"""

ALL_MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

DEMO_LOCATIONS = [
    "Kaspi L'amour", "Айнабулак", "Аксай СПП", "Арена",
    "Арыстан СПП", "Мира", "Самал СПП", "Саяхат",
    "Шолохова", "Шугыла", "L'amour", "ReTech",
    "Айнабулак СПП", "Алмагуль", "Арена СПП",
    "Касса Бухгалтерия", "Мира СПП", "Сатпаева",
    "Саяхат СПП", "Толе Би", "Шолохова СПП",
    "Шугыла СПП", "Аксай", "Алмагуль СПП",
    "Арыстан", "Самал", "Сатпаева СПП", "Сейф", "Толе Би СПП",
]


def _generate_demo_data():
    data = []
    demo_branches = DEMO_LOCATIONS[:4]
    weights = [0.32, 0.28, 0.22, 0.18][: len(demo_branches)]
    for year in [2024, 2025, 2026]:
        month_count = 12 if year < 2026 else 3
        for i in range(month_count):
            month = ALL_MONTHS[i]
            base_income = random.randint(230_000_000, 320_000_000)
            total_assets = random.randint(1_500_000_000, 1_900_000_000)
            for bi, loc in enumerate(demo_branches):
                w = weights[bi]
                bi_income = int(base_income * w)
                lombard_pct = random.uniform(0.65, 0.75)
                store_pct = random.uniform(0.22, 0.30)
                lombard_income = int(bi_income * lombard_pct)
                store_income = int(bi_income * store_pct)
                other_income = bi_income - lombard_income - store_income
                expenses = int(bi_income * random.uniform(0.50, 0.65))
                profit = bi_income - expenses
                ta = int(total_assets * w)
                lombard_assets = int(ta * random.uniform(0.82, 0.92))
                store_assets = int(ta * random.uniform(0.05, 0.10))
                store_lombard = lombard_assets + store_assets
                cash = ta - store_lombard
                data.append({
                    "month": month,
                    "year": year,
                    "location": loc,
                    "total_assets": ta,
                    "store_lombard_assets": store_lombard,
                    "lombard_assets": lombard_assets,
                    "store_assets": store_assets,
                    "cash": cash,
                    "total_income": bi_income,
                    "lombard_income": lombard_income,
                    "store_income": store_income,
                    "other_income": other_income,
                    "expenses": expenses,
                    "profit": profit,
                    "profit_pct": round(profit / bi_income * 100, 1) if bi_income else 0,
                })
    return data


DEMO_DATA = _generate_demo_data()


async def broadcast(message: dict):
    for ws in list(connected_clients):
        try:
            await ws.send_json(message)
        except Exception:
            connected_clients.discard(ws)


def on_notify(conn, pid, channel, payload):
    asyncio.create_task(broadcast({
        "event": "data_changed",
        "payload": payload,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }))


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool, listener_conn

    if DEMO_MODE:
        print("=" * 50)
        print("  DEMO MODE — using generated sample data")
        print("  Set DATABASE_URL in .env to use real PostgreSQL")
        print("=" * 50)
        yield
        return

    import asyncpg
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    try:
        listener_conn = await asyncpg.connect(DATABASE_URL)
        await listener_conn.add_listener("finance_updates", on_notify)
    except Exception as e:
        print(f"  LISTEN finance_updates skipped: {e}")
        listener_conn = None

    yield

    if listener_conn:
        try:
            await listener_conn.remove_listener("finance_updates", on_notify)
            await listener_conn.close()
        except Exception:
            pass
        listener_conn = None
    await pool.close()


app = FastAPI(title="Finance Dashboard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.add(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        connected_clients.discard(ws)


@app.get("/api/filters")
async def get_filters():
    if DEMO_MODE:
        years = sorted({d["year"] for d in DEMO_DATA})
        locs = sorted({d["location"] for d in DEMO_DATA})
        return {"years": years, "months": ALL_MONTHS, "locations": locs}

    import asyncpg
    async with pool.acquire() as conn:
        years = await conn.fetch(
            f"SELECT DISTINCT year FROM ({FINANCE_ROWS_SQL}) fr ORDER BY year"
        )
        months = await conn.fetch(
            f"""
            SELECT month FROM (
                SELECT DISTINCT month FROM ({FINANCE_ROWS_SQL}) fr
            ) t
            ORDER BY {MONTH_ORDER_CASE.replace('CASE month', 'CASE t.month')}
            """
        )
        locations = await conn.fetch(
            f"SELECT DISTINCT location FROM ({FINANCE_ROWS_SQL}) fr ORDER BY location"
        )
    return {
        "years": [r["year"] for r in years],
        "months": [r["month"] for r in months],
        "locations": [r["location"] for r in locations],
    }


@app.get("/api/data")
async def get_data(
    year: Optional[int] = Query(None),
    month: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
):
    if DEMO_MODE:
        data = DEMO_DATA
        if year:
            data = [d for d in data if d["year"] == year]
        if month:
            data = [d for d in data if d["month"] == month]
        if location:
            data = [d for d in data if d.get("location") == location]
        return {"data": data}

    conditions, params, idx = [], [], 1
    if year:
        conditions.append(f"fr.year = ${idx}")
        params.append(year)
        idx += 1
    if month:
        conditions.append(f"fr.month = ${idx}")
        params.append(month)
        idx += 1
    if location:
        conditions.append(f"fr.location = ${idx}")
        params.append(location)
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = f"""
        SELECT
            fr.year,
            fr.month,
            fr.location,
            fr.total_assets,
            fr.store_lombard_assets,
            fr.lombard_assets,
            fr.store_assets,
            fr.cash,
            fr.total_income,
            fr.lombard_income,
            fr.store_income,
            fr.other_income,
            fr.expenses,
            fr.profit,
            fr.profit_pct
        FROM ({FINANCE_ROWS_SQL}) fr
        {where}
        ORDER BY fr.year DESC, {MONTH_ORDER_FR}, fr.location
    """

    import asyncpg
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)

    return {"data": [dict(r) for r in rows]}


@app.get("/api/monthly-summary")
async def monthly_summary(year: Optional[int] = Query(None)):
    if DEMO_MODE:
        data = DEMO_DATA
        if year:
            data = [d for d in data if d["year"] == year]
        return {"data": data}

    condition = "WHERE fr.year = $1" if year else ""
    params = [year] if year else []

    query = f"""
        SELECT
            fr.year,
            fr.month,
            fr.location,
            fr.total_assets,
            fr.store_lombard_assets,
            fr.lombard_assets,
            fr.store_assets,
            fr.cash,
            fr.total_income,
            fr.lombard_income,
            fr.store_income,
            fr.other_income,
            fr.expenses,
            fr.profit,
            fr.profit_pct
        FROM ({FINANCE_ROWS_SQL}) fr
        {condition}
        ORDER BY fr.year DESC, {MONTH_ORDER_FR}, fr.location
    """

    import asyncpg
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)

    return {"data": [dict(r) for r in rows]}


@app.get("/api/location-summary")
async def location_summary(
    year: Optional[int] = Query(None),
    month: Optional[str] = Query(None),
):
    if DEMO_MODE:
        rows = DEMO_DATA
        if year:
            rows = [d for d in rows if d["year"] == year]
        if month:
            rows = [d for d in rows if d["month"] == month]
        by_loc: dict[str, dict] = {}
        for d in rows:
            loc = d.get("location") or "(без филиала)"
            if loc not in by_loc:
                by_loc[loc] = {"location": loc, "total_income": 0, "profit": 0, "total_assets": 0}
            by_loc[loc]["total_income"] += int(d.get("total_income") or 0)
            by_loc[loc]["profit"] += int(d.get("profit") or 0)
            by_loc[loc]["total_assets"] += int(d.get("total_assets") or 0)
        out = sorted(by_loc.values(), key=lambda x: x["profit"], reverse=True)
        return {"data": out}

    conditions, params, idx = [], [], 1
    if year:
        conditions.append(f"fr.year = ${idx}")
        params.append(year)
        idx += 1
    if month:
        conditions.append(f"fr.month = ${idx}")
        params.append(month)
        idx += 1
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    query = f"""
        SELECT
            fr.location,
            COALESCE(SUM(fr.total_income), 0)::bigint AS total_income,
            COALESCE(SUM(fr.profit), 0)::bigint AS profit,
            COALESCE(SUM(fr.total_assets), 0)::bigint AS total_assets
        FROM ({FINANCE_ROWS_SQL}) fr
        {where}
        GROUP BY fr.location
        ORDER BY SUM(fr.profit) DESC
    """

    import asyncpg
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)

    return {"data": [dict(r) for r in rows]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
