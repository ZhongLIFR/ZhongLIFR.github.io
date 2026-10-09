// Static data is refreshed by the repository workflow, never by a visitor's browser.
const totalLink = document.querySelector('#scholar-citation-total');
const dateLabel = document.querySelector('#scholar-citation-date');
if (totalLink && dateLabel) {
  try {
    const response = await fetch('scholar-stats.json', {cache: 'no-cache'});
    if (!response.ok) throw new Error('Citation snapshot unavailable');
    const stats = await response.json();
    const date = new Date(`${stats.snapshot}T00:00:00Z`);
    if (stats.authorId !== 'm5u8VlIAAAAJ' || !Number.isSafeInteger(stats.totalCitations) || stats.totalCitations < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(stats.snapshot) || Number.isNaN(date.getTime())) throw new Error('Invalid citation snapshot');
    const count = new Intl.NumberFormat('en-US').format(stats.totalCitations);
    totalLink.textContent = `${count}${stats.isLowerBound ? '+' : ''} Google Scholar citations`;
    totalLink.title = `${stats.source} · ${stats.snapshot}`;
    const options = stats.lastSuccessfulSync ? {day: 'numeric', month: 'long', year: 'numeric'} : {month: 'long', year: 'numeric'};
    dateLabel.textContent = `(as of ${new Intl.DateTimeFormat('en-GB', {...options, timeZone: 'UTC'}).format(date)})`;
  } catch {
    // The dated HTML snapshot remains visible if the JSON cannot be read.
  }
}
