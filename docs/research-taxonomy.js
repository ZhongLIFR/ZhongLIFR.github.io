// Research Interests and publication filters share the taxonomy agreed in the
// latest English CV (13 October 2026). Paper tags describe that paper's work;
// broader research interests do not automatically become publication claims.
export const researchAreas = [
  {
    id: 'ai4or', label: 'AI4OR', fullLabel: 'AI4OR (Operations Research)',
    interests: ['LLM/MLLM', 'Operations Research', 'Optimization Modeling', 'Benchmarking', 'Post-Training', 'Multi-Agents', 'Trustworthiness'],
    topics: ['LLM/MLLM', 'Optimization Modeling', 'Benchmarking', 'Post-Training', 'Multi-Agents', 'Efficiency', 'Robustness', 'Hallucination Detection', 'Hallucination Repair', 'Constraint Programming']
  },
  {
    id: 'data-mining', label: 'Trustworthy Data Mining', fullLabel: 'Trustworthy Data Mining',
    interests: ['Anomaly Detection', 'Graph Learning', 'Subgroup Discovery', 'Diffusion/Flow Matching', 'Smart Manufacturing', 'Healthcare'],
    topics: ['Anomaly Detection', 'Graph Learning', 'Subgroup Discovery', 'Diffusion/Flow Matching', 'Smart Manufacturing', 'Healthcare', 'Explainability', 'Robustness', 'Generalization']
  }
];

export const topicGroup = topic => ['LLM', 'MLLM'].includes(topic) ? 'LLM/MLLM' : topic;

export function matchesResearchFilter(paper, filter) {
  if (filter === 'all') return true;
  if (filter.startsWith('area:')) return paper.researchArea === filter.slice(5);
  return paper.topics.some(topic => topicGroup(topic) === topicGroup(filter));
}

export function researchFilterGroups(papers) {
  const areas = researchAreas.filter(area => papers.some(p => p.researchArea === area.id));
  const topicsByArea = new Map(areas.map(area => [area.id,
    new Set(papers.filter(p => p.researchArea === area.id).flatMap(p => p.topics.map(topicGroup)))
  ]));
  const topics = [...new Set(areas.flatMap(area => area.topics))];
  const shared = topics.filter(topic => areas.filter(area => topicsByArea.get(area.id).has(topic)).length > 1);
  return [
    {label: 'Research areas', options: areas.map(area => ({value: `area:${area.id}`, label: area.fullLabel}))},
    ...areas.map(area => ({label: area.fullLabel, options: area.topics
      .filter(topic => topicsByArea.get(area.id).has(topic) && !shared.includes(topic))
      .map(topic => ({value: topic, label: topic}))})),
    {label: 'Shared topics', options: shared.map(topic => ({value: topic, label: topic}))}
  ].filter(group => group.options.length);
}
