/*
Schedule hourly priority score refresh.

Runs at minute 5 of every hour:
05:00, 06:00, 07:00, etc.

Note: Requires pg_cron extension. If not available, run manually:
    SELECT cron.schedule(
        'priority-score-refresh',
        '5 * * * *',
        $cron$SELECT refresh_priority_scores();$cron$
    );
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
