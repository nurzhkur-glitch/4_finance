"""
Finance dashboard (Streamlit) — calls deployed FastAPI over HTTPS.
Streamlit Community Cloud: set Secrets API_BASE_URL = https://your-api.example.com
Local: export STREAMLIT_API_BASE_URL=http://127.0.0.1:8000
"""

from __future__ import annotations

import os
from typing import Any

import pandas as pd
import requests
import streamlit as st

ALL_MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
MONTH_SHORT = {
    "January": "Янв", "February": "Фев", "March": "Мар", "April": "Апр",
    "May": "Май", "June": "Июн", "July": "Июл", "August": "Авг",
    "September": "Сен", "October": "Окт", "November": "Ноя", "December": "Дек",
}

# Same mapping as frontend/src/FinanceDashboard.jsx (PROJECT_GROUPS)
PROJECT_GROUPS: dict[str, list[str]] = {
    "L'amour": ["L'amour", "L'amour KASPI", "Ком. магазин", "Ком магазин"],
    "L'amour NEW": ["L'amour NEW"],
    "ReTech": ["ReTech", "Склад товаров"],
    "Аренда": ["Rent", "Service"],
    "Бухгалтерия": ["Касса бухгалтерии"],
    "Инвестиции": ["Сейф"],
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
    "L'amour", "L'amour NEW", "ReTech", "Аренда", "Бухгалтерия",
    "Инвестиции", "Ломбард", "СПП",
]

ASSET_KEYS = [
    "total_assets", "store_lombard_assets", "lombard_assets", "store_assets", "cash",
]
FLOW_KEYS = [
    "total_income", "lombard_income", "store_income", "other_income", "expenses", "profit",
]
ROW_NUMERIC_KEYS = ASSET_KEYS + FLOW_KEYS


def normalize_branch_key(s: str) -> str:
    if not s or not isinstance(s, str):
        return ""
    t = s.strip()
    for old, new in (
        ("\u2018", "'"),
        ("\u2019", "'"),
        ("\u02bc", "'"),
        ("`", "'"),
    ):
        t = t.replace(old, new)
    return t


def location_matches_pattern(pattern: str, loc: str) -> bool:
    np = normalize_branch_key(pattern)
    nl = normalize_branch_key(loc)
    if nl == np:
        return True
    if nl.lower() == np.lower():
        return True
    id_prefix = f"{np} ID-"
    if len(nl) >= len(id_prefix) and nl[: len(id_prefix)].lower() == id_prefix.lower():
        return True
    return False


def expand_project_to_locations(project_name: str, all_locations: list[str]) -> set[str]:
    out: set[str] = set()
    for pat in PROJECT_GROUPS.get(project_name, []):
        for loc in all_locations:
            if location_matches_pattern(pat, loc):
                out.add(loc)
    return out


def api_base_url() -> str:
    env = os.environ.get("STREAMLIT_API_BASE_URL", "").strip()
    if env:
        return env.rstrip("/")
    try:
        v = st.secrets["API_BASE_URL"]
        if v:
            return str(v).strip().rstrip("/")
    except Exception:
        pass
    return "http://127.0.0.1:8000"


def _num(x: Any) -> float:
    try:
        return float(x) if x is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def collapse_by_month(rows: list[dict], selected_locations: list[str]) -> list[dict]:
    if selected_locations:
        locset = set(selected_locations)
        rows = [r for r in rows if r.get("location") and r["location"] in locset]
    acc: dict[tuple[Any, str], dict[str, Any]] = {}
    for d in rows:
        y, m = d.get("year"), d.get("month")
        if y is None or m is None:
            continue
        k = (y, m)
        if k not in acc:
            acc[k] = {"year": y, "month": m, **{x: 0.0 for x in ROW_NUMERIC_KEYS}}
        o = acc[k]
        for key in ROW_NUMERIC_KEYS:
            o[key] += _num(d.get(key))
    out = []
    for o in acc.values():
        ti = o["total_income"]
        o["profit_pct"] = round((o["profit"] / ti * 100), 1) if ti > 0 else 0.0
        out.append(o)
    mi = {m: i for i, m in enumerate(ALL_MONTHS)}
    out.sort(key=lambda r: (-int(r["year"]), mi.get(r["month"], 99)))
    return out


def aggregate(filtered: list[dict]) -> dict[str, Any]:
    if not filtered:
        return {k: 0 for k in ROW_NUMERIC_KEYS} | {"profit_pct": 0.0}
    n = len(filtered)
    res: dict[str, Any] = {}
    for k in FLOW_KEYS:
        res[k] = sum(_num(d.get(k)) for d in filtered)
    for k in ASSET_KEYS:
        res[k] = round(sum(_num(d.get(k)) for d in filtered) / n)
    ti = res["total_income"]
    res["profit_pct"] = round((res["profit"] / ti * 100), 1) if ti > 0 else 0.0
    return res


def fmt_kzt(n: float) -> str:
    x = abs(n)
    if x >= 1e9:
        return f"{n / 1e9:.1f} млрд"
    if x >= 1e6:
        return f"{n / 1e6:.1f} млн"
    if x >= 1e3:
        return f"{n / 1e3:.0f} тыс"
    return f"{n:,.0f}".replace(",", " ")


@st.cache_data(ttl=120, show_spinner=False)
def fetch_filters(base: str) -> dict[str, Any]:
    r = requests.get(f"{base}/api/filters", timeout=60)
    r.raise_for_status()
    return r.json()


@st.cache_data(ttl=120, show_spinner=False)
def fetch_monthly_for_years(base: str, years_key: tuple[int, ...]) -> list[dict]:
    rows: list[dict] = []
    for y in years_key:
        r = requests.get(f"{base}/api/monthly-summary", params={"year": y}, timeout=120)
        r.raise_for_status()
        data = r.json().get("data") or []
        rows.extend(data)
    return rows


def months_present_in_rows(rows: list[dict]) -> list[str]:
    seen: set[str] = set()
    for r in rows:
        m = r.get("month")
        if m:
            seen.add(str(m))
    mi = {m: i for i, m in enumerate(ALL_MONTHS)}
    return sorted(seen, key=lambda m: mi.get(m, 99))


def month_label_ru(m: str) -> str:
    return MONTH_SHORT.get(m, m)


st.set_page_config(page_title="Финансы — Streamlit", layout="wide")
st.title("Финансовый дашборд")

base = api_base_url()

try:
    filters = fetch_filters(base)
except requests.RequestException as e:
    st.error(f"Не удалось загрузить /api/filters: {e}")
    st.stop()

years = filters.get("years") or []
locations = filters.get("locations") or []
months_all = filters.get("months") or ALL_MONTHS

if not years:
    st.warning("Нет годов в ответе API.")
    st.stop()

if "months_ms" not in st.session_state:
    st.session_state["months_ms"] = []
if "branches_ms" not in st.session_state:
    st.session_state["branches_ms"] = []

with st.sidebar:
    st.subheader("Данные")
    if st.button("Обновить данные", type="primary", use_container_width=True):
        st.cache_data.clear()
        st.rerun()
    st.caption("База API")
    st.code(base, language="text")
    st.divider()
    st.subheader("Фильтры")

    default_years = [max(years)] if years else []
    sel_years = st.multiselect("Годы", options=sorted(years), default=default_years, key="years_ms")
    if not sel_years:
        st.warning("Выберите хотя бы один год.")
        st.stop()

    try:
        raw = fetch_monthly_for_years(base, tuple(sorted(sel_years)))
    except requests.RequestException as e:
        st.error(f"Ошибка загрузки: {e}")
        st.stop()

    months_in_data = months_present_in_rows(raw)
    if not months_in_data:
        months_in_data = list(months_all)

    years_t = tuple(sorted(sel_years))
    if st.session_state.get("_sync_years_t") != years_t:
        st.session_state["_sync_years_t"] = years_t
        prev_m = list(st.session_state.get("months_ms", []))
        st.session_state["months_ms"] = [m for m in prev_m if m in months_in_data]

    project_options = [p for p in PROJECT_ORDER if p in PROJECT_GROUPS]
    sel_projects = st.multiselect(
        "Проекты",
        options=project_options,
        default=[],
        key="projects_ms",
        help="Филиалы проекта подставляются ниже; можно править вручную.",
    )
    expanded_from_projects: set[str] = set()
    for pname in sel_projects:
        expanded_from_projects |= expand_project_to_locations(pname, locations)

    proj_t = tuple(sorted(sel_projects))
    if st.session_state.get("_sync_proj_t") != proj_t:
        st.session_state["_sync_proj_t"] = proj_t
        if sel_projects:
            st.session_state["branches_ms"] = sorted(expanded_from_projects)
        else:
            st.session_state["branches_ms"] = []

    if sel_projects:
        st.caption(f"От проектов: {len(expanded_from_projects)} филиалов")

    sel_months = st.multiselect(
        "Месяцы",
        options=months_in_data,
        format_func=month_label_ru,
        key="months_ms",
        help="Только месяцы с данными за выбранные годы. Пусто = все.",
    )

    sel_locs_manual = st.multiselect(
        "Филиалы",
        options=locations,
        key="branches_ms",
        help="Пусто при отсутствии проектов = все. С проектами — подставляются из проекта.",
    )

effective_locs = set(sel_locs_manual)
if sel_projects and not effective_locs:
    sel_locs = sorted(expanded_from_projects)
elif effective_locs:
    sel_locs = sorted(effective_locs)
else:
    sel_locs = []

collapsed = collapse_by_month(raw, sel_locs)
if sel_months:
    collapsed = [d for d in collapsed if d.get("month") in sel_months]

agg = aggregate(collapsed)

c1, c2, c3, c4 = st.columns(4)
c1.metric("Прибыль", fmt_kzt(agg["profit"]), f"{agg['profit_pct']}% от дохода")
c2.metric("Доход", fmt_kzt(agg["total_income"]))
c3.metric("Расходы", fmt_kzt(agg["expenses"]))
c4.metric("Активы (среднее)", fmt_kzt(agg["total_assets"]))

if not collapsed:
    st.warning("Нет строк после фильтров.")
    st.stop()

chart_rows = []
multi_year = len(set(d["year"] for d in collapsed)) > 1
for d in collapsed:
    label = (
        f"{str(d['year'])[-2:]} {MONTH_SHORT.get(d['month'], d['month'])}"
        if multi_year
        else MONTH_SHORT.get(d["month"], d["month"])
    )
    chart_rows.append({"Период": label, "Прибыль": _num(d["profit"]), "Доход": _num(d["total_income"])})

df = pd.DataFrame(chart_rows)
st.subheader("Динамика")
tab1, tab2 = st.tabs(["Прибыль", "Доход"])
with tab1:
    st.line_chart(df.set_index("Период")["Прибыль"])
with tab2:
    st.line_chart(df.set_index("Период")["Доход"])

with st.expander("Таблица (помесячно)"):
    st.dataframe(pd.DataFrame(collapsed), use_container_width=True)
