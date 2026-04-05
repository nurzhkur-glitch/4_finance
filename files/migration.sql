-- ============================================================
-- Миграция: создание таблицы finance_data
-- ============================================================
-- Адаптируйте под вашу реальную структуру данных.
-- Эта таблица соответствует колонкам из Power BI дашборда.
-- ============================================================

CREATE TABLE IF NOT EXISTS finance_data (
    id              SERIAL PRIMARY KEY,
    year            INT          NOT NULL,
    month           VARCHAR(20)  NOT NULL,        -- 'January', 'February', ...
    location        VARCHAR(100) NOT NULL,        -- Название точки

    -- Активы
    total_assets         BIGINT DEFAULT 0,        -- Общий актив
    store_lombard_assets BIGINT DEFAULT 0,        -- Актив магазина + ломбарда
    lombard_assets       BIGINT DEFAULT 0,        -- Актив Ломбарда
    store_assets         BIGINT DEFAULT 0,        -- Актив Магазина
    cash                 BIGINT DEFAULT 0,        -- Денег в кассе

    -- Доходы
    total_income         BIGINT DEFAULT 0,        -- Общий доход
    lombard_income       BIGINT DEFAULT 0,        -- Доход Ломбарда
    store_income         BIGINT DEFAULT 0,        -- Доход Магазина
    other_income         BIGINT DEFAULT 0,        -- Доход прочее

    -- Расходы и прибыль
    expenses             BIGINT DEFAULT 0,        -- Затраты
    profit               BIGINT DEFAULT 0,        -- Прибыль

    created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для быстрой фильтрации
CREATE INDEX IF NOT EXISTS idx_finance_year     ON finance_data(year);
CREATE INDEX IF NOT EXISTS idx_finance_month    ON finance_data(month);
CREATE INDEX IF NOT EXISTS idx_finance_location ON finance_data(location);
CREATE INDEX IF NOT EXISTS idx_finance_year_month ON finance_data(year, month);
