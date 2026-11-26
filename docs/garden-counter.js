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

  async function requestCount(kind, operation) {
    const url = `https://abacus.jasoncameron.dev/${operation}/${namespace}/${scope}-${kind}`;
    const response = await fetcher(url, {
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(10000)
    });
    const data = await response.json();
    // Only an unused preview counter can start at zero.
    if (hostname !== namespace && operation === 'get' && response.status === 404 && data.error === 'Key not found') return 0;
    if (!response.ok) throw new Error('Counter service unavailable');
    if (!Number.isSafeInteger(data.value) || data.value < 0) throw new Error('Invalid counter response');
    return data.value;
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
    let value;
    try {
      value = await requestCount(kind, increment ? 'hit' : 'get');
    } catch (error) {
      if (!increment) throw error;
      // A lost response may still have incremented the counter. Only read it back.
      return {value: await requestCount(kind, 'get'), confirmed: false};
    }
    if (increment) saveFlag('done');
    return {value, confirmed: increment || confirmed};
  }

  async function update(action) {
    const result = {};
    for (const kind of ['visitors', 'waterers']) {
      // Register a watering only after this browser's visit was acknowledged.
      const record = kind === 'visitors' ? Boolean(action) : action === 'water' && result.visitors?.confirmed;
      try { result[kind] = await read(kind, record); }
      catch { result[kind] = {value: null, confirmed: false}; }
    }
    return result;
  }

  return {
    preview: hostname !== namespace,
    refresh(action) {
      const run = () => locks?.request ? locks.request(prefix + 'lock', () => update(action)) : update(action);
      const job = queue.then(run, run);
      queue = job.catch(() => {});
      return job;
    }
  };
}
