import React from 'react';
import {
  getModelById,
  getModelDisplayName,
} from '@hasna/assistants-shared';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import { themeColor } from '../theme/colors';

function fmtTokens(n?: number): string {
  if (n == null) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

function fmtCost(inputCost?: number, outputCost?: number): string {
  if (inputCost == null || outputCost == null) return '—';
  const fmtNum = (n: number) => (n >= 1 ? `$${n % 1 === 0 ? n : n.toFixed(1)}` : `$${n}`);
  return `${fmtNum(inputCost)} / ${fmtNum(outputCost)}`;
}

interface ModelPanelProps {
  currentModelId: string | null;
  agentName?: string;
  agentDescription?: string;
  onOpenAgents: () => void;
  onCancel: () => void;
}

/**
 * Read-only model info panel.
 * Models are tied to agents — to change the model, switch agent.
 */
export function ModelPanel({
  currentModelId,
  agentName,
  agentDescription,
  onOpenAgents,
  onCancel,
}: ModelPanelProps) {
  const model = currentModelId ? getModelById(currentModelId) : null;
  const displayName = currentModelId ? getModelDisplayName(currentModelId) : 'Unknown';

  useInput(
    (input, key) => {
      if (key.escape || input === 'q' || input === 'Q') {
        onCancel();
        return;
      }
      // 'a' opens agents panel to switch agent (and thus model)
      if (input === 'a' || input === 'A' || key.tab) {
        onOpenAgents();
        return;
      }
    },
    { isActive: true },
  );

  return (
    <box flexDirection="column" paddingY={1}>
      {/* Header */}
      <box marginBottom={1}>
        <text><b>Model Info</b></text>
      </box>

      {/* Agent info */}
      <box flexDirection="column" marginBottom={1}>
        <box>
          <text fg={themeColor('muted')}>Agent:   </text>
          <text fg={themeColor('primary')}><b>{agentName || 'Default'}</b></text>
        </box>
        {agentDescription && (
          <box>
            <text fg={themeColor('muted')}>         {agentDescription}</text>
          </box>
        )}
      </box>

      {/* Model info */}
      <box flexDirection="column" marginBottom={1}>
        <box>
          <text fg={themeColor('muted')}>Model:   </text>
          <text><b>{displayName}</b></text>
          {currentModelId && currentModelId !== displayName && (
            <text fg={themeColor('muted')}> ({currentModelId})</text>
          )}
        </box>
        {model?.provider && (
          <box>
            <text fg={themeColor('muted')}>Provider: </text>
            <text>{model.provider}</text>
          </box>
        )}
        {model?.contextWindow && (
          <box>
            <text fg={themeColor('muted')}>Context:  </text>
            <text>{fmtTokens(model.contextWindow)} tokens</text>
          </box>
        )}
        {model?.maxOutputTokens && (
          <box>
            <text fg={themeColor('muted')}>Output:   </text>
            <text>{fmtTokens(model.maxOutputTokens)} tokens</text>
          </box>
        )}
        {(model?.inputCostPer1M != null || model?.outputCostPer1M != null) && (
          <box>
            <text fg={themeColor('muted')}>Cost/1M:  </text>
            <text>{fmtCost(model?.inputCostPer1M, model?.outputCostPer1M)} (in/out)</text>
          </box>
        )}
        {model?.description && (
          <box>
            <text fg={themeColor('muted')}>Info:     </text>
            <text fg={themeColor('muted')}>{model.description}</text>
          </box>
        )}
        {model?.notes && (
          <box>
            <text fg={themeColor('muted')}>Notes:    </text>
            <text fg={themeColor('muted')}>{model.notes}</text>
          </box>
        )}
      </box>

      {/* Hint to switch via agents */}
      <box marginTop={1} marginBottom={1}>
        <text fg={themeColor('warning')}>
          Models are tied to agents. To change the model, switch to a different agent.
        </text>
      </box>

      {/* Footer */}
      <box>
        <text fg={themeColor('muted')}>
          <b>a</b>/<b>tab</b> switch agent  |  <b>q</b>/<b>esc</b> close
        </text>
      </box>
    </box>
  );
}
