-- Optional NRT: run as DB owner if analytic user lacks TRIGGER privilege.
-- Channel name must match main.py: finance_updates

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

DROP TRIGGER IF EXISTS unpacked_smart_lombard_analytic_data_notify ON unpacked_smart_lombard_analytic_data;

CREATE TRIGGER unpacked_smart_lombard_analytic_data_notify
    AFTER INSERT OR UPDATE OR DELETE ON unpacked_smart_lombard_analytic_data
    FOR EACH STATEMENT
    EXECUTE FUNCTION notify_finance_change();
