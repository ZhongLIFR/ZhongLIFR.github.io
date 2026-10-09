// Shared totals use Abacus; only duplicate-prevention flags stay in the browser.
// No account, API key, or visitor identifier is sent to the counter service.
export function createGardenCounter({hostname, storage, fetcher = fetch, locks = globalThis.navigator?.locks, now = Date.now}) {
  const namespace = 'zhonglifr.github.io';
  const scope = hostname === namespace ? 'garden-20261009' : 'garden-preview-20261009';
  const prefix = `zl:${scope}:`;
  const countWindow = 30 * 60 * 1000;
  let writable = false;
  try {
    storage.setItem(prefix + 'storage-check', '1');
    writable = storage.getItem(prefix + 'storage-check') === '1';
    storage.removeItem(prefix + 'storage-check');
  } catch { /* Without storage, read totals without repeatedly counting. */ }
  let queue = Promise.resolve();

  function cached(kind) {
    try {
      const item = JSON.parse(storage.getItem(prefix + kind + ':cache'));
      if (Number.isSafeInteger(item?.value) && item.value >= 0 && typeof item.updated === 'string') return item;
    } catch { /* No usable snapshot. */ }
    return null;
  }

  async function read(kind, record) {
    const flag = prefix + kind;
    const previous = writable ? storage.getItem(flag) : null;
    let last;
    try { last = JSON.parse(previous); } catch { /* Older flags have no timestamp. */ }
    const attempted = Number.isFinite(last?.at) && now() - last.at < countWindow && ['done', 'pending'].includes(last.state);
    const confirmed = attempted && last.state === 'done';
    const increment = record && writable && !attempted;
    const started = now();
    const saveFlag = state => storage.setItem(flag, JSON.stringify({state, at: started}));
    // The public increment endpoint has no idempotency token. Save intent first
    // and never blindly repeat a write after a timeout or lost response.
    if (increment) saveFlag('pending');
    const operation = increment ? 'hit' : 'get';
    const url = `https://abacus.jasoncameron.dev/${operation}/${namespace}/${scope}-${kind}`;
    const response = await fetcher(url, {
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(10000)
    });
    const data = await response.json();
    const missing = !increment && response.status === 404 && data.error === 'Key not found';
    if (!response.ok && !missing) throw new Error('Counter service unavailable');
    const value = missing ? 0 : data.value;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid counter response');
    if (increment) saveFlag('done');
    const result = {value, updated: new Date(now()).toISOString(), confirmed: increment || confirmed};
    try { storage.setItem(prefix + kind + ':cache', JSON.stringify(result)); } catch { /* Display the live count. */ }
    return result;
  }

  async function update(action) {
    const result = {};
    for (const kind of ['visitors', 'waterers']) {
      // Register a watering only after this browser's visit was acknowledged.
      const record = kind === 'visitors' ? Boolean(action) : action === 'water' && result.visitors?.confirmed;
      try { result[kind] = {...await read(kind, record), stale: false}; }
      catch { result[kind] = {...cached(kind), stale: true, confirmed: false}; }
    }
    return result;
  }

  return {
    preview: hostname !== namespace,
    cached,
    refresh(action) {
      const run = () => locks?.request ? locks.request(prefix + 'lock', () => update(action)) : update(action);
      const job = queue.then(run, run);
      queue = job.catch(() => {});
      return job;
    }
  };
}
