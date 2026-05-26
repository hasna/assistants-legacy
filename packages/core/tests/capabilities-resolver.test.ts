import { describe, test, expect } from 'bun:test';
import {
  resolveCapabilityChain,
  createCapabilityChain,
  extendCapabilityChain,
} from '../src/capabilities/resolver';
import type { CapabilityChain } from '../src/capabilities/types';

describe('createCapabilityChain', () => {
  test('wraps capabilities under the given scope', () => {
    const chain = createCapabilityChain('session', { enabled: false });
    expect(chain.session).toEqual({ enabled: false });
    expect(chain.system).toBeUndefined();
  });
});

describe('extendCapabilityChain', () => {
  test('adds a scope without dropping existing ones', () => {
    const base = createCapabilityChain('system', { enabled: true });
    const extended = extendCapabilityChain(base, 'instance', { enabled: false });
    expect(extended.system).toEqual({ enabled: true });
    expect(extended.instance).toEqual({ enabled: false });
  });

  test('overwrites the same scope', () => {
    const base = createCapabilityChain('session', { enabled: true });
    const extended = extendCapabilityChain(base, 'session', { enabled: false });
    expect(extended.session).toEqual({ enabled: false });
  });
});

describe('resolveCapabilityChain', () => {
  test('empty chain returns defaults with metadata', () => {
    const resolved = resolveCapabilityChain({});
    expect(resolved.enabled).toBe(true);
    expect(resolved.orchestration.level).toBe('standard');
    expect(resolved.sources).toEqual({});
    expect(typeof resolved.resolvedAt).toBe('string');
    expect(Number.isNaN(Date.parse(resolved.resolvedAt))).toBe(false);
  });

  test('disabling at any scope disables the result and records the source', () => {
    const chain: CapabilityChain = { session: { enabled: false } };
    const resolved = resolveCapabilityChain(chain);
    expect(resolved.enabled).toBe(false);
    expect(resolved.sources.enabled).toBe('session');
  });

  test('orchestration takes the most restrictive concurrency limit', () => {
    // base default standard = 5; a session caps it lower; an instance asks higher
    const chain: CapabilityChain = {
      session: { orchestration: { maxConcurrentSubassistants: 2 } as any },
      instance: { orchestration: { maxConcurrentSubassistants: 100 } as any },
    };
    const resolved = resolveCapabilityChain(chain);
    // Min of (default 5, 2, 100) -> 2; the higher instance request cannot raise it
    expect(resolved.orchestration.maxConcurrentSubassistants).toBe(2);
  });

  test('canCoordinateSwarms can only be granted if the base allows it', () => {
    // default standard has canCoordinateSwarms=false; an override cannot enable it
    const chain: CapabilityChain = {
      instance: { orchestration: { canCoordinateSwarms: true } as any },
    };
    const resolved = resolveCapabilityChain(chain);
    expect(resolved.orchestration.canCoordinateSwarms).toBe(false);
  });

  test('budget limits take the lower (more restrictive) value', () => {
    const chain: CapabilityChain = {
      organization: { budget: { limits: { maxTotalTokens: 100000 } } as any },
      session: { budget: { limits: { maxTotalTokens: 5000 } } as any },
    };
    const resolved = resolveCapabilityChain(chain);
    expect(resolved.budget.limits.maxTotalTokens).toBe(5000);
  });

  test('budget canOverrideBudget cannot be granted above the base default (false)', () => {
    const chain: CapabilityChain = {
      instance: { budget: { canOverrideBudget: true } as any },
    };
    const resolved = resolveCapabilityChain(chain);
    expect(resolved.budget.canOverrideBudget).toBe(false);
  });

  test('approval escalates to the most restrictive default level', () => {
    const chain: CapabilityChain = {
      session: { approval: { defaultLevel: 'require_explicit', requireApproval: ['bash'] } as any },
    };
    const resolved = resolveCapabilityChain(chain);
    expect(resolved.approval.defaultLevel).toBe('require_explicit');
    expect(resolved.approval.requireApproval).toContain('bash');
  });

  test('approval cannot de-escalate below a stricter scope', () => {
    const chain: CapabilityChain = {
      organization: { approval: { defaultLevel: 'require' } as any },
      // a lower-precedence instance asks for "none" — but merge keeps the stricter
      instance: { approval: { defaultLevel: 'none' } as any },
    };
    const resolved = resolveCapabilityChain(chain);
    expect(resolved.approval.defaultLevel).toBe('require');
  });

  test('overrides cannot grant new auto-approvals (restrictive-only)', () => {
    // The base default has autoApprove=[]; an override asking to auto-approve
    // tools must NOT be able to add them. requireApproval still accumulates.
    const chain: CapabilityChain = {
      organization: { approval: { autoApprove: ['read', 'write'] } as any },
      session: { approval: { requireApproval: ['write'] } as any },
    };
    const resolved = resolveCapabilityChain(chain);
    expect(resolved.approval.autoApprove).toEqual([]);
    expect(resolved.approval.requireApproval).toContain('write');
  });

  test('communication broadcast cannot be enabled above the base default (false)', () => {
    const chain: CapabilityChain = {
      instance: { communication: { canBroadcast: true } as any },
    };
    const resolved = resolveCapabilityChain(chain);
    expect(resolved.communication.canBroadcast).toBe(false);
  });

  test('memory scopes intersect to the narrower set', () => {
    // base default allows '*'; a scope narrows to ['project']
    const chain: CapabilityChain = {
      session: { memory: { allowedMemoryScopes: ['project'] } as any },
    };
    const resolved = resolveCapabilityChain(chain);
    expect(resolved.memory.allowedMemoryScopes).toEqual(['project']);
  });

  test('tool capabilities merge by pattern; higher-precedence scope wins', () => {
    // system (precedence 0) outranks instance (precedence 5) and is applied last.
    const chain: CapabilityChain = {
      instance: {
        tools: { policy: 'allow_list', capabilities: [{ pattern: 'bash', allowed: true }] } as any,
      },
      system: {
        tools: { policy: 'allow_list', capabilities: [{ pattern: 'bash', allowed: false }] } as any,
      },
    };
    const resolved = resolveCapabilityChain(chain);
    const bash = resolved.tools.capabilities.find((c) => c.pattern === 'bash');
    expect(bash?.allowed).toBe(false);
  });

  test('sources reflect which scope last touched each section', () => {
    const chain: CapabilityChain = {
      organization: { budget: { limits: { maxLlmCalls: 50 } } as any },
      session: { communication: { canSendMessages: false } as any },
    };
    const resolved = resolveCapabilityChain(chain);
    expect(resolved.sources.budget).toBe('organization');
    expect(resolved.sources.communication).toBe('session');
  });
});
