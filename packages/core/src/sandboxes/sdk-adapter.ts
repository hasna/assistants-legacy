/**
 * Sandboxes SDK adapter — lazy loader for @hasna/sandboxes
 *
 * Exposes: create, exec, list, delete
 * Uses db/ functions for CRUD and providers/ for runtime operations.
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/sandboxes');
  return _lib;
}

export async function createSandbox(input: { image?: string; timeout?: number; provider?: string; project_id?: string }): Promise<any> {
  try {
    const mod = await lib();
    // Create DB record first
    const sandbox = mod.createSandbox({ image: input.image, timeout: input.timeout, provider: input.provider ?? 'local', project_id: input.project_id });
    // Start via provider
    const provider = mod.getProvider(sandbox.provider);
    const providerSandbox = await provider.create({ image: input.image, timeout: input.timeout });
    mod.updateSandbox(sandbox.id, { provider_sandbox_id: providerSandbox.id, status: 'running' });
    return { ...sandbox, provider_sandbox_id: providerSandbox.id, status: 'running' };
  } catch {
    return null;
  }
}

export async function execCommand(sandboxId: string, command: string): Promise<string | null> {
  try {
    const mod = await lib();
    const sandbox = mod.getSandbox(sandboxId);
    const provider = mod.getProvider(sandbox.provider);
    const result = await provider.exec(sandbox.provider_sandbox_id ?? sandboxId, command);
    return typeof result === 'string' ? result : JSON.stringify(result);
  } catch {
    return null;
  }
}

export async function listSandboxes(opts?: { status?: string; provider?: string; project_id?: string }): Promise<any[]> {
  try {
    return (await lib()).listSandboxes(opts) ?? [];
  } catch {
    return [];
  }
}

export async function deleteSandbox(sandboxId: string): Promise<void> {
  try {
    const mod = await lib();
    const sandbox = mod.getSandbox(sandboxId);
    // Stop in provider first, then remove DB record
    const provider = mod.getProvider(sandbox.provider);
    await provider.delete(sandbox.provider_sandbox_id ?? sandboxId).catch(() => {});
    mod.deleteSandbox(sandboxId);
  } catch {
    // silent — sandbox may already be gone
  }
}
