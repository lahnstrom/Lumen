// Source links are displayable HTTP(S) references, not arbitrary browser schemes.
// Parsing here does not fetch a page or claim that its contents are authoritative.
export function httpUrl(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url : null;
  } catch { return null; }
}
export const sourceHostname = value => httpUrl(value)?.hostname || 'Invalid saved link';
