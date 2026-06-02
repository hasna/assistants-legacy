/**
 * People panel renderers: Assistants, Identity, Hooks.
 */
import React from 'react';
import type { HookEvent, HookHandler } from '@hasna/assistants-shared';
import {
  listTemplates, createIdentityFromTemplate,
  HookStore, nativeHookRegistry, createLLMClient, loadConfig,
  type CreateAssistantOptions, type CreateIdentityOptions,
} from '@hasna/assistants-core';
import { generateId } from '@hasna/assistants-shared';
import { AssistantsPanel } from '../AssistantsPanel';
import { IdentityPanel } from '../IdentityPanel';
import { HooksPanel } from '../HooksPanel';
import type { HookDraft } from '../appHelpers';
import {
  HOOK_EVENT_SET, HOOK_TYPE_SET, HOOK_LOCATION_SET, HOOK_EVENT_MAP,
  collectStreamText, extractJsonObject,
} from '../appHelpers';
import { Box } from '../../ui/ink';
import type { PanelRenderContext } from './context';

export function renderAssistantsPanel(ctx: PanelRenderContext): React.ReactNode {
  const assistantManager = ctx.activeSession?.client.getAssistantManager?.();
  const assistantsList = assistantManager?.listAssistants() ?? [];
  const activeAssistantId = assistantManager?.getActiveId() ?? undefined;
  const ensureAssistantManager = () => {
    if (assistantManager) return assistantManager;
    const err = new Error('Assistant manager not available');
    ctx.setAssistantError(err.message);
    throw err;
  };
  const switchAssistantAndSyncIdentity = async (assistantId: string) => {
    if (!ctx.activeSession) {
      throw new Error('No active session');
    }

    const loop = ctx.activeSession.client.getAssistantLoop?.();
    if (loop && typeof loop.switchAssistant === 'function') {
      await loop.switchAssistant(assistantId);
    } else {
      const manager = ensureAssistantManager();
      await manager.switchAssistant(assistantId);
      await ctx.activeSession.client.refreshIdentityContext?.();
    }
    ctx.setIdentityInfo(ctx.activeSession.client.getIdentityInfo() ?? undefined);
  };

  const handleAssistantSelect = async (assistantId: string) => {
    ctx.setAssistantError(null);
    try {
      await switchAssistantAndSyncIdentity(assistantId);
      ctx.setAssistantsRefreshKey((k) => k + 1);
      ctx.setShowAssistantsPanel(false);
    } catch (err) {
      ctx.setAssistantError(err instanceof Error ? err.message : 'Failed to switch assistant');
    }
  };

  const handleAssistantCreate = async (options: CreateAssistantOptions) => {
    ctx.setAssistantError(null);
    try {
      const manager = ensureAssistantManager();
      const created = await manager.createAssistant(options);
      await switchAssistantAndSyncIdentity(created.id);
      ctx.setAssistantsRefreshKey((k) => k + 1);
    } catch (err) {
      ctx.setAssistantError(err instanceof Error ? err.message : 'Failed to create assistant');
      throw err;
    }
  };

  const handleAssistantUpdate = async (id: string, updates: Partial<{ name: string; description: string; settings: Record<string, unknown> }>) => {
    ctx.setAssistantError(null);
    try {
      const manager = ensureAssistantManager();
      await manager.updateAssistant(id, updates as any);
      await ctx.activeSession?.client.refreshIdentityContext?.();
      ctx.setIdentityInfo(ctx.activeSession?.client.getIdentityInfo() ?? undefined);
      ctx.setAssistantsRefreshKey((k) => k + 1);
    } catch (err) {
      ctx.setAssistantError(err instanceof Error ? err.message : 'Failed to update assistant');
      throw err;
    }
  };

  const handleAssistantDelete = async (assistantId: string) => {
    ctx.setAssistantError(null);
    try {
      const manager = ensureAssistantManager();
      const assistantsBefore = manager.listAssistants();
      if (assistantsBefore.length <= 1) {
        throw new Error('Cannot delete the last remaining assistant');
      }
      const wasActive = manager.getActiveId() === assistantId;
      await manager.deleteAssistant(assistantId);
      if (wasActive) {
        const nextActiveId = manager.getActiveId();
        if (nextActiveId) {
          await switchAssistantAndSyncIdentity(nextActiveId);
        }
      } else {
        ctx.setIdentityInfo(ctx.activeSession?.client.getIdentityInfo() ?? undefined);
      }
      ctx.setAssistantsRefreshKey((k) => k + 1);
    } catch (err) {
      ctx.setAssistantError(err instanceof Error ? err.message : 'Failed to delete assistant');
      throw err;
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <AssistantsPanel
        assistants={assistantsList}
        activeAssistantId={activeAssistantId}
        onSelect={handleAssistantSelect}
        onCreate={handleAssistantCreate}
        onUpdate={handleAssistantUpdate}
        onDelete={handleAssistantDelete}
        onCancel={() => {
          ctx.setAssistantError(null);
          ctx.setShowAssistantsPanel(false);
        }}
        error={ctx.assistantError}
        onClearError={() => ctx.setAssistantError(null)}
      />
    </Box>
  );
}

export function renderIdentityPanel(ctx: PanelRenderContext): React.ReactNode {
  const identityManager = ctx.activeSession?.client.getIdentityManager?.();
  const activeIdentity = identityManager?.getActive();
  const templates = listTemplates();

  const ensureIdentityManager = () => {
    if (identityManager) return identityManager;
    const err = new Error('Identity manager not available');
    ctx.setIdentityError(err.message);
    throw err;
  };

  const handleIdentitySwitch = async (identityId: string) => {
    ctx.setIdentityError(null);
    try {
      const manager = ensureIdentityManager();
      await manager.switchIdentity(identityId);
      await ctx.activeSession?.client.refreshIdentityContext?.();
      ctx.setIdentityInfo(ctx.activeSession?.client.getIdentityInfo() ?? undefined);
      ctx.refreshIdentitiesList();
    } catch (err) {
      ctx.setIdentityError(err instanceof Error ? err.message : 'Failed to switch identity');
    }
  };

  const handleIdentityCreate = async (options: CreateIdentityOptions) => {
    ctx.setIdentityError(null);
    try {
      const manager = ensureIdentityManager();
      await manager.createIdentity(options);
      await ctx.activeSession?.client.refreshIdentityContext?.();
      ctx.setIdentityInfo(ctx.activeSession?.client.getIdentityInfo() ?? undefined);
      ctx.refreshIdentitiesList();
    } catch (err) {
      ctx.setIdentityError(err instanceof Error ? err.message : 'Failed to create identity');
      throw err;
    }
  };

  const handleIdentityCreateFromTemplate = async (templateName: string) => {
    ctx.setIdentityError(null);
    try {
      const manager = ensureIdentityManager();
      const options = createIdentityFromTemplate(templateName);
      if (options) {
        await manager.createIdentity(options);
        await ctx.activeSession?.client.refreshIdentityContext?.();
        ctx.setIdentityInfo(ctx.activeSession?.client.getIdentityInfo() ?? undefined);
        ctx.refreshIdentitiesList();
      }
    } catch (err) {
      ctx.setIdentityError(err instanceof Error ? err.message : 'Failed to create identity from template');
      throw err;
    }
  };

  const handleIdentityUpdate = async (identityId: string, updates: Partial<CreateIdentityOptions>) => {
    ctx.setIdentityError(null);
    try {
      const manager = ensureIdentityManager();
      await manager.updateIdentity(identityId, updates as any);
      await ctx.activeSession?.client.refreshIdentityContext?.();
      ctx.setIdentityInfo(ctx.activeSession?.client.getIdentityInfo() ?? undefined);
      ctx.refreshIdentitiesList();
    } catch (err) {
      ctx.setIdentityError(err instanceof Error ? err.message : 'Failed to update identity');
      throw err;
    }
  };

  const handleIdentitySetDefault = async (identityId: string) => {
    ctx.setIdentityError(null);
    try {
      const manager = ensureIdentityManager();
      for (const identity of ctx.identitiesList) {
        if (identity.isDefault && identity.id !== identityId) {
          await manager.updateIdentity(identity.id, { isDefault: false });
        }
      }
      await manager.updateIdentity(identityId, { isDefault: true });
      await ctx.activeSession?.client.refreshIdentityContext?.();
      ctx.setIdentityInfo(ctx.activeSession?.client.getIdentityInfo() ?? undefined);
      ctx.refreshIdentitiesList();
    } catch (err) {
      ctx.setIdentityError(err instanceof Error ? err.message : 'Failed to set default identity');
    }
  };

  const handleIdentityDelete = async (identityId: string) => {
    ctx.setIdentityError(null);
    try {
      const manager = ensureIdentityManager();
      await manager.deleteIdentity(identityId);
      await ctx.activeSession?.client.refreshIdentityContext?.();
      ctx.setIdentityInfo(ctx.activeSession?.client.getIdentityInfo() ?? undefined);
      ctx.refreshIdentitiesList();
    } catch (err) {
      ctx.setIdentityError(err instanceof Error ? err.message : 'Failed to delete identity');
      throw err;
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <IdentityPanel
        identities={ctx.identitiesList}
        activeIdentityId={activeIdentity?.id}
        initialIdentityId={ctx.identityPanelIntent?.id}
        initialMode={ctx.identityPanelIntent?.mode}
        templates={templates}
        onSwitch={handleIdentitySwitch}
        onCreate={handleIdentityCreate}
        onCreateFromTemplate={handleIdentityCreateFromTemplate}
        onUpdate={handleIdentityUpdate}
        onSetDefault={handleIdentitySetDefault}
        onDelete={handleIdentityDelete}
        onClose={() => {
          ctx.setIdentityError(null);
          ctx.setIdentityPanelIntent(null);
          ctx.setShowIdentityPanel(false);
        }}
        error={ctx.identityError}
      />
    </Box>
  );
}

export function renderHooksPanel(ctx: PanelRenderContext): React.ReactNode {
  const handleHookToggle = (event: HookEvent, hookId: string, enabled: boolean) => {
    if (!ctx.hookStoreRef.current) {
      ctx.hookStoreRef.current = new HookStore();
    }
    ctx.hookStoreRef.current.setEnabled(hookId, enabled);
    const hooks = ctx.hookStoreRef.current.loadAll();
    ctx.setHooksConfig(hooks);
  };

  const handleHookDelete = async (event: HookEvent, hookId: string) => {
    if (!ctx.hookStoreRef.current) {
      ctx.hookStoreRef.current = new HookStore();
    }
    ctx.hookStoreRef.current.removeHook(hookId);
    const hooks = ctx.hookStoreRef.current.loadAll();
    ctx.setHooksConfig(hooks);
  };

  const handleHookAdd = async (
    event: HookEvent,
    handler: HookHandler,
    location: 'user' | 'project' | 'local',
    matcher?: string
  ) => {
    if (!ctx.hookStoreRef.current) {
      ctx.hookStoreRef.current = new HookStore();
    }
    ctx.hookStoreRef.current.addHook(event, handler, location, matcher);
    const hooks = ctx.hookStoreRef.current.loadAll();
    ctx.setHooksConfig(hooks);
  };

  const handleNativeHookToggle = (hookId: string, enabled: boolean) => {
    nativeHookRegistry.setEnabled(hookId, enabled);
  };

  const handleHookDraft = async (prompt: string): Promise<HookDraft> => {
    const config = ctx.currentConfig ?? await loadConfig(ctx.cwd, ctx.workspaceBaseDir);
    const llmConfig = config?.llm;
    if (!llmConfig?.model) {
      throw new Error('LLM not configured. Set llm.model in config.json.');
    }

    const llmClient = await createLLMClient(llmConfig);
    const systemPrompt = [
      'You are generating a hook configuration for assistants.',
      'Return ONLY a JSON object with keys:',
      'event, matcher, type, command, timeout, async, name, description, location.',
      'event: one of SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, Notification, SubassistantStart, SubassistantStop, PreCompact, Stop.',
      'type: command | prompt | assistant.',
      'command: for type=command use a shell command; for prompt/assistant use the prompt text.',
      'matcher: optional string (regex or *).',
      'timeout: milliseconds (number).',
      'async: boolean.',
      'location: project | user | local.',
      'Do not wrap JSON in markdown or code fences.',
    ].join('\n');

    const userPrompt = [
      'Create a hook draft that matches this request:',
      prompt,
      'Return JSON only.',
    ].join('\n');

    const responseText = await collectStreamText(
      llmClient.chat([
        {
          id: generateId(),
          role: 'user',
          content: userPrompt,
          timestamp: Date.now(),
        },
      ], undefined, systemPrompt)
    );

    const jsonText = extractJsonObject(responseText);
    if (!jsonText) {
      throw new Error('Failed to parse hook draft from model response.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error('Invalid JSON returned by model.');
    }

    const rawEvent = typeof parsed.event === 'string' ? parsed.event : '';
    const event = HOOK_EVENT_MAP.get(rawEvent.trim().toLowerCase()) ?? 'PreToolUse';

    const rawType = typeof parsed.type === 'string' ? parsed.type.trim().toLowerCase() : 'command';
    const type = HOOK_TYPE_SET.has(rawType) ? rawType : 'command';

    const rawLocation = typeof parsed.location === 'string' ? parsed.location.trim().toLowerCase() : 'project';
    const location = HOOK_LOCATION_SET.has(rawLocation) ? rawLocation : 'project';

    const timeout = typeof parsed.timeout === 'number'
      ? parsed.timeout
      : typeof parsed.timeout === 'string'
        ? parseInt(parsed.timeout, 10)
        : undefined;

    const command = typeof parsed.command === 'string'
      ? parsed.command
      : typeof parsed.prompt === 'string'
        ? parsed.prompt
        : typeof parsed.action === 'string'
          ? parsed.action
          : '';

    return {
      event,
      matcher: typeof parsed.matcher === 'string' ? parsed.matcher : '',
      type,
      command,
      timeout: Number.isFinite(timeout) && timeout! >= 0 ? timeout : 30000,
      async: Boolean(parsed.async),
      name: typeof parsed.name === 'string' ? parsed.name : '',
      description: typeof parsed.description === 'string' ? parsed.description : '',
      location,
    };
  };

  const nativeHooks = nativeHookRegistry.listFlat();

  return (
    <Box flexDirection="column" padding={1}>
      <HooksPanel
        hooks={ctx.hooksConfig}
        nativeHooks={nativeHooks}
        onToggle={handleHookToggle}
        onToggleNative={handleNativeHookToggle}
        onDelete={handleHookDelete}
        onAdd={handleHookAdd}
        onGenerateDraft={handleHookDraft}
        onCancel={() => ctx.setShowHooksPanel(false)}
      />
    </Box>
  );
}
