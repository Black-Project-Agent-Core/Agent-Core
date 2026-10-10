// Pure fixture/accounting helpers. No config, provider, process, or filesystem imports.
export function taskReviewDecision(state, taskId) {
  const entries = Object.entries(state.reviewDecisions ?? {}).filter(([,decision]) => decision.taskId === taskId);
  if (!entries.length) return undefined;
  return { taskId, status: entries.length === 1 ? entries[0][1].status : 'multiple',
    complete: entries.every(([,decision]) => decision.complete) && !(state.pendingReviews ?? []).some(item => item.taskId === taskId),
    checkpointDecisions: Object.fromEntries(entries) };
}


export function workflowCase(domain, index) {
  if (domain === 'engineering') {
    const scale = index + 2;
    const input = Array.from({ length: 8 }, (_, n) => ({ key: 'k' + n % 3, sequence: n + scale, value: (n - 2) * scale, deleted: n === 6 }));
    const expected = rows => [...new Set(rows.map(row => row.key))].sort().flatMap(key => {
      const latest = rows.filter(row => row.key === key).sort((a,b) => b.sequence-a.sequence)[0];
      return latest.deleted ? [] : [{ key, value: latest.value }];
    });
    return { domain, index, question: 'Write a JavaScript arrow function expression (rows => ...) into answer.txt. The verifier calls this function with several arrays of event records. For each key select the highest sequence; if that latest event has deleted=true omit the key, otherwise output {key,value}. Sort keys ascending. The function must return an array. Keep the file as a pure function expression, with no imports, file I/O, or precomputed answers. Do not delete tombstones before choosing the latest event.',
      document: JSON.stringify({ records: input, specification: 'Latest event wins before deletion filtering; output keys sorted ascending.' }),
      oracle: { domain, tests: [input, [...input].reverse(), [], [{ key:'z',sequence:1,value:5 },{ key:'z',sequence:2,value:0,deleted:true }], [{ key:'a',sequence:1,value:0 },{ key:'b',sequence:2,value:-scale }]].map(rows => ({ input: rows, expected: expected(rows) })) } };
  }
  const facts = Array.from({ length: 3 }, (_, n) => ({ key: 'component-' + n, value: String(index * 10 + n + 20), source: 'memo-' + index + '-' + n + '-new', supersedes: ['memo-' + index + '-' + n + '-old'] }));
  return { domain, index, question: 'Research the frozen local corpus. Return only a JSON array with key,value,source,contradictions. Use the newest memo for each component. Cite its exact source ID and list superseded source IDs in contradictions. Include every component, with no unsupported claims.',
    document: facts.flatMap(fact => [{ source: fact.supersedes[0], date: '2025-01-01', key: fact.key, value: 'obsolete-' + index }, { source: fact.source, date: '2025-02-01', key: fact.key, value: fact.value }]).reverse().map(item => JSON.stringify(item)).join('\n'),
    oracle: { domain, facts } };
}

