import { createHash } from 'crypto';
import type { GuardrailsConfig, GuardrailsPolicy, PolicyOverride } from './types';
import { DEFAULT_GUARDRAILS_CONFIG, DEFAULT_SYSTEM_POLICY } from './defaults';
import { getDatabase } from '../database';

/**
 * Guardrails storage location
 */
export type GuardrailsLocation = 'user' | 'project' | 'local';

/**
 * Information about a policy including its source
 */
export interface PolicyInfo {
  id: string;
  name: string;
  scope: string;
  enabled: boolean;
  location: GuardrailsLocation;
  filePath: string;
  policy: GuardrailsPolicy;
}

/**
 * Generate a unique ID for a policy
 */
function generatePolicyId(name: string, scope: string): string {
  const hash = createHash('sha256')
    .update(`${name}-${scope}-${Date.now()}`)
    .digest('hex')
    .slice(0, 8);
  return `policy-${scope}-${hash}`;
}

/**
 * Guardrails store - manages guardrails persistence using SQLite
 */
export class GuardrailsStore {
  constructor() {}

  /**
   * Load guardrails from all sources
   * Reads from SQLite tables and assembles a full GuardrailsConfig
   */
  loadAll(): GuardrailsConfig {
    const db = getDatabase();

    // Start with defaults
    const merged: GuardrailsConfig = {
      enabled: DEFAULT_GUARDRAILS_CONFIG.enabled,
      policies: [DEFAULT_SYSTEM_POLICY],
      overrides: [],
      defaultAction: DEFAULT_GUARDRAILS_CONFIG.defaultAction,
      logEvaluations: false,
      persist: false,
    };

    // Load enabled state from guardrails_config
    const enabledRow = db.prepare(
      `SELECT value FROM guardrails_config WHERE key = 'enabled'`
    ).get() as { value: string } | undefined;
    if (enabledRow) {
      merged.enabled = enabledRow.value === 'true';
    }

    // Load defaultAction from guardrails_config
    const defaultActionRow = db.prepare(
      `SELECT value FROM guardrails_config WHERE key = 'defaultAction'`
    ).get() as { value: string } | undefined;
    if (defaultActionRow) {
      merged.defaultAction = defaultActionRow.value as GuardrailsConfig['defaultAction'];
    }

    // Load logEvaluations from guardrails_config
    const logRow = db.prepare(
      `SELECT value FROM guardrails_config WHERE key = 'logEvaluations'`
    ).get() as { value: string } | undefined;
    if (logRow) {
      merged.logEvaluations = logRow.value === 'true';
    }

    // Load persist from guardrails_config
    const persistRow = db.prepare(
      `SELECT value FROM guardrails_config WHERE key = 'persist'`
    ).get() as { value: string } | undefined;
    if (persistRow) {
      merged.persist = persistRow.value === 'true';
    }

    // Load all policies
    const policyRows = db.prepare(
      `SELECT id, name, scope, enabled, policy_json, location FROM guardrails_policies ORDER BY rowid`
    ).all() as Array<{
      id: string;
      name: string | null;
      scope: string;
      enabled: number;
      policy_json: string;
      location: string;
    }>;

    for (const row of policyRows) {
      if (row.id === 'system-default') continue;

      try {
        const policy = JSON.parse(row.policy_json) as GuardrailsPolicy;
        policy.id = row.id;
        policy.enabled = row.enabled === 1;

        // Check if policy already exists by ID
        const existingIdx = merged.policies.findIndex((p) => p.id === policy.id);
        if (existingIdx >= 0) {
          merged.policies[existingIdx] = policy;
        } else {
          merged.policies.push(policy);
        }
      } catch {
        // Skip invalid policy JSON
      }
    }

    // Load overrides
    const overrideRows = db.prepare(
      `SELECT id, policy_id, rule_pattern, new_action, reason, approved_by, expires_at, scope FROM guardrails_overrides`
    ).all() as Array<{
      id: string;
      policy_id: string | null;
      rule_pattern: string | null;
      new_action: string;
      reason: string;
      approved_by: string | null;
      expires_at: string | null;
      scope: string;
    }>;

    merged.overrides = overrideRows.map((row) => ({
      id: row.id,
      policyId: row.policy_id || undefined,
      rulePattern: row.rule_pattern || undefined,
      newAction: row.new_action as PolicyOverride['newAction'],
      reason: row.reason,
      approvedBy: row.approved_by || undefined,
      expiresAt: row.expires_at || undefined,
      scope: row.scope as PolicyOverride['scope'],
    }));

    return merged;
  }

  /**
   * Add a policy
   */
  addPolicy(
    policy: GuardrailsPolicy,
    location: GuardrailsLocation = 'project'
  ): string {
    const db = getDatabase();
    const now = new Date().toISOString();

    if (!policy.id) {
      policy.id = generatePolicyId(policy.name || 'unnamed', policy.scope);
    }

    db.prepare(
      `INSERT OR REPLACE INTO guardrails_policies (id, name, scope, enabled, policy_json, location, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      policy.id,
      policy.name || null,
      policy.scope,
      policy.enabled ? 1 : 0,
      JSON.stringify(policy),
      location,
      now,
      now
    );

    return policy.id;
  }

  /**
   * Remove a policy by ID
   */
  removePolicy(policyId: string): boolean {
    const db = getDatabase();
    const result = db.prepare(
      `DELETE FROM guardrails_policies WHERE id = ?`
    ).run(policyId);
    return (result as { changes: number }).changes > 0;
  }

  /**
   * Enable or disable a policy by ID
   */
  setPolicyEnabled(policyId: string, enabled: boolean): boolean {
    const db = getDatabase();
    const now = new Date().toISOString();

    // Update the enabled column
    const result = db.prepare(
      `UPDATE guardrails_policies SET enabled = ?, updated_at = ? WHERE id = ?`
    ).run(enabled ? 1 : 0, now, policyId);

    if ((result as { changes: number }).changes === 0) {
      return false;
    }

    // Also update the policy_json to keep enabled in sync
    const row = db.prepare(
      `SELECT policy_json FROM guardrails_policies WHERE id = ?`
    ).get(policyId) as { policy_json: string } | undefined;
    if (row) {
      try {
        const policy = JSON.parse(row.policy_json) as GuardrailsPolicy;
        policy.enabled = enabled;
        db.prepare(
          `UPDATE guardrails_policies SET policy_json = ? WHERE id = ?`
        ).run(JSON.stringify(policy), policyId);
      } catch {
        // Ignore JSON parse errors
      }
    }

    return true;
  }

  /**
   * Get a policy by ID
   */
  getPolicy(policyId: string): PolicyInfo | null {
    const db = getDatabase();

    const row = db.prepare(
      `SELECT id, name, scope, enabled, policy_json, location FROM guardrails_policies WHERE id = ?`
    ).get(policyId) as {
      id: string;
      name: string | null;
      scope: string;
      enabled: number;
      policy_json: string;
      location: string;
    } | undefined;

    if (!row) {
      // Check if it's the system default
      if (policyId === 'system-default') {
        return {
          id: 'system-default',
          name: 'System Default Policy',
          scope: 'system',
          enabled: true,
          location: 'user',
          filePath: '',
          policy: DEFAULT_SYSTEM_POLICY,
        };
      }
      return null;
    }

    try {
      const policy = JSON.parse(row.policy_json) as GuardrailsPolicy;
      policy.id = row.id;
      policy.enabled = row.enabled === 1;

      return {
        id: row.id,
        name: row.name || 'Unnamed',
        scope: row.scope,
        enabled: row.enabled === 1,
        location: row.location as GuardrailsLocation,
        filePath: '',
        policy,
      };
    } catch {
      return null;
    }
  }

  /**
   * List all policies with metadata
   */
  listPolicies(): PolicyInfo[] {
    const db = getDatabase();
    const policies: PolicyInfo[] = [];
    const seenIds = new Set<string>();

    const rows = db.prepare(
      `SELECT id, name, scope, enabled, policy_json, location FROM guardrails_policies ORDER BY rowid`
    ).all() as Array<{
      id: string;
      name: string | null;
      scope: string;
      enabled: number;
      policy_json: string;
      location: string;
    }>;

    for (const row of rows) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);

      try {
        const policy = JSON.parse(row.policy_json) as GuardrailsPolicy;
        policy.id = row.id;
        policy.enabled = row.enabled === 1;

        policies.push({
          id: row.id,
          name: row.name || 'Unnamed',
          scope: row.scope,
          enabled: row.enabled === 1,
          location: row.location as GuardrailsLocation,
          filePath: '',
          policy,
        });
      } catch {
        // Skip invalid rows
      }
    }

    // Add system default if not overridden
    if (!seenIds.has('system-default')) {
      policies.unshift({
        id: 'system-default',
        name: 'System Default Policy',
        scope: 'system',
        enabled: true,
        location: 'user',
        filePath: '',
        policy: DEFAULT_SYSTEM_POLICY,
      });
    }

    return policies;
  }

  /**
   * Add an override
   */
  addOverride(
    override: PolicyOverride,
    _location: GuardrailsLocation = 'project'
  ): string {
    const db = getDatabase();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT OR REPLACE INTO guardrails_overrides (id, policy_id, rule_pattern, new_action, reason, approved_by, expires_at, scope, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      override.id,
      override.policyId || null,
      override.rulePattern || null,
      override.newAction,
      override.reason,
      override.approvedBy || null,
      override.expiresAt || null,
      override.scope,
      now
    );

    return override.id;
  }

  /**
   * Remove an override by ID
   */
  removeOverride(overrideId: string): boolean {
    const db = getDatabase();
    const result = db.prepare(
      `DELETE FROM guardrails_overrides WHERE id = ?`
    ).run(overrideId);
    return (result as { changes: number }).changes > 0;
  }

  /**
   * Set guardrails enabled state
   */
  setEnabled(enabled: boolean, _location: GuardrailsLocation = 'project'): void {
    const db = getDatabase();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT OR REPLACE INTO guardrails_config (key, value, updated_at) VALUES ('enabled', ?, ?)`
    ).run(enabled ? 'true' : 'false', now);
  }

  /**
   * Get enabled state
   */
  isEnabled(): boolean {
    const db = getDatabase();
    const row = db.prepare(
      `SELECT value FROM guardrails_config WHERE key = 'enabled'`
    ).get() as { value: string } | undefined;

    if (row) {
      return row.value === 'true';
    }

    return DEFAULT_GUARDRAILS_CONFIG.enabled;
  }

  /**
   * Save guardrails config to a specific location (used by tools.ts enable/disable)
   * In SQLite mode, this is handled by individual methods, but we keep the signature
   * for backwards compatibility with hooks_enable/disable tools that call store.save()
   */
  save(_location: GuardrailsLocation, config: GuardrailsConfig): void {
    const db = getDatabase();
    const now = new Date().toISOString();

    // Sync enabled state
    db.prepare(
      `INSERT OR REPLACE INTO guardrails_config (key, value, updated_at) VALUES ('enabled', ?, ?)`
    ).run(config.enabled ? 'true' : 'false', now);

    if (config.defaultAction) {
      db.prepare(
        `INSERT OR REPLACE INTO guardrails_config (key, value, updated_at) VALUES ('defaultAction', ?, ?)`
      ).run(config.defaultAction, now);
    }

    // Sync policies - upsert all
    for (const policy of config.policies) {
      if (!policy.id || policy.id === 'system-default') continue;
      db.prepare(
        `INSERT OR REPLACE INTO guardrails_policies (id, name, scope, enabled, policy_json, location, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        policy.id,
        policy.name || null,
        policy.scope,
        policy.enabled ? 1 : 0,
        JSON.stringify(policy),
        _location,
        now,
        now
      );
    }
  }
}
