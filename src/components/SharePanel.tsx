import { useState } from 'react';
import { inviteUrl } from '../lib/api.ts';
import { track } from '../lib/analytics.ts';
import { Button } from './ui.tsx';

export function SharePanel({ path, title }: { path: string; title: string }) {
  const url = inviteUrl(path);
  const [copied, setCopied] = useState(false);
  const text = `I left a lock for you on the Bridge of Memories 🔒 Solve the puzzle to read what's inside: ${url}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); track('invite_shared', { channel: 'copy' }); }
    catch { /* clipboard blocked: the URL is selectable below */ }
  };
  const native = async () => {
    try { await navigator.share({ title, text, url }); track('invite_shared', { channel: 'native' }); } catch { /* cancelled */ }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-2xl border border-brass-400/30 bg-night-950/70 p-2 pl-4">
        <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Invitation link" className="min-w-0 flex-1 bg-transparent text-sm text-ivory/80 outline-none" />
        <Button onClick={copy} className="shrink-0 px-4">{copied ? 'Copied ✓' : 'Copy'}</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" onClick={() => track('invite_shared', { channel: 'whatsapp' })}>
          <Button variant="ghost">WhatsApp</Button>
        </a>
        <a href={`mailto:?subject=${encodeURIComponent('A lock for you')}&body=${encodeURIComponent(text)}`} onClick={() => track('invite_shared', { channel: 'email' })}>
          <Button variant="ghost">Email</Button>
        </a>
        {typeof navigator !== 'undefined' && 'share' in navigator && <Button variant="ghost" onClick={native}>More…</Button>}
      </div>
      <p className="text-xs text-ivory/50">The link opens in any browser — no app or account needed. Anyone holding it can try your puzzle, so share it privately.</p>
    </div>
  );
}
