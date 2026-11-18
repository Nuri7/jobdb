import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Building2, Loader2, RefreshCw } from 'lucide-react';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const db: SupabaseClient = supabase;
type SourceRequest = {id: string; company_name: string; career_url: string; status: string; review_note: string | null; jobs_imported: number | null};
const statusLabels: Record<string, string> = {pending: 'Wacht op controle', approved: 'Goedgekeurd · import ingepland', validating: 'Bron wordt gecontroleerd', imported: 'Import voltooid', failed: 'Bron heeft aandacht nodig', rejected: 'Niet opgenomen'};

export default function SuggestEmployer() {
  const {user, isAdmin, loading} = useAuth();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['source-requests', user?.id, isAdmin], enabled: Boolean(user), refetchInterval: 60000,
    queryFn: async () => {
      let request = db.from('job_source_requests').select('id,company_name,career_url,status,review_note,jobs_imported').order('created_at', {ascending: false}).limit(100);
      if (!isAdmin) request = request.eq('user_id', user!.id);
      const result = await request;
      if (result.error) throw result.error;
      return result.data as SourceRequest[];
    },
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    let career: URL;
    try { career = new URL(url.trim()); } catch { toast.error('Vul een geldige https-link in.'); return; }
    if (career.protocol !== 'https:' || career.username || career.password || (career.port && career.port !== '443')) {
      toast.error('Gebruik een openbare https-link naar de werken-bij-pagina.'); return;
    }
    career.hash = '';
    setBusy(true);
    try {
      const result = await db.rpc('fairjobs_suggest_source', {p_name: name, p_url: career.toString()});
      if (result.error) throw result.error;
      setName(''); setUrl('');
      toast.success('Werkgever aangemeld. Je kunt de controle hieronder volgen.');
      await query.refetch();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Aanmelden is niet gelukt. Probeer het opnieuw.'); }
    finally { setBusy(false); }
  }
  async function review(row: SourceRequest, status: 'approved' | 'rejected') {
    setBusy(true);
    const result = await db.from('job_source_requests').update({status, updated_at: new Date().toISOString(), next_check_at: new Date().toISOString(),
      review_note: status === 'rejected' ? 'De aangemelde pagina is niet geschikt als vacaturebron.' : null}).eq('id', row.id).in('status', ['pending', 'failed']);
    if (result.error) toast.error('De beoordeling kon niet worden opgeslagen.');
    else await query.refetch();
    setBusy(false);
  }
  return <div className="min-h-screen bg-muted/20"><Header /><main className="container max-w-3xl space-y-8 py-8">
    <div><Building2 className="mb-3 h-8 w-8 text-primary" /><h1 className="text-3xl font-bold">Werkgever toevoegen</h1><p className="mt-2 text-muted-foreground">Mis je een werkgever? Meld de werken-bij-pagina aan. Na controle laden we de beschikbare vacatures automatisch uit de bron.</p></div>
    {loading ? <Loader2 className="animate-spin" aria-label="Account laden" /> : !user ? <div className="rounded-2xl border bg-card p-6"><p>Log in om een werkgever aan te melden en de voortgang te volgen.</p><Button asChild className="mt-4"><Link to="/inloggen" state={{from: '/werkgever-toevoegen'}}>Inloggen</Link></Button></div> : <>
      <form onSubmit={submit} className="space-y-5 rounded-2xl border bg-card p-6">
        <div><Label htmlFor="employer-name">Naam werkgever</Label><Input className="mt-2" id="employer-name" required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} autoComplete="organization" /></div>
        <div><Label htmlFor="career-url">Link naar de werken-bij-pagina</Label><Input className="mt-2" id="career-url" type="url" required maxLength={1000} placeholder="https://bedrijf.nl/vacatures" value={url} onChange={e => setUrl(e.target.value)} /><p className="mt-2 text-sm text-muted-foreground">Gebruik de website van de werkgever of diens sollicitatieplatform. We nemen alleen controleerbare vacatures op.</p></div>
        <Button disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Werkgever aanmelden</Button>
      </form>
      <section aria-label="Voortgang aangemelde werkgevers" className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{isAdmin ? 'Aangemelde werkgevers' : 'Je aanmeldingen'}</h2><Button variant="ghost" size="sm" onClick={() => query.refetch()} aria-label="Voortgang vernieuwen"><RefreshCw className="h-4 w-4" /></Button></div>
        {query.isLoading && <p>Voortgang laden…</p>}
        {query.isError && <p role="alert">Aanmeldingen konden niet worden geladen. Probeer opnieuw.</p>}
        {query.data?.length === 0 && <p className="text-sm text-muted-foreground">Je hebt nog geen werkgevers aangemeld.</p>}
        {query.data?.map(row => <article key={row.id} className="space-y-2 rounded-xl border bg-card p-5"><h3 className="font-semibold">{row.company_name}</h3><a className="block break-all text-sm text-primary underline" href={row.career_url} target="_blank" rel="noopener noreferrer">{row.career_url}</a><p className="text-sm font-medium">{statusLabels[row.status]}{row.status === 'imported' && row.jobs_imported != null ? ` · ${row.jobs_imported} vacatures` : ''}</p>{row.review_note && <p className="text-sm text-muted-foreground">{row.review_note}</p>}{isAdmin && ['pending','failed'].includes(row.status) && <div className="flex gap-2 pt-2"><Button size="sm" disabled={busy} onClick={() => review(row, 'approved')}>Goedkeuren en controleren</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => review(row, 'rejected')}>Afwijzen</Button></div>}</article>)}
      </section>
    </>}
  </main></div>;
}
