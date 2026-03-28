import React, { useEffect, useMemo, useState } from 'react';
import type { GuardrailsConfig, GuardrailsPolicy, PolicyAction, PolicyScope, ToolPolicyRule } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

interface PolicyInfo {
  id: string;
  name: string;
  scope: string;
  enabled: boolean;
  location: 'user' | 'project' | 'local' | 'system';
  policy: GuardrailsPolicy;
}

interface GuardrailsPanelProps {
  config: GuardrailsConfig;
  policies: PolicyInfo[];
  onToggleEnabled: (enabled: boolean) => void;
  onTogglePolicy: (policyId: string, enabled: boolean) => void;
  onSetPreset: (preset: 'permissive' | 'restrictive') => void;
  onAddPolicy: (policy: GuardrailsPolicy) => void;
  onRemovePolicy: (policyId: string) => void;
  onUpdatePolicy: (policyId: string, updates: Partial<GuardrailsPolicy>) => void;
  onCancel: () => void;
}

type Mode =
  | 'overview'
  | 'policies'
  | 'policy-detail'
  | 'policy-create'
  | 'tools'
  | 'rule-create'
  | 'delete-confirm'
  | 'preset-select';

const SCOPE_COLORS: Record<string, string> = {
  system: 'red',
  organization: 'magenta',
  project: 'yellow',
  session: 'green',
};

const ACTION_COLORS: Record<PolicyAction, string> = {
  allow: 'green',
  deny: 'red',
  require_approval: 'yellow',
  warn: 'cyan',
};

const SCOPES: PolicyScope[] = ['system', 'organization', 'project', 'session'];
const ACTIONS: PolicyAction[] = ['allow', 'deny', 'warn', 'require_approval'];

export function GuardrailsPanel({
  config,
  policies,
  onToggleEnabled,
  onTogglePolicy,
  onSetPreset,
  onAddPolicy,
  onRemovePolicy,
  onUpdatePolicy,
  onCancel,
}: GuardrailsPanelProps) {
  const [mode, setMode] = useState<Mode>('overview');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [detailPolicyId, setDetailPolicyId] = useState<string | null>(null);
  const [ruleIndex, setRuleIndex] = useState(0);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'policy' | 'rule'; id: string; label: string; ruleIdx?: number } | null>(null);

  // Create policy form state
  const [createName, setCreateName] = useState('');
  const [createScopeIdx, setCreateScopeIdx] = useState(2); // default: project
  const [createActionIdx, setCreateActionIdx] = useState(0); // default: allow
  const [createField, setCreateField] = useState(0); // 0=name, 1=scope, 2=action

  // Create rule form state
  const [rulePattern, setRulePattern] = useState('');
  const [ruleActionIdx, setRuleActionIdx] = useState(0);
  const [ruleReason, setRuleReason] = useState('');
  const [ruleField, setRuleField] = useState(0); // 0=pattern, 1=action, 2=reason

  // Flatten tool rules for tool view
  const toolRules = useMemo(() => {
    const rules: Array<{ policyId: string; policyName: string; rule: ToolPolicyRule }> = [];
    for (const policyInfo of policies) {
      if (!policyInfo.policy.tools?.rules) continue;
      for (const rule of policyInfo.policy.tools.rules) {
        rules.push({ policyId: policyInfo.id, policyName: policyInfo.name, rule });
      }
    }
    return rules;
  }, [policies]);

  const detailPolicy = detailPolicyId ? policies.find(p => p.id === detailPolicyId) : null;
  const detailRules = detailPolicy?.policy.tools?.rules || [];

  useEffect(() => {
    if (detailPolicyId && !detailPolicy && mode !== 'overview') {
      setDetailPolicyId(null);
      setRuleIndex(0);
      setMode('policies');
    }
  }, [detailPolicyId, detailPolicy, mode]);

  const currentList = mode === 'policies' ? policies : mode === 'tools' ? toolRules : [];
  const totalItems = currentList.length;

  useInput((input, key) => {
    // --- Preset selection ---
    if (mode === 'preset-select') {
      if (input === '1') { onSetPreset('permissive'); setMode('overview'); return; }
      if (input === '2') { onSetPreset('restrictive'); setMode('overview'); return; }
      if (key.escape || input === 'q' || input === 'Q') { setMode('overview'); return; }
      return;
    }

    // --- Delete confirmation ---
    if (mode === 'delete-confirm' && deleteTarget) {
      if (input === 'y' || input === 'Y') {
        if (deleteTarget.type === 'policy') {
          onRemovePolicy(deleteTarget.id);
          setDeleteTarget(null);
          setDetailPolicyId(null);
          setMode('policies');
          setSelectedIndex(0);
        } else if (deleteTarget.type === 'rule' && detailPolicy && deleteTarget.ruleIdx !== undefined) {
          const existingRules = [...(detailPolicy.policy.tools?.rules || [])];
          existingRules.splice(deleteTarget.ruleIdx, 1);
          onUpdatePolicy(detailPolicy.id, {
            tools: { ...detailPolicy.policy.tools!, rules: existingRules },
          });
          setDeleteTarget(null);
          setMode('policy-detail');
          setRuleIndex(Math.max(0, ruleIndex - 1));
        }
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        setDeleteTarget(null);
        setMode('policy-detail');
        return;
      }
      return;
    }

    // --- Policy create form ---
    if (mode === 'policy-create') {
      if (key.escape) { setMode('policies'); return; }

      if (key.tab) {
        setCreateField((prev) => (prev + 1) % 3);
        return;
      }

      if (key.return) {
        if (!createName.trim()) return;
        const newPolicy: GuardrailsPolicy = {
          name: createName.trim(),
          scope: SCOPES[createScopeIdx],
          enabled: true,
          tools: { defaultAction: ACTIONS[createActionIdx], rules: [] },
        };
        onAddPolicy(newPolicy);
        setCreateName('');
        setCreateField(0);
        setMode('policies');
        return;
      }

      // Handle text input for name field
      if (createField === 0) {
        if (input === '\x7f' || input === '\x08' || key.backspace || key.delete) {
          setCreateName(prev => prev.slice(0, -1));
          return;
        }
        const charCode = input?.charCodeAt(0) ?? 0;
        if (input && charCode >= 32 && charCode !== 127) {
          setCreateName(prev => prev + input);
          return;
        }
      }

      // Cycle scope with arrows
      if (createField === 1) {
        if (key.leftArrow || key.upArrow) { setCreateScopeIdx(prev => (prev - 1 + SCOPES.length) % SCOPES.length); return; }
        if (key.rightArrow || key.downArrow) { setCreateScopeIdx(prev => (prev + 1) % SCOPES.length); return; }
      }

      // Cycle action with arrows
      if (createField === 2) {
        if (key.leftArrow || key.upArrow) { setCreateActionIdx(prev => (prev - 1 + ACTIONS.length) % ACTIONS.length); return; }
        if (key.rightArrow || key.downArrow) { setCreateActionIdx(prev => (prev + 1) % ACTIONS.length); return; }
      }
      return;
    }

    // --- Rule create form ---
    if (mode === 'rule-create') {
      if (key.escape) { setMode('policy-detail'); return; }

      if (key.tab) {
        setRuleField((prev) => (prev + 1) % 3);
        return;
      }

      if (key.return) {
        if (!rulePattern.trim()) return;
        if (!detailPolicy) return;
        const newRule: ToolPolicyRule = {
          pattern: rulePattern.trim(),
          action: ACTIONS[ruleActionIdx],
          ...(ruleReason.trim() ? { reason: ruleReason.trim() } : {}),
        };
        const existingRules = [...(detailPolicy.policy.tools?.rules || [])];
        existingRules.push(newRule);
        onUpdatePolicy(detailPolicy.id, {
          tools: { ...(detailPolicy.policy.tools || { defaultAction: 'allow', rules: [] }), rules: existingRules },
        });
        setRulePattern('');
        setRuleReason('');
        setRuleField(0);
        setMode('policy-detail');
        return;
      }

      // Text input for pattern (field 0) or reason (field 2)
      if (ruleField === 0 || ruleField === 2) {
        if (input === '\x7f' || input === '\x08' || key.backspace || key.delete) {
          if (ruleField === 0) setRulePattern(prev => prev.slice(0, -1));
          else setRuleReason(prev => prev.slice(0, -1));
          return;
        }
        const charCode = input?.charCodeAt(0) ?? 0;
        if (input && charCode >= 32 && charCode !== 127) {
          if (ruleField === 0) setRulePattern(prev => prev + input);
          else setRuleReason(prev => prev + input);
          return;
        }
      }

      // Cycle action (field 1)
      if (ruleField === 1) {
        if (key.leftArrow || key.upArrow) { setRuleActionIdx(prev => (prev - 1 + ACTIONS.length) % ACTIONS.length); return; }
        if (key.rightArrow || key.downArrow) { setRuleActionIdx(prev => (prev + 1) % ACTIONS.length); return; }
      }
      return;
    }

    // --- Policy detail ---
    if (mode === 'policy-detail' && detailPolicy) {
      if (key.escape || input === 'b' || input === 'B') {
        setDetailPolicyId(null);
        setRuleIndex(0);
        setMode('policies');
        return;
      }

      if (key.upArrow && detailRules.length > 0) {
        setRuleIndex(prev => (prev === 0 ? detailRules.length - 1 : prev - 1));
        return;
      }
      if (key.downArrow && detailRules.length > 0) {
        setRuleIndex(prev => (prev >= detailRules.length - 1 ? 0 : prev + 1));
        return;
      }

      if (input === 'a' || input === 'A') {
        if (detailPolicy.location !== 'system') {
          setRulePattern('');
          setRuleActionIdx(0);
          setRuleReason('');
          setRuleField(0);
          setMode('rule-create');
        }
        return;
      }

      if (input === 'x' || input === 'X') {
        if (detailPolicy.location !== 'system') {
          setDeleteTarget({ type: 'policy', id: detailPolicy.id, label: detailPolicy.name || detailPolicy.id });
          setMode('delete-confirm');
        }
        return;
      }

      if (key.delete && detailRules.length > 0 && detailPolicy.location !== 'system') {
        const rule = detailRules[ruleIndex];
        if (rule) {
          setDeleteTarget({ type: 'rule', id: detailPolicy.id, label: rule.pattern, ruleIdx: ruleIndex });
          setMode('delete-confirm');
        }
        return;
      }

      if (input === 'e' || input === 'E') {
        if (detailPolicy.location !== 'system') onTogglePolicy(detailPolicy.id, true);
        return;
      }
      if (input === 'd' || input === 'D') {
        if (detailPolicy.location !== 'system') onTogglePolicy(detailPolicy.id, false);
        return;
      }

      if (input === 'q' || input === 'Q') { onCancel(); return; }
      return;
    }

    // --- Policies list ---
    if (mode === 'policies') {
      // Navigate including the "+ New policy" row at the end
      const policiesListSize = policies.length + 1;
      if (key.upArrow) { setSelectedIndex(prev => (prev === 0 ? policiesListSize - 1 : prev - 1)); return; }
      if (key.downArrow) { setSelectedIndex(prev => (prev >= policiesListSize - 1 ? 0 : prev + 1)); return; }

      if (key.return) {
        if (selectedIndex === policies.length) {
          // "New policy" option
          setCreateName('');
          setCreateScopeIdx(2);
          setCreateActionIdx(0);
          setCreateField(0);
          setMode('policy-create');
        } else {
          const policy = policies[selectedIndex];
          if (policy) {
            setDetailPolicyId(policy.id);
            setRuleIndex(0);
            setMode('policy-detail');
          }
        }
        return;
      }

      if (input === 'e' || input === 'E') {
        const policy = policies[selectedIndex];
        if (policy && policy.location !== 'system') onTogglePolicy(policy.id, true);
        return;
      }
      if (input === 'd' || input === 'D') {
        const policy = policies[selectedIndex];
        if (policy && policy.location !== 'system') onTogglePolicy(policy.id, false);
        return;
      }

      if (input === 'n' || input === 'N') {
        setCreateName('');
        setCreateScopeIdx(2);
        setCreateActionIdx(0);
        setCreateField(0);
        setMode('policy-create');
        return;
      }

      if (key.escape || input === 'b' || input === 'B') { setMode('overview'); setSelectedIndex(0); return; }
    }

    // --- Tools rules ---
    if (mode === 'tools') {
      if (key.upArrow) { setSelectedIndex(prev => (prev === 0 ? Math.max(0, totalItems - 1) : prev - 1)); return; }
      if (key.downArrow) { setSelectedIndex(prev => (prev >= totalItems - 1 ? 0 : prev + 1)); return; }
      if (key.escape || input === 'b' || input === 'B') { setMode('overview'); setSelectedIndex(0); return; }
    }

    // --- Overview ---
    if (mode === 'overview') {
      if (input === 'e' || input === 'E') { onToggleEnabled(true); return; }
      if (input === 'd' || input === 'D') { onToggleEnabled(false); return; }
      if (input === 'p' || input === 'P') { setMode('policies'); setSelectedIndex(0); return; }
      if (input === 't' || input === 'T') { setMode('tools'); setSelectedIndex(0); return; }
      if (input === 's' || input === 'S') { setMode('preset-select'); return; }
    }

    // Quit
    if (key.escape || input === 'q' || input === 'Q') { onCancel(); return; }
  }, { isActive: true });

  // --- RENDER: Delete confirmation ---
  if (mode === 'delete-confirm' && deleteTarget) {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="red"><b>Delete {deleteTarget.type === 'policy' ? 'Policy' : 'Rule'}</b></text>
        </box>
        <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1} paddingY={1}>
          <text>Are you sure you want to delete this {deleteTarget.type}?</text>
          <text fg="gray">{deleteTarget.label}</text>
          <text fg="gray">This action cannot be undone.</text>
        </box>
        <box marginTop={1}>
          <text fg="gray">y confirm | n cancel</text>
        </box>
      </box>
    );
  }

  // --- RENDER: Policy create form ---
  if (mode === 'policy-create') {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}><text><b>Create New Policy</b></text></box>
        <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1} paddingY={1}>
          <box flexDirection="row">
            <text fg="gray">Name: </text>
            <text bg={createField === 0 ? "#0055aa" : undefined}>{createName || ' '}</text>
            {createField === 0 && <text fg="cyan">|</text>}
          </box>
          <box flexDirection="row">
            <text fg="gray">Scope: </text>
            <text bg={createField === 1 ? "#0055aa" : undefined} fg={createField === 1 ? "whiteBright" : SCOPE_COLORS[SCOPES[createScopeIdx]]}>{SCOPES[createScopeIdx]}</text>
            {createField === 1 && <text fg="gray"> ←/→</text>}
          </box>
          <box flexDirection="row">
            <text fg="gray">Default Action: </text>
            <text bg={createField === 2 ? "#0055aa" : undefined} fg={createField === 2 ? "whiteBright" : ACTION_COLORS[ACTIONS[createActionIdx]]}>{ACTIONS[createActionIdx]}</text>
            {createField === 2 && <text fg="gray"> ←/→</text>}
          </box>
        </box>
        <box marginTop={1}>
          <text fg="gray">Tab next field | Enter save | Esc cancel</text>
        </box>
      </box>
    );
  }

  // --- RENDER: Rule create form ---
  if (mode === 'rule-create') {
    return (
      <box flexDirection="column" paddingY={1}>
        <box flexDirection="row" marginBottom={1}>
          <text><b>Add Tool Rule</b></text>
          {detailPolicy && <text fg="gray"> to {detailPolicy.name || detailPolicy.id}</text>}
        </box>
        <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1} paddingY={1}>
          <box flexDirection="row">
            <text fg="gray">Pattern: </text>
            <text bg={ruleField === 0 ? "#0055aa" : undefined}>{rulePattern || ' '}</text>
            {ruleField === 0 && <text fg="cyan">|</text>}
          </box>
          <box flexDirection="row">
            <text fg="gray">Action: </text>
            <text bg={ruleField === 1 ? "#0055aa" : undefined} fg={ruleField === 1 ? "whiteBright" : ACTION_COLORS[ACTIONS[ruleActionIdx]]}>{ACTIONS[ruleActionIdx]}</text>
            {ruleField === 1 && <text fg="gray"> ←/→</text>}
          </box>
          <box flexDirection="row">
            <text fg="gray">Reason: </text>
            <text bg={ruleField === 2 ? "#0055aa" : undefined}>{ruleReason || ' '}</text>
            {ruleField === 2 && <text fg="cyan">|</text>}
            {ruleField !== 2 && <text fg="gray"> (optional)</text>}
          </box>
        </box>
        <box marginTop={1}>
          <text fg="gray">Tab next field | Enter save | Esc cancel</text>
        </box>
      </box>
    );
  }

  // --- RENDER: Policy detail ---
  if (mode === 'policy-detail' && detailPolicy) {
    const isSystem = detailPolicy.location === 'system';
    return (
      <box flexDirection="column" paddingY={1}>
        <box flexDirection="row" marginBottom={1} justifyContent="space-between">
          <box flexDirection="row">
            <text><b>{detailPolicy.name || detailPolicy.id}</b></text>
            <text fg={detailPolicy.enabled ? 'green' : 'red'}> [{detailPolicy.enabled ? 'on' : 'off'}]</text>
          </box>
          <text fg={SCOPE_COLORS[detailPolicy.scope]}>{detailPolicy.scope}</text>
        </box>

        <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1} paddingY={1}>
          <box flexDirection="row"><text fg="gray">ID: </text><text>{detailPolicy.id}</text></box>
          <box flexDirection="row"><text fg="gray">Location: </text><text>{detailPolicy.location}</text></box>
          {detailPolicy.policy.tools && (
            <box flexDirection="row"><text fg="gray">Default Action: </text><text fg={ACTION_COLORS[detailPolicy.policy.tools.defaultAction]}>{detailPolicy.policy.tools.defaultAction}</text></box>
          )}
          {detailPolicy.policy.depth && (
            <box><text fg="gray">Max Depth: </text><text>{detailPolicy.policy.depth.maxDepth}</text></box>
          )}
          {detailPolicy.policy.rateLimits && (
            <box><text fg="gray">Rate Limits: </text><text>{detailPolicy.policy.rateLimits.toolCallsPerMinute || '-'} tools/min, {detailPolicy.policy.rateLimits.llmCallsPerMinute || '-'} llm/min</text></box>
          )}
        </box>

        <box marginTop={1} marginBottom={0}>
          <text fg="gray"><b>Tool Rules ({detailRules.length})</b></text>
        </box>
        <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1} height={Math.min(8, detailRules.length + 2)} overflow="hidden">
          {detailRules.length === 0 ? (
            <box paddingY={0}><text fg="gray">{isSystem ? 'No tool rules.' : 'No tool rules. Press a to add one.'}</text></box>
          ) : (
            detailRules.map((rule, idx) => {
              const isSelected = idx === ruleIndex;
              return (
                <box key={`${rule.pattern}-${idx}`}>
                  <text bg={isSelected ? "#0055aa" : undefined} fg={isSelected ? "whiteBright" : undefined}>
                    {isSelected ? '>' : ' '}{' '}
                    <text fg={ACTION_COLORS[rule.action]}>[{rule.action.slice(0, 4).padEnd(4)}]</text>{' '}
                    <text attributes={isSelected ? 1 : undefined}><b>{rule.pattern.slice(0, 30).padEnd(30)}</b></text>
                    {rule.reason && <text fg="gray"> {rule.reason.slice(0, 20)}</text>}
                  </text>
                </box>
              );
            })
          )}
        </box>

        <box marginTop={1}>
          <text fg="gray">
            {!isSystem ? '[e]nable [d]isable [a]dd rule [x] delete ' : ''}
            {!isSystem && detailRules.length > 0 ? '[del] rm rule ' : ''}
            [b]ack [q]uit | ↑↓ rules
          </text>
        </box>
      </box>
    );
  }

  // --- RENDER: Preset selection ---
  if (mode === 'preset-select') {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}><text><b>Select Preset Policy</b></text></box>
        <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1} paddingY={1}>
          <box marginBottom={1}>
            <text fg="green"><b>1.</b></text>
            <text> Permissive - Allow most, warn on dangerous</text>
          </box>
          <box>
            <text fg="red"><b>2.</b></text>
            <text> Restrictive - Deny by default, require approval</text>
          </box>
        </box>
        <box marginTop={1}>
          <text fg="gray">[1] permissive [2] restrictive [q] cancel</text>
        </box>
      </box>
    );
  }

  // --- RENDER: Policies list ---
  if (mode === 'policies') {
    return (
      <box flexDirection="column" paddingY={1}>
        <box flexDirection="row" marginBottom={1} justifyContent="space-between">
          <text><b>Policies</b></text>
          <text fg="gray">{policies.length} polic{policies.length !== 1 ? 'ies' : 'y'}</text>
        </box>
        <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1} height={Math.min(12, policies.length + 2)} overflow="hidden">
          {policies.length === 0 ? (
            <box paddingY={1}><text fg="gray">No policies. Press n to create one.</text></box>
          ) : (
            policies.map((policy, index) => {
              const isSelected = index === selectedIndex;
              const scopeColor = SCOPE_COLORS[policy.scope] || 'white';
              return (
                <box key={policy.id}>
                  <text bg={isSelected ? "#0055aa" : undefined} fg={isSelected ? "whiteBright" : undefined}>
                    {isSelected ? '>' : ' '}{' '}
                    <text fg={policy.enabled ? 'green' : 'red'}>[{policy.enabled ? 'on ' : 'off'}]</text>{' '}
                    <text attributes={isSelected ? 1 : undefined}><b>{(policy.name || policy.id).slice(0, 20).padEnd(20)}</b></text>{' '}
                    <text fg={scopeColor}>{policy.scope.padEnd(10)}</text>{' '}
                    <text fg="gray">{policy.location}</text>
                  </text>
                </box>
              );
            })
          )}

          {/* New policy option */}
          <box marginTop={policies.length > 0 ? 1 : 0} paddingY={0}>
            <text
              bg={selectedIndex === policies.length ? "#0055aa" : undefined}
              fg={selectedIndex === policies.length ? "whiteBright" : undefined}
            >
              + New policy (n)
            </text>
          </box>
        </box>
        <box marginTop={1}>
          <text fg="gray">[e]nable [d]isable [Enter] detail [b]ack [q]uit | ↑↓ navigate</text>
        </box>
      </box>
    );
  }

  // --- RENDER: Tools rules ---
  if (mode === 'tools') {
    const selectedRule = toolRules[selectedIndex];
    return (
      <box flexDirection="column" paddingY={1}>
        <box flexDirection="row" marginBottom={1} justifyContent="space-between">
          <text><b>Tool Rules</b></text>
          <text fg="gray">{toolRules.length} rule{toolRules.length !== 1 ? 's' : ''}</text>
        </box>
        <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1} height={Math.min(12, toolRules.length + 2)} overflow="hidden">
          {toolRules.length === 0 ? (
            <box paddingY={1}><text fg="gray">No tool rules configured.</text></box>
          ) : (
            toolRules.map((item, index) => {
              const isSelected = index === selectedIndex;
              const actionColor = ACTION_COLORS[item.rule.action];
              return (
                <box key={`${item.policyId}-${item.rule.pattern}-${index}`}>
                  <text bg={isSelected ? "#0055aa" : undefined} fg={isSelected ? "whiteBright" : undefined}>
                    {isSelected ? '>' : ' '}{' '}
                    <text fg={actionColor}>[{item.rule.action.slice(0, 4).padEnd(4)}]</text>{' '}
                    <text attributes={isSelected ? 1 : undefined}><b>{item.rule.pattern.slice(0, 25).padEnd(25)}</b></text>{' '}
                    <text fg="gray">{item.policyName.slice(0, 15)}</text>
                  </text>
                </box>
              );
            })
          )}
        </box>
        {selectedRule && (
          <box marginTop={1} flexDirection="column">
            <box><text fg="gray">Pattern: </text><text>{selectedRule.rule.pattern}</text></box>
            <box><text fg="gray">Action: </text><text fg={ACTION_COLORS[selectedRule.rule.action]}>{selectedRule.rule.action}</text></box>
            {selectedRule.rule.reason && (<box><text fg="gray">Reason: </text><text>{selectedRule.rule.reason}</text></box>)}
            <box><text fg="gray">Policy: </text><text>{selectedRule.policyName}</text></box>
          </box>
        )}
        <box marginTop={1}>
          <text fg="gray">[b]ack [q]uit | ↑↓ navigate</text>
        </box>
      </box>
    );
  }

  // --- RENDER: Overview (default) ---
  const enabledPolicies = policies.filter(p => p.enabled).length;
  const totalRules = toolRules.length;
  const denyRules = toolRules.filter(r => r.rule.action === 'deny').length;
  const approvalRules = toolRules.filter(r => r.rule.action === 'require_approval').length;

  return (
    <box flexDirection="column" paddingY={1}>
      <box flexDirection="row" marginBottom={1} justifyContent="space-between">
        <text><b>Guardrails</b></text>
        <text fg={config.enabled ? 'green' : 'red'}>{config.enabled ? 'Enabled' : 'Disabled'}</text>
      </box>
      <box flexDirection="column" borderStyle="rounded" borderColor="#d4d4d8" border={["top", "bottom"]} paddingX={1} paddingY={1}>
        <box marginBottom={1}>
          <text><b>Status: </b></text>
          <text fg={config.enabled ? 'green' : 'red'}>
            {config.enabled ? 'Enforcing policies' : 'Not enforcing (all tools allowed)'}
          </text>
        </box>
        <box marginBottom={1} flexDirection="column">
          <box><text fg="gray">Policies: </text><text>{enabledPolicies}/{policies.length} enabled</text></box>
          <box>
            <text fg="gray">Tool Rules: </text><text>{totalRules} total</text>
            {denyRules > 0 && (
              <text> (<text fg="red">{denyRules} deny</text>
                {approvalRules > 0 && <text>, </text>}
                {approvalRules > 0 && <text fg="yellow">{approvalRules} approval</text>})
              </text>
            )}
          </box>
          <box><text fg="gray">Default Action: </text><text fg={ACTION_COLORS[config.defaultAction]}>{config.defaultAction}</text></box>
        </box>
        {policies.filter(p => p.enabled).length > 0 && (
          <box flexDirection="column">
            <text fg="gray"><b>Active Policies:</b></text>
            {policies.filter(p => p.enabled).slice(0, 3).map(p => (
              <box key={p.id} paddingLeft={1}>
                <text>- {p.name || p.id}</text><text fg="gray"> ({p.scope})</text>
              </box>
            ))}
            {policies.filter(p => p.enabled).length > 3 && (
              <box paddingLeft={1}><text fg="gray">+ {policies.filter(p => p.enabled).length - 3} more</text></box>
            )}
          </box>
        )}
      </box>
      <box marginTop={1}>
        <text fg="gray">[e]nable [d]isable [p]olicies [t]ool rules [s]et preset [q]uit</text>
      </box>
    </box>
  );
}
