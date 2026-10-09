// Unpublished entries expose only preprint metadata and a generic review status.
// Reconstruct these fields from the public URL, never from a submission target.
export function isPublicPaper(paper) {
  return paper.status === 'published' || (
    paper.status === 'review' && /^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\/\d{4}\.\d{4,5}(?:v\d+)?(?:\.pdf)?(?:[?#].*)?$/.test(paper.url || '')
  );
}

export function isSelectedPaper(paper) {
  const count = paper.citations?.count;
  return isPublicPaper(paper) && (
    (paper.status === 'published' && (paper.ranks || []).includes('CCF A')) ||
    (Number.isInteger(count) && count > 50)
  );
}

export function publicPaper(paper) {
  if (paper.status !== 'review') return paper;
  const arxiv = paper.url?.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?/)?.[1];
  const year = arxiv ? 2000 + Number(arxiv.slice(0, 2)) : null;
  return {
    ...paper,
    venue: arxiv ? 'Preprint' : 'Manuscript',
    year,
    outlet: arxiv ? `arXiv:${arxiv}, ${year}` : '',
    note: '',
    presentation: '',
    ranks: [],
  };
}

export function presentationFor(paper) {
  if (paper.status !== 'published') return '';
  const explicit = ['Poster', 'Oral', 'Spotlight'].find(value => value === paper.presentation);
  if (explicit) return explicit;
  const match = paper.note?.match(/\b(spotlight|oral|poster)\b/i);
  return match ? match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() : '';
}

export function resourceLinksFor(paper) {
  const arxivPdf = paper.url?.includes('arxiv.org/abs/') ? paper.url.replace('/abs/', '/pdf/') : '';
  const candidates = [
    { label: 'Paper', url: paper.url },
    { label: 'PDF', url: paper.pdf || arxivPdf },
    { label: 'Code', url: paper.code },
    ...(paper.resources || []),
  ];
  const seen = new Set();
  return candidates.filter(({ label, url }) => {
    if (!label || !/^https?:\/\//.test(url || '') || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

export function citationFor(rawPaper) {
  const p = publicPaper(rawPaper);
  const journal = ['DMKD', 'TKDE', 'TKDD', 'Clinical Trials', 'KDD Explor.', 'JHRI'].includes(p.venue);
  const type = p.status === 'review' ? 'misc' : journal ? 'article' : 'inproceedings';
  const authors = p.authors.replace(/[#*]/g, '').replace(/, and /g, ', ').replace(/ and /g, ', ').split(', ').map(s => s.trim()).filter(Boolean).join(' and ');
  const fields = [`  title = {${p.title}}`, `  author = {${authors}}`];
  if (p.year) fields.push(`  year = {${p.year}}`);
  if (p.status === 'published') {
    fields.push(`  ${journal ? 'journal' : 'booktitle'} = {${p.outlet.replace(/, (20\d\d)$/, '')}}`);
  } else {
    fields.push('  note = {Under review}');
    const arxiv = p.url?.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?/)?.[1];
    if (arxiv) fields.push(`  eprint = {${arxiv}}`, '  archivePrefix = {arXiv}');
  }
  if (p.url) fields.push(`  url = {${p.url}}`);
  const surname = p.authors.split(' ')[1].replace(/[^a-z]/gi, '').toLowerCase();
  return `@${type}{${surname}${p.year || 'undated'}${p.id},\n${fields.join(',\n')}\n}`;
}
