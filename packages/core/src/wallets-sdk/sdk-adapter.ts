/**
 * Wallets SDK adapter — lazy loader for @hasna/wallets
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/wallets' as any);
  return _lib;
}

export async function getBalance(args?: any): Promise<any> {
  try {
    return await (await lib()).getBalance(args);
  } catch {
    return null;
  }
}

export async function listCards(args?: any): Promise<any> {
  try {
    return await (await lib()).listCards(args);
  } catch {
    return [];
  }
}

export async function createCard(args?: any): Promise<any> {
  try {
    return await (await lib()).createCard(args);
  } catch {
    return null;
  }
}

export async function getCardDetails(args?: any): Promise<any> {
  try {
    return await (await lib()).getCardDetails(args);
  } catch {
    return null;
  }
}

export async function closeCard(args?: any): Promise<any> {
  try {
    return await (await lib()).closeCard(args);
  } catch {
    return null;
  }
}

export async function listTransactions(args?: any): Promise<any> {
  try {
    return await (await lib()).listTransactions(args);
  } catch {
    return [];
  }
}
