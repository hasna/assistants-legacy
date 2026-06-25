/**
 * Wallet SDK adapter for an explicitly configured external wallet module.
 */

interface WalletSdkModule {
  getBalance?: () => Promise<unknown> | unknown;
  listCards?: () => Promise<unknown[]> | unknown[];
  listTransactions?: (limit: number) => Promise<unknown[]> | unknown[];
  createCard?: (options?: { label?: string }) => Promise<unknown> | unknown;
  getCardDetails?: (cardId: string) => Promise<unknown> | unknown;
  closeCard?: (cardId: string) => Promise<boolean> | boolean;
}

let _lib: WalletSdkModule | null | undefined;

async function lib(): Promise<WalletSdkModule | null> {
  if (_lib !== undefined) return _lib;

  const moduleName = process.env.ASSISTANTS_WALLET_MODULE?.trim();
  if (!moduleName) {
    _lib = null;
    return null;
  }

  try {
    _lib = await import(moduleName) as WalletSdkModule;
  } catch {
    _lib = null;
  }
  return _lib;
}

export async function getBalance(): Promise<any> {
  const m = await lib();
  if (!m?.getBalance) return null;
  try { return await m.getBalance(); } catch { return null; }
}

export async function listCards(): Promise<any[]> {
  const m = await lib();
  if (!m?.listCards) return [];
  try { return await m.listCards(); } catch { return []; }
}

export async function listTransactions(limit = 20): Promise<any[]> {
  const m = await lib();
  if (!m?.listTransactions) return [];
  try { return await m.listTransactions(limit); } catch { return []; }
}

export async function createCard(options?: { label?: string }): Promise<any> {
  const m = await lib();
  if (!m?.createCard) return null;
  try { return await m.createCard(options); } catch { return null; }
}

export async function getCardDetails(cardId: string): Promise<any> {
  const m = await lib();
  if (!m?.getCardDetails) return null;
  try { return await m.getCardDetails(cardId); } catch { return null; }
}

export async function closeCard(cardId: string): Promise<boolean> {
  const m = await lib();
  if (!m?.closeCard) return false;
  try { return await m.closeCard(cardId); } catch { return false; }
}
