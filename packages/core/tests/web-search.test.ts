import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { WebSearchTool } from '../src/tools/web';

describe('WebSearchTool', () => {
  let originalFetch: typeof fetch;
  let originalExaKey: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalExaKey = process.env.EXA_API_KEY;
    // Ensure Exa is not configured by default so DDG path is tested
    delete process.env.EXA_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalExaKey !== undefined) {
      process.env.EXA_API_KEY = originalExaKey;
    } else {
      delete process.env.EXA_API_KEY;
    }
  });

  test('parses DuckDuckGo HTML results', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      const html = `
        <a class="result__a" href="https://example.com">Example Result</a>
        <a class="result__snippet">Example snippet</a>
      `;
      return new Response(html, { status: 200 });
    }) as typeof fetch;

    const output = await WebSearchTool.executor({ query: 'example', max_results: 3 });
    expect(calls).toBe(1);
    expect(output).toContain('Example Result');
    expect(output).toContain('https://example.com');
    expect(output).toContain('Example snippet');
  });

  test('falls back to Instant Answer API when HTML is blocked', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) {
        const html = `<form id="challenge-form">anomaly.js</form>`;
        return new Response(html, { status: 200 });
      }
      const json = JSON.stringify({
        Heading: 'OpenAI',
        AbstractText: 'OpenAI is an AI research organization.',
        AbstractURL: 'https://openai.com',
        Results: [
          { Text: 'OpenAI homepage', FirstURL: 'https://openai.com/' },
        ],
      });
      return new Response(json, { status: 200 });
    }) as typeof fetch;

    const output = await WebSearchTool.executor({ query: 'openai', max_results: 2 });
    expect(calls).toBe(2);
    expect(output).toContain('OpenAI');
    expect(output).toContain('https://openai.com');
  });

  test('detects CAPTCHA challenge with "bots use DuckDuckGo" text', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) {
        // Real DDG CAPTCHA page content
        const html = `<h1>DuckDuckGo</h1><p>Unfortunately, bots use DuckDuckGo too.</p><p>Select all squares containing a duck:</p>`;
        return new Response(html, { status: 200 });
      }
      // Instant Answer API returns nothing useful for generic queries
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    const output = await WebSearchTool.executor({ query: 'typescript tutorial', max_results: 5 });
    expect(calls).toBe(2);
    // Should show the bot-blocked message with EXA_API_KEY guidance
    expect(output).toContain('bot protection');
    expect(output).toContain('EXA_API_KEY');
  });

  test('uses Exa API when EXA_API_KEY is set', async () => {
    process.env.EXA_API_KEY = 'test-exa-key';
    let calls = 0;
    let lastUrl = '';
    let lastHeaders: Record<string, string> = {};

    globalThis.fetch = (async (input: string | URL | Request) => {
      calls += 1;
      lastUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      // Capture headers from the init argument — not available via this mock signature,
      // but we can verify the URL is the Exa endpoint
      const json = JSON.stringify({
        results: [
          { title: 'TypeScript Docs', url: 'https://typescriptlang.org', text: 'Official TypeScript documentation' },
          { title: 'TS Tutorial', url: 'https://example.com/ts', text: 'Learn TypeScript step by step' },
        ],
      });
      return new Response(json, { status: 200 });
    }) as typeof fetch;

    const output = await WebSearchTool.executor({ query: 'typescript tutorial', max_results: 5 });
    expect(calls).toBe(1);
    expect(lastUrl).toBe('https://api.exa.ai/search');
    expect(output).toContain('TypeScript Docs');
    expect(output).toContain('https://typescriptlang.org');
    expect(output).toContain('Official TypeScript documentation');
  });

  test('falls back to DDG when Exa API returns error', async () => {
    process.env.EXA_API_KEY = 'test-exa-key';
    let calls = 0;

    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) {
        // Exa API fails
        return new Response('Unauthorized', { status: 401 });
      }
      // DDG returns results
      const html = `
        <a class="result__a" href="https://example.com">Fallback Result</a>
        <a class="result__snippet">DDG fallback snippet</a>
      `;
      return new Response(html, { status: 200 });
    }) as typeof fetch;

    const output = await WebSearchTool.executor({ query: 'test query', max_results: 3 });
    expect(calls).toBe(2);
    expect(output).toContain('Fallback Result');
  });

  test('returns actionable message when no results and no API key', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) {
        // DDG returns empty HTML (no results, no challenge)
        return new Response('<html><body></body></html>', { status: 200 });
      }
      // Instant Answer returns empty
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    const output = await WebSearchTool.executor({ query: 'obscure query xyz', max_results: 5 });
    expect(output).toContain('No results found');
    expect(output).toContain('EXA_API_KEY');
  });
});
