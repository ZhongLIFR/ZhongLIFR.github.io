import {createGardenCounter} from './garden-counter.js?v=20261126';

const stats = document.querySelector('.garden-stats');
if (stats) {
  let storage;
  try { storage = localStorage; } catch { /* Read-only counts still work. */ }
  const counter = createGardenCounter({hostname: location.hostname, storage});
  const formatter = new Intl.NumberFormat('en-US');
  const explanation = 'Shared totals refresh every minute while this page is visible. Visits and completed waterings each count at most once per browser every 30 minutes, using separate timers.';
  const preview = counter.preview ? 'Preview counters, separate from the live website. ' : '';
  function display(data) {
    let unavailable = false;
    for (const kind of ['waterers', 'visitors']) {
      const item = data[kind];
      const element = stats.querySelector(`[data-count="${kind}"]`);
      const valid = Number.isSafeInteger(item?.value);
      const label = valid ? formatter.format(item.value) : '—';
      if (element.textContent !== label) element.textContent = label;
      element.title = valid ? '' : 'Shared count temporarily unavailable';
      unavailable ||= !valid;
    }
    stats.dataset.state = unavailable ? 'unavailable' : 'ready';
    stats.title = preview + explanation;
  }
  async function refresh(action) {
    display(await counter.refresh(action));
  }
  document.addEventListener('garden:watered', () => { void refresh('water'); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh('visit');
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted && !document.hidden) void refresh('visit');
  });
  window.addEventListener('online', () => {
    if (!document.hidden) void refresh();
  });
  setInterval(() => {
    if (!document.hidden) void refresh();
  }, 60_000);
  void refresh('visit');
}
