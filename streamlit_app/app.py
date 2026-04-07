"""
Финансовый дашборд — standalone Streamlit приложение.

Источники данных (проверяются по порядку):
  1. DATABASE_URL  в secrets → прямое подключение к PostgreSQL
  2. API_BASE_URL  в secrets → FastAPI backend
  3. Demo-режим (автоматически, без настроек)

Streamlit Community Cloud:
  Secrets → добавить DATABASE_URL = "postgresql://..." или API_BASE_URL = "https://..."
Локально:
  export DATABASE_URL=postgresql://user:pass@host:5432/db
  streamlit run app.py
"""

from __future__ import annotations

import os
import random
from typing import Any

import pandas as pd
import streamlit as st

# ── Константы ────────────────────────────────────────────────────────────────
ALL_MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
MONTH_SHORT = {
    "January": "Янв", "February": "Фев", "March": "Мар", "April": "Апр",
    "May": "Май",     "June": "Июн",     "July": "Июл",  "August": "Авг",
    "September": "Сен", "October": "Окт", "November": "Ноя", "December": "Дек",
}
MONTH_IDX = {m: i for i, m in enumerate(ALL_MONTHS)}

MONTH_ORDER_SQL = """
    CASE {col}
        WHEN 'January'   THEN 1  WHEN 'February'  THEN 2
        WHEN 'March'     THEN 3  WHEN 'April'     THEN 4
        WHEN 'May'       THEN 5  WHEN 'June'      THEN 6
        WHEN 'July'      THEN 7  WHEN 'August'    THEN 8
        WHEN 'September' THEN 9  WHEN 'October'   THEN 10
        WHEN 'November'  THEN 11 WHEN 'December'  THEN 12
        ELSE 99
    END
"""

PROJECT_GROUPS: dict[str, list[str]] = {
    "L'amour":     ["L'amour", "L'amour KASPI", "Ком. магазин", "Ком магазин"],
    "L'amour NEW": ["L'amour NEW"],
    "ReTech":      ["ReTech", "Склад товаров"],
    "Аренда":      ["Rent", "Service"],
    "Бухгалтерия": ["Касса бухгалтерии"],
    "Инвестиции":  ["Сейф"],
    "Ломбард": [
        "Айнабулак", "Алмагуль", "Аксай", "Арена", "Арыстан",
        "Мира", "Самал", "Саяхат", "Сатпаева", "Шолохова", "Шугыла",
        "Толе би", "Толе Би",
    ],
    "СПП": [
        "Айнабулак СПП", "Алмагуль СПП", "Аксай СПП", "Арена СПП", "Арыстан СПП",
        "Мира СПП", "Самал СПП", "Саяхат СПП", "Сатпаева СПП", "Шолохова СПП",
        "Шугыла СПП", "Толе би СПП", "Толе Би СПП",
    ],
}
PROJECT_ORDER = [
    "L'amour", "L'amour NEW", "ReTech", "Аренда",
    "Бухгалтерия", "Инвестиции", "Ломбард", "СПП",
]

ASSET_KEYS = ["total_assets", "store_lombard_assets", "lombard_assets", "store_assets", "cash"]
FLOW_KEYS  = ["total_income", "lombard_income", "store_income", "other_income", "expenses", "profit"]
ROW_KEYS   = ASSET_KEYS + FLOW_KEYS

ANALYTICS_TABLE = "unpacked_smart_lombard_analytic_data"

_VAL = "COALESCE(d.value, 0::numeric)"
FINANCE_ROWS_SQL = f"""
    SELECT
        NULLIF(trim(SPLIT_PART(d.date, ' ', 1)), '')::int AS year,
        CASE trim(SPLIT_PART(d.date, ' ', 2))
            WHEN 'Январь'   THEN 'January'   WHEN 'Февраль'  THEN 'February'
            WHEN 'Март'     THEN 'March'     WHEN 'Апрель'   THEN 'April'
            WHEN 'Май'      THEN 'May'       WHEN 'Июнь'     THEN 'June'
            WHEN 'Июль'     THEN 'July'      WHEN 'Август'   THEN 'August'
            WHEN 'Сентябрь' THEN 'September' WHEN 'Октябрь'  THEN 'October'
            WHEN 'Ноябрь'   THEN 'November'  WHEN 'Декабрь'  THEN 'December'
            ELSE trim(SPLIT_PART(d.date, ' ', 2))
        END AS month,
        COALESCE(NULLIF(trim(d.branch::text), ''), '(без филиала)') AS location,
        COALESCE(SUM(CASE WHEN d.metric = 'assets_general'  THEN {_VAL} ELSE 0 END), 0)::bigint AS total_assets,
        COALESCE(SUM(CASE WHEN d.metric = 'assets_lombard'  THEN {_VAL} ELSE 0 END), 0)::bigint AS lombard_assets,
        COALESCE(SUM(CASE WHEN d.metric = 'assets_com_shop' THEN {_VAL} ELSE 0 END), 0)::bigint AS store_assets,
        (
            COALESCE(SUM(CASE WHEN d.metric = 'assets_general'  THEN {_VAL} ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN d.metric = 'assets_lombard'  THEN {_VAL} ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN d.metric = 'assets_com_shop' THEN {_VAL} ELSE 0 END), 0)
        )::bigint AS cash,
        (
            COALESCE(SUM(CASE WHEN d.metric = 'assets_lombard'  THEN {_VAL} ELSE 0 END), 0)
            + COALESCE(SUM(CASE WHEN d.metric = 'assets_com_shop' THEN {_VAL} ELSE 0 END), 0)
        )::bigint AS store_lombard_assets,
        COALESCE(SUM(CASE WHEN d.metric = 'profit_general'  THEN {_VAL} ELSE 0 END), 0)::bigint AS total_income,
        COALESCE(SUM(CASE WHEN d.metric = 'profit_lombard'  THEN {_VAL} ELSE 0 END), 0)::bigint AS lombard_income,
        COALESCE(SUM(CASE WHEN d.metric = 'profit_com_shop' THEN {_VAL} ELSE 0 END), 0)::bigint AS store_income,
        (
            COALESCE(SUM(CASE WHEN d.metric = 'profit_general'  THEN {_VAL} ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN d.metric = 'profit_lombard'  THEN {_VAL} ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN d.metric = 'profit_com_shop' THEN {_VAL} ELSE 0 END), 0)
        )::bigint AS other_income,
        (
            COALESCE(SUM(CASE WHEN d.metric = 'profit_general' THEN {_VAL} ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN d.metric = 'profit_clean'  THEN {_VAL} ELSE 0 END), 0)
        )::bigint AS expenses,
        COALESCE(SUM(CASE WHEN d.metric = 'profit_clean' THEN {_VAL} ELSE 0 END), 0)::bigint AS profit
    FROM {ANALYTICS_TABLE} d
    GROUP BY d.date, d.branch
"""


# ── Утилиты ───────────────────────────────────────────────────────────────────
def _num(x: Any) -> float:
    try:
        return float(x) if x is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def fmt_kzt(n: float) -> str:
    """Полное число с пробелами как разделителями тысяч: 337 500 000"""
    v = int(round(_num(n)))
    if v < 0:
        return "-" + f"{abs(v):,}".replace(",", "\u00a0")
    return f"{v:,}".replace(",", "\u00a0")


def normalize_key(s: str) -> str:
    if not s:
        return ""
    for old, new in (("\u2018", "'"), ("\u2019", "'"), ("\u02bc", "'"), ("`", "'")):
        s = s.replace(old, new)
    return s.strip()


def loc_matches(pattern: str, loc: str) -> bool:
    np_, nl = normalize_key(pattern).lower(), normalize_key(loc).lower()
    return nl == np_ or nl.startswith(f"{np_} id-")


def expand_project(project: str, all_locs: list[str]) -> set[str]:
    return {
        loc
        for pat in PROJECT_GROUPS.get(project, [])
        for loc in all_locs
        if loc_matches(pat, loc)
    }


def collapse_by_month(rows: list[dict], sel_locs: list[str]) -> list[dict]:
    """Агрегирует строки по (year, month), фильтруя по sel_locs если задано."""
    if sel_locs:
        locset = set(sel_locs)
        rows = [r for r in rows if r.get("location") in locset]
    acc: dict[tuple, dict] = {}
    for d in rows:
        y, m = d.get("year"), d.get("month")
        if y is None or m is None:
            continue
        k = (y, m)
        if k not in acc:
            acc[k] = {"year": y, "month": m, **{x: 0.0 for x in ROW_KEYS}}
        o = acc[k]
        for key in ROW_KEYS:
            o[key] += _num(d.get(key))
    out = list(acc.values())
    for o in out:
        ti = o["total_income"]
        o["profit_pct"] = round(o["profit"] / ti * 100, 1) if ti > 0 else 0.0
    # Хронологический порядок: Янв → Дек, старые годы первыми
    out.sort(key=lambda r: (int(r["year"]), MONTH_IDX.get(r["month"], 99)))
    return out


def aggregate(rows: list[dict]) -> dict[str, Any]:
    if not rows:
        return {k: 0 for k in ROW_KEYS} | {"profit_pct": 0.0}
    n = len(rows)
    res: dict[str, Any] = {}
    for k in FLOW_KEYS:
        res[k] = sum(_num(d.get(k)) for d in rows)
    for k in ASSET_KEYS:
        res[k] = round(sum(_num(d.get(k)) for d in rows) / n)
    ti = res["total_income"]
    res["profit_pct"] = round(res["profit"] / ti * 100, 1) if ti > 0 else 0.0
    return res


# ── Источники данных ──────────────────────────────────────────────────────────
def _secret(key: str) -> str:
    val = os.environ.get(key, "").strip()
    if val:
        return val
    try:
        v = st.secrets.get(key, "")
        return str(v).strip() if v else ""
    except Exception:
        return ""


# ---------- Прямой PostgreSQL ----------
@st.cache_data(ttl=120, show_spinner=False)
def _db_query(db_url: str, sql: str, params: tuple = ()) -> list[dict]:
    import psycopg2
    import psycopg2.extras
    with psycopg2.connect(db_url) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]


def db_get_filters(db_url: str) -> dict:
    years = _db_query(
        db_url,
        f"SELECT DISTINCT year FROM ({FINANCE_ROWS_SQL}) fr ORDER BY year",
    )
    months = _db_query(
        db_url,
        f"""
        SELECT month FROM (SELECT DISTINCT month FROM ({FINANCE_ROWS_SQL}) fr) t
        ORDER BY {MONTH_ORDER_SQL.format(col='t.month')}
        """,
    )
    locs = _db_query(
        db_url,
        f"SELECT DISTINCT location FROM ({FINANCE_ROWS_SQL}) fr ORDER BY location",
    )
    return {
        "years":     [r["year"]     for r in years],
        "months":    [r["month"]    for r in months],
        "locations": [r["location"] for r in locs],
    }


def db_get_monthly(db_url: str, years: tuple[int, ...]) -> list[dict]:
    if not years:
        return []
    ph = ", ".join(["%s"] * len(years))
    return _db_query(
        db_url,
        f"SELECT * FROM ({FINANCE_ROWS_SQL}) fr WHERE fr.year IN ({ph})",
        params=years,
    )


# ---------- FastAPI backend ----------
@st.cache_data(ttl=120, show_spinner=False)
def api_get_filters(base: str) -> dict:
    import requests
    r = requests.get(f"{base}/api/filters", timeout=60)
    r.raise_for_status()
    return r.json()


@st.cache_data(ttl=120, show_spinner=False)
def api_get_monthly(base: str, years: tuple[int, ...]) -> list[dict]:
    import requests
    rows: list[dict] = []
    for y in years:
        r = requests.get(f"{base}/api/monthly-summary", params={"year": y}, timeout=120)
        r.raise_for_status()
        rows.extend(r.json().get("data") or [])
    return rows


# ---------- Demo-режим ----------
@st.cache_data(show_spinner=False)
def _demo_data() -> list[dict]:
    rng = random.Random(42)
    locs = ["Kaspi L'amour", "Айнабулак", "Аксай СПП", "Арена"]
    weights = [0.32, 0.28, 0.22, 0.18]
    rows: list[dict] = []
    for year in [2024, 2025, 2026]:
        for i in range(12 if year < 2026 else 3):
            month = ALL_MONTHS[i]
            base_income = rng.randint(230_000_000, 320_000_000)
            total_assets = rng.randint(1_500_000_000, 1_900_000_000)
            for bi, loc in enumerate(locs):
                w = weights[bi]
                bi_income = int(base_income * w)
                li = int(bi_income * rng.uniform(0.65, 0.75))
                si = int(bi_income * rng.uniform(0.22, 0.30))
                exp = int(bi_income * rng.uniform(0.50, 0.65))
                profit = bi_income - exp
                ta = int(total_assets * w)
                la = int(ta * rng.uniform(0.82, 0.92))
                sa = int(ta * rng.uniform(0.05, 0.10))
                rows.append({
                    "year": year, "month": month, "location": loc,
                    "total_assets": ta, "lombard_assets": la, "store_assets": sa,
                    "store_lombard_assets": la + sa, "cash": ta - la - sa,
                    "total_income": bi_income, "lombard_income": li,
                    "store_income": si, "other_income": bi_income - li - si,
                    "expenses": exp, "profit": profit,
                    "profit_pct": round(profit / bi_income * 100, 1) if bi_income else 0,
                })
    return rows


def demo_get_filters() -> dict:
    rows = _demo_data()
    return {
        "years":     sorted({r["year"]     for r in rows}),
        "months":    ALL_MONTHS,
        "locations": sorted({r["location"] for r in rows}),
    }


# ══════════════════════════════════════════════════════════════════════════════
# Основное приложение
# ══════════════════════════════════════════════════════════════════════════════
st.set_page_config(
    page_title="Финансовый дашборд",
    layout="wide",
    page_icon="📊",
    initial_sidebar_state="expanded",
)
st.title("📊 Финансовый дашборд")

db_url  = _secret("DATABASE_URL")
api_url = (_secret("API_BASE_URL") or _secret("STREAMLIT_API_BASE_URL")).rstrip("/")

if db_url:
    MODE = "db"
elif api_url:
    MODE = "api"
else:
    MODE = "demo"

# ── Боковая панель ─────────────────────────────────────────────────────────────
with st.sidebar:
    st.subheader("⚙️ Данные")

    if MODE == "db":
        st.success("PostgreSQL — прямое подключение")
    elif MODE == "api":
        st.success(f"FastAPI backend")
        st.caption(api_url)
    else:
        st.info("Demo-режим: реальная БД не подключена")
        with st.expander("Как подключить?"):
            st.markdown(
                "Добавьте в **Secrets** (Streamlit Cloud → ⋮ → Settings → Secrets):\n\n"
                "```toml\n"
                "# Прямой PostgreSQL (рекомендуется):\n"
                'DATABASE_URL = "postgresql://user:pass@host:5432/db"\n\n'
                "# Или FastAPI backend:\n"
                'API_BASE_URL = "https://your-api.example.com"\n'
                "```"
            )

    if st.button("🔄 Обновить данные", type="primary", use_container_width=True):
        st.cache_data.clear()
        st.rerun()

    st.divider()
    st.subheader("🔽 Фильтры")

    # Загрузка фильтров
    try:
        if MODE == "db":
            filters = db_get_filters(db_url)
        elif MODE == "api":
            filters = api_get_filters(api_url)
        else:
            filters = demo_get_filters()
    except Exception as e:
        st.error(f"Ошибка загрузки фильтров: {e}")
        st.stop()

    years_avail    = filters.get("years")     or []
    locations_avail = filters.get("locations") or []

    if not years_avail:
        st.warning("Нет доступных годов в базе.")
        st.stop()

    sel_years = st.multiselect(
        "Годы",
        sorted(years_avail),
        default=[max(years_avail)],
        key="years_ms",
    )
    if not sel_years:
        st.warning("Выберите хотя бы один год.")
        st.stop()

    # Загрузка данных за выбранные годы
    try:
        if MODE == "db":
            raw = db_get_monthly(db_url, tuple(sorted(sel_years)))
        elif MODE == "api":
            raw = api_get_monthly(api_url, tuple(sorted(sel_years)))
        else:
            raw = [r for r in _demo_data() if r["year"] in set(sel_years)]
    except Exception as e:
        st.error(f"Ошибка загрузки данных: {e}")
        st.stop()

    months_in_data = sorted(
        {r["month"] for r in raw if r.get("month")},
        key=lambda m: MONTH_IDX.get(m, 99),
    )

    # Проекты
    sel_projects = st.multiselect(
        "Проекты",
        [p for p in PROJECT_ORDER if p in PROJECT_GROUPS],
        default=[],
        key="projects_ms",
        help="Выберите проект — связанные филиалы подставятся ниже",
    )
    expanded_locs: set[str] = set()
    for p in sel_projects:
        expanded_locs |= expand_project(p, locations_avail)

    proj_key = tuple(sorted(sel_projects))
    if st.session_state.get("_proj_key") != proj_key:
        st.session_state["_proj_key"] = proj_key
        st.session_state["branches_ms"] = sorted(expanded_locs) if sel_projects else []

    if sel_projects and expanded_locs:
        st.caption(f"Из проектов: {len(expanded_locs)} филиалов")

    # Месяцы
    sel_months = st.multiselect(
        "Месяцы",
        months_in_data,
        format_func=lambda m: MONTH_SHORT.get(m, m),
        key="months_ms",
        help="Пусто = все месяцы",
    )

    # Филиалы
    sel_locs_manual = st.multiselect(
        "Филиалы",
        locations_avail,
        key="branches_ms",
        help="Пусто = все филиалы",
    )

# ── Применение фильтров ────────────────────────────────────────────────────────
effective_locs: list[str] = []
if sel_locs_manual:
    effective_locs = list(sel_locs_manual)
elif sel_projects:
    effective_locs = sorted(expanded_locs)

collapsed = collapse_by_month(raw, effective_locs)
if sel_months:
    collapsed = [d for d in collapsed if d.get("month") in set(sel_months)]

agg = aggregate(collapsed)

# ── KPI-карточки ──────────────────────────────────────────────────────────────
r1c1, r1c2 = st.columns(2)
r1c1.metric("💰 Прибыль",  fmt_kzt(agg["profit"]),  f"{agg['profit_pct']:.1f}% от дохода")
r1c2.metric("📉 Затраты",  fmt_kzt(agg["expenses"]))

r2c1, r2c2, r2c3, r2c4 = st.columns(4)
r2c1.metric("🏦 Общий актив",     fmt_kzt(agg["total_assets"]))
r2c2.metric("💎 Актив ломбарда",  fmt_kzt(agg["lombard_assets"]))
r2c3.metric("🏪 Актив магазина",  fmt_kzt(agg["store_assets"]))
r2c4.metric("🏧 Касса",           fmt_kzt(agg["cash"]))

r3c1, r3c2, r3c3, r3c4 = st.columns(4)
r3c1.metric("💵 Общий доход",    fmt_kzt(agg["total_income"]))
r3c2.metric("💎 Доход ломбарда", fmt_kzt(agg["lombard_income"]))
r3c3.metric("🏪 Доход магазина", fmt_kzt(agg["store_income"]))
r3c4.metric("📦 Прочий доход",   fmt_kzt(agg["other_income"]))

if not collapsed:
    st.warning("Нет данных за выбранный период. Измените фильтры.")
    st.stop()

# ── Подготовка данных для графиков ────────────────────────────────────────────
multi_year = len({d["year"] for d in collapsed}) > 1

def period_label(d: dict) -> str:
    short = MONTH_SHORT.get(d["month"], d["month"])
    year_short = str(d["year"])[-2:]
    return f"{year_short}/{short}" if multi_year else short


chart_rows: list[dict] = []
breakdown_rows: list[dict] = []
margin_rows: list[dict] = []

for d in collapsed:
    p = period_label(d)
    m = 1_000_000  # масштаб: миллионы тенге

    chart_rows.append({
        "Период":   p,
        "Доход":    _num(d["total_income"]) / m,
        "Расходы":  _num(d["expenses"])     / m,
        "Прибыль":  _num(d["profit"])       / m,
    })
    breakdown_rows.append({
        "Период":  p,
        "Ломбард": _num(d["lombard_income"]) / m,
        "Магазин": _num(d["store_income"])   / m,
        "Прочее":  _num(d["other_income"])   / m,
    })
    margin_rows.append({
        "Период":         p,
        "Рентабельность": _num(d.get("profit_pct")),
    })

periods     = [r["Период"]  for r in chart_rows]
income_vals = [r["Доход"]   for r in chart_rows]
expense_vals= [r["Расходы"] for r in chart_rows]
lombard_vals= [r["Ломбард"] for r in breakdown_rows]
store_vals  = [r["Магазин"] for r in breakdown_rows]
other_vals  = [r["Прочее"]  for r in breakdown_rows]

def _fmt_hover(v_mln: float) -> str:
    n = int(round(v_mln * 1_000_000))
    return f"{n:,}".replace(",", "\u00a0")

# ── Графики ────────────────────────────────────────────────────────────────────
import plotly.graph_objects as go

st.subheader("📊 Графики")
gcol1, gcol2 = st.columns([3, 2])

# ---- График 1: Доходы vs Расходы (area chart) --------------------------------
with gcol1:
    fig1 = go.Figure()
    fig1.add_trace(go.Scatter(
        x=periods, y=income_vals,
        name="Доход",
        fill="tozeroy",
        mode="lines",
        line=dict(color="#4CAF50", width=2),
        fillcolor="rgba(76,175,80,0.25)",
        customdata=[_fmt_hover(v) for v in income_vals],
        hovertemplate="Доход: <b>%{customdata}</b><extra></extra>",
    ))
    fig1.add_trace(go.Scatter(
        x=periods, y=expense_vals,
        name="Расходы",
        fill="tozeroy",
        mode="lines",
        line=dict(color="#F44336", width=2),
        fillcolor="rgba(244,67,54,0.25)",
        customdata=[_fmt_hover(v) for v in expense_vals],
        hovertemplate="Расходы: <b>%{customdata}</b><extra></extra>",
    ))
    fig1.update_layout(
        title=dict(text="ДОХОДЫ VS РАСХОДЫ ПО МЕСЯЦАМ", font=dict(size=12, color="#aaaaaa")),
        template="plotly_dark",
        paper_bgcolor="#0e1117",
        plot_bgcolor="#0e1117",
        legend=dict(orientation="h", y=-0.15),
        hovermode="x unified",
        margin=dict(l=10, r=10, t=40, b=10),
        yaxis=dict(ticksuffix=" млн", gridcolor="#222222"),
        xaxis=dict(gridcolor="#222222"),
        height=380,
    )
    st.plotly_chart(fig1, use_container_width=True)

# ---- График 2: Структура дохода (donut chart) --------------------------------
with gcol2:
    lombard_total = sum(lombard_vals)
    store_total   = sum(store_vals)
    other_total   = sum(other_vals)

    fig2 = go.Figure(go.Pie(
        labels=["Ломбард", "Магазин", "Прочее"],
        values=[lombard_total, store_total, other_total],
        hole=0.55,
        marker=dict(colors=["#2196F3", "#4CAF50", "#FF9800"]),
        textinfo="none",
        hovertemplate="%{label}: <b>%{value:.1f} млн</b> (%{percent})<extra></extra>",
    ))
    fig2.update_layout(
        title=dict(text="СТРУКТУРА ДОХОДА", font=dict(size=12, color="#aaaaaa")),
        template="plotly_dark",
        paper_bgcolor="#0e1117",
        plot_bgcolor="#0e1117",
        legend=dict(orientation="v", x=0.0, y=0.5, font=dict(size=12)),
        margin=dict(l=10, r=10, t=40, b=10),
        height=380,
        annotations=[dict(
            text=f"{lombard_total + store_total + other_total:.0f}<br>млн ₸",
            x=0.5, y=0.5, font_size=14, showarrow=False, font_color="white",
        )],
    )
    st.plotly_chart(fig2, use_container_width=True)

# ── Детальная таблица ──────────────────────────────────────────────────────────
st.subheader("📋 Данные по месяцам")


def _fmt(n: float) -> str:
    """Число с пробелами как разделителями тысяч (123 456 789)."""
    v = int(round(_num(n)))
    if v < 0:
        return "-" + f"{abs(v):,}".replace(",", "\u00a0")
    return f"{v:,}".replace(",", "\u00a0")


def _period_iso(d: dict) -> str:
    """Формат периода: 2026-04"""
    m_num = MONTH_IDX.get(d["month"], 0) + 1
    return f"{d['year']}-{m_num:02d}"


# Сортировка: свежие сверху (descending)
table_data = sorted(collapsed, key=lambda r: (int(r["year"]), MONTH_IDX.get(r["month"], 99)), reverse=True)

table_rows = []
for d in table_data:
    table_rows.append({
        "Период":           _period_iso(d),
        "Общий актив":      _fmt(d.get("total_assets")),
        "Актив маг.+ломб.": _fmt(d.get("store_lombard_assets")),
        "Актив ломб.":      _fmt(d.get("lombard_assets")),
        "Актив маг.":       _fmt(d.get("store_assets")),
        "Касса":            _fmt(d.get("cash")),
        "Общий доход":      _fmt(d.get("total_income")),
        "Доход ломб.":      _fmt(d.get("lombard_income")),
        "Доход маг.":       _fmt(d.get("store_income")),
        "Доход пр.":        _fmt(d.get("other_income")),
        "Затраты":          _fmt(d.get("expenses")),
        "Прибыль":          _fmt(d.get("profit")),
    })

# Итоговая строка
if len(table_rows) > 1:
    table_rows.append({
        "Период":           "Итого",
        "Общий актив":      _fmt(agg["total_assets"]),
        "Актив маг.+ломб.": _fmt(agg["store_lombard_assets"]),
        "Актив ломб.":      _fmt(agg["lombard_assets"]),
        "Актив маг.":       _fmt(agg["store_assets"]),
        "Касса":            _fmt(agg["cash"]),
        "Общий доход":      _fmt(agg["total_income"]),
        "Доход ломб.":      _fmt(agg["lombard_income"]),
        "Доход маг.":       _fmt(agg["store_income"]),
        "Доход пр.":        _fmt(agg["other_income"]),
        "Затраты":          _fmt(agg["expenses"]),
        "Прибыль":          _fmt(agg["profit"]),
    })

st.dataframe(
    pd.DataFrame(table_rows),
    use_container_width=True,
    hide_index=True,
)
