import { useMemo, useReducer } from 'react';

// Storage failures must never stop typing. The memory cache also lets us compare
// an accepted message with the current draft before clearing it.
export function createDraftStore(storage) {
  const drafts = new Map();
  let persistent = true;
  const key = topicId => `lumen-draft:${topicId}`;
  function read(topicId) {
    if (!topicId) return '';
    if (!drafts.has(topicId)) {
      try { drafts.set(topicId, storage.getItem(key(topicId)) || ''); }
      catch { persistent = false; drafts.set(topicId, ''); }
    }
    return drafts.get(topicId);
  }
  function write(topicId, text) {
    if (!topicId) return;
    drafts.set(topicId, text);
    try {
      if (text) storage.setItem(key(topicId), text); else storage.removeItem(key(topicId));
      persistent = true;
    } catch { persistent = false; }
  }
  return {
    read, write,
    get persistent() { return persistent; },
    clearIfMatches(topicId, submitted) { if (read(topicId) === submitted) write(topicId, ''); },
  };
}

export function useTopicDraft(topicId) {
  const store = useMemo(() => createDraftStore({
    getItem: key => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: key => localStorage.removeItem(key),
  }), []);
  const [, render] = useReducer(n => n + 1, 0);
  const text = store.read(topicId);
  return {
    text, persistent: store.persistent,
    setText(value) { store.write(topicId, value); render(); },
    clearIfMatches(id, value) { store.clearIfMatches(id, value); render(); },
  };
}
