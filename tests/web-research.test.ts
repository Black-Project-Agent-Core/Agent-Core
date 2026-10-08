import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebResearchService } from '../src/web-research/service.js';

const base = (overrides: Partial<ConstructorParameters<typeof WebResearchService>[0]> = {}) => ({
  enabled: true,
  exaApiKey: null,
  parallelApiKey: null,
  jinaApiKey: null,
  firecrawlApiKey: null,
  openAlexApiKey: null,
  pexelsApiKey: null,
  unsplashAccessKey: null,
  browserbaseApiKey: null,
  apifyToken: null,
  langfusePublicKey: null,
  langfuseSecretKey: null,
  langfuseBaseUrl: null,
  timeoutMs: 5_000,
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebResearchService', () => {
  it('reports degraded search health without keys while keeping keyless Jina Reader available', () => {
    const service = new WebResearchService(base());
    expect(service.health()).toEqual({
      status: 'degraded',
      searchConfigured: false,
      readerConfigured: true,
      academicConfigured: false,
      assetConfigured: false,
      difficultWebCredentialsPresent: false,
      observabilityCredentialsPresent: false,
      searchProviders: [],
      academicProviders: [],
      assetProviders: [],
      openProviders: ['jina'],
      issue: 'WEB_RESEARCH_SEARCH_KEY_MISSING',
    });
  });
  it('uses Exa first, forwards bounded filters, and never exposes the search key', async () => {
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.exa.ai/search');
      expect((init?.headers as Record<string, string>)['x-api-key']).toBe('fixture-exa-secret');
      const body = JSON.parse(String(init?.body));
      expect(body.query).toBe('agent research');
      expect(body.numResults).toBe(3);
      expect(body.includeDomains).toEqual(['example.com']);
      expect(typeof body.startPublishedDate).toBe('string');
      return new Response(JSON.stringify({
        results: [{
          title: 'Example Result',
          url: 'https://example.com/article',
          highlights: ['Useful current source'],
          publishedDate: '2026-10-01',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new WebResearchService(base({
      exaApiKey: 'fixture-exa-secret',
      jinaApiKey: 'fixture-jina-secret',
    }));
    const result = await service.search({
      query: 'agent research',
      limit: 3,
      domains: ['example.com'],
      recencyDays: 7,
    });
    expect(result.provider).toBe('exa');
    expect(result.results[0]).toEqual(expect.objectContaining({
      title: 'Example Result',
      url: 'https://example.com/article',
      snippet: 'Useful current source',
    }));
    expect(JSON.stringify(result)).not.toContain('fixture-exa-secret');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('falls back from Exa failure to Parallel search without leaking either credential', async () => {
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
      if (String(url).includes('api.exa.ai')) {
        return new Response('unavailable', { status: 503 });
      }
      expect(String(url)).toBe('https://api.parallel.ai/v1/search');
      expect((init?.headers as Record<string, string>)['x-api-key']).toBe('fixture-parallel-secret');
      return new Response(JSON.stringify({
        results: [{
          title: 'Parallel Result',
          url: 'https://example.org/current',
          excerpts: ['Parallel excerpt'],
          publish_date: '2026-10-02',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new WebResearchService(base({
      exaApiKey: 'fixture-exa-secret',
      parallelApiKey: 'fixture-parallel-secret',
    }));
    const result = await service.search({ query: 'current agent news' });
    expect(result.provider).toBe('parallel');
    expect(result.results[0]?.snippet).toBe('Parallel excerpt');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('fixture-exa-secret');
    expect(serialized).not.toContain('fixture-parallel-secret');
  });
  it('uses Browserbase as a final web-search fallback without exposing the API key', async () => {
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.browserbase.com/v1/search');
      expect((init?.headers as Record<string, string>)['x-bb-api-key'])
        .toBe('fixture-browserbase-secret');
      return new Response(JSON.stringify({
        requestId: 'request-1',
        results: [{
          title: 'Browserbase Result',
          url: 'https://example.net/research',
          description: 'Difficult-web fallback result',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new WebResearchService(base({
      browserbaseApiKey: 'fixture-browserbase-secret',
    }));
    const result = await service.search({ query: 'difficult web source' });
    expect(result.provider).toBe('browserbase');
    expect(result.results[0]?.snippet).toBe('Difficult-web fallback result');
    expect(JSON.stringify(result)).not.toContain('fixture-browserbase-secret');
  });

  it('searches OpenAlex in academic mode without exposing the API key', async () => {
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
      expect(String(url)).toContain('https://api.openalex.org/works?');
      expect(String(url)).toContain('search=agent');
      expect((init?.headers as Record<string, string>).authorization)
        .toBe('Bearer fixture-openalex');
      return new Response(JSON.stringify({
        results: [{
          id: 'https://openalex.org/W123',
          title: 'Agent Research Paper',
          doi: 'https://doi.org/10.1234/example',
          publication_date: '2026-10-01',
          cited_by_count: 12,
          primary_location: { source: { display_name: 'Example Journal' } },
          authorships: [{ author: { display_name: 'Ada Example' } }],
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new WebResearchService(base({ openAlexApiKey: 'fixture-openalex' }));
    const result = await service.search({ query: 'agent', mode: 'academic', limit: 1 });
    expect(result.mode).toBe('academic');
    expect(result.provider).toBe('openalex');
    expect(result.results[0]).toEqual(expect.objectContaining({
      kind: 'academic',
      title: 'Agent Research Paper',
      author: 'Ada Example',
    }));
    expect(JSON.stringify(result)).not.toContain('fixture-openalex');
  });

  it('searches Pexels in assets mode and returns source plus direct image metadata', async () => {
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
      expect(String(url)).toContain('https://api.pexels.com/v1/search?');
      expect((init?.headers as Record<string, string>).authorization).toBe('fixture-pexels');
      return new Response(JSON.stringify({
        photos: [{
          id: 42,
          url: 'https://www.pexels.com/photo/example-42/',
          photographer: 'Photo Maker',
          alt: 'Mountain road',
          src: {
            large2x: 'https://images.pexels.com/photos/42/pexels-photo-42.jpeg',
            medium: 'https://images.pexels.com/photos/42/pexels-photo-42-medium.jpeg',
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new WebResearchService(base({ pexelsApiKey: 'fixture-pexels' }));
    const result = await service.search({ query: 'mountain road', mode: 'assets', limit: 1 });
    expect(result.mode).toBe('assets');
    expect(result.provider).toBe('pexels');
    expect(result.results[0]).toEqual(expect.objectContaining({
      kind: 'asset',
      title: 'Mountain road',
      author: 'Photo Maker',
      imageUrl: 'https://images.pexels.com/photos/42/pexels-photo-42.jpeg',
    }));
    expect(JSON.stringify(result)).not.toContain('fixture-pexels');
  });

  it('opens a public URL through keyless Jina Reader', async () => {
    const fetchMock = vi.fn(async (url: URL | string) => {
      expect(String(url)).toContain('https://r.jina.ai/https://example.com/article');
      return new Response(JSON.stringify({
        data: {
          title: 'Example Article',
          url: 'https://example.com/article',
          content: 'Readable article body',
          publishedTime: '2026-10-01',
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new WebResearchService(base());
    const result = await service.open({ url: 'https://example.com/article' });
    expect(result).toEqual({
      provider: 'jina',
      url: 'https://example.com/article',
      title: 'Example Article',
      content: 'Readable article body',
      publishedAt: '2026-10-01',
    });
  });
  it('falls back from Jina Reader to Firecrawl scrape when configured', async () => {
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
      if (String(url).startsWith('https://r.jina.ai/')) {
        return new Response('rate limited', { status: 429 });
      }
      expect(String(url)).toBe('https://api.firecrawl.dev/v2/scrape');
      expect((init?.headers as Record<string, string>).authorization)
        .toBe('Bearer fixture-firecrawl-secret');
      return new Response(JSON.stringify({
        success: true,
        data: {
          markdown: '# Fallback\nUseful body',
          metadata: { title: 'Fallback Page', sourceURL: 'https://example.com/page' },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new WebResearchService(base({
      firecrawlApiKey: 'fixture-firecrawl-secret',
    }));
    const result = await service.open({ url: 'https://example.com/page' });
    expect(result.provider).toBe('firecrawl');
    expect(result.content).toContain('Useful body');
    expect(JSON.stringify(result)).not.toContain('fixture-firecrawl-secret');
  });
  it('falls back to Browserbase fetch after earlier readers fail', async () => {
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
      if (String(url).startsWith('https://r.jina.ai/')) {
        return new Response('rate limited', { status: 429 });
      }
      expect(String(url)).toBe('https://api.browserbase.com/v1/fetch');
      expect((init?.headers as Record<string, string>)['x-bb-api-key'])
        .toBe('fixture-browserbase-secret');
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        url: 'https://example.com/difficult',
        allowRedirects: true,
        proxies: true,
      });
      return new Response(JSON.stringify({
        id: 'fetch-1',
        statusCode: 200,
        contentType: 'text/html',
        encoding: 'utf-8',
        content: '<main>Difficult page body</main>',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new WebResearchService(base({
      browserbaseApiKey: 'fixture-browserbase-secret',
    }));
    const result = await service.open({ url: 'https://example.com/difficult' });
    expect(result.provider).toBe('browserbase');
    expect(result.content).toContain('Difficult page body');
    expect(JSON.stringify(result)).not.toContain('fixture-browserbase-secret');
  });

  it('refuses loopback/private literal targets before sending them to remote extractors', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = new WebResearchService(base({ jinaApiKey: 'fixture-jina' }));
    await expect(service.open({ url: 'http://127.0.0.1:8765/health' }))
      .rejects.toThrow('WEB_RESEARCH_URL_INVALID');
    await expect(service.open({ url: 'http://10.0.0.1/private' }))
      .rejects.toThrow('WEB_RESEARCH_URL_INVALID');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses search when no search-provider credential is configured', async () => {
    const service = new WebResearchService(base());
    await expect(service.search({ query: 'anything' }))
      .rejects.toThrow('WEB_RESEARCH_WEB_NOT_CONFIGURED');
  });
});
