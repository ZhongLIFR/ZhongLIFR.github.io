import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../docs/research-taxonomy.js', import.meta.url), 'utf8');
const {researchAreas, topicGroup, matchesResearchFilter, researchFilterGroups} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const papers = JSON.parse(await readFile(new URL('../docs/publications.json', import.meta.url), 'utf8'));

test('every public paper has one research area and supported, nonduplicated tags', () => {
  for (const paper of papers) {
    const area = researchAreas.find(area => area.id === paper.researchArea);
    assert.ok(area, paper.title);
    assert.ok(paper.topics.length, paper.title);
    assert.equal(new Set(paper.topics).size, paper.topics.length, paper.title);
    for (const topic of paper.topics) assert.ok(area.topics.includes(topicGroup(topic)), `${paper.title}: ${topic}`);
  }
});

test('area filters partition papers; LLM/MLLM combines both models without rewriting paper tags', () => {
  assert.deepEqual(papers.filter(p => matchesResearchFilter(p, 'area:ai4or')).map(p => p.id).sort(), ['p1', 'p2', 'p3', 'p5', 'p6']);
  assert.equal(papers.filter(p => matchesResearchFilter(p, 'area:data-mining')).length, papers.length - 5);
  const original = JSON.stringify(papers);
  for (const filter of ['LLM/MLLM', 'LLM', 'MLLM']) {
    assert.equal(papers.filter(p => matchesResearchFilter(p, filter)).length, 5);
  }
  assert.ok(papers.find(p => p.id === 'p2').topics.includes('MLLM'));
  assert.ok(papers.find(p => p.id === 'p1').topics.includes('LLM'));
  assert.equal(JSON.stringify(papers), original);
});

test('every tag is selectable exactly once, and options have results in their stated area', () => {
  const groups = researchFilterGroups(papers);
  const options = groups.flatMap(group => group.options);
  assert.equal(new Set(options.map(option => option.value)).size, options.length);
  for (const topic of papers.flatMap(p => p.topics)) assert.ok(options.some(o => o.value === topicGroup(topic)), topic);
  for (const option of options) assert.ok(papers.some(p => matchesResearchFilter(p, option.value)), option.value);
  for (const area of researchAreas) {
    for (const option of groups.find(group => group.label === area.fullLabel).options) {
      assert.ok(papers.some(p => p.researchArea === area.id && matchesResearchFilter(p, option.value)), `${area.id}: ${option.value}`);
    }
  }
  assert.ok(!options.some(o => ['Trustworthiness', 'Privacy', 'Operations Research'].includes(o.value)), 'Broader interests do not become unsupported paper filters');
});

test('a topic used in both areas is grouped once and filters across both areas', () => {
  const crossArea = [...papers, {id: 'fixture', researchArea: 'ai4or', topics: ['LLM', 'Robustness']}];
  const groups = researchFilterGroups(crossArea);
  assert.deepEqual(groups.find(g => g.label === 'Shared topics').options, [{value: 'Robustness', label: 'Robustness'}]);
  assert.deepEqual(new Set(crossArea.filter(p => matchesResearchFilter(p, 'Robustness')).map(p => p.researchArea)), new Set(['ai4or', 'data-mining']));
  assert.equal(groups.flatMap(g => g.options).filter(o => o.value === 'Robustness').length, 1);
  assert.deepEqual(researchFilterGroups([]), []);
});
