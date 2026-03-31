/**
 * Wallet SDK Adapter — lazy-loading wrapper for @hasna/wallets.
 * Follows the same pattern as other sdk-adapter files.
 */

let _lib: any = null;

async function lib(): Promise<any> {
  if (!_lib) {
    try {
      _lib = await import('@hasna/wallets' as any);
    } catch {
      return null;
    }
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
