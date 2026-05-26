/**
 * Work panel renderers: Connectors, Tasks, Skills, Schedules.
 */
import React from 'react';
import type { Connector, ScheduledCommand } from '@hasna/assistants-shared';
import {
  getTasks, addTask, deleteTask, clearPendingTasks, clearCompletedTasks,
  isPaused, setPaused, startTask, updateTask,
  listSchedules, saveSchedule, deleteSchedule, updateSchedule, computeNextRun,
  createSkill, deleteSkill, createLLMClient, loadConfig,
  type Task, type TaskPriority, type TaskCreateOptions, type SkillScope, type CreateSkillOptions,
} from '@hasna/assistants-core';
import { generateId } from '@hasna/assistants-shared';
import type { AssistantsConfig } from '@hasna/assistants-shared';
import { ConnectorsPanel } from '../ConnectorsPanel';
import { TasksPanel } from '../TasksPanel';
import { SkillsPanel } from '../SkillsPanel';
import { SchedulesPanel } from '../SchedulesPanel';
import type { SkillDraft } from '../appHelpers';
import { collectStreamText, extractJsonObject, normalizeAllowedTools } from '../appHelpers';
import type { PanelRenderContext } from './context';

export function renderConnectorsPanel(ctx: PanelRenderContext): React.ReactNode {
  const handleCheckAuth = async (connector: Connector) => {
    if (!ctx.connectorBridgeRef.current) {
      return { authenticated: false, error: 'Not initialized' };
    }
    return ctx.connectorBridgeRef.current.checkAuthStatus(connector);
  };

  const handleGetCommandHelp = async (connector: Connector, command: string) => {
    if (!ctx.connectorBridgeRef.current) {
      return 'Not initialized';
    }
    return ctx.connectorBridgeRef.current.getCommandHelp(connector, command);
  };

  const handleLoadCommands = async (connectorName: string) => {
    if (!ctx.connectorBridgeRef.current) {
      return null;
    }
    const discovered = await ctx.connectorBridgeRef.current.discover([connectorName]);
    const connector = discovered.find((c) => c.name === connectorName);
    if (connector) {
      ctx.setConnectors((prev) => {
        const updated = prev.map((c) => c.name === connectorName ? connector : c);
        return updated;
      });
    }
    return connector || null;
  };

  return (
    <box flexDirection="column" padding={1}>
      <ConnectorsPanel
        connectors={ctx.connectors}
        initialConnector={ctx.connectorsPanelInitial}
        onCheckAuth={handleCheckAuth}
        onGetCommandHelp={handleGetCommandHelp}
        onLoadCommands={handleLoadCommands}
        onClose={() => {
          ctx.setShowConnectorsPanel(false);
          ctx.setConnectorsPanelInitial(undefined);
        }}
      />
    </box>
  );
}

export function renderTasksPanel(ctx: PanelRenderContext): React.ReactNode {
  const handleTasksAdd = async (options: TaskCreateOptions) => {
    try {
      await addTask(ctx.cwd, options);
      ctx.setTasksList(await getTasks(ctx.cwd));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTasksDelete = async (id: string) => {
    try {
      const deleted = await deleteTask(ctx.cwd, id);
      if (!deleted) throw new Error('Task not found or locked.');
      ctx.setTasksList(await getTasks(ctx.cwd));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTasksRun = async (id: string) => {
    try {
      const started = await startTask(ctx.cwd, id);
      if (!started) throw new Error('Task not found or locked.');
      const updatedTasks = await getTasks(ctx.cwd);
      ctx.setTasksList(updatedTasks);
      const task = updatedTasks.find((t) => t.id === id);
      if (task && ctx.activeSession) {
        await ctx.activeSession.client.send(`Execute the following task:\n\n${task.description}\n\nWhen done, report the result.`);
      }
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTasksClearPending = async () => {
    try {
      await clearPendingTasks(ctx.cwd);
      ctx.setTasksList(await getTasks(ctx.cwd));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTasksClearCompleted = async () => {
    try {
      await clearCompletedTasks(ctx.cwd);
      ctx.setTasksList(await getTasks(ctx.cwd));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTasksTogglePause = async () => {
    const newPaused = !ctx.tasksPaused;
    try {
      await setPaused(ctx.cwd, newPaused);
      ctx.setTasksPaused(newPaused);
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTasksChangePriority = async (id: string, priority: TaskPriority) => {
    try {
      const updated = await updateTask(ctx.cwd, id, { priority });
      if (!updated) throw new Error('Task not found or locked.');
      ctx.setTasksList(await getTasks(ctx.cwd));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <box flexDirection="column" padding={1}>
      <TasksPanel
        tasks={ctx.tasksList}
        paused={ctx.tasksPaused}
        onAdd={handleTasksAdd}
        onDelete={handleTasksDelete}
        onRun={handleTasksRun}
        onClearPending={handleTasksClearPending}
        onClearCompleted={handleTasksClearCompleted}
        onTogglePause={handleTasksTogglePause}
        onChangePriority={handleTasksChangePriority}
        onClose={() => ctx.setShowTasksPanel(false)}
      />
    </box>
  );
}

export function renderSkillsPanel(ctx: PanelRenderContext): React.ReactNode {
  const activeClient = ctx.registry.getActiveSession()?.client;

  const handleSkillExecute = (name: string) => {
    ctx.setShowSkillsPanel(false);
    if (activeClient) {
      activeClient.send(`/${name}`);
    }
  };

  const handleSkillCreate = async (options: CreateSkillOptions) => {
    const result = await createSkill(options);
    if (activeClient) {
      await activeClient.refreshSkills();
    }
    return result;
  };

  const handleSkillDraft = async (prompt: string, scope: SkillScope): Promise<SkillDraft> => {
    const config = ctx.currentConfig ?? await loadConfig(ctx.cwd, ctx.workspaceBaseDir);
    const llmConfig = config?.llm;
    if (!llmConfig?.model) {
      throw new Error('LLM not configured. Set llm.model in config.json.');
    }

    const llmClient = await createLLMClient(llmConfig);
    const systemPrompt = [
      'You are generating a SKILL.md draft for the assistants CLI.',
      'Return ONLY a JSON object with keys:',
      'name, description, allowed_tools, argument_hint, content.',
      'name: short kebab-case, do not include the word "skill".',
      'allowed_tools: array of tool names (or empty array if unsure).',
      'argument_hint: short usage hint like "[input] [options]".',
      'content: markdown instructions for the skill body. Include $ARGUMENTS where relevant.',
      'Do not wrap the JSON in markdown or code fences.',
    ].join('\n');

    const userPrompt = [
      `Scope: ${scope}`,
      `User prompt: ${prompt}`,
      '',
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
      throw new Error('Failed to parse skill draft from model response.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      throw new Error('Invalid JSON returned by model.');
    }

    const allowedTools = normalizeAllowedTools(parsed.allowed_tools ?? parsed.allowedTools ?? parsed.tools);

    return {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      allowedTools,
      argumentHint: typeof parsed.argument_hint === 'string'
        ? parsed.argument_hint
        : typeof parsed.argumentHint === 'string'
          ? parsed.argumentHint
          : undefined,
      content: typeof parsed.content === 'string' ? parsed.content : undefined,
    };
  };

  const handleSkillDelete = async (name: string, filePath: string) => {
    await deleteSkill(filePath);
    const skillLoader = activeClient?.getSkillLoader();
    if (skillLoader) {
      skillLoader.removeSkill(name);
    }
  };

  const handleSkillRefresh = async () => {
    if (activeClient) {
      const refreshed = await activeClient.refreshSkills();
      ctx.setSkillsList(refreshed);
      return refreshed;
    }
    return ctx.skillsList;
  };

  const handleSkillEnsureContent = async (name: string) => {
    const skillLoader = activeClient?.getSkillLoader();
    if (skillLoader && typeof skillLoader.ensureSkillContent === 'function') {
      return skillLoader.ensureSkillContent(name);
    }
    return null;
  };

  return (
    <box flexDirection="column" padding={1}>
      <SkillsPanel
        skills={ctx.skillsList}
        onExecute={handleSkillExecute}
        onCreate={handleSkillCreate}
        onGenerateDraft={handleSkillDraft}
        onDelete={handleSkillDelete}
        onRefresh={handleSkillRefresh}
        onEnsureContent={handleSkillEnsureContent}
        onClose={() => ctx.setShowSkillsPanel(false)}
        cwd={ctx.cwd}
      />
    </box>
  );
}

export function renderSchedulesPanel(ctx: PanelRenderContext): React.ReactNode {
  const scheduleListOpts = { global: true };

  const handleSchedulePause = async (id: string) => {
    try {
      const updated = await updateSchedule(ctx.cwd, id, (schedule) => ({
        ...schedule,
        status: 'paused',
        updatedAt: Date.now(),
      }));
      if (!updated) throw new Error('Schedule not found or locked.');
      ctx.setSchedulesList(await listSchedules(ctx.cwd, scheduleListOpts));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleScheduleResume = async (id: string) => {
    try {
      const updated = await updateSchedule(ctx.cwd, id, (schedule) => {
        const nextRun = computeNextRun(schedule, Date.now());
        return {
          ...schedule,
          status: 'active',
          updatedAt: Date.now(),
          nextRunAt: nextRun,
        };
      });
      if (!updated) throw new Error('Schedule not found or locked.');
      ctx.setSchedulesList(await listSchedules(ctx.cwd, scheduleListOpts));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleScheduleDelete = async (id: string) => {
    ctx.setSchedulesList((prev) => prev.filter((s) => s.id !== id));
    try {
      const deleted = await deleteSchedule(ctx.cwd, id);
      if (!deleted) throw new Error('Schedule not found or locked.');
      const refreshed = await listSchedules(ctx.cwd, scheduleListOpts);
      ctx.setSchedulesList(refreshed);
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleScheduleRun = async (id: string) => {
    const schedule = ctx.schedulesList.find((s) => s.id === id);
    if (schedule && ctx.activeSession) {
      try {
        const actionType = schedule.actionType || 'command';
        if (actionType === 'message' && schedule.message) {
          await ctx.activeSession.client.send(schedule.message);
        } else {
          await ctx.activeSession.client.send(schedule.command);
        }
      } catch (err) {
        ctx.setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleScheduleRefresh = async () => {
    try {
      ctx.setSchedulesList(await listSchedules(ctx.cwd, scheduleListOpts));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleScheduleCreate = async (schedule: Omit<ScheduledCommand, 'id' | 'createdAt' | 'updatedAt' | 'nextRunAt'>) => {
    try {
      const nowTs = Date.now();
      const fullSchedule: ScheduledCommand = {
        ...schedule,
        id: generateId(),
        createdAt: nowTs,
        updatedAt: nowTs,
      };
      fullSchedule.nextRunAt = computeNextRun(fullSchedule, nowTs);
      if (!fullSchedule.nextRunAt) {
        throw new Error('Unable to compute next run time. Check your schedule configuration.');
      }
      if (fullSchedule.schedule.kind === 'once' && fullSchedule.nextRunAt <= nowTs) {
        throw new Error('Scheduled time must be in the future.');
      }
      await saveSchedule(ctx.cwd, fullSchedule);
      ctx.setSchedulesList(await listSchedules(ctx.cwd, scheduleListOpts));
    } catch (err) {
      ctx.setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <box flexDirection="column" padding={1}>
      <SchedulesPanel
        schedules={ctx.schedulesList}
        sessionId={ctx.activeSessionId || 'default'}
        onPause={handleSchedulePause}
        onResume={handleScheduleResume}
        onDelete={handleScheduleDelete}
        onRun={handleScheduleRun}
        onCreate={handleScheduleCreate}
        onRefresh={handleScheduleRefresh}
        onClose={() => ctx.setShowSchedulesPanel(false)}
      />
    </box>
  );
}

