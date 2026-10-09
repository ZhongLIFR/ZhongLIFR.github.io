import { isPublicPaper, isSelectedPaper, publicPaper, presentationFor, citationFor, resourceLinksFor } from './publication-metadata.js?v=paper-resources-20261008';
const $ = (selector) => document.querySelector(selector);
const escape = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const root = document.documentElement;
const themeButton = $('#theme-toggle');
function themeLabel(){themeButton.setAttribute('aria-label',root.dataset.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');document.querySelector('meta[name="theme-color"]').content=root.dataset.theme==='dark'?'#1d1f21':'#ffffff';}
themeLabel();
themeButton.addEventListener('click',()=>{root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('zl-theme',root.dataset.theme)}catch{}themeLabel();document.dispatchEvent(new CustomEvent('themechange',{detail:root.dataset.theme}));});
const scheme=matchMedia('(prefers-color-scheme: dark)');scheme.addEventListener('change',e=>{let saved;try{saved=localStorage.getItem('zl-theme')}catch{}if(!saved){root.dataset.theme=e.matches?'dark':'light';themeLabel();document.dispatchEvent(new CustomEvent('themechange',{detail:root.dataset.theme}));}});
const state={collection:'selected',topic:'all',query:'',status:'all'};
let papers=[];
const topicGroup = topic => topic === 'LLM' || topic === 'MLLM' ? 'MLLM/LLM' : topic;
function formatAuthors(authors){return escape(authors).replace(/Zhong Li/g,'<strong>Zhong Li</strong>').replace(/([#*])/g,'<sup>$1</sup>');}
function compactMetadata(p){
 const ranks=p.status==='published'?(p.ranks||[]):[];
 const rankTags=ranks.map(rank=>`<span class="rank-tag" data-rank="${escape(rank)}" title="${escape(rank)} · venue ranking in the CV">${escape(rank)}</span>`).join('');
 const citation=p.citations;
 const scholarUrl=citation?.scholarId && /^m5u8VlIAAAAJ:[A-Za-z0-9_-]+$/.test(citation.scholarId)?`https://scholar.google.com/citations?view_op=view_citation&user=m5u8VlIAAAAJ&citation_for_view=${encodeURIComponent(citation.scholarId)}`:`https://scholar.google.com/scholar?q=${encodeURIComponent(p.title)}`;
 const citationSource=escape(citation?.source || 'Google Scholar');
 const count=Number.isInteger(citation?.count)&&citation.count>=0?`<a class="citation-tag" href="${escape(scholarUrl)}" target="_blank" rel="noopener" title="Google Scholar citations: ${citation.count} · ${citationSource} · ${escape(citation.snapshot)}" aria-label="${citation.count} Google Scholar citations, snapshot ${escape(citation.snapshot)}; find this paper on Google Scholar"><span class="scholar-mark" aria-hidden="true"><img src="assets/icons/google-scholar.png" alt="" width="14" height="14"></span><span>${citation.count}</span></a>`:'';
 return rankTags||count?`<div class="paper-metrics">${rankTags}${count}</div>`:'';
}
function render(){
 const q=state.query.trim().toLowerCase();
 const filtered=papers.filter(p=>(state.collection==='all'||isSelectedPaper(p))&&(state.topic==='all'||p.topics.some(topic=>topicGroup(topic)===state.topic))&&(state.status==='all'||p.status===state.status)&&(!q||[p.title,p.authors,p.venue,p.year,presentationFor(p),...p.topics].join(' ').toLowerCase().includes(q)));
 document.querySelectorAll('[data-collection]').forEach(b=>{const active=b.dataset.collection===state.collection;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',active);b.querySelector('span').textContent=b.dataset.collection==='all'?papers.length:papers.filter(isSelectedPaper).length});
 $('#show-all-papers').innerHTML=`View all ${papers.length} papers <span>↓</span>`;
 $('#topic-filter').value=state.topic;
 $('#paper-count').textContent=`${filtered.length} ${filtered.length===1?'paper':'papers'}`;
 $('#show-all-papers').hidden=state.collection==='all';
 let currentYear=null;
 $('#paper-list').innerHTML=filtered.map(p=>{
  const heading=p.status==='review'?'Preprints':p.year || 'Publications';
  let year='';if(heading!==currentYear){currentYear=heading;year=`<h3 class="paper-year">${heading}</h3>`;}
  const presentation=presentationFor(p);
  const recognition=p.status==='published'&&/highly cited/i.test(p.note)?'Highly cited':'';
  const venueLabels=`<span class="venue-badge">${escape(p.venue)}</span>${presentation?`<span class="presentation-badge" data-presentation="${presentation}">${presentation}</span>`:''}${compactMetadata(p)}${recognition?`<span class="award-badge">${recognition}</span>`:''}${p.status==='review'?'<span class="review-badge">Under review</span>':''}`;
  const buttons=[p.summary?`<button data-summary="${p.id}" aria-expanded="false" aria-controls="summary-${p.id}">Summary <span>+</span></button>`:'',...resourceLinksFor(p).map(({label,url})=>`<a href="${escape(url)}" target="_blank" rel="noopener">${escape(label)} ↗</a>`),`<button data-cite="${p.id}">BibTeX</button>`].join('');
  return year+`<article class="paper" data-id="${p.id}" data-status="${p.status}"><div class="paper-venue">${venueLabels}</div><div class="paper-content"><h3>${p.url?`<a href="${escape(p.url)}" target="_blank" rel="noopener">${escape(p.title)}</a>`:escape(p.title)}</h3><p class="paper-authors">${formatAuthors(p.authors)}</p>${p.outlet?`<p class="paper-outlet">${escape(p.outlet)}</p>`:''}<div class="paper-topics">${p.topics.map(t=>`<button class="topic-tag" data-topic="${escape(t)}" aria-label="Filter by ${escape(topicGroup(t))}">${escape(t)}</button>`).join('')}</div><div class="paper-links">${buttons}</div>${p.summary?`<div class="paper-summary" id="summary-${p.id}" hidden><p>${escape(p.summary)}</p><a href="${escape(p.summarySource || p.url)}" target="_blank" rel="noopener">Read the original abstract ↗</a></div>`:''}</div></article>`;
 }).join('')||'<div class="empty-results"><p>No papers match these filters.</p><button id="reset-filters">Reset filters</button></div>';
}
function topicFilter(topic){state.topic=topicGroup(topic);state.collection='all';render();}
document.addEventListener('click',e=>{
 const topic=e.target.closest('[data-topic]');if(topic)topicFilter(topic.dataset.topic);
 const collection=e.target.closest('[data-collection]');if(collection){state.collection=collection.dataset.collection;state.topic='all';state.query='';state.status='all';$('#paper-search').value='';$('#status-filter').value='all';render();}
 const summary=e.target.closest('[data-summary]');if(summary){const panel=$(`#summary-${summary.dataset.summary}`);panel.hidden=!panel.hidden;summary.setAttribute('aria-expanded',!panel.hidden);summary.querySelector('span').textContent=panel.hidden?'+':'−';}
 const citation=e.target.closest('[data-cite]');if(citation)openCitation(papers.find(p=>p.id===citation.dataset.cite));
 if(e.target.closest('#reset-filters')){Object.assign(state,{collection:'all',topic:'all',query:'',status:'all'});$('#paper-search').value='';$('#status-filter').value='all';render();}
});
$('#topic-filter').addEventListener('change',e=>topicFilter(e.target.value));
$('#paper-search').addEventListener('input',e=>{state.query=e.target.value;state.collection='all';render();});
$('#status-filter').addEventListener('change',e=>{state.status=e.target.value;state.collection='all';render();});
$('#show-all-papers').addEventListener('click',()=>{state.collection='all';render();$('#publications').scrollIntoView({block:'start'});});
function openCitation(p){
 $('#citation-text').textContent=citationFor(p);
 $('#copy-status').textContent='';$('#copy-citation').textContent='Copy BibTeX';$('#citation-dialog').showModal();
}
$('#close-citation').addEventListener('click',()=>$('#citation-dialog').close());
$('#citation-dialog').addEventListener('click',e=>{if(e.target===$('#citation-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('#copy-citation').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#citation-text').textContent);$('#copy-status').textContent='Copied to clipboard.';$('#copy-citation').textContent='Copied ✓'}catch{$('#copy-status').textContent='Select the citation above and copy it manually.'}});
// Use the actual top-level headings as the navigation's source of truth.
const sections=[...document.querySelectorAll('#main > section[id]')].filter(section=>section.querySelector('h2'));
const nav=$('nav[aria-label="Main navigation"]');
const navLinks=sections.map(section=>{
 const link=document.createElement('a');
 link.href=`#${section.id}`;
 link.textContent=section.querySelector('h2').textContent.trim();
 return link;
});
nav.replaceChildren(...navLinks);
const header=$('.site-header');
let navigationFrame=0;
function updateNavigation(){
 navigationFrame=0;
 const cutoff=header.getBoundingClientRect().bottom+36;
 let current=sections[0];
 for(const section of sections)if(section.getBoundingClientRect().top<=cutoff)current=section;
 // The short Contact section cannot reach the top when it ends the page.
 if(scrollY>0&&Math.ceil(scrollY+innerHeight)>=root.scrollHeight-2)current=sections.at(-1);
 navLinks.forEach(link=>{
  const active=link.hash===`#${current.id}`;
  link.classList.toggle('active',active);
  if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');
 });
}
function scheduleNavigation(){if(!navigationFrame)navigationFrame=requestAnimationFrame(updateNavigation);}
addEventListener('scroll',scheduleNavigation,{passive:true});
addEventListener('resize',scheduleNavigation);
addEventListener('hashchange',scheduleNavigation);
const navigationLayout=new ResizeObserver(()=>{
 root.style.setProperty('--header-height',`${Math.ceil(header.getBoundingClientRect().height)}px`);
 scheduleNavigation();
});
navigationLayout.observe(header);
navigationLayout.observe($('#main'));
updateNavigation();
try{const response=await fetch('publications.json', {cache:'no-cache'});if(!response.ok)throw Error('Publication data unavailable');papers=(await response.json()).filter(isPublicPaper).map(publicPaper);render();}catch(error){$('#paper-count').textContent='Publication list unavailable';$('#paper-list').innerHTML='<p class="empty-results">Please reload, or view my <a href="https://scholar.google.com/citations?user=m5u8VlIAAAAJ&amp;hl=en" target="_blank" rel="noopener">Google Scholar profile</a>.</p>';$('#show-all-papers').hidden=true;console.error(error);}
// Resolve the initial section after the asynchronous paper list sets the page height.
const initialSection = document.getElementById(location.hash.slice(1));
if (initialSection) requestAnimationFrame(() => initialSection.scrollIntoView({behavior:'instant',block:'start'}));
import('./sunflower.js?v=rabbit-watering-can-20261009').catch(error=>{console.error('Sunflower could not load',error);$('#garden-fallback').hidden=false;$('#water-button').disabled=true;$('#garden-message').textContent='3D view unavailable.';});
