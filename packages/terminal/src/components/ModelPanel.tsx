import React from 'react';
import {
  getModelById,
  getModelDisplayName,
} from '@hasna/assistants-shared';
import { Box, Inline, Text, useInput } from '../ui/ink';
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
    <Box flexDirection="column" paddingY={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold>Model Info</Text>
      </Box>

      {/* Agent info */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text fg={themeColor('muted')}>Agent:   </Text>
          <Text fg={themeColor('primary')} bold>{agentName || 'Default'}</Text>
        </Box>
        {agentDescription && (
          <Box>
            <Text fg={themeColor('muted')}>         {agentDescription}</Text>
          </Box>
        )}
      </Box>

      {/* Model info */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text fg={themeColor('muted')}>Model:   </Text>
          <Text bold>{displayName}</Text>
          {currentModelId && currentModelId !== displayName && (
            <Text fg={themeColor('muted')}> ({currentModelId})</Text>
          )}
        </Box>
        {model?.provider && (
          <Box>
            <Text fg={themeColor('muted')}>Provider: </Text>
            <Text>{model.provider}</Text>
          </Box>
        )}
        {model?.contextWindow && (
          <Box>
            <Text fg={themeColor('muted')}>Context:  </Text>
            <Text>{fmtTokens(model.contextWindow)} tokens</Text>
          </Box>
        )}
        {model?.maxOutputTokens && (
          <Box>
            <Text fg={themeColor('muted')}>Output:   </Text>
            <Text>{fmtTokens(model.maxOutputTokens)} tokens</Text>
          </Box>
        )}
        {(model?.inputCostPer1M != null || model?.outputCostPer1M != null) && (
          <Box>
            <Text fg={themeColor('muted')}>Cost/1M:  </Text>
            <Text>{fmtCost(model?.inputCostPer1M, model?.outputCostPer1M)} (in/out)</Text>
          </Box>
        )}
        {model?.description && (
          <Box>
            <Text fg={themeColor('muted')}>Info:     </Text>
            <Text fg={themeColor('muted')}>{model.description}</Text>
          </Box>
        )}
        {model?.notes && (
          <Box>
            <Text fg={themeColor('muted')}>Notes:    </Text>
            <Text fg={themeColor('muted')}>{model.notes}</Text>
          </Box>
        )}
      </Box>

      {/* Hint to switch via agents */}
      <Box marginTop={1} marginBottom={1}>
        <Text fg={themeColor('warning')}>
          Models are tied to agents. To change the model, switch to a different agent.
        </Text>
      </Box>

      {/* Footer */}
      <Box>
        <Text fg={themeColor('muted')}>
          <Inline bold>a</Inline>/<Inline bold>tab</Inline> switch agent  |  <Inline bold>q</Inline>/<Inline bold>esc</Inline> close
        </Text>
      </Box>
    </Box>
  );
}
