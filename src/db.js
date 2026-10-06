// Адаптер документного хранилища поверх Supabase (таблица shtab_docs).
// Повторяет API, которым пользуется app.js: db.doc(path) / db.collection(path),
// set / update / delete / onSnapshot. Изменения других пользователей приходят через Realtime.
const split = p => { const i = p.lastIndexOf('/'); return [p.slice(0, i), p.slice(i + 1)]; };
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function merge(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : v;
  return out;
}
function dbError(e) {
  const code = e && (e.code === '42501' || /row-level security|permission/i.test(e.message || '')) ? 'invalid_argument' : 'unavailable';
  return { code, message: (e && e.message) || 'db error' };
}

export function createDb(sb) {
  const cache = new Map();
  const collSubs = new Map();
  const docSubs = new Map();
  const loading = new Map();

  const collSnap = coll => {
    const docs = [...cache.entries()]
      .filter(([p]) => split(p)[0] === coll)
      .map(([p, d]) => ({ id: split(p)[1], exists: true, data: () => d, metadata: {} }));
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} };
  };
  const docSnap = path => { const d = cache.get(path); return { id: split(path)[1], exists: d !== undefined, data: () => d, metadata: {} }; };
  const emitColl = coll => { const s = collSubs.get(coll); if (s && loading.get(coll) === true) { const snap = collSnap(coll); s.forEach(f => f(snap)); } };
  const emitDoc = path => { const s = docSubs.get(path); if (s && loading.get(split(path)[0]) === true) { const snap = docSnap(path); s.forEach(f => f(snap)); } };
  const apply = (path, data) => {
    if (data === undefined) cache.delete(path); else cache.set(path, data);
    emitColl(split(path)[0]); emitDoc(path);
  };

  function loadColl(coll) {
    if (loading.has(coll)) return loading.get(coll) === true ? Promise.resolve() : loading.get(coll);
    const p = sb.from('shtab_docs').select('path,data').eq('coll', coll).limit(10000).then(({ data, error }) => {
      if (error) { loading.delete(coll); throw dbError(error); }
      data.forEach(r => cache.set(r.path, r.data));
      loading.set(coll, true);
      emitColl(coll);
      [...docSubs.keys()].filter(x => split(x)[0] === coll).forEach(emitDoc);
    });
    loading.set(coll, p);
    return p;
  }

  sb.channel('shtab_docs')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shtab_docs' }, payload => {
      if (payload.eventType === 'DELETE') { if (payload.old && payload.old.path) apply(payload.old.path, undefined); }
      else if (payload.new && payload.new.path) apply(payload.new.path, payload.new.data);
    })
    .subscribe();

  function docRef(path) {
    const [coll, id] = split(path);
    return {
      id, path,
      async get() { await loadColl(coll); return docSnap(path); },
      async set(data) {
        const prev = cache.get(path);
        apply(path, data);
        const { error } = await sb.from('shtab_docs').upsert({ path, coll, doc_id: id, data });
        if (error) { apply(path, prev); throw dbError(error); }
      },
      async update(data) {
        await loadColl(coll);
        const prev = cache.get(path);
        if (prev === undefined) throw { code: 'invalid_argument', message: 'document does not exist' };
        const next = merge(prev, data);
        apply(path, next);
        const { error } = await sb.from('shtab_docs').update({ data: next }).eq('path', path);
        if (error) { apply(path, prev); throw dbError(error); }
      },
      async delete() {
        const prev = cache.get(path);
        apply(path, undefined);
        const { error } = await sb.from('shtab_docs').delete().eq('path', path);
        if (error) { apply(path, prev); throw dbError(error); }
      },
      onSnapshot(next, err) {
        if (!docSubs.has(path)) docSubs.set(path, new Set());
        docSubs.get(path).add(next);
        loadColl(coll).then(() => next(docSnap(path))).catch(e => err && err(e));
        return () => docSubs.get(path) && docSubs.get(path).delete(next);
      },
      collection(sub) { return collRef(path + '/' + sub); },
    };
  }
  function collRef(coll) {
    return {
      path: coll,
      doc(id) { return docRef(coll + '/' + (id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)))); },
      async add(data) { const r = this.doc(); await r.set(data); return r; },
      async get() { await loadColl(coll); return collSnap(coll); },
      onSnapshot(next, err) {
        if (!collSubs.has(coll)) collSubs.set(coll, new Set());
        collSubs.get(coll).add(next);
        loadColl(coll).then(() => next(collSnap(coll))).catch(e => err && err(e));
        return () => collSubs.get(coll) && collSubs.get(coll).delete(next);
      },
    };
  }
  return { doc: docRef, collection: collRef };
}
