import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Modal } from './Modal';
import { Box, Text, useInput, useWindowSize } from '../ui/ink';
import { themeColor } from '../theme/colors';

/**
 * A command entry for the palette.
 */
export interface PaletteCommand {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  handler: () => void;
}

interface CommandPaletteProps {
  visible: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
}

/**
 * Command palette dialog — opens on Ctrl+P.
 *
 * Per OpenCode spec (section 8.4):
 * - Title: "Commands" in Primary, Bold, Padding(0,1)
 * - Filter prompt at top
 * - Compact one-line list below with command name and shortcut
 * - 60% width, 60% height overlay via Modal
 * - Min width: 40, expands to fit longest command title/description
 * - Max visible: capped by terminal height
 * - Selected: Primary bg, Background fg, Bold
 * - Normal title: Text color
 * - Keys: up/down navigate, enter select, esc close
 */
export function CommandPalette({ visible, commands, onClose }: CommandPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dims = useWindowSize();

  // Theme colors
  const primaryColor = themeColor('primary');
  const bgColor = themeColor('bg');
  const textColor = themeColor('text');
  const mutedColor = themeColor('muted');

  const filteredCommands = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return q
      ? commands.filter(
          (cmd) =>
            cmd.label.toLowerCase().includes(q) ||
            (cmd.description?.toLowerCase().includes(q)) ||
            cmd.id.toLowerCase().includes(q),
        )
      : commands;
  }, [searchQuery, commands]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(Math.max(0, filteredCommands.length - 1));
    }
  }, [filteredCommands.length, selectedIndex]);

  const runSelectedCommand = useCallback(() => {
    const cmd = filteredCommands[selectedIndex];
    if (cmd) {
      setSearchQuery('');
      onClose();
      cmd.handler();
    }
  }, [filteredCommands, selectedIndex, onClose]);

  useInput((input, key) => {
    if (key.backspace) {
      setSearchQuery((prev) => prev.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta && !key.return && !key.escape) {
      setSearchQuery((prev) => prev + input);
      return;
    }
    if (filteredCommands.length === 0) return;
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      return;
    }
    if (key.return) {
      runSelectedCommand();
    }
  }, { isActive: visible });

  // Reset search when closing
  const handleClose = useCallback(() => {
    setSearchQuery('');
    setSelectedIndex(0);
    onClose();
  }, [onClose]);

  if (!visible) return null;

  const maxVisible = Math.max(3, Math.min(6, Math.floor((dims.rows || 24) * 0.6) - 9));
  const contentWidth = Math.max(20, Math.floor((dims.columns || 80) * 0.6) - 8);
  const fitLine = (line: string): string => {
    if (line.length > contentWidth) {
      return line.slice(0, Math.max(0, contentWidth - 3)) + '...';
    }
    return line.padEnd(contentWidth);
  };
  const startIndex = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(maxVisible / 2),
      Math.max(0, filteredCommands.length - maxVisible),
    ),
  );
  const visibleCommands = filteredCommands.slice(startIndex, startIndex + maxVisible);

  return (
    <Modal visible={visible} onClose={handleClose} title="Commands">
      {/* Search/filter input */}
      <Box flexDirection="row" marginBottom={1} backgroundColor={bgColor}>
        <Text fg={mutedColor} bg={bgColor}>&gt; </Text>
        <Text fg={searchQuery ? textColor : mutedColor} bg={bgColor}>
          {searchQuery || 'Type a command...'}
        </Text>
      </Box>

      {/* Command list */}
      {filteredCommands.length > 0 ? (
        <Box flexDirection="column" flexGrow={1}>
          {startIndex > 0 && (
            <Box backgroundColor={bgColor} paddingX={1}>
              <Text fg={mutedColor} bg={bgColor}>{fitLine(`^ ${startIndex} more above`)}</Text>
            </Box>
          )}
          {visibleCommands.map((cmd, offset) => {
            const actualIndex = startIndex + offset;
            const isSelected = actualIndex === selectedIndex;
            const rowBg = isSelected ? primaryColor : bgColor;
            const rowText = isSelected ? bgColor : textColor;
            const title = cmd.shortcut ? `${cmd.label}  (${cmd.shortcut})` : cmd.label;

            return (
              <Box key={cmd.id} backgroundColor={rowBg} paddingX={1}>
                <Text fg={rowText} bg={rowBg}>
                  {fitLine(`${isSelected ? '> ' : '  '}${title}`)}
                </Text>
              </Box>
            );
          })}
          {startIndex + visibleCommands.length < filteredCommands.length && (
            <Box backgroundColor={bgColor} paddingX={1}>
              <Text fg={mutedColor} bg={bgColor}>{fitLine(`v ${filteredCommands.length - startIndex - visibleCommands.length} more below`)}</Text>
            </Box>
          )}
        </Box>
      ) : (
        <Box backgroundColor={bgColor}>
          <Text fg={mutedColor} bg={bgColor}>No commands match "{searchQuery}"</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1} backgroundColor={bgColor}>
        <Text fg={mutedColor} bg={bgColor}>Type filter | Up/Down | Enter | Esc</Text>
      </Box>
    </Modal>
  );
}

/**
 * Build the default set of palette commands from available panel setters.
 * This is a helper that App.tsx can call to generate the command list.
 */
export function buildDefaultCommands(ctx: {
  setShowModelPanel?: (v: boolean) => void;
  setShowSessionSelector?: (v: boolean) => void;
  setShowTasksPanel?: (v: boolean) => void;
  setShowConnectorsPanel?: (v: boolean) => void;
  setShowHooksPanel?: (v: boolean) => void;
  setShowConfigPanel?: (v: boolean) => void;
  setShowSkillsPanel?: (v: boolean) => void;
  setShowSchedulesPanel?: (v: boolean) => void;
  setShowMemoryPanel?: (v: boolean) => void;
  setShowIdentityPanel?: (v: boolean) => void;
  setShowBudgetPanel?: (v: boolean) => void;
  setShowGuardrailsPanel?: (v: boolean) => void;
  setShowDocsPanel?: (v: boolean) => void;
  setShowAssistantsPanel?: (v: boolean) => void;
  setShowSwarmPanel?: (v: boolean) => void;
  setShowLogsPanel?: (v: boolean) => void;
  setShowProjectsPanel?: (v: boolean) => void;
  setShowWorkspacePanel?: (v: boolean) => void;
  handleNewSession?: () => void;
}): PaletteCommand[] {
  const commands: PaletteCommand[] = [];

  if (ctx.setShowModelPanel) {
    commands.push({
      id: 'model',
      label: 'Switch Model',
      description: 'Change the active LLM model',
      shortcut: 'Ctrl+T',
      handler: () => ctx.setShowModelPanel!(true),
    });
  }

  if (ctx.setShowSessionSelector) {
    commands.push({
      id: 'sessions',
      label: 'Switch Session',
      description: 'Switch between active sessions',
      shortcut: 'Ctrl+]',
      handler: () => ctx.setShowSessionSelector!(true),
    });
  }

  if (ctx.handleNewSession) {
    commands.push({
      id: 'new-session',
      label: 'New Session',
      description: 'Start a new assistant session',
      handler: ctx.handleNewSession,
    });
  }

  if (ctx.setShowTasksPanel) {
    commands.push({
      id: 'tasks',
      label: 'Tasks',
      description: 'View and manage tasks',
      handler: () => ctx.setShowTasksPanel!(true),
    });
  }

  if (ctx.setShowConnectorsPanel) {
    commands.push({
      id: 'connectors',
      label: 'Connectors',
      description: 'Manage external connectors',
      handler: () => ctx.setShowConnectorsPanel!(true),
    });
  }

  if (ctx.setShowHooksPanel) {
    commands.push({
      id: 'hooks',
      label: 'Hooks',
      description: 'View and configure hooks',
      handler: () => ctx.setShowHooksPanel!(true),
    });
  }

  if (ctx.setShowConfigPanel) {
    commands.push({
      id: 'config',
      label: 'Configuration',
      description: 'View and edit configuration',
      handler: () => ctx.setShowConfigPanel!(true),
    });
  }

  if (ctx.setShowSkillsPanel) {
    commands.push({
      id: 'skills',
      label: 'Skills',
      description: 'View available skills',
      handler: () => ctx.setShowSkillsPanel!(true),
    });
  }

  if (ctx.setShowSchedulesPanel) {
    commands.push({
      id: 'schedules',
      label: 'Schedules',
      description: 'View scheduled commands',
      handler: () => ctx.setShowSchedulesPanel!(true),
    });
  }

  if (ctx.setShowMemoryPanel) {
    commands.push({
      id: 'memory',
      label: 'Memory',
      description: 'View assistant memory',
      handler: () => ctx.setShowMemoryPanel!(true),
    });
  }

  if (ctx.setShowIdentityPanel) {
    commands.push({
      id: 'identity',
      label: 'Identity',
      description: 'Manage assistant identity',
      handler: () => ctx.setShowIdentityPanel!(true),
    });
  }

  if (ctx.setShowBudgetPanel) {
    commands.push({
      id: 'budget',
      label: 'Budget',
      description: 'View budget and spending',
      handler: () => ctx.setShowBudgetPanel!(true),
    });
  }

  if (ctx.setShowGuardrailsPanel) {
    commands.push({
      id: 'guardrails',
      label: 'Guardrails',
      description: 'Configure safety guardrails',
      handler: () => ctx.setShowGuardrailsPanel!(true),
    });
  }

  if (ctx.setShowDocsPanel) {
    commands.push({
      id: 'docs',
      label: 'Documentation',
      description: 'View documentation',
      handler: () => ctx.setShowDocsPanel!(true),
    });
  }

  if (ctx.setShowAssistantsPanel) {
    commands.push({
      id: 'assistants',
      label: 'Assistants',
      description: 'View registered assistants',
      handler: () => ctx.setShowAssistantsPanel!(true),
    });
  }

  if (ctx.setShowSwarmPanel) {
    commands.push({
      id: 'swarm',
      label: 'Swarm',
      description: 'Multi-agent swarm coordination',
      handler: () => ctx.setShowSwarmPanel!(true),
    });
  }

  if (ctx.setShowLogsPanel) {
    commands.push({
      id: 'logs',
      label: 'Logs',
      description: 'View activity logs',
      handler: () => ctx.setShowLogsPanel!(true),
    });
  }

  if (ctx.setShowProjectsPanel) {
    commands.push({
      id: 'projects',
      label: 'Projects',
      description: 'View and manage projects',
      handler: () => ctx.setShowProjectsPanel!(true),
    });
  }

  if (ctx.setShowWorkspacePanel) {
    commands.push({
      id: 'workspace',
      label: 'Workspace',
      description: 'Workspace settings',
      handler: () => ctx.setShowWorkspacePanel!(true),
    });
  }

  return commands;
}
