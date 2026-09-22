import { createHash, randomUUID } from 'node:crypto';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const html = value => String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\n', '<br>');
const grades = ['again', 'hard', 'good', 'easy'];
const fieldsOf = info => Object.fromEntries(Object.entries(info.fields || {}).map(([key, value]) => [key, value.value]));
const snapshot = info => hash([info.cardId, info.note, info.mod, info.reps, info.lapses, info.due, info.queue, info.type, info.interval, info.fields]);
const chunks = values => Array.from({ length: Math.ceil(values.length / 100) }, (_, i) => values.slice(i * 100, i * 100 + 100));
export const BASIC_MODEL = { modelName: 'Lumen Basic v1', inOrderFields: ['Front', 'Back', 'Source', 'LumenID'], css: '.card{font:22px/1.6 system-ui;text-align:left;color:#253c34;background:#fffefa}.source{font-size:12px;opacity:.7}', cardTemplates: [{ Name: 'Recall', Front: '{{Front}}', Back: '{{FrontSide}}<hr id="answer">{{Back}}<div class="source">{{Source}}</div>' }] };

export class AnkiBridge {
  constructor({ db, save, emit = () => {}, invoke, studioBundle }) {
    Object.assign(this, { db, save, emit, invoke, studioBundle }); this.tail = Promise.resolve(); this.tokens = new Map(); this.polling = false;
    db.anki ||= { enabled: false };
  }
  serial(fn) { const next = this.tail.then(fn); this.tail = next.catch(() => {}); return next; }
  status() { const { pending, ...status } = this.db.anki; return status; }
  async profile() {
    const profile = await this.invoke('getActiveProfile');
    if (!profile) throw new Error('Open an Anki profile first.');
    if (this.db.anki.profile && this.db.anki.profile !== profile) throw new Error(`Open the linked Anki profile (${this.db.anki.profile}) before synchronizing. No changes were made to this profile.`);
    return profile;
  }
  async inspect() { const profile = await this.profile(); const decks = await this.invoke('deckNames'); return { profile, decks, ...this.status() }; }
  notify() { this.save(); this.emit({ type: 'anki' }); }
  connect(topic, deck) {
    return this.serial(async () => {
      const profile = await this.profile();
      if (typeof deck !== 'string' || !deck.trim() || deck.length > 200 || /[\x00-\x1f]/.test(deck)) throw new Error('Choose a valid Anki deck name.');
      const capabilities = await this.invoke('apiReflect', { scopes: ['actions'], actions: ['answerCards', 'cardsInfo', 'getReviewsOfCards'] });
      if (capabilities.actions?.length !== 3) throw new Error('Update AnkiConnect to support review synchronization.');
      this.db.anki = { ...this.db.anki, enabled: true, profile };
      topic.anki = { ...topic.anki, enabled: true, deck: deck.trim() }; this.notify();
      await this.syncInner({ web: true }); return this.status();
    });
  }
  sync(options = {}) { return this.serial(() => this.syncInner(options)); }
  async syncInner({ web = false } = {}) {
    if (!this.db.anki.enabled) return this.status();
    try {
      await this.profile();
      if (web) await this.syncWeb();
      let changed = false;
      for (const topic of this.db.topics.filter(t => t.anki?.enabled)) {
        try { changed = (await this.publish(topic)) || changed; topic.anki.error = ''; }
        catch (e) { topic.anki.error = e.message; }
      }
      // Receive cloud changes before publication; upload newly published notes afterwards.
      if (web && changed) await this.syncWeb();
      await this.pull();
      Object.assign(this.db.anki, { connected: true, error: '', lastPullAt: new Date().toISOString() }); this.notify();
    } catch (e) { Object.assign(this.db.anki, { connected: false, error: e.message }); this.notify(); throw e; }
    return this.status();
  }
  async syncWeb() {
    this.db.anki.lastWebAttemptAt = new Date().toISOString();
    try { await this.invoke('sync'); this.db.anki.lastWebSyncRequestedAt = new Date().toISOString(); this.db.anki.webError = ''; }
    catch (e) { this.db.anki.webError = `AnkiWeb: ${e.message}. Open Anki to finish sign-in or resolve its sync prompt.`; }
  }
  start() {
    this.timer = setInterval(() => {
      if (!this.db.anki.enabled || this.polling) return;
      this.polling = true;
      this.sync({ web: Date.now() - Date.parse(this.db.anki.lastWebAttemptAt || 0) > 120000 }).catch(() => {}).finally(() => { this.polling = false; });
    }, 15000); this.timer.unref();
  }
  close() { clearInterval(this.timer); }
  async publish(topic) {
    const active = topic.cards.filter(c => !c.suspended);
    const descriptors = active.filter(c => !c.studio).map(card => ({
      tag: `lumen_id_${card.id.replaceAll('-', '')}`, model: BASIC_MODEL,
      fields: { Front: html(card.front), Back: html(card.back), Source: html(card.source), LumenID: card.id },
      tags: ['lumen', `lumen_id_${card.id.replaceAll('-', '')}`], cards: [{ key: card.id, ord: 0 }],
    }));
    const media = [];
    for (const projectId of new Set(active.filter(c => c.studio).map(c => c.studio.projectId))) {
      const bundle = await this.studioBundle(projectId);
      for (const note of bundle.notes) descriptors.push({ ...note, projectId });
      media.push(...bundle.media);
    }
    let knownModels, mediaSent = false, deckReady = false, changed = false;
    for (const desc of descriptors) {
      const local = desc.cards.map(identity => ({ identity, card: active.find(c => desc.projectId ? c.studio?.projectId === desc.projectId && c.studio.key === identity.key : c.id === identity.key) })).filter(x => x.card);
      if (!local.length) continue;
      if (local.every(({ card }) => card.anki?.cardId && card.anki.localHash === hash(desc.fields) && !card.anki.missing && !card.anki.contentConflict)) continue;
      const matches = await this.invoke('findNotes', { query: `tag:${desc.tag}` });
      if (matches.length > 1) { for (const { card } of local) card.anki = { ...card.anki, error: 'Multiple Anki notes share this identity. Resolve the duplicates in Anki.' }; continue; }
      let noteId = matches[0];
      if (!noteId && local.some(x => x.card.anki?.cardId)) {
        for (const { card } of local) Object.assign(card.anki ||= {}, { missing: true, dueNow: false, error: 'The linked Anki note is missing or its identity tag was removed. Restore it in Anki to reconnect.' });
        continue; // Do not resurrect intentionally deleted notes.
      }
      if (!noteId) {
        if (!deckReady) { await this.invoke('createDeck', { deck: topic.anki.deck }); deckReady = true; }
        knownModels ||= await this.invoke('modelNames');
        if (!knownModels.includes(desc.model.modelName)) { await this.invoke('createModel', desc.model); knownModels.push(desc.model.modelName); }
        const names = await this.invoke('modelFieldNames', { modelName: desc.model.modelName });
        if (JSON.stringify(names) !== JSON.stringify(desc.model.inOrderFields)) throw new Error(`Anki note type ${desc.model.modelName} has incompatible fields.`);
        if (desc.projectId && !mediaSent) { for (const file of media) await this.invoke('storeMediaFile', { ...file, deleteExisting: false }); mediaSent = true; }
        noteId = await this.invoke('addNote', { note: { deckName: topic.anki.deck, modelName: desc.model.modelName, fields: desc.fields, tags: desc.tags, options: { allowDuplicate: true } } });
        if (!noteId) throw new Error('Anki could not create the card.');
        changed = true;
      }
      const [note] = await this.invoke('notesInfo', { notes: [noteId] });
      if (!note?.cards) throw new Error('Anki note is unavailable.');
      const infos = await this.invoke('cardsInfo', { cards: note.cards });
      for (const { identity, card } of local) {
        const info = infos.find(c => c.ord === identity.ord);
        if (!info) { card.anki = { ...card.anki, missing: true, dueNow: false, error: 'The cloze/card template is missing in Anki.' }; continue; }
        const previous = card.anki;
        const incomingHash = hash(desc.fields), remoteHash = hash(fieldsOf(info));
        card.anki = { ...previous, profile: this.db.anki.profile, cardId: info.cardId, noteId, tag: desc.tag, missing: false, error: '',
          legacyReviews: previous?.legacyReviews ?? card.reviews ?? 0,
          localHash: incomingHash, remoteHash, previousSchedule: previous?.previousSchedule || { due: card.due, interval: card.interval, fsrs: card.fsrs } };
        // Review sync never blindly overwrites an Anki-side edit.
        if (previous?.localHash && previous.localHash !== incomingHash) {
          if ((!previous.contentConflict && previous.remoteHash === remoteHash) || incomingHash === remoteHash) {
            if (desc.projectId && !mediaSent) { for (const file of media) await this.invoke('storeMediaFile', { ...file, deleteExisting: false }); mediaSent = true; }
            try { await this.invoke('updateNoteFields', { note: { id: noteId, fields: desc.fields } }); }
            catch (e) { card.anki.localHash = previous.localHash; card.anki.remoteHash = previous.remoteHash; throw e; }
            card.anki.remoteHash = incomingHash; card.anki.contentConflict = false; delete card.anki.pendingLocalHash; changed = true;
          } else { card.anki.contentConflict = true; card.anki.localHash = previous.localHash; card.anki.pendingLocalHash = incomingHash; }
        }
      }
      this.save(); // Persist identities before another remote mutation or process shutdown.
    }
    return changed;
  }
  keepAnkiContent(topic) {
    return this.serial(async () => {
      for (const card of topic.cards) if (card.anki?.contentConflict) {
        card.anki.localHash = card.anki.pendingLocalHash;
        delete card.anki.pendingLocalHash; card.anki.contentConflict = false;
      }
      this.notify(); return this.status();
    });
  }
  linked() { return this.db.topics.flatMap(topic => topic.cards.filter(c => c.anki?.cardId).map(card => ({ topic, card }))); }
  async pull() {
    const linked = this.linked();
    for (const group of chunks(linked)) {
      const ids = [...new Set(group.map(x => x.card.anki.cardId))];
      const infos = await this.invoke('cardsInfo', { cards: ids });
      const reviews = await this.invoke('getReviewsOfCards', { cards: ids });
      const due = new Set(await this.invoke('findCards', { query: `cid:${ids.join(',')} (is:due OR is:new) -is:suspended -is:buried` }));
      for (const { topic, card } of group) {
        const info = infos.find(c => c.cardId === card.anki.cardId);
        if (!info) { Object.assign(card.anki, { missing: true, dueNow: false, error: 'This card is missing in Anki.' }); continue; }
        const history = (reviews[info.cardId] || []).filter(r => r.ease >= 1 && r.ease <= 4);
        const prefix = `anki:${hash(this.db.anki.profile).slice(0, 12)}:${card.id}:`;
        const imported = new Set(history.map(r => prefix + r.id));
        // Anki undo removes its revlog row: mirror that removal, retaining Lumen's old history.
        this.db.reviews = this.db.reviews.filter(r => !r.id.startsWith(prefix) || imported.has(r.id));
        const known = new Set(this.db.reviews.map(r => r.id));
        for (const r of history) if (!known.has(prefix + r.id)) this.db.reviews.push({ id: prefix + r.id, topicId: topic.id, cardId: card.id, grade: grades[r.ease - 1], at: new Date(r.id).toISOString(), scheduler: 'anki', ankiReviewId: r.id, log: r });
        card.reviews = card.anki.legacyReviews + info.reps;
        card.interval = Math.max(0, info.interval);
        card.lastGrade = history.length ? grades[history.toSorted((a, b) => b.id - a.id)[0].ease - 1] : card.lastGrade;
        Object.assign(card.anki, { missing: false, dueNow: due.has(info.cardId), queue: info.queue, type: info.type, reps: info.reps,
          due: info.due, interval: info.interval, deck: info.deckName, nextReviews: info.nextReviews, question: info.question, answer: info.answer, css: info.css,
          snapshot: snapshot(info), lastReviewId: Math.max(0, ...history.map(r => r.id)), lastCheckedAt: new Date().toISOString() });
      }
    }
    const pending = this.db.anki.pending;
    if (pending) {
      const card = linked.find(x => x.card.id === pending.cardId)?.card;
      if (card && !card.anki.missing) {
        this.db.anki.lastAnswerCheck = { ...pending, confirmed: card.anki.lastReviewId > pending.beforeReviewId };
        delete this.db.anki.pending;
      }
    }
  }
  preview(card) {
    return this.serial(async () => {
      await this.profile(); await this.pull(); this.notify();
      if (card.suspended || card.anki.missing || !card.anki.dueNow) throw new Error('This card is no longer due in Anki. The queue has been refreshed.');
      const token = randomUUID();
      for (const [key, item] of this.tokens) if (Date.now() - item.at > 1800000) this.tokens.delete(key);
      this.tokens.set(token, { cardId: card.id, snapshot: card.anki.snapshot, lastReviewId: card.anki.lastReviewId, at: Date.now() });
      return { token, scheduler: 'anki', options: Object.fromEntries(grades.map((grade, i) => [grade, { label: card.anki.nextReviews?.[i] || 'Anki schedule' }])) };
    });
  }
  answer(card, grade, token) {
    return this.serial(async () => {
      const preview = this.tokens.get(token);
      if (!preview || preview.cardId !== card.id || Date.now() - preview.at > 1800000) throw new Error('This answer has already been submitted or expired. Reveal the card again.');
      if (!grades.includes(grade)) throw new Error('Unknown review grade.');
      await this.profile(); await this.pull();
      if (card.suspended || !card.anki.dueNow || card.anki.missing || card.anki.snapshot !== preview.snapshot || card.anki.lastReviewId !== preview.lastReviewId) { this.tokens.delete(token); this.notify(); throw new Error('This card changed in Anki. The queue has been refreshed; reveal the current card again.'); }
      this.tokens.delete(token);
      // Durable journal + consumed token: never retry an ambiguous remote answer.
      this.db.anki.pending = { token, cardId: card.id, ankiCardId: card.anki.cardId, beforeReviewId: preview.lastReviewId, at: new Date().toISOString(), grade }; this.save();
      let failure;
      try { const result = await this.invoke('answerCards', { answers: [{ cardId: card.anki.cardId, ease: grades.indexOf(grade) + 1 }] }); if (!result?.[0]) throw new Error('Anki did not accept this answer.'); }
      catch (e) { failure = e; }
      try {
        await this.pull();
        if (card.anki.lastReviewId <= preview.lastReviewId) throw failure || new Error('Anki has not confirmed this answer. Sync before reviewing again.');
        delete this.db.anki.pending; this.db.anki.connected = true; this.db.anki.error = ''; this.notify();
      } catch (e) { this.db.anki.error = 'Answer confirmation pending. Reconnect to Anki and sync; the answer will not be sent twice.'; this.notify(); throw e; }
      // Cloud errors must not make a successful review look unsaved.
      this.sync({ web: true }).catch(() => {});
      return { saved: true };
    });
  }
}
