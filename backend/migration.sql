-- ============================================================
-- Миграция: создание таблицы finance_data + NRT триггер
-- ============================================================

CREATE TABLE IF NOT EXISTS finance_data (
    id              SERIAL PRIMARY KEY,
    year            INT          NOT NULL,
    month           VARCHAR(20)  NOT NULL,
    location        VARCHAR(100) NOT NULL,

    -- Активы
    total_assets         BIGINT DEFAULT 0,
    store_lombard_assets BIGINT DEFAULT 0,
    lombard_assets       BIGINT DEFAULT 0,
    store_assets         BIGINT DEFAULT 0,
    cash                 BIGINT DEFAULT 0,

    -- Доходы
    total_income         BIGINT DEFAULT 0,
    lombard_income       BIGINT DEFAULT 0,
    store_income         BIGINT DEFAULT 0,
    other_income         BIGINT DEFAULT 0,

    -- Расходы и прибыль
    expenses             BIGINT DEFAULT 0,
    profit               BIGINT DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_finance_year       ON finance_data(year);
CREATE INDEX IF NOT EXISTS idx_finance_month      ON finance_data(month);
CREATE INDEX IF NOT EXISTS idx_finance_location   ON finance_data(location);
CREATE INDEX IF NOT EXISTS idx_finance_year_month ON finance_data(year, month);

-- ============================================================
-- NRT: триггер для LISTEN/NOTIFY
-- ============================================================

CREATE OR REPLACE FUNCTION notify_finance_change() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('finance_updates', json_build_object(
        'table', TG_TABLE_NAME,
        'action', TG_OP,
        'timestamp', NOW()
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS finance_data_notify ON finance_data;

CREATE TRIGGER finance_data_notify
    AFTER INSERT OR UPDATE OR DELETE ON finance_data
    FOR EACH STATEMENT
    EXECUTE FUNCTION notify_finance_change();
