import { isIP } from 'node:net';
import { fetchWithPolicy } from '../net/outbound-request.js';
import { readResponseJsonBounded } from '../net/bounded-response.js';
import { assertCredentialBearingUrl } from '../net/endpoint-policy.js';
import { isPublicAddress } from '../net/public-address.js';
import { redactSensitiveString } from '../security/redaction.js';
import { readPublicDocument } from '../rdc/document-projection/public-url.js';
import { finalizePdfEvidence, type PdfEvidence } from '../rdc/tools/pdf/lib/evidence.js';

const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_CONTENT_CHARS = 80_000;
const CONTENT_TRUNCATION_NOTICE = '\n\n[Content truncated]';

export type WebSearchMode = 'web' | 'academic' | 'assets';
export type WebSearchProvider =
  | 'exa' | 'parallel' | 'firecrawl' | 'jina' | 'browserbase'
  | 'openalex' | 'pexels' | 'unsplash';
export type WebOpenProvider = 'native' | 'jina' | 'parallel' | 'firecrawl' | 'browserbase';
export type WebOpenReader = 'native' | 'external';
export type WebContentScope = 'full' | 'main';
type ExternalWebOpenProvider = Exclude<WebOpenProvider, 'native'>;

export interface WebResearchConfig {
  enabled: boolean;
  exaApiKey: string | null;
  parallelApiKey: string | null;
  jinaApiKey: string | null;
  firecrawlApiKey: string | null;
  openAlexApiKey: string | null;
  pexelsApiKey: string | null;
  unsplashAccessKey: string | null;
  browserbaseApiKey: string | null;
  apifyToken: string | null;
  langfusePublicKey: string | null;
  langfuseSecretKey: string | null;
  langfuseBaseUrl: string | null;
  timeoutMs: number;
}

export interface WebSearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  kind?: 'web' | 'academic' | 'asset';
  sourceId?: string;
  author?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
}

export interface WebSearchResponse {
  provider: WebSearchProvider;
  mode: WebSearchMode;
  query: string;
  results: WebSearchResult[];
}

export interface WebOpenResponse {
  provider: WebOpenProvider;
  url: string;
  title?: string;
  content: string;
  publishedAt?: string;
  truncated: boolean;
  returnedChars: number;
  pdfEvidence?: PdfEvidence;
  provenance: {
    kind: 'native-public' | 'provider-reported';
    untrusted: true;
    contentType?: string;
    converter?: string;
    downloadedBytes?: number;
    redirects?: number;
    contentSha256?: string;
    extractionScope?: WebContentScope;
    selectionReason?: string;
    retainedTextChars?: number;
    droppedTextChars?: number;
  };
}

export interface WebResearchHealth {
  status: 'available' | 'degraded' | 'disabled';
  searchConfigured: boolean;
  readerConfigured: boolean;
  nativeReaderAvailable: boolean;
  externalReaderConfigured: boolean;
  academicConfigured: boolean;
  assetConfigured: boolean;
  difficultWebCredentialsPresent: boolean;
  observabilityCredentialsPresent: boolean;
  searchProviders: WebSearchProvider[];
  academicProviders: WebSearchProvider[];
  assetProviders: WebSearchProvider[];
  openProviders: WebOpenProvider[];
  issue?: string;
}

/**
 * Safe-prefix mechanism adapted from Qwen Code tool-hook-context.ts,
 * commit e9789d091133d9753decfc139df64c935a1866e6.
 * Copyright 2026 Qwen Team. SPDX-License-Identifier: Apache-2.0.
 * Modified for redacted web content and an explicit response envelope.
 * Does not repair malformed source Unicode or preserve grapheme clusters.
 */
function safePrefix(text: string, length: number): string {
  if (length <= 0) return '';
  if (length >= text.length) return text;
  const last = text.charCodeAt(length - 1);
  const end = last >= 0xd800 && last <= 0xdbff ? length - 1 : length;
  return text.slice(0, end);
}

function boundedContent(raw: string): Pick<WebOpenResponse, 'content' | 'truncated' | 'returnedChars'> {
  const redacted = redactSensitiveString(raw);
  const prefix = safePrefix(redacted, MAX_CONTENT_CHARS);
  const truncated = prefix.length < redacted.length;
  const content = truncated
    ? safePrefix(redacted, MAX_CONTENT_CHARS - CONTENT_TRUNCATION_NOTICE.length) + CONTENT_TRUNCATION_NOTICE
    : prefix;
  return { content, truncated, returnedChars: content.length };
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('WEB_RESEARCH_ABORTED');
}

function providerFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message === 'WEB_RESEARCH_OPEN_EMPTY') return 'EMPTY';
  if (/^(?:EXA|PARALLEL|FIRECRAWL|JINA|BROWSERBASE|OPENALEX|PEXELS|UNSPLASH)_[A-Z_]+_FAILED:\d{3}$/.test(message)) {
    return message;
  }
  return error instanceof SyntaxError ? 'INVALID_RESPONSE' : 'REQUEST_FAILED';
}

function clean(value: unknown, max = 2_000): string {
  return safePrefix(redactSensitiveString(String(value ?? ''))
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim(), max);
}

function normalizedHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
}

function normalizeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 4_000) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    const host = normalizedHost(url);
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null;
    const family = isIP(host);
    if (family && !isPublicAddress(host)) return null;
    if (!family && !host.includes('.')) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function normalizedDomains(values: string[] | undefined): string[] {
  return [...new Set((values ?? [])
    .map(value => value.trim().toLowerCase())
    .filter(value => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)))]
    .slice(0, 8);
}

function publishedValue(row: any): string {
  return clean(
    row?.publishedTime ?? row?.published_at ?? row?.publishedDate
      ?? row?.publish_date ?? row?.date ?? row?.timestamp ?? '',
    120,
  );
}

function snippetValue(row: any): string {
  const excerpts = Array.isArray(row?.excerpts) && row.excerpts.length
    ? row.excerpts.join(' ') : undefined;
  const highlights = Array.isArray(row?.highlights) && row.highlights.length
    ? row.highlights.join(' ') : undefined;
  return clean(
    row?.description ?? row?.snippet ?? excerpts ?? highlights
      ?? row?.content ?? row?.text ?? row?.markdown ?? '',
    4_000,
  );
}
function searchSource(payload: any, provider: WebSearchProvider): any[] {
  if (provider === 'firecrawl') {
    if (Array.isArray(payload?.data?.web)) return payload.data.web;
    if (Array.isArray(payload?.web)) return payload.web;
  }
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return Array.isArray(payload) ? payload : [];
}

function normalizedSearchRows(
  payload: any,
  provider: WebSearchProvider,
  limit: number,
): WebSearchResult[] {
  const output: WebSearchResult[] = [];
  for (const row of searchSource(payload, provider)) {
    if (!row || typeof row !== 'object') continue;
    const url = normalizeHttpUrl(row.url ?? row.link);
    if (!url) continue;
    const title = clean(row.title ?? row.name ?? url, 500) || url;
    const snippet = snippetValue(row);
    const publishedAt = publishedValue(row);
    output.push({
      id: 'web:' + String(output.length + 1),
      title,
      url,
      snippet,
      ...(publishedAt ? { publishedAt } : {}),
    });
    if (output.length >= limit) break;
  }
  return output;
}

function normalizedOpen(
  provider: ExternalWebOpenProvider,
  row: any,
  requestedUrl: string,
): WebOpenResponse {
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const content = typeof row?.content === 'string' ? row.content
    : typeof row?.full_content === 'string' ? row.full_content
      : typeof row?.markdown === 'string' ? row.markdown
        : typeof row?.text === 'string' ? row.text
          : typeof row === 'string' ? row : '';
  if (!content.trim()) throw new Error('WEB_RESEARCH_OPEN_EMPTY');
  const title = clean(row?.title ?? metadata.title ?? '', 500);
  const publishedAt = clean(
    row?.publishedTime ?? row?.published_at ?? row?.publish_date
      ?? metadata.publishedTime ?? metadata.published_at ?? '',
    120,
  );
  const finalUrl = normalizeHttpUrl(
    row?.url ?? metadata.sourceURL ?? metadata.url,
  ) ?? requestedUrl;
  return {
    provider,
    url: finalUrl,
    ...(title ? { title } : {}),
    ...boundedContent(content),
    ...(publishedAt ? { publishedAt } : {}),
    provenance: { kind: 'provider-reported', untrusted: true },
  };
}
export class WebResearchService {
  constructor(private readonly config: WebResearchConfig) {}

  private searchProviders(mode: WebSearchMode = 'web'): WebSearchProvider[] {
    const providers: WebSearchProvider[] = [];
    if (mode === 'academic') {
      if (this.config.openAlexApiKey) providers.push('openalex');
      return providers;
    }
    if (mode === 'assets') {
      if (this.config.pexelsApiKey) providers.push('pexels');
      if (this.config.unsplashAccessKey) providers.push('unsplash');
      return providers;
    }
    if (this.config.exaApiKey) providers.push('exa');
    if (this.config.parallelApiKey) providers.push('parallel');
    if (this.config.firecrawlApiKey) providers.push('firecrawl');
    if (this.config.jinaApiKey) providers.push('jina');
    if (this.config.browserbaseApiKey) providers.push('browserbase');
    return providers;
  }

  private externalOpenProviders(): ExternalWebOpenProvider[] {
    const providers: ExternalWebOpenProvider[] = ['jina'];
    if (this.config.parallelApiKey) providers.push('parallel');
    if (this.config.firecrawlApiKey) providers.push('firecrawl');
    if (this.config.browserbaseApiKey) providers.push('browserbase');
    return providers;
  }

  health(): WebResearchHealth {
    if (!this.config.enabled) {
      return {
        status: 'disabled',
        searchConfigured: false,
        readerConfigured: false,
        nativeReaderAvailable: false,
        externalReaderConfigured: false,
        academicConfigured: false,
        assetConfigured: false,
        difficultWebCredentialsPresent: false,
        observabilityCredentialsPresent: false,
        searchProviders: [],
        academicProviders: [],
        assetProviders: [],
        openProviders: [],
      };
    }
    const searchProviders = this.searchProviders('web');
    const academicProviders = this.searchProviders('academic');
    const assetProviders = this.searchProviders('assets');
    return {
      status: searchProviders.length ? 'available' : 'degraded',
      searchConfigured: searchProviders.length > 0,
      readerConfigured: true,
      nativeReaderAvailable: true,
      externalReaderConfigured: this.externalOpenProviders().length > 0,
      academicConfigured: academicProviders.length > 0,
      assetConfigured: assetProviders.length > 0,
      difficultWebCredentialsPresent: Boolean(
        this.config.browserbaseApiKey || this.config.apifyToken
      ),
      observabilityCredentialsPresent: Boolean(
        this.config.langfusePublicKey
        && this.config.langfuseSecretKey
        && this.config.langfuseBaseUrl
      ),
      searchProviders,
      academicProviders,
      assetProviders,
      openProviders: ['native', ...this.externalOpenProviders()],
      ...(!searchProviders.length ? { issue: 'WEB_RESEARCH_SEARCH_KEY_MISSING' } : {}),
    };
  }

  private async requestJson(
    endpoint: string,
    label: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<any> {
    assertNotAborted(signal);
    const url = assertCredentialBearingUrl(endpoint, label);
    const response = await fetchWithPolicy(url, {
      ...init,
      ...(signal ? { signal } : {}),
    }, {
      safety: 'safe',
      maxAttempts: 2,
      timeoutMs: this.config.timeoutMs,
      maxTotalDelayMs: 2_000,
    });
    if (!response.ok) throw new Error(label + '_FAILED:' + response.status);
    const payload = await readResponseJsonBounded<any>(
      response, MAX_JSON_BYTES, label.toLowerCase().replace(/_/g, ' '),
    );
    assertNotAborted(signal);
    return payload;
  }
  private async searchProvider(
    provider: WebSearchProvider,
    query: string,
    limit: number,
    domains: string[],
    recencyDays: number | undefined,
    signal?: AbortSignal,
  ): Promise<WebSearchResult[]> {
    if (provider === 'openalex') {
      const endpoint = new URL('https://api.openalex.org/works');
      endpoint.searchParams.set('search', query);
      endpoint.searchParams.set('per-page', String(limit));
      if (recencyDays) {
        const from = new Date(Date.now() - recencyDays * 86_400_000)
          .toISOString().slice(0, 10);
        endpoint.searchParams.set('filter', 'from_publication_date:' + from);
      }
      const payload = await this.requestJson(endpoint.toString(), 'OPENALEX_SEARCH', {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: 'Bearer ' + this.config.openAlexApiKey!,
        },
      }, signal);
      return (Array.isArray(payload?.results) ? payload.results : [])
        .slice(0, limit)
        .flatMap((row: any, index: number) => {
          const url = normalizeHttpUrl(
            row?.doi ?? row?.primary_location?.landing_page_url ?? row?.id,
          );
          if (!url) return [];
          const authors = Array.isArray(row?.authorships)
            ? row.authorships.slice(0, 4)
              .map((item: any) => clean(item?.author?.display_name ?? '', 120))
              .filter(Boolean)
            : [];
          const publishedAt = clean(row?.publication_date ?? row?.publication_year ?? '', 120);
          const snippet = clean([
            authors.length ? 'Authors: ' + authors.join(', ') : '',
            row?.primary_location?.source?.display_name
              ? 'Source: ' + row.primary_location.source.display_name : '',
            Number.isFinite(row?.cited_by_count) ? 'Cited by: ' + row.cited_by_count : '',
          ].filter(Boolean).join(' | '), 4_000);
          return [{
            id: 'academic:' + String(index + 1),
            title: clean(row?.title ?? row?.display_name ?? url, 500) || url,
            url,
            snippet,
            kind: 'academic' as const,
            sourceId: clean(row?.id ?? '', 500) || undefined,
            ...(authors.length ? { author: authors.join(', ') } : {}),
            ...(publishedAt ? { publishedAt } : {}),
          }];
        });
    }

    if (provider === 'pexels') {
      const endpoint = new URL('https://api.pexels.com/v1/search');
      endpoint.searchParams.set('query', query);
      endpoint.searchParams.set('per_page', String(limit));
      const payload = await this.requestJson(endpoint.toString(), 'PEXELS_SEARCH', {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: this.config.pexelsApiKey!,
        },
      }, signal);
      return (Array.isArray(payload?.photos) ? payload.photos : [])
        .slice(0, limit)
        .flatMap((row: any, index: number) => {
          const url = normalizeHttpUrl(row?.url);
          const imageUrl = normalizeHttpUrl(
            row?.src?.large2x ?? row?.src?.large ?? row?.src?.original,
          );
          if (!url || !imageUrl) return [];
          const author = clean(row?.photographer ?? '', 200);
          return [{
            id: 'asset:' + String(index + 1),
            title: clean(row?.alt ?? ('Pexels photo by ' + (author || 'unknown')), 500),
            url,
            snippet: author ? 'Photo by ' + author + ' on Pexels' : 'Pexels photo',
            kind: 'asset' as const,
            sourceId: clean(row?.id ?? '', 200) || undefined,
            ...(author ? { author } : {}),
            imageUrl,
            ...(normalizeHttpUrl(row?.src?.medium) ? {
              thumbnailUrl: normalizeHttpUrl(row.src.medium)!,
            } : {}),
          }];
        });
    }

    if (provider === 'unsplash') {
      const endpoint = new URL('https://api.unsplash.com/search/photos');
      endpoint.searchParams.set('query', query);
      endpoint.searchParams.set('per_page', String(limit));
      const payload = await this.requestJson(endpoint.toString(), 'UNSPLASH_SEARCH', {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: 'Client-ID ' + this.config.unsplashAccessKey!,
        },
      }, signal);
      return (Array.isArray(payload?.results) ? payload.results : [])
        .slice(0, limit)
        .flatMap((row: any, index: number) => {
          const url = normalizeHttpUrl(row?.links?.html);
          const imageUrl = normalizeHttpUrl(row?.urls?.regular ?? row?.urls?.full);
          if (!url || !imageUrl) return [];
          const author = clean(row?.user?.name ?? row?.user?.username ?? '', 200);
          return [{
            id: 'asset:' + String(index + 1),
            title: clean(
              row?.description ?? row?.alt_description
                ?? ('Unsplash photo by ' + (author || 'unknown')),
              500,
            ),
            url,
            snippet: author ? 'Photo by ' + author + ' on Unsplash' : 'Unsplash photo',
            kind: 'asset' as const,
            sourceId: clean(row?.id ?? '', 200) || undefined,
            ...(author ? { author } : {}),
            imageUrl,
            ...(normalizeHttpUrl(row?.urls?.thumb) ? {
              thumbnailUrl: normalizeHttpUrl(row.urls.thumb)!,
            } : {}),
          }];
        });
    }

    if (provider === 'exa') {
      const startPublishedDate = recencyDays
        ? new Date(Date.now() - recencyDays * 86_400_000).toISOString()
        : undefined;
      const payload = await this.requestJson('https://api.exa.ai/search', 'EXA_SEARCH', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-api-key': this.config.exaApiKey!,
        },
        body: JSON.stringify({
          query,
          numResults: limit,
          ...(domains.length ? { includeDomains: domains } : {}),
          ...(startPublishedDate ? { startPublishedDate } : {}),
          contents: { highlights: true },
        }),
      }, signal);
      return normalizedSearchRows(payload, provider, limit);
    }

    if (provider === 'parallel') {
      const payload = await this.requestJson(
        'https://api.parallel.ai/v1/search',
        'PARALLEL_SEARCH',
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-api-key': this.config.parallelApiKey!,
          },
          body: JSON.stringify({
            search_queries: [query],
            mode: 'basic',
            max_chars_total: Math.max(4_000, Math.min(24_000, limit * 3_000)),
            ...(domains.length
              ? { objective: 'Prefer sources from: ' + domains.join(', ') }
              : {}),
          }),
        },
        signal,
      );
      return normalizedSearchRows(payload, provider, limit);
    }
    if (provider === 'firecrawl') {
      const tbs = recencyDays
        ? recencyDays <= 1 ? 'qdr:d'
          : recencyDays <= 7 ? 'qdr:w'
            : recencyDays <= 31 ? 'qdr:m' : undefined
        : undefined;
      const payload = await this.requestJson(
        'https://api.firecrawl.dev/v2/search',
        'FIRECRAWL_SEARCH',
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            authorization: 'Bearer ' + this.config.firecrawlApiKey!,
          },
          body: JSON.stringify({
            query,
            limit,
            sources: ['web'],
            ...(domains.length ? { includeDomains: domains } : {}),
            ...(tbs ? { tbs } : {}),
          }),
        },
        signal,
      );
      return normalizedSearchRows(payload, provider, limit);
    }

    if (provider === 'browserbase') {
      const scopedQuery = domains.length
        ? query + ' (' + domains.map(domain => 'site:' + domain).join(' OR ') + ')'
        : query;
      const payload = await this.requestJson(
        'https://api.browserbase.com/v1/search',
        'BROWSERBASE_SEARCH',
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-bb-api-key': this.config.browserbaseApiKey!,
          },
          body: JSON.stringify({ query: scopedQuery, numResults: limit }),
        },
        signal,
      );
      return normalizedSearchRows(payload, provider, limit);
    }

    const scopedQuery = domains.length
      ? query + ' (' + domains.map(domain => 'site:' + domain).join(' OR ') + ')'
      : query;
    const endpoint = 'https://s.jina.ai/' + encodeURIComponent(scopedQuery);
    const payload = await this.requestJson(endpoint, 'JINA_SEARCH', {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer ' + this.config.jinaApiKey!,
      },
    }, signal);
    return normalizedSearchRows(payload, provider, limit);
  }

  async search(input: {
    query: string;
    mode?: WebSearchMode;
    limit?: number;
    domains?: string[];
    recencyDays?: number;
    signal?: AbortSignal;
  }): Promise<WebSearchResponse> {
    if (!this.config.enabled) throw new Error('WEB_RESEARCH_DISABLED');
    const query = input.query.trim();
    if (!query || query.length > 2_000) throw new Error('WEB_RESEARCH_QUERY_INVALID');
    const mode = input.mode ?? 'web';
    const providers = this.searchProviders(mode);
    if (!providers.length) {
      throw new Error('WEB_RESEARCH_' + mode.toUpperCase() + '_NOT_CONFIGURED');
    }
    const limit = Math.max(1, Math.min(10, input.limit ?? 5));
    const domains = mode === 'web' ? normalizedDomains(input.domains) : [];
    const recencyDays = input.recencyDays === undefined
      ? undefined : Math.max(1, Math.min(3650, Math.trunc(input.recencyDays)));
    let empty: WebSearchResponse | undefined;
    const failures: string[] = [];
    for (const provider of providers) {
      assertNotAborted(input.signal);
      try {
        const results = await this.searchProvider(
          provider, query, limit, domains, recencyDays, input.signal,
        );
        assertNotAborted(input.signal);
        const response: WebSearchResponse = { provider, mode, query, results };
        if (results.length) return response;
        empty ??= response;
      } catch (error) {
        assertNotAborted(input.signal);
        failures.push(provider + ':' + providerFailure(error));
      }
    }
    if (empty) return empty;
    throw new Error(
      'WEB_RESEARCH_' + mode.toUpperCase() + '_FAILED_ALL:'
      + failures.join('|').slice(0, 900),
    );
  }
  private async openJina(url: string, signal?: AbortSignal): Promise<WebOpenResponse> {
    const payload = await this.requestJson(
      'https://r.jina.ai/' + url,
      'JINA_READER',
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          ...(this.config.jinaApiKey
            ? { authorization: 'Bearer ' + this.config.jinaApiKey }
            : {}),
        },
      },
      signal,
    );
    const data = payload?.data && typeof payload.data === 'object'
      ? payload.data : payload;
    return normalizedOpen('jina', data, url);
  }

  private async openParallel(url: string, signal?: AbortSignal): Promise<WebOpenResponse> {
    const payload = await this.requestJson(
      'https://api.parallel.ai/v1/extract',
      'PARALLEL_EXTRACT',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-api-key': this.config.parallelApiKey!,
        },
        body: JSON.stringify({
          urls: [url],
          max_chars_total: MAX_CONTENT_CHARS,
        }),
      },
      signal,
    );
    const row = Array.isArray(payload?.results) ? payload.results[0]
      : Array.isArray(payload?.data?.results) ? payload.data.results[0]
        : payload?.result ?? payload?.data;
    return normalizedOpen('parallel', row, url);
  }

  private async openFirecrawl(url: string, signal?: AbortSignal): Promise<WebOpenResponse> {
    const payload = await this.requestJson(
      'https://api.firecrawl.dev/v2/scrape',
      'FIRECRAWL_SCRAPE',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: 'Bearer ' + this.config.firecrawlApiKey!,
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent: true,
        }),
      },
      signal,
    );
    return normalizedOpen('firecrawl', payload?.data ?? payload, url);
  }

  private async openBrowserbase(url: string, signal?: AbortSignal): Promise<WebOpenResponse> {
    const payload = await this.requestJson(
      'https://api.browserbase.com/v1/fetch',
      'BROWSERBASE_FETCH',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-bb-api-key': this.config.browserbaseApiKey!,
        },
        body: JSON.stringify({
          url,
          allowRedirects: true,
          proxies: true,
        }),
      },
      signal,
    );
    return normalizedOpen('browserbase', payload, url);
  }

  async open(input: {
    url: string;
    reader?: WebOpenReader;
    contentScope?: WebContentScope;
    pdfPages?: { start: number; count: number };
    signal?: AbortSignal;
  }): Promise<WebOpenResponse> {
    if (!this.config.enabled) throw new Error('WEB_RESEARCH_DISABLED');
    const reader = input.reader ?? 'native';
    if (reader !== 'native' && reader !== 'external') {
      throw new Error('WEB_RESEARCH_READER_INVALID');
    }
    if (input.contentScope !== undefined && input.contentScope !== 'full' && input.contentScope !== 'main') {
      throw new Error('WEB_RESEARCH_CONTENT_SCOPE_INVALID');
    }
    if (input.pdfPages !== undefined) {
      if (!input.pdfPages || !Number.isSafeInteger(input.pdfPages.start) || input.pdfPages.start < 1
        || !Number.isSafeInteger(input.pdfPages.count) || input.pdfPages.count < 1 || input.pdfPages.count > 8) {
        throw new Error('WEB_RESEARCH_PDF_SELECTION_INVALID');
      }
      if (reader !== 'native') throw new Error('WEB_RESEARCH_PDF_SELECTION_UNSUPPORTED');
    }
    if (reader === 'external' && input.contentScope !== undefined) {
      throw new Error('WEB_RESEARCH_CONTENT_SCOPE_UNSUPPORTED');
    }

    // Admit the original spelling in the native transport. Normalizing it here
    // would hide ambiguous numeric hosts. Native failures never enter the cloud chain.
    if (reader === 'native') {
      const result = await readPublicDocument(input.url, {
        projection: 'markdown',
        contentScope: input.contentScope ?? 'full',
        pdfPages: input.pdfPages,
        signal: input.signal,
      });
      assertNotAborted(input.signal);
      if (typeof result.content !== 'string' || result.metadata?.isImage || result.metadata?.isBinary) {
        throw new Error('WEB_RESEARCH_OPEN_UNSUPPORTED');
      }
      if (result.metadata?.error) throw new Error('WEB_RESEARCH_OPEN_FAILED');
      if (!result.content.trim()) throw new Error('WEB_RESEARCH_OPEN_EMPTY');
      const source = result.metadata?.publicUrl;
      if (!source?.finalUrl || (input.contentScope === 'main' && (!source.extractionScope || !source.selectionReason))) {
        throw new Error('WEB_RESEARCH_OPEN_METADATA_MISSING');
      }
      const title = clean(result.metadata?.title ?? '', 500);
      const content = boundedContent(result.content);
      const pdfEvidence = result.metadata?.pdfEvidence
        ? finalizePdfEvidence(result.metadata.pdfEvidence, { outputTruncated: content.truncated }) : undefined;
      return {
        provider: 'native',
        url: source.finalUrl,
        ...(title ? { title } : {}),
        ...content,
        ...(pdfEvidence ? { pdfEvidence } : {}),
        provenance: {
          kind: 'native-public',
          untrusted: true,
          ...(source.contentType !== undefined ? { contentType: source.contentType } : {}),
          ...(result.metadata?.converter !== undefined ? { converter: result.metadata.converter } : {}),
          downloadedBytes: source.downloadedBytes,
          redirects: source.redirects,
          ...(source.contentSha256 !== undefined ? { contentSha256: source.contentSha256 } : {}),
          ...(source.extractionScope !== undefined ? { extractionScope: source.extractionScope } : {}),
          ...(source.selectionReason !== undefined ? { selectionReason: source.selectionReason } : {}),
          ...(source.retainedTextChars !== undefined ? { retainedTextChars: source.retainedTextChars } : {}),
          ...(source.droppedTextChars !== undefined ? { droppedTextChars: source.droppedTextChars } : {}),
        },
      };
    }

    const requestedUrl = normalizeHttpUrl(input.url);
    if (!requestedUrl) throw new Error('WEB_RESEARCH_URL_INVALID');
    const failures: string[] = [];
    for (const provider of this.externalOpenProviders()) {
      assertNotAborted(input.signal);
      try {
        const result = provider === 'jina'
          ? await this.openJina(requestedUrl, input.signal)
          : provider === 'parallel'
            ? await this.openParallel(requestedUrl, input.signal)
            : provider === 'firecrawl'
              ? await this.openFirecrawl(requestedUrl, input.signal)
              : await this.openBrowserbase(requestedUrl, input.signal);
        assertNotAborted(input.signal);
        return result;
      } catch (error) {
        assertNotAborted(input.signal);
        failures.push(provider + ':' + providerFailure(error));
      }
    }
    throw new Error('WEB_RESEARCH_OPEN_FAILED_ALL:' + failures.join('|').slice(0, 900));
  }
}
