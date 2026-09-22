import React, { useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

export function BackupDownloads() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const controller = useRef();
  useEffect(() => () => controller.current?.abort(), []);
  async function download() {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/backup/archive', { signal: request.signal });
      if (!response.ok) throw new Error((await response.json()).error || 'The archive could not be created.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || 'lumen-workspace.zip';
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { if (!request.signal.aborted) setError(e.message); }
    finally { controller.current = null; setBusy(false); }
  }
  return <div className="backup-downloads"><button className="button" onClick={download} disabled={busy}>{busy ? <Loader2 size={16} className="spin"/> : <Download size={16}/>} {busy ? 'Preparing archive…' : 'Download complete archive'}</button><a className="button secondary" href="/api/backup"><Download size={16}/>Study records only (JSON)</a><p className="fine-print">The ZIP includes saved Studio projects and images, a checksum manifest, and restore instructions. Browser drafts, Anki’s collection, and account credentials are separate. Finish editing before exporting.</p>{error && <p className="form-error" role="alert">{error}</p>}</div>;
}
