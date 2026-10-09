const stats = document.querySelector('.garden-stats');
if (stats && !stats.hidden) {
  const endpoint = (stats.dataset.endpoint || '/api/garden').replace(/\/$/, '');
  let visitor;
  // Keep one anonymous ID for this browser. Without storage, show shared totals
  // without manufacturing a new visitor on every page load.
  try {
    visitor = localStorage.getItem('zl-garden-visitor');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(visitor || '')) {
      visitor = crypto.randomUUID();
      localStorage.setItem('zl-garden-visitor', visitor);
    }
  } catch { visitor = null; }
  const formatter = new Intl.NumberFormat('en-US');
  let latest = 0;
  async function refresh(action) {
    const sequence = ++latest;
    try {
      const response = await fetch(endpoint + (visitor && action ? `/${action}` : ''), {
        ...(visitor && action ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({visitor})} : {}),
        cache: 'no-store', signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error('Counter unavailable');
      const data = await response.json();
      if (![data.waterers, data.visitors].every(n => Number.isSafeInteger(n) && n >= 0) || data.waterers > data.visitors) throw new Error('Invalid counts');
      if (sequence !== latest) return;
      stats.querySelector('[data-count="waterers"]').textContent = formatter.format(data.waterers);
      stats.querySelector('[data-count="visitors"]').textContent = formatter.format(data.visitors);
      stats.dataset.state = 'ready';
      stats.title = 'Unique browsers since October 2026. Repeat visits and watering do not add to the totals.';
    } catch {
      if (sequence !== latest) return;
      stats.dataset.state = 'unavailable';
      stats.querySelectorAll('[data-count]').forEach(value => { value.textContent = '—'; });
      stats.title = 'Counts are temporarily unavailable.';
    }
  }
  document.addEventListener('garden:watered', () => refresh('water'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh('visit');
}
