import { buildSemanticDocument } from './semantic-document.js';
import { lexicalRetrievalTokens } from './identifier-tokenizer.js';
import type { MemoryRecord } from './types.js';

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','by','did','do','does','for','from','had','has','have','how',
  'i','in','is','it','of','on','or','that','the','their','then','there','to','was','were','what',
  'when','where','which','who','why','with','you','your',
  'yang','dan','atau','untuk','dari','dengan','pada','dalam','adalah','ini','itu','ke','di',
  'sebagai','agar','jika','karena','tidak','akan','sudah','juga','lebih','bisa','dapat','oleh',
]);

export interface Bm25Profile {
  scores: Map<string, number>;
  meaningfulQueryTokens: number;
  weight: number;
}

function meaningfulTokens(value: string, kind:'query'|'document'='document'): string[] {
  return lexicalRetrievalTokens(value,kind).tokens.filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function buildBm25Profile(records: MemoryRecord[], query: string): Bm25Profile {
  const queryTokens = [...new Set(meaningfulTokens(query,'query'))];
  const weight = queryTokens.length > 0 && queryTokens.length <= 2 ? 0.9 : queryTokens.length ? 0.45 : 0;
  if (!records.length || !queryTokens.length) {
    return { scores: new Map(), meaningfulQueryTokens: queryTokens.length, weight };
  }

  const docs = records.map((record) => meaningfulTokens(buildSemanticDocument(record)));
  const avgdl = docs.reduce((sum, tokens) => sum + tokens.length, 0) / docs.length;
  const k1 = 1.2;
  const b = 0.75;

  const documentFrequency = new Map<string, number>();
  for (const term of queryTokens) {
    let count = 0;
    for (const tokens of docs) {
      if (tokens.includes(term)) count += 1;
    }
    documentFrequency.set(term, count);
  }

  const raw = new Map<string, number>();
  records.forEach((record, index) => {
    const tokens = docs[index];
    const frequencies = new Map<string, number>();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);

    let score = 0;
    for (const term of queryTokens) {
      const frequency = frequencies.get(term) ?? 0;
      if (!frequency) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + ((records.length - df + 0.5) / (df + 0.5)));
      const lengthNorm = avgdl > 0 ? (1 - b) + b * (tokens.length / avgdl) : 1;
      score += idf * ((frequency * (k1 + 1)) / (frequency + k1 * lengthNorm));
    }
    raw.set(record.id, score);
  });

  const maxScore = Math.max(0, ...raw.values());
  const scores = new Map<string, number>();
  for (const [id, score] of raw) scores.set(id, maxScore > 0 ? score / maxScore : 0);
  return { scores, meaningfulQueryTokens: queryTokens.length, weight };
}
