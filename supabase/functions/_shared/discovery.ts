/** Shared validation and URL mapping for search and saved-search delivery. */
export function discoveryOptions(params: URLSearchParams) {
  const options: Record<string, string | number> = {};
  const mode = params.get('mode');
  if (mode === 'employment' || mode === 'freelance') options.mode = mode;
  const sort = params.get('sort');
  if (
    sort &&
    ['relevance', 'recent', 'salary', 'deadline', 'distance'].includes(sort)
  )
    options.sort = sort;
  for (const [key, max] of [
    ['pay_min', 1000000],
    ['hours_min', 168],
    ['hours_max', 168],
    ['closing_within', 365],
  ] as const) {
    const raw = params.get(key);
    const value = Number(raw);
    if (raw && Number.isFinite(value) && value >= 0 && value <= max)
      options[key] = key === 'pay_min' ? value : Math.floor(value);
  }
  options.pay_period =
    mode === 'freelance' || params.get('job_type') === 'freelance'
      ? 'hour'
      : 'month';
  const start = params.get('start_before');
  if (
    start &&
    /^\d{4}-\d{2}-\d{2}$/.test(start) &&
    !Number.isNaN(Date.parse(start))
  )
    options.start_before = start;
  const since = params.get('new_since');
  if (since && !Number.isNaN(Date.parse(since)))
    options.new_since = new Date(since).toISOString();
  return options;
}

export function alertParams(criteria: Record<string, unknown>, since: string) {
  const params = new URLSearchParams({
    limit: '10',
    new_since: since,
    auto_expand: 'false',
  });
  const fields = {
    search: 'search',
    jobType: 'job_type',
    experienceLevel: 'experience_level',
    workplaceType: 'workplace_type',
    mode: 'mode',
    payMin: 'pay_min',
    hoursMin: 'hours_min',
    hoursMax: 'hours_max',
    startBefore: 'start_before',
    closingWithin: 'closing_within',
  };
  for (const [key, apiKey] of Object.entries(fields)) {
    const value = criteria[key];
    if (typeof value === 'string' || typeof value === 'number')
      params.set(apiKey, String(value));
  }
  if (typeof criteria.location === 'string') {
    if (Number(criteria.radiusKm) > 0) {
      params.set('near', criteria.location);
      params.set('radius_km', String(criteria.radiusKm));
    } else params.set('location', criteria.location);
  }
  for (const [key, apiKey] of Object.entries({
    remote: 'remote',
    internship: 'internship',
    hasSalary: 'has_salary',
    easyApply: 'easy_apply',
  })) {
    if (criteria[key] === true) params.set(apiKey, 'true');
  }
  // Recency is a discovery window; new_since tracks only jobs not included in earlier alerts.
  if (Number(criteria.postedWithin) > 0)
    params.set('posted_within', String(criteria.postedWithin));
  return params;
}
