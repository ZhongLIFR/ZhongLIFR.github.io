import {createGardenCounter} from './garden-counter.js?v=shared-counts-20261009';

const stats = document.querySelector('.garden-stats');
if (stats) {
  let storage;
  try { storage = localStorage; } catch { /* Read-only counts still work. */ }
  const counter = createGardenCounter({hostname: location.hostname, storage});
  const formatter = new Intl.NumberFormat('en-US');
  const explanation = 'Visitors counts visits and Watered by counts completed watering contributions, each at most once per browser every 30 minutes. The two counters use separate timers. Counts started in October 2026. Clearing browser data or using another browser may count again. Shared totals provided by Abacus.';
  const preview = counter.preview ? 'Preview counters, separate from the live website. ' : '';
  function display(data) {
    let stale = false;
    for (const kind of ['waterers', 'visitors']) {
      const item = data[kind];
      const element = stats.querySelector(`[data-count="${kind}"]`);
      const valid = Number.isSafeInteger(item?.value);
      element.textContent = valid ? formatter.format(item.value) : '—';
      element.title = item?.stale ? (valid ? `Last available count: ${new Date(item.updated).toLocaleString()}` : 'Temporarily unavailable') : '';
      stale ||= Boolean(item?.stale);
    }
    stats.dataset.state = stale ? 'stale' : 'ready';
    stats.title = preview + explanation + (stale ? ' The service is temporarily unavailable; any displayed numbers are the last successful readings.' : '');
  }
  display(Object.fromEntries(['waterers', 'visitors'].map(kind => [kind, {...counter.cached(kind), stale: true}])));
  let lastRefresh = 0;
  async function refresh(action) {
    lastRefresh = Date.now();
    display(await counter.refresh(action));
  }
  document.addEventListener('garden:watered', () => { void refresh('water'); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastRefresh > 60000) void refresh('visit');
  });
  void refresh('visit');
}
