import React, { useMemo, useState, useCallback } from 'react';
import type { SelectOption } from '@opentui/core';
import { Modal } from './Modal';
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
 * - Text input at top for filtering
 * - List below with command name + description (two-line format)
 * - 60% width, 60% height overlay via Modal
 * - Min width: 40, expands to fit longest command title/description
 * - Max visible: 10
 * - Selected: Primary bg, Background fg, Bold
 * - Normal title: Text color; Normal description: TextMuted
 * - Keys: up/down/j/k navigate, enter select, esc close
 */
export function CommandPalette({ visible, commands, onClose }: CommandPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Theme colors
  const primaryColor = themeColor('primary');
  const bgColor = themeColor('bg');
  const textColor = themeColor('text');
  const mutedColor = themeColor('muted');

  // Filter and build options
  const { options, commandMap } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = q
      ? commands.filter(
          (cmd) =>
            cmd.label.toLowerCase().includes(q) ||
            (cmd.description?.toLowerCase().includes(q)) ||
            cmd.id.toLowerCase().includes(q),
        )
      : commands;

    const opts: SelectOption[] = filtered.map((cmd) => ({
      name: cmd.shortcut ? `${cmd.label}  (${cmd.shortcut})` : cmd.label,
      description: cmd.description ?? '',
      value: cmd.id,
    }));

    const map = new Map<string, PaletteCommand>();
    for (const cmd of commands) {
      map.set(cmd.id, cmd);
    }

    return { options: opts, commandMap: map };
  }, [searchQuery, commands]);

  const handleSelect = useCallback((_index: number, option: SelectOption | null) => {
    if (!option) return;
    const cmd = commandMap.get(String(option.value));
    if (cmd) {
      onClose();
      cmd.handler();
    }
  }, [commandMap, onClose]);

  // Reset search when closing
  const handleClose = useCallback(() => {
    setSearchQuery('');
    onClose();
  }, [onClose]);

  if (!visible) return null;

  return (
    <Modal visible={visible} onClose={handleClose} title="Commands">
      {/* Search/filter input */}
      <box marginBottom={1}>
        <text fg={mutedColor}>&gt; </text>
        <input
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Type a command..."
          focused={visible}
        />
      </box>

      {/* Command list with name + description */}
      {options.length > 0 ? (
        <select
          options={options}
          selectedIndex={0}
          onSelect={handleSelect}
          focused={visible && !searchQuery}
          showDescription={true}
          wrapSelection={true}
          showScrollIndicator={true}
          backgroundColor={bgColor}
          textColor={textColor}
          selectedBackgroundColor={primaryColor}
          selectedTextColor={bgColor}
          descriptionColor={mutedColor}
          selectedDescriptionColor={bgColor}
          flexGrow={1}
        />
      ) : (
        <box>
          <text fg={mutedColor}>No commands match "{searchQuery}"</text>
        </box>
      )}

      {/* Footer */}
      <box marginTop={1}>
        <text fg={mutedColor}>Enter select | Up/Down navigate | Esc close</text>
      </box>
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
