-- A few feeds mapped application deadlines into datePosted, pushing vacancies from 2027 above
-- genuinely recent jobs. Keep a two-day clock-skew allowance and let first_seen_at drive recency.

UPDATE public.job_opportunities
SET posted_date = NULL
WHERE posted_date > current_date + 2;
