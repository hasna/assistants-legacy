/**
 * Crawl SDK adapter — lazy-loads @hasna/crawl.
 *
 * Thin wrappers that forward to the SDK's exported functions.
 * Each function handles errors locally so tool executors get safe returns.
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/crawl');
  return _lib;
}

export async function crawlUrl(url: string): Promise<any> {
  try {
    const sdk = await lib();
    // fetchPage does a single-page fetch+extract without needing a crawl ID
    return await sdk.fetchPage(url);
  } catch (e: any) {
    return null;
  }
}

export async function crawlSite(url: string, maxPages?: number): Promise<any> {
  try {
    const sdk = await lib();
    return await sdk.startCrawl({ url, maxPages: maxPages ?? 50 });
  } catch (e: any) {
    return null;
  }
}

export async function mapSite(url: string, opts?: { limit?: number; search?: string }): Promise<any> {
  try {
    const sdk = await lib();
    return await sdk.mapSite(url, opts);
  } catch (e: any) {
    return [];
  }
}

export async function searchPages(query: string): Promise<any> {
  try {
    const sdk = await lib();
    return await sdk.searchPages(query);
  } catch (e: any) {
    return [];
  }
}

export async function extractData(url: string, schema?: string): Promise<any> {
  try {
    const sdk = await lib();
    // Fetch the page first, then run AI extraction on its content
    const result = await sdk.fetchPage(url);
    if (!result?.content && !result?.text) return null;
    const text = result.text || result.content;
    const parsedSchema = schema ? JSON.parse(schema) : { summary: 'string', title: 'string' };
    return await sdk.extractWithAI(text, parsedSchema);
  } catch (e: any) {
    return null;
  }
}

export async function searchWeb(query: string, opts?: { limit?: number }): Promise<any> {
  try {
    const sdk = await lib();
    return await sdk.searchWeb(query, opts);
  } catch (e: any) {
    return [];
  }
}
