import { useState, useEffect, useMemo, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Area, AreaChart,
} from "recharts";
import { fetchFilters, fetchMonthlySummary, useFinanceWebSocket } from "./api";

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════

const ALL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_SHORT = {
  January: "Янв", February: "Фев", March: "Мар", April: "Апр",
  May: "Май", June: "Июн", July: "Июл", August: "Авг",
  September: "Сен", October: "Окт", November: "Ноя", December: "Дек",
};

const PROJECT_GROUPS = {
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
};

/** Unify typographic apostrophes (U+2019 etc.) with ASCII so DB labels match PROJECT_GROUPS. */
function normalizeBranchKey(s) {
  if (s == null || typeof s !== "string") return "";
  return s.trim().replace(/[\u2018\u2019\u02BC\u0060]/g, "'");
}

/** Match API branch string to a project pattern (exact or "Name ID-123", case-insensitive for ID suffix and Latin names). */
function locationMatchesPattern(pattern, loc) {
  const np = normalizeBranchKey(pattern);
  const nl = normalizeBranchKey(loc);
  if (nl === np) return true;
  if (nl.toLowerCase() === np.toLowerCase()) return true;
  const idPrefix = `${np} ID-`;
  if (nl.length >= idPrefix.length
    && nl.slice(0, idPrefix.length).toLowerCase() === idPrefix.toLowerCase()) {
    return true;
  }
  return false;
}

function expandPatternsToLocations(patterns, allLocations) {
  const out = new Set();
  for (const p of patterns) {
    for (const loc of allLocations) {
      if (locationMatchesPattern(p, loc)) out.add(loc);
    }
  }
  return out;
}

const P = {
  bg: "#0a0e1a", card: "#111827", cardHover: "#1a2235",
  border: "#1e293b", text: "#e2e8f0", textDim: "#64748b",
  accent: "#3b82f6", accentLight: "#60a5fa",
  green: "#10b981", red: "#ef4444",
  amber: "#f59e0b", purple: "#8b5cf6", cyan: "#06b6d4", pink: "#ec4899",
};

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

const ASSET_KEYS = ["total_assets", "store_lombard_assets", "lombard_assets", "store_assets", "cash"];
const FLOW_KEYS = ["total_income", "lombard_income", "store_income", "other_income", "expenses", "profit"];
const AGG_KEYS = [...ASSET_KEYS, ...FLOW_KEYS];
const ROW_NUMERIC_KEYS = [...ASSET_KEYS, ...FLOW_KEYS];

/** Sum all branches into one row per (year, month); optional branch filter */
function collapseRowsByMonth(rows, selectedLocations) {
  let r = rows;
  if (selectedLocations.size > 0) {
    r = r.filter((d) => d.location && selectedLocations.has(d.location));
  }
  const map = new Map();
  for (const d of r) {
    const k = `${d.year}\0${d.month}`;
    if (!map.has(k)) {
      const o = { year: d.year, month: d.month };
      ROW_NUMERIC_KEYS.forEach((key) => { o[key] = 0; });
      map.set(k, o);
    }
    const acc = map.get(k);
    ROW_NUMERIC_KEYS.forEach((key) => {
      acc[key] += Number(d[key]) || 0;
    });
  }
  return Array.from(map.values())
    .map((acc) => ({
      ...acc,
      profit_pct: acc.total_income > 0
        ? Number(((acc.profit / acc.total_income) * 100).toFixed(1))
        : 0,
    }))
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return ALL_MONTHS.indexOf(a.month) - ALL_MONTHS.indexOf(b.month);
    });
}

// ═══════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════

const fmt = (n) => {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + " млрд";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + " млн";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + " тыс";
  return n.toLocaleString("ru-RU");
};

const fmtFull = (n) => {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("ru-RU");
};

// ═══════════════════════════════════════════════════════
// SMALL COMPONENTS
// ═══════════════════════════════════════════════════════

function Pill({ label, active, onClick, dashed }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "6px 14px", borderRadius: "8px",
        border: `1px ${dashed ? "dashed" : "solid"} ${active ? P.accent : hovered ? P.accentLight + "55" : P.border}`,
        background: active ? P.accent + "22" : hovered ? P.accent + "0a" : "transparent",
        color: active ? P.accentLight : hovered ? P.text : P.textDim,
        fontSize: "13px", fontWeight: active ? 600 : 400,
        cursor: "pointer", transition: "all 0.15s ease",
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "-0.02em", whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function KPI({ title, value, subtitle, color, icon }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${P.card} 0%, ${color}11 100%)`,
      border: `1px solid ${color}33`, borderRadius: "16px",
      padding: "20px 24px", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: -10, right: -10, width: 80, height: 80,
        borderRadius: "50%", background: color + "08", filter: "blur(20px)",
      }} />
      <div style={{
        fontSize: 12, color: P.textDim, textTransform: "uppercase",
        letterSpacing: "0.1em", marginBottom: 8,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {icon} {title}
      </div>
      <div style={{
        fontSize: 26, fontWeight: 700, color: P.text,
        fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em",
      }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

function Section({ children }) {
  return (
    <h3 style={{
      fontSize: 14, fontWeight: 600, color: P.textDim,
      textTransform: "uppercase", letterSpacing: "0.12em",
      margin: "0 0 16px 0", fontFamily: "'JetBrains Mono', monospace",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ width: 20, height: 2, background: P.accent, display: "inline-block" }} />
      {children}
    </h3>
  );
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: P.card, border: `1px solid ${P.border}`,
      borderRadius: 12, padding: "12px 16px",
      boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
    }}>
      <div style={{ fontSize: 12, color: P.textDim, marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize: 13, color: p.color, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }} />
          {p.name}: <strong>{fmtFull(p.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      display: "flex", justifyContent: "center", alignItems: "center",
      padding: "60px 0", color: P.textDim, fontFamily: "'JetBrains Mono', monospace",
      fontSize: 14, gap: 12,
    }}>
      <div style={{
        width: 20, height: 20, border: `2px solid ${P.border}`,
        borderTopColor: P.accent, borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      Загрузка данных...
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const LABEL_STYLE = {
  fontSize: 11, color: P.textDim, textTransform: "uppercase",
  letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace",
  minWidth: 70, paddingTop: 7,
};

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════

export default function FinanceDashboard() {
  const [availableYears, setAvailableYears] = useState([]);
  const [availableLocations, setAvailableLocations] = useState([]);
  const [selectedYears, setSelectedYears] = useState(new Set());
  const [selectedMonths, setSelectedMonths] = useState(new Set());
  const [selectedLocations, setSelectedLocations] = useState(new Set());
  const [selectedProjects, setSelectedProjects] = useState(new Set());
  const [activeTab, setActiveTab] = useState("overview");
  const [showAllLocations, setShowAllLocations] = useState(false);
  const [monthlyData, setMonthlyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchFilters()
      .then((f) => {
        setAvailableYears(f.years || []);
        setAvailableLocations(f.locations || []);
        if (f.years?.length) {
          setSelectedYears(new Set([f.years[f.years.length - 1]]));
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  const loadData = useCallback(() => {
    if (selectedYears.size === 0) return;
    setLoading(true);
    setError(null);
    Promise.all([...selectedYears].map((y) => fetchMonthlySummary(y)))
      .then((results) => {
        setMonthlyData(results.flat());
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [selectedYears]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFinanceWebSocket(() => {
    loadData();
  });

  // ── Toggle helpers ──
  const toggle = (setter, val) => {
    setter((prev) => {
      const next = new Set(prev);
      next.has(val) ? next.delete(val) : next.add(val);
      return next;
    });
  };

  const toggleProject = useCallback((proj) => {
    const patterns = PROJECT_GROUPS[proj] || [];
    const expanded = expandPatternsToLocations(patterns, availableLocations);
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      const wasActive = next.has(proj);
      wasActive ? next.delete(proj) : next.add(proj);
      setSelectedLocations((prevL) => {
        const nl = new Set(prevL);
        expanded.forEach((l) => (wasActive ? nl.delete(l) : nl.add(l)));
        return nl;
      });
      return next;
    });
  }, [availableLocations]);

  useEffect(() => {
    if (availableLocations.length === 0 || selectedProjects.size === 0) return;
    setSelectedLocations((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const proj of selectedProjects) {
        const patterns = PROJECT_GROUPS[proj] || [];
        for (const p of patterns) {
          for (const loc of availableLocations) {
            if (locationMatchesPattern(p, loc) && !next.has(loc)) {
              next.add(loc);
              changed = true;
            }
          }
        }
      }
      return changed ? next : prev;
    });
  }, [availableLocations, selectedProjects]);

  const clearAll = () => {
    setSelectedMonths(new Set());
    setSelectedLocations(new Set());
    setSelectedProjects(new Set());
  };

  const hasFilters = selectedMonths.size > 0 || selectedLocations.size > 0 || selectedProjects.size > 0;

  const collapsedByMonth = useMemo(
    () => collapseRowsByMonth(monthlyData, selectedLocations),
    [monthlyData, selectedLocations],
  );

  const filteredData = useMemo(() => {
    let data = collapsedByMonth;
    if (selectedMonths.size > 0) {
      data = data.filter((d) => selectedMonths.has(d.month));
    }
    return data;
  }, [collapsedByMonth, selectedMonths]);

  const aggregated = useMemo(() => {
    if (filteredData.length === 0) {
      const res = {};
      AGG_KEYS.forEach((k) => (res[k] = 0));
      res.profit_pct = 0;
      return res;
    }
    const n = filteredData.length;
    const res = {};
    FLOW_KEYS.forEach((k) => (res[k] = filteredData.reduce((s, d) => s + (Number(d[k]) || 0), 0)));
    ASSET_KEYS.forEach((k) => (res[k] = Math.round(filteredData.reduce((s, d) => s + (Number(d[k]) || 0), 0) / n)));
    res.profit_pct = res.total_income > 0
      ? (res.profit / res.total_income * 100).toFixed(1)
      : 0;
    return res;
  }, [filteredData]);

  const incomeBreakdown = useMemo(() => [
    { name: "Ломбард", value: aggregated.lombard_income, color: CHART_COLORS[0] },
    { name: "Магазин", value: aggregated.store_income, color: CHART_COLORS[1] },
    { name: "Прочее", value: aggregated.other_income, color: CHART_COLORS[2] },
  ], [aggregated]);

  const chartData = useMemo(() => {
    const years = new Set(filteredData.map((d) => d.year).filter((y) => y != null));
    const multiYear = years.size > 1;
    return filteredData.map((d) => ({
      ...d,
      name: multiYear && d.year != null
        ? `${String(d.year).slice(-2)} ${MONTH_SHORT[d.month] || d.month}`
        : (MONTH_SHORT[d.month] || d.month),
    }));
  }, [filteredData]);

  const visibleLocations = showAllLocations ? availableLocations : availableLocations.slice(0, 14);
  const hiddenCount = availableLocations.length - 14;

  const activeFilterParts = [];
  if (selectedMonths.size > 0) activeFilterParts.push(`${selectedMonths.size} мес.`);
  if (selectedLocations.size > 0) activeFilterParts.push(`${selectedLocations.size} фил.`);
  if (selectedProjects.size > 0) activeFilterParts.push(`${selectedProjects.size} проект.`);

  const showCharts = activeTab === "overview" || activeTab === "charts";
  const showTable = activeTab === "overview" || activeTab === "details";

  return (
    <div style={{
      background: P.bg, minHeight: "100vh", color: P.text,
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ─── HEADER ─── */}
      <header style={{
        borderBottom: `1px solid ${P.border}`, padding: "20px 32px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: `linear-gradient(180deg, ${P.card} 0%, ${P.bg} 100%)`,
        flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: 24, fontWeight: 700,
            fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em",
            background: `linear-gradient(135deg, ${P.text} 0%, ${P.accent} 100%)`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Finance Dashboard
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: P.textDim, fontFamily: "'JetBrains Mono', monospace" }}>
            PostgreSQL &bull; NRT updates
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { key: "overview", label: "Обзор" },
            { key: "details", label: "Таблица" },
            { key: "charts", label: "Графики" },
          ].map((t) => (
            <Pill key={t.key} label={t.label} active={activeTab === t.key} onClick={() => setActiveTab(t.key)} />
          ))}
        </div>
      </header>

      <div style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ─── ERROR ─── */}
        {error && (
          <div style={{
            background: P.red + "15", border: `1px solid ${P.red}44`,
            borderRadius: 12, padding: "12px 20px", marginBottom: 16,
            color: P.red, fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span>Ошибка: {error}</span>
            <button onClick={() => { setError(null); loadData(); }} style={{
              background: P.red + "22", border: `1px solid ${P.red}55`,
              color: P.red, borderRadius: 6, padding: "4px 12px",
              cursor: "pointer", fontSize: 12, fontFamily: "'JetBrains Mono'",
            }}>
              Повторить
            </button>
          </div>
        )}

        {/* ─── FILTERS ─── */}
        <div style={{
          background: P.card, borderRadius: 16,
          border: `1px solid ${P.border}`, padding: "20px 24px", marginBottom: 24,
        }}>
          {/* Years */}
          <div style={{ marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={LABEL_STYLE}>Год</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {availableYears.map((y) => (
                <Pill key={y} label={y} active={selectedYears.has(y)} onClick={() => toggle(setSelectedYears, y)} />
              ))}
            </div>
          </div>

          {/* Months */}
          <div style={{ marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={LABEL_STYLE}>Месяц</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ALL_MONTHS.map((m) => (
                <Pill key={m} label={MONTH_SHORT[m]} active={selectedMonths.has(m)} onClick={() => toggle(setSelectedMonths, m)} />
              ))}
            </div>
          </div>

          {/* Locations */}
          {availableLocations.length > 0 && (
            <div style={{ marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 12 }}>
              <span style={LABEL_STYLE}>Филиалы</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {visibleLocations.map((l) => (
                  <Pill key={l} label={l} active={selectedLocations.has(l)} onClick={() => toggle(setSelectedLocations, l)} />
                ))}
                {!showAllLocations && hiddenCount > 0 && (
                  <Pill label={`+${hiddenCount} ещё ▾`} active={false} onClick={() => setShowAllLocations(true)} dashed />
                )}
                {showAllLocations && (
                  <Pill label="Свернуть ▴" active={false} onClick={() => setShowAllLocations(false)} dashed />
                )}
              </div>
            </div>
          )}

          {/* Projects */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={LABEL_STYLE}>Проекты</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.keys(PROJECT_GROUPS).map((proj) => (
                <Pill
                  key={proj}
                  label={proj}
                  active={selectedProjects.has(proj)}
                  onClick={() => toggleProject(proj)}
                />
              ))}
            </div>
          </div>

          {/* Reset -- standalone */}
          {hasFilters && (
            <div style={{ paddingTop: 14, marginTop: 14, borderTop: `1px solid ${P.border}` }}>
              <button
                onClick={clearAll}
                style={{
                  padding: "8px 20px", borderRadius: 8,
                  border: `1px solid ${P.red}44`,
                  background: P.red + "12",
                  color: P.red, cursor: "pointer",
                  fontSize: 13, fontWeight: 500,
                  fontFamily: "'JetBrains Mono', monospace",
                  transition: "all 0.15s ease",
                }}
              >
                ✕ Сбросить все фильтры ({activeFilterParts.join(", ")})
              </button>
            </div>
          )}
        </div>

        {/* ─── LOADING ─── */}
        {loading && <Spinner />}

        {/* ─── KPI CARDS ─── */}
        {!loading && showCharts && (
          <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Row 1: Прибыль + Затраты */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
              <KPI title="Прибыль" value={fmt(aggregated.profit)} icon="📈" color={aggregated.profit > 0 ? P.green : P.red} subtitle={`${aggregated.profit_pct}% от дохода`} />
              <KPI title="Затраты" value={fmt(aggregated.expenses)} icon="📉" color={P.amber} />
            </div>
            {/* Row 2: Активы */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              <KPI title="Общий актив" value={fmt(aggregated.total_assets)} icon="📊" color={P.accent} subtitle={[...selectedYears].sort().join(", ")} />
              <KPI title="Актив Ломбарда" value={fmt(aggregated.lombard_assets)} icon="💎" color={P.purple} />
              <KPI title="Актив Магазина" value={fmt(aggregated.store_assets)} icon="🏪" color={P.cyan} />
              <KPI title="Касса" value={fmt(aggregated.cash)} icon="🏦" color={aggregated.cash >= 0 ? P.cyan : P.red} />
            </div>
            {/* Row 3: Доходы */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              <KPI title="Общий доход" value={fmt(aggregated.total_income)} icon="💰" color={P.green} />
              <KPI title="Доход Ломбарда" value={fmt(aggregated.lombard_income)} icon="💎" color={P.accent} />
              <KPI title="Доход Магазина" value={fmt(aggregated.store_income)} icon="🏪" color={P.green} />
              <KPI title="Прочий доход" value={fmt(aggregated.other_income)} icon="📋" color={P.amber} />
            </div>
          </div>
        )}

        {/* ─── CHARTS ─── */}
        {!loading && showCharts && chartData.length > 0 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 24 }}>
              {/* Area chart */}
              <div style={{ background: P.card, borderRadius: 16, border: `1px solid ${P.border}`, padding: 24 }}>
                <Section>Доходы vs Расходы по месяцам</Section>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={P.green} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={P.green} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={P.red} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={P.red} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={P.border} />
                    <XAxis dataKey="name" stroke={P.textDim} fontSize={12} fontFamily="'JetBrains Mono'" />
                    <YAxis stroke={P.textDim} fontSize={11} fontFamily="'JetBrains Mono'" tickFormatter={fmt} />
                    <Tooltip content={<ChartTip />} />
                    <Area type="monotone" dataKey="total_income" name="Доход" stroke={P.green} fill="url(#gI)" strokeWidth={2} />
                    <Area type="monotone" dataKey="expenses" name="Расходы" stroke={P.red} fill="url(#gE)" strokeWidth={2} />
                    <Line type="monotone" dataKey="profit" name="Прибыль" stroke={P.accent} strokeWidth={2.5} dot={{ fill: P.accent, r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Pie chart */}
              <div style={{ background: P.card, borderRadius: 16, border: `1px solid ${P.border}`, padding: 24 }}>
                <Section>Структура дохода</Section>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={incomeBreakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value">
                      {incomeBreakdown.map((e, i) => <Cell key={i} fill={e.color} stroke="transparent" />)}
                    </Pie>
                    <Tooltip content={<ChartTip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  {incomeBreakdown.map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: item.color, display: "inline-block" }} />
                      <span style={{ color: P.textDim, fontFamily: "'JetBrains Mono'" }}>{item.name}</span>
                      <span style={{ marginLeft: "auto", color: P.text, fontWeight: 600, fontFamily: "'JetBrains Mono'" }}>{fmt(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bar chart */}
            <div style={{ background: P.card, borderRadius: 16, border: `1px solid ${P.border}`, padding: 24, marginBottom: 24 }}>
              <Section>Прибыльность по месяцам (%)</Section>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={P.border} />
                  <XAxis dataKey="name" stroke={P.textDim} fontSize={12} fontFamily="'JetBrains Mono'" />
                  <YAxis stroke={P.textDim} fontSize={11} fontFamily="'JetBrains Mono'" unit="%" />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="profit_pct" name="Прибыльность %" fill={P.accent} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* ─── No data ─── */}
        {!loading && showCharts && chartData.length === 0 && (
          <div style={{
            background: P.card, borderRadius: 16, border: `1px solid ${P.border}`,
            padding: "60px 24px", textAlign: "center", marginBottom: 24,
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ color: P.textDim, fontFamily: "'JetBrains Mono'", fontSize: 14 }}>
              Нет данных для выбранных фильтров
            </div>
            <button onClick={clearAll} style={{
              marginTop: 16, padding: "8px 20px", borderRadius: 8,
              border: `1px solid ${P.accent}`, background: P.accent + "22",
              color: P.accentLight, cursor: "pointer", fontSize: 13,
              fontFamily: "'JetBrains Mono'",
            }}>
              Сбросить фильтры
            </button>
          </div>
        )}

        {/* ─── TABLE ─── */}
        {!loading && showTable && (
          <div style={{
            background: P.card, borderRadius: 16, border: `1px solid ${P.border}`,
            padding: 24, overflowX: "auto",
          }}>
            <Section>Детализация по месяцам — {[...selectedYears].sort().join(", ")}</Section>
            {filteredData.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: P.textDim, fontFamily: "'JetBrains Mono'" }}>
                Нет данных. Попробуйте изменить фильтры.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
                <thead>
                  <tr>
                    {["Период", "Общий актив", "Актив маг.+ломб.", "Актив ломб.", "Актив маг.", "Касса", "Общий доход", "Доход ломб.", "Доход маг.", "Доход пр.", "Затраты", "Прибыль", "%"].map((h, i) => (
                      <th key={i} style={{
                        padding: "10px 12px", textAlign: i === 0 ? "left" : "right",
                        borderBottom: `2px solid ${P.accent}33`,
                        color: P.textDim, fontSize: 11, textTransform: "uppercase",
                        letterSpacing: "0.05em", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${P.border}`, cursor: "default" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = P.cardHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ padding: "10px 12px", fontWeight: 500, color: P.text }}>{MONTH_SHORT[row.month]}</td>
                      {AGG_KEYS.map((k, j) => (
                        <td key={j} style={{
                          padding: "10px 12px", textAlign: "right",
                          color: Number(row[k]) < 0 ? P.red : P.text,
                          fontVariantNumeric: "tabular-nums",
                        }}>{fmtFull(Number(row[k]))}</td>
                      ))}
                      <td style={{
                        padding: "10px 12px", textAlign: "right", fontWeight: 600,
                        color: Number(row.profit_pct) >= 5 ? P.green : Number(row.profit_pct) >= 0 ? P.amber : P.red,
                      }}>{row.profit_pct}%</td>
                    </tr>
                  ))}
                  {/* Totals */}
                  <tr style={{
                    borderTop: `2px solid ${P.accent}33`,
                    background: P.accent + "08", fontWeight: 700,
                  }}>
                    <td style={{ padding: "12px 12px", color: P.accentLight }}>Итого</td>
                    {AGG_KEYS.map((k, j) => (
                      <td key={j} style={{
                        padding: "12px 12px", textAlign: "right",
                        color: aggregated[k] < 0 ? P.red : P.text,
                        fontVariantNumeric: "tabular-nums",
                      }}>{fmtFull(aggregated[k])}</td>
                    ))}
                    <td style={{ padding: "12px 12px", textAlign: "right", color: P.accent }}>{aggregated.profit_pct}%</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ─── FOOTER ─── */}
        <footer style={{
          textAlign: "center", padding: "32px 0 16px",
          fontSize: 11, color: P.textDim,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          Finance Dashboard &bull; React + Recharts &bull; FastAPI + PostgreSQL
        </footer>
      </div>
    </div>
  );
}
