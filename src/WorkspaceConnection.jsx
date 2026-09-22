import React, { useState } from 'react';
import { Loader2, RefreshCw, WifiOff } from 'lucide-react';
export function WorkspaceConnection({ status, retry }) {
  const [busy, setBusy] = useState(false);
  if (status.online && status.live === 'connected' && !status.loadError) return null;
  const initial = status.online && status.live === 'connecting' && !status.loadError && !status.lastLoaded;
  return <div className={'workspace-connection ' + (initial ? 'connecting' : '')} role="status" aria-label="Workspace connection">
    {initial ? <Loader2 size={18} className="spin"/> : <WifiOff size={18}/>}
    <div><strong>{initial ? 'Connecting to your workspace…' : !status.online ? 'This device is offline' : status.loadError ? 'Workspace refresh interrupted' : 'Live updates interrupted'}</strong>
      {!initial && <p>{status.savedWhileStale ? 'Your change was saved. Other workspace details may be out of date. ' : status.lastLoaded ? 'Showing previously loaded material. ' : 'Your workspace could not be loaded. '}{status.online ? (status.loadError ? 'Check Tailscale and the home PC, then retry the connection.' : 'Lumen is reconnecting; check Tailscale and the home PC if this continues.') : 'Reconnect to update your progress, send messages, or save reviews.'}</p>}
      {!initial && status.loadError && status.online && <small>{status.loadError}</small>}
    </div>
    {!initial && <button className="button secondary" disabled={busy || !status.online} onClick={async () => { setBusy(true); try { await retry(); } finally { setBusy(false); } }}>{busy ? <Loader2 size={14} className="spin"/> : <RefreshCw size={14}/>}Retry connection</button>}
  </div>;
}
