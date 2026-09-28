import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAdminOrService } from '../_shared/adminAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

type Criteria = {
  search?: string;
  location?: string;
  jobType?: string;
  experienceLevel?: string;
  remote?: boolean;
  internship?: boolean;
  hasSalary?: boolean;
  easyApply?: boolean;
  postedWithin?: number;
};

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) throw new Error('BREVO_API_KEY not configured');
  const response = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'FairJobs', email: 'noreply@fairapply.app' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!response.ok) throw new Error(`Brevo returned ${response.status}: ${await response.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const auth = await requireAdminOrService(req, corsHeaders);
  if (!auth.ok) return auth.response;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  const { data: searches, error } = await supabase
    .from('job_saved_searches')
    .select('id,user_id,name,criteria,last_notified_at,created_at')
    .eq('email_enabled', true)
    .limit(500);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  let sent = 0;
  let matched = 0;
  const failures: { searchId: string; error: string }[] = [];

  for (const savedSearch of searches || []) {
    try {
      const criteria = (savedSearch.criteria || {}) as Criteria;
      const since = savedSearch.last_notified_at || savedSearch.created_at || new Date(Date.now() - 86_400_000).toISOString();
      let query = supabase
        .from('job_opportunities')
        .select('id,job_title,location,first_seen_at,is_remote,is_internship,salary_range,employment_type,experience_level,company_career_sites!inner(company_name,source_type)')
        .eq('status', 'open')
        .eq('verified', true)
        .eq('is_foreign', false)
        .gt('first_seen_at', since)
        .order('first_seen_at', { ascending: false })
        .limit(10);
      if (criteria.search) query = query.ilike('job_title', `%${criteria.search.replace(/[%_]/g, '')}%`);
      if (criteria.location) query = query.ilike('location', `%${criteria.location.replace(/[%_]/g, '')}%`);
      if (criteria.remote) query = query.eq('is_remote', true);
      if (criteria.internship) query = query.eq('is_internship', true);
      if (criteria.hasSalary) query = query.not('salary_range', 'is', null);
      if (criteria.jobType) query = query.ilike('employment_type', `%${criteria.jobType.replace(/[%_]/g, '')}%`);
      if (criteria.experienceLevel) query = query.ilike('experience_level', `%${criteria.experienceLevel.replace(/[%_]/g, '')}%`);
      if (criteria.easyApply) query = query.ilike('company_career_sites.source_type', 'ats:%');

      const { data: jobs, error: jobsError } = await query;
      if (jobsError) throw jobsError;
      const now = new Date().toISOString();
      if (jobs?.length) {
        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(savedSearch.user_id);
        if (userError || !userData.user?.email) throw userError || new Error('User email missing');
        const rows = jobs.map((job) => {
          const company = job.company_career_sites as unknown as { company_name: string };
          const slug = String(job.job_title).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
          const href = `https://fairjobs.app/vacatures/${slug || 'vacature'}--${job.id}`;
          return `<li style="margin:0 0 16px"><a href="${href}" style="color:#6d28d9;font-weight:700;text-decoration:none">${escapeHtml(job.job_title)}</a><br><span style="color:#555">${escapeHtml(company?.company_name)} · ${escapeHtml(job.location || 'Nederland')}</span></li>`;
        }).join('');
        await sendEmail(
          userData.user.email,
          `${jobs.length} nieuwe ${jobs.length === 1 ? 'vacature' : 'vacatures'} voor ${savedSearch.name}`,
          `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto"><h1 style="font-size:24px">Nieuwe matches op FairJobs</h1><p>Voor je zoekopdracht <strong>${escapeHtml(savedSearch.name)}</strong> vonden we:</p><ul style="padding-left:20px">${rows}</ul><p><a href="https://fairjobs.app/bewaard">Beheer je zoekmeldingen</a></p></div>`,
        );
        sent += 1;
        matched += jobs.length;
      }
      await supabase.from('job_saved_searches').update({ last_notified_at: now }).eq('id', savedSearch.id);
    } catch (alertError) {
      failures.push({ searchId: savedSearch.id, error: alertError instanceof Error ? alertError.message : String(alertError) });
    }
  }

  return new Response(JSON.stringify({ success: failures.length === 0, checked: searches?.length || 0, sent, matched, failures }), {
    status: failures.length ? 207 : 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
