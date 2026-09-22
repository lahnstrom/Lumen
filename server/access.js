export function createAccessPolicy(env = process.env) {
  const configured = env.LUMEN_TAILSCALE_ORIGIN;
  const users = new Set((env.LUMEN_TAILSCALE_USERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  let remote = null;
  if (configured) {
    remote = new URL(configured);
    if (remote.protocol !== 'https:' || !remote.hostname.endsWith('.ts.net') || remote.port || remote.pathname !== '/' || remote.search || remote.hash || remote.username || remote.password || !users.size) {
      throw new Error('Phone access needs an HTTPS .ts.net origin and LUMEN_TAILSCALE_USERS containing allowed Tailscale login names.');
    }
  }
  return (req, res, next) => {
    const host = req.headers.host || '';
    const origin = req.headers.origin;
    const login = req.headers['tailscale-user-login'];
    const forwarded = req.headers['x-forwarded-host'];
    const isRemote = !!login || (!!remote && (host === remote.host || forwarded === remote.host));
    if (isRemote) {
      // The HTTP server stays bound to loopback. Tailscale Serve strips client-supplied
      // identity headers and supplies its own; never use this policy on a LAN listener.
      if (!remote || !users.has(String(login || '').toLowerCase())) return res.status(403).json({ error: 'This Tailscale account does not have access to Lumen.' });
      if (host !== remote.host && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return res.status(403).json({ error: 'Unrecognized host.' });
      if (origin && origin !== remote.origin) return res.status(403).json({ error: 'Cross-origin access blocked.' });
    } else {
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return res.status(403).json({ error: 'Local access only. Configure Tailscale Serve for phone access.' });
      if (origin && origin !== `http://${host}`) return res.status(403).json({ error: 'Cross-origin access blocked.' });
    }
    next();
  };
}
