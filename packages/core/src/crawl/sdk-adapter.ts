/**
 * Crawl SDK adapter — lazy loader for @hasna/crawl
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/crawl');
  return _lib;
}

export async function crawlUrl(args?: any): Promise<any> {
  try {
    return await (await lib()).crawlUrl(args);
  } catch {
    return null;
  }
}

export async function crawlSite(args?: any): Promise<any> {
  try {
    return await (await lib()).crawlSite(args);
  } catch {
    return null;
  }
}

export async function mapSite(args?: any): Promise<any> {
  try {
    return await (await lib()).mapSite(args);
  } catch {
    return null;
  }
}

export async function searchPages(args?: any): Promise<any> {
  try {
    return await (await lib()).searchPages(args);
  } catch {
    return [];
  }
}

export async function extractData(args?: any): Promise<any> {
  try {
    return await (await lib()).extractData(args);
  } catch {
    return null;
  }
}

export async function searchWeb(args?: any): Promise<any> {
  try {
    return await (await lib()).searchWeb(args);
  } catch {
    return [];
  }
}
