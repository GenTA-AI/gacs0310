DO $$ BEGIN PERFORM cron.unschedule('priority-score-refresh'); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron not available, skip unschedule'; END $$;
