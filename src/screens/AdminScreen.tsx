import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui.tsx';
import { get, post } from '../lib/api.ts';
import { useSession } from '../lib/session.tsx';

interface ReportRow { lockId: string; title: string; engraving: string; status: string; reports: number; reasons: string; lastReportAt: string }
interface Metrics { profiles: number; registered: number; locks: number; invitationsOpened: number; unlocks: number; attempts: number; openReports: number; events: { name: string; count: number }[] }

export function AdminScreen() {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useSession();
  const load = () => {
    get<ReportRow[]>('/api/admin/reports').then(setRows).catch((e) => setError(e.message));
    get<Metrics>('/api/admin/metrics').then(setMetrics).catch(() => undefined);
  };
  useEffect(load, []);
  const act = async (id: string, action: string) => {
    try { await post(`/api/admin/locks/${id}/moderate`, { action }); toast(`Lock ${action === 'hide' ? 'hidden' : 'restored'}`, 'success'); load(); }
    catch (e) { toast((e as Error).message, 'error'); }
  };

  if (error) return <main className="mx-auto max-w-2xl px-4 pb-nav pt-10"><ErrorState message={error} /></main>;
  return (
    <main className="mx-auto max-w-3xl px-4 pb-nav pt-6">
      <PageHeader title="Moderation" subtitle="Reported locks and product health" />
      {metrics && (
        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(metrics).filter(([, v]) => typeof v === 'number').map(([k, v]) => (
            <Card key={k} className="p-3"><p className="font-display text-2xl text-brass-300">{v as number}</p><p className="text-[11px] text-ivory/50">{k}</p></Card>
          ))}
        </div>
      )}
      {!rows ? <Spinner /> : rows.length === 0 ? <EmptyState title="All quiet" body="No open reports." /> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.lockId}>
              <Card className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/lock/${r.lockId}`} className="font-semibold underline">{r.title || r.engraving}</Link>
                  <p className="text-xs text-ivory/60">{r.reports} report(s): {r.reasons} · status {r.status}</p>
                </div>
                <Button variant="danger" onClick={() => act(r.lockId, 'hide')}>Hide</Button>
                <Button variant="ghost" onClick={() => act(r.lockId, 'restore')}>Restore</Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {metrics && metrics.events.length > 0 && (
        <Card className="mt-6">
          <h2 className="font-display text-2xl">Funnel events</h2>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-sm">{metrics.events.map((e) => <li key={e.name} className="flex justify-between pr-4"><span className="text-ivory/60">{e.name}</span>{e.count}</li>)}</ul>
        </Card>
      )}
    </main>
  );
}
