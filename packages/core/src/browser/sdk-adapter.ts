/**
 * Browser SDK adapter — lazy-loads @hasna/browser and manages a default session.
 *
 * All actions go through a single lazy session. The session is created on first use
 * and reused across calls. Functions accept plain args (no Page objects) so the
 * tool layer stays decoupled from Playwright internals.
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
    _lib = await dynamicImport('@hasna/browser');
  }
  return _lib;
}

/** Lazy default session — created once, reused. */
let _session: { session: any; page: any } | null = null;
async function page(): Promise<any> {
  if (!_session) {
    const sdk = await lib();
    _session = await sdk.createSession({ headless: true });
  }
  if (!_session) throw new Error('browser session failed to initialize');
  return _session.page;
}

export async function browserNavigate(url: string): Promise<any> {
  try {
    const [sdk, p] = [await lib(), await page()];
    await sdk.navigate(p, url);
    return { url, status: 'navigated' };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function browserScreenshot(path?: string): Promise<any> {
  try {
    const [sdk, p] = [await lib(), await page()];
    return await sdk.takeScreenshot(p, path ? { path } : undefined);
  } catch (e: any) {
    return null;
  }
}

export async function browserClick(selector: string): Promise<any> {
  try {
    const [sdk, p] = [await lib(), await page()];
    return await sdk.click(p, selector);
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function browserType(selector: string, text: string): Promise<any> {
  try {
    const [sdk, p] = [await lib(), await page()];
    return await sdk.type(p, selector, text);
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function browserExtract(opts?: any): Promise<any> {
  try {
    const [sdk, p] = [await lib(), await page()];
    return await sdk.extract(p, typeof opts === 'string' ? { selector: opts } : opts);
  } catch (e: any) {
    return null;
  }
}

export async function browserGetText(selector?: string): Promise<any> {
  try {
    const [sdk, p] = [await lib(), await page()];
    return await sdk.getText(p, selector);
  } catch (e: any) {
    return null;
  }
}

export async function browserSnapshot(): Promise<any> {
  try {
    const [sdk, p] = [await lib(), await page()];
    return await sdk.getAriaSnapshot(p);
  } catch (e: any) {
    return null;
  }
}
