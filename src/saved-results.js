// Apply only data acknowledged by the host. Never invent a schedule or review log.
export function applySavedResult(db, url, result) {
  if (!result || typeof result !== 'object') return db;
  if (result.id && Array.isArray(result.cards) && Array.isArray(result.sources) && result.graph) {
    const { reviewReceipt, saved, ...topic } = result;
    const topics = db.topics.some(t => t.id === topic.id) ? db.topics.map(t => t.id === topic.id ? topic : t) : [topic, ...db.topics];
    const reviews = reviewReceipt && Array.isArray(reviewReceipt.reviews) ? [...db.reviews.filter(r => r.topicId !== topic.id || r.cardId !== reviewReceipt.cardId), ...reviewReceipt.reviews] : db.reviews;
    return { ...db, topics, reviews };
  }
  const topicId = /^\/topics\/([^/]+)\//.exec(url)?.[1];
  if (topicId && Array.isArray(result.nodes) && Array.isArray(result.edges)) return { ...db, topics: db.topics.map(t => t.id === topicId ? { ...t, graph: result } : t) };
  if (url.startsWith('/concept-links')) {
    if (Array.isArray(result)) return { ...db, conceptLinks: result };
    if (result.id) return { ...db, conceptLinks: (db.conceptLinks || []).map(link => link.id === result.id ? result : link) };
  }
  if (topicId && result.projectId) return { ...db, topics: db.topics.map(t => t.id === topicId ? { ...t, studioProjects: [...new Set([...(t.studioProjects || []), result.projectId])] } : t) };
  return db;
}
