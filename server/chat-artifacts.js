import { applyBundle } from './domain.js';

export function parseLearningReply(content) {
  const raw = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let value; try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value.reply !== 'string' || !Array.isArray(value.cards) || !Array.isArray(value.sources) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) return null;
  if (value.cards.some(c => !c || typeof c.front !== 'string' || typeof c.back !== 'string' || typeof c.source !== 'string')) return null;
  if (value.sources.some(s => !s || typeof s.title !== 'string' || typeof s.url !== 'string' || typeof s.note !== 'string')) return null;
  if (value.nodes.some(n => !n || typeof n.id !== 'string' || typeof n.label !== 'string' || typeof n.description !== 'string')) return null;
  if (value.edges.some(e => !e || ['from', 'to', 'label', 'source'].some(k => typeof e[k] !== 'string'))) return null;
  return value;
}
// Extract only the human reply during structured streaming; never expose the JSON envelope.
export function streamedReply(buffer) {
  const match = buffer.match(/"reply"\s*:\s*("(?:[^"\\]|\\.)*)/);
  if (!match) return null;
  try { return JSON.parse(match[1] + '"'); } catch { return null; }
}
export function saveLearningReply(topic, bundle) {
  applyBundle(topic, bundle, 'chat');
  return { content: bundle.reply, artifacts: { cards: bundle.cards.length, concepts: bundle.nodes.length } };
}
export function recoverUnappliedBundles(db) {
  let recovered = 0;
  for (const topic of db.topics) for (const message of topic.messages) {
    if (message.role !== 'assistant' || message.artifacts) continue;
    const bundle = parseLearningReply(message.content);
    // Recover only unambiguous artifact envelopes, not arbitrary JSON examples in conversation.
    if (!bundle || !bundle.cards.length) continue;
    Object.assign(message, saveLearningReply(topic, bundle), { recoveredAt: new Date().toISOString() });
    recovered += bundle.cards.length;
  }
  return recovered;
}
