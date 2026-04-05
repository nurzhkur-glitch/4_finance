import { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Area, AreaChart
} from "recharts";

// ═══════════════════════════════════════════════════════
// DEMO DATA — замените fetch-вызовами к вашему FastAPI
// ═══════════════════════════════════════════════════════

const ALL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const LOCATIONS = [
  "Kaspi L'amour", "Rent", "Айнабулак", "Аксай СПП", "Арена",
  "Арыстан СПП", "Мира", "Самал СПП", "Саяхат", "Склад Товаров",
  "Шолохова", "Шугыла", "L'amour", "ReTech", "Айнабулак СПП",
  "Алмагуль", "Арена СПП", "Касса Бухгалтерия", "Мира СПП",
  "Сатпаева", "Саяхат СПП", "Толе Би", "Шолохова СПП", "Шугыла СПП",
  "L'amour NEW", "Service", "Аксай", "Алмагуль СПП", "Арыстан",
  "Ком. магазин", "Самал", "Сатпаева СПП", "Сейф", "Толе Би СПП"
];

const CATEGORY_GROUPS = {
  "L'amour": ["Kaspi L'amour", "L'amour", "L'amour NEW"],
  "ReTech": ["ReTech"],
  "Аренда": ["Rent"],
  "Бухгалтерия": ["Касса Бухгалтерия"],
  "Ломбард": LOCATIONS.filter(l => l.includes("СПП") || l === "Сейф" || l === "Service"),
};

const MONTHLY_DATA = [
  {
    month: "January", location: "all",
    total_assets: 1621301949, store_lombard_assets: 1642033698,
    lombard_assets: 1531096342, store_assets: 110937356, cash: -20731749,
    total_income: 281737133, lombard_income: 197898170, store_income: 83526963,
    other_income: 312000, expenses: 155782372, profit: 125954761, profit_pct: 8.4
  },
  {
    month: "February", location: "all",
    total_assets: 1725292927, store_lombard_assets: 1652247850,
    lombard_assets: 1542383955, store_assets: 109863895, cash: 73045077,
    total_income: 278809126, lombard_income: 195381714, store_income: 83016435,
    other_income: 410977, expenses: 167385087, profit: 111424039, profit_pct: 6.8
  },
  {
    month: "March", location: "all",
    total_assets: 1758820751, store_lombard_assets: 1628240096,
    lombard_assets: 1507401556, store_assets: 120838540, cash: 130580655,
    total_income: 98944661, lombard_income: 67150051, store_income: 31589883,
    other_income: 204727, expenses: 67603389, profit: 31341272, profit_pct: 1.9
  },
];

const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

const MONTH_SHORT = {
  January: "Янв", February: "Фев", March: "Мар", April: "Апр",
  May: "Май", June: "Июн", July: "Июл", August: "Авг",
  September: "Сен", October: "Окт", November: "Ноя", December: "Дек"
};

// ═══════════════════════════════════════════════════════
// УТИЛИТЫ
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

const P = {
  bg: "#0a0e1a", card: "#111827", cardHover: "#1a2235",
  border: "#1e293b", text: "#e2e8f0", textDim: "#64748b",
  accent: "#3b82f6", accentLight: "#60a5fa",
  green: "#10b981", red: "#ef4444",
  amber: "#f59e0b", purple: "#8b5cf6", cyan: "#06b6d4", pink: "#ec4899",
};

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

const AGG_KEYS = [
  "total_assets", "store_lombard_assets", "lombard_assets", "store_assets",
  "cash", "total_income", "lombard_income", "store_income", "other_income",
  "expenses", "profit"
];

// ═══════════════════════════════════════════════════════
// МАЛЕНЬКИЕ КОМПОНЕНТЫ
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
        borderRadius: "50%", background: color + "08", filter: "blur(20px)"
      }} />
      <div style={{
        fontSize: 12, color: P.textDim, textTransform: "uppercase",
        letterSpacing: "0.1em", marginBottom: 8,
        fontFamily: "'JetBrains Mono', monospace"
      }}>
        {icon} {title}
      </div>
      <div style={{
        fontSize: 26, fontWeight: 700, color: P.text,
        fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em"
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
      display: "flex", alignItems: "center", gap: 8
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
      boxShadow: "0 20px 40px rgba(0,0,0,0.5)"
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

// ═══════════════════════════════════════════════════════
// ГЛАВНЫЙ КОМПОНЕНТ
// ═══════════════════════════════════════════════════════

export default function FinanceDashboard() {
  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedMonths, setSelectedMonths] = useState(new Set());
  const [selectedLocations, setSelectedLocations] = useState(new Set());
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [activeTab, setActiveTab] = useState("overview");
  const [showAllLocations, setShowAllLocations] = useState(false);

  // ── Toggle helpers ──
  const toggle = (setter, val) => {
    setter(prev => {
      const next = new Set(prev);
      next.has(val) ? next.delete(val) : next.add(val);
      return next;
    });
  };

  const toggleCategory = (cat) => {
    const locs = CATEGORY_GROUPS[cat] || [];
    setSelectedCategories(prev => {
      const next = new Set(prev);
      const wasActive = next.has(cat);
      if (wasActive) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      setSelectedLocations(prevL => {
        const nl = new Set(prevL);
        if (wasActive) {
          locs.forEach(l => nl.delete(l));
        } else {
          locs.forEach(l => nl.add(l));
        }
        return nl;
      });
      return next;
    });
  };

  const clearAll = () => {
    setSelectedMonths(new Set());
    setSelectedLocations(new Set());
    setSelectedCategories(new Set());
  };

  const hasFilters = selectedMonths.size > 0 || selectedLocations.size > 0 || selectedCategories.size > 0;

  // ── Фильтрация данных ──
  const filteredData = useMemo(() => {
    let data = MONTHLY_DATA;
    if (selectedMonths.size > 0) {
      data = data.filter(d => selectedMonths.has(d.month));
    }
    return data;
  }, [selectedMonths]);

  const aggregated = useMemo(() => {
    if (filteredData.length === 0) {
      const res = {};
      AGG_KEYS.forEach(k => res[k] = 0);
      res.profit_pct = 0;
      return res;
    }
    const res = {};
    AGG_KEYS.forEach(k => res[k] = filteredData.reduce((s, d) => s + d[k], 0));
    res.profit_pct = res.total_income > 0
      ? (res.profit / res.total_income * 100).toFixed(1) : 0;
    return res;
  }, [filteredData]);

  const incomeBreakdown = useMemo(() => [
    { name: "Ломбард", value: aggregated.lombard_income, color: CHART_COLORS[0] },
    { name: "Магазин", value: aggregated.store_income, color: CHART_COLORS[1] },
    { name: "Прочее", value: aggregated.other_income, color: CHART_COLORS[2] },
  ], [aggregated]);

  const chartData = useMemo(() =>
    filteredData.map(d => ({ ...d, name: MONTH_SHORT[d.month] || d.month })),
  [filteredData]);

  const visibleLocations = showAllLocations ? LOCATIONS : LOCATIONS.slice(0, 14);
  const hiddenCount = LOCATIONS.length - 14;

  const activeFilterParts = [];
  if (selectedMonths.size > 0) activeFilterParts.push(`${selectedMonths.size} мес.`);
  if (selectedLocations.size > 0) activeFilterParts.push(`${selectedLocations.size} точ.`);
  if (selectedCategories.size > 0) activeFilterParts.push(`${selectedCategories.size} кат.`);

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
            Данные обновлены 3/12/26 &bull; PostgreSQL
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { key: "overview", label: "Обзор" },
            { key: "details", label: "Таблица" },
            { key: "charts", label: "Графики" },
          ].map(t => (
            <Pill key={t.key} label={t.label} active={activeTab === t.key} onClick={() => setActiveTab(t.key)} />
          ))}
        </div>
      </header>

      <div style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ─── ФИЛЬТРЫ ─── */}
        <div style={{
          background: P.card, borderRadius: 16,
          border: `1px solid ${P.border}`, padding: "20px 24px", marginBottom: 24,
        }}>
          {/* Годы */}
          <div style={{ marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 11, color: P.textDim, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace", minWidth: 55, paddingTop: 7 }}>Год</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {YEARS.map(y => (
                <Pill key={y} label={y} active={selectedYear === y} onClick={() => setSelectedYear(y)} />
              ))}
            </div>
          </div>

          {/* Месяцы */}
          <div style={{ marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 11, color: P.textDim, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace", minWidth: 55, paddingTop: 7 }}>Месяц</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ALL_MONTHS.map(m => (
                <Pill key={m} label={MONTH_SHORT[m]} active={selectedMonths.has(m)} onClick={() => toggle(setSelectedMonths, m)} />
              ))}
            </div>
          </div>

          {/* Точки — все кликабельные, с раскрытием */}
          <div style={{ marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 11, color: P.textDim, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', monospace", minWidth: 55, paddingTop: 7 }}>Точки</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {visibleLocations.map(l => (
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

          {/* Категории + Сбросить */}
          <div style={{
            display: "flex", gap: 6, flexWrap: "wrap",
            paddingTop: 14, borderTop: `1px solid ${P.border}`,
            alignItems: "center",
          }}>
            <Pill
              label={hasFilters ? `✕ Сбросить (${activeFilterParts.join(", ")})` : "✕ Сбросить"}
              active={false}
              onClick={clearAll}
            />
            <span style={{ width: 1, height: 24, background: P.border, margin: "0 4px", display: "inline-block" }} />
            {Object.keys(CATEGORY_GROUPS).map(cat => (
              <Pill
                key={cat}
                label={cat}
                active={selectedCategories.has(cat)}
                onClick={() => toggleCategory(cat)}
              />
            ))}
          </div>
        </div>

        {/* ─── KPI КАРТОЧКИ ─── */}
        {showCharts && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16, marginBottom: 24,
          }}>
            <KPI title="Общий актив" value={fmt(aggregated.total_assets)} icon="📊" color={P.accent} subtitle={`${selectedYear}`} />
            <KPI title="Общий доход" value={fmt(aggregated.total_income)} icon="💰" color={P.green} subtitle={`Прибыль: ${aggregated.profit_pct}%`} />
            <KPI title="Прибыль" value={fmt(aggregated.profit)} icon="📈" color={aggregated.profit > 0 ? P.green : P.red} />
            <KPI title="Затраты" value={fmt(aggregated.expenses)} icon="📉" color={P.amber} />
            <KPI title="Касса" value={fmt(aggregated.cash)} icon="🏦" color={aggregated.cash >= 0 ? P.cyan : P.red} />
            <KPI title="Актив Ломбарда" value={fmt(aggregated.lombard_assets)} icon="💎" color={P.purple} />
          </div>
        )}

        {/* ─── ГРАФИКИ ─── */}
        {showCharts && chartData.length > 0 && (
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

        {/* ─── Нет данных ─── */}
        {showCharts && chartData.length === 0 && (
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

        {/* ─── ТАБЛИЦА ─── */}
        {showTable && (
          <div style={{
            background: P.card, borderRadius: 16, border: `1px solid ${P.border}`,
            padding: 24, overflowX: "auto",
          }}>
            <Section>Детализация по месяцам — {selectedYear}</Section>
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
                      onMouseEnter={e => e.currentTarget.style.background = P.cardHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "10px 12px", fontWeight: 500, color: P.text }}>{MONTH_SHORT[row.month]}</td>
                      {AGG_KEYS.map((k, j) => (
                        <td key={j} style={{
                          padding: "10px 12px", textAlign: "right",
                          color: row[k] < 0 ? P.red : P.text,
                          fontVariantNumeric: "tabular-nums",
                        }}>{fmtFull(row[k])}</td>
                      ))}
                      <td style={{
                        padding: "10px 12px", textAlign: "right", fontWeight: 600,
                        color: row.profit_pct >= 5 ? P.green : row.profit_pct >= 0 ? P.amber : P.red,
                      }}>{row.profit_pct}%</td>
                    </tr>
                  ))}
                  {/* Итого */}
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
