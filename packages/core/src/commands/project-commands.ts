import type { Command, CommandContext } from './types';
import { splitArgs, singleLine } from './helpers';
import { generateId } from '@hasna/assistants-shared';
import {
  createProject,
  deleteProject,
  ensureDefaultProject,
  findProjectByName,
  hasProjectNameConflict,
  listProjects,
  readProject,
  updateProject,
  type ProjectContextEntry,
  type ProjectPlan,
  type ProjectPlanStep,
  type ProjectRecord,
} from '../projects/store';
import { buildProjectContext } from '../projects/context';

async function resolveProject(context: CommandContext, target: string): Promise<ProjectRecord | null> {
  const byId = await readProject(context.cwd, target);
  if (byId) return byId;
  return findProjectByName(context.cwd, target);
}

async function ensureActiveProject(
  context: CommandContext,
  createIfMissing: boolean
): Promise<ProjectRecord | null> {
  const activeId = context.getActiveProjectId?.();
  if (activeId) {
    const project = await readProject(context.cwd, activeId);
    if (project) return project;
  }

  if (!createIfMissing) return null;

  const project = await ensureDefaultProject(context.cwd);
  context.setActiveProjectId?.(project.id);
  await applyProjectContext(context, project);
  return project;
}

async function applyProjectContext(context: CommandContext, project: ProjectRecord): Promise<void> {
  if (!context.setProjectContext) return;
  const projectContext = await buildProjectContext(project, {
    cwd: context.cwd,
    connectors: context.connectors,
  });
  context.setProjectContext(projectContext);
}

/**
 * /projects - Manage projects in the current folder
 */
export function projectsCommand(): Command {
  return {
    name: 'projects',
    description: 'Manage projects inside this folder',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const parts = splitArgs(args);
      const sub = parts[0] || '';

      // Interactive UI mode - default when no args or explicit 'ui'
      if (!sub || sub === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'projects' as const };
      }

      // Show help with explicit help command
      if (sub === 'help') {
        const projects = await listProjects(context.cwd);
        const activeId = context.getActiveProjectId?.();
        const activeProject = activeId ? projects.find(p => p.id === activeId) : null;

        let output = '\n📁 **Projects** - Manage projects in this folder\n\n';
        output += '**Commands:**\n';
        output += '  /projects                         Interactive project manager\n';
        output += '  /projects list                    List all projects\n';
        output += '  /projects new <name>              Create new project\n';
        output += '  /projects use <id|name>           Select active project\n';
        output += '  /projects show [id|name]          Show project details\n';
        output += '  /projects describe <id> <text>    Update description\n';
        output += '  /projects delete <id|name>        Delete project\n';
        output += '\n';

        if (activeProject) {
          output += `**Current:** ${singleLine(activeProject.name)} (${activeProject.id})\n`;
        } else if (projects.length > 0) {
          output += `**Projects:** ${projects.length} (none selected)\n`;
        } else {
          output += '**No projects yet.** Use `/projects new <name>` to create one.\n';
        }

        context.emit('text', output);
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'list' || sub === 'ls') {
        const projects = await listProjects(context.cwd);
        if (projects.length === 0) {
          context.emit('text', '\nNo projects found. Use /projects new <name>.\n');
          context.emit('done');
          return { handled: true };
        }
        const activeId = context.getActiveProjectId?.();
        let output = '\n**Projects**\n\n';
        for (const project of projects) {
          const marker = project.id === activeId ? '*' : ' ';
          output += `${marker} ${singleLine(project.name)} (${project.id})\n`;
        }
        context.emit('text', output);
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'new' || sub === 'create') {
        const name = parts.slice(1).join(' ').trim();
        if (!name) {
          context.emit('text', 'Usage: /projects new <name>\n');
          context.emit('done');
          return { handled: true };
        }
        const existing = await listProjects(context.cwd);
        if (hasProjectNameConflict(existing, name)) {
          context.emit('text', `Project "${name}" already exists.\n`);
          context.emit('done');
          return { handled: true };
        }
        const project = await createProject(context.cwd, name);
        context.setActiveProjectId?.(project.id);
        await applyProjectContext(context, project);
        context.emit('text', `Created project "${project.name}" (${project.id}).\n`);
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'use' || sub === 'switch') {
        const target = parts.slice(1).join(' ').trim();
        if (!target) {
          context.emit('text', 'Usage: /projects use <id|name>\n');
          context.emit('done');
          return { handled: true };
        }
        const project = await resolveProject(context, target);
        if (!project) {
          context.emit('text', `Project not found: ${target}\n`);
          context.emit('done');
          return { handled: true };
        }
        context.setActiveProjectId?.(project.id);
        await applyProjectContext(context, project);
        context.emit('text', `Switched to project "${project.name}".\n`);
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'show' || sub === 'info') {
        const target = parts.slice(1).join(' ').trim();
        const project = target
          ? await resolveProject(context, target)
          : await ensureActiveProject(context, false);
        if (!project) {
          context.emit('text', 'No project selected. Use /projects use <id|name>.\n');
          context.emit('done');
          return { handled: true };
        }
        let output = `\n**Project: ${singleLine(project.name)}**\n\n`;
        output += `ID: ${project.id}\n`;
        if (project.description) {
          output += `Description: ${singleLine(project.description)}\n`;
        }
        output += `Context entries: ${project.context.length}\n`;
        output += `Plans: ${project.plans.length}\n`;
        context.emit('text', output);
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'describe' || sub === 'desc') {
        const target = parts[1];
        const description = parts.slice(2).join(' ').trim();
        if (!target || !description) {
          context.emit('text', 'Usage: /projects describe <id|name> <description>\n');
          context.emit('done');
          return { handled: true };
        }
        const project = await resolveProject(context, target);
        if (!project) {
          context.emit('text', `Project not found: ${target}\n`);
          context.emit('done');
          return { handled: true };
        }
        const updated = await updateProject(context.cwd, project.id, (current) => ({
          ...current,
          description,
          updatedAt: Date.now(),
        }));
        if (updated) {
          await applyProjectContext(context, updated);
          context.emit('text', `Updated project "${updated.name}".\n`);
          context.emit('done');
          return { handled: true };
        }
        context.emit('text', `Failed to update project "${project.name}".\n`);
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'delete' || sub === 'rm') {
        const target = parts.slice(1).join(' ').trim();
        if (!target) {
          context.emit('text', 'Usage: /projects delete <id|name>\n');
          context.emit('done');
          return { handled: true };
        }
        const project = await resolveProject(context, target);
        if (!project) {
          context.emit('text', `Project not found: ${target}\n`);
          context.emit('done');
          return { handled: true };
        }
        const ok = await deleteProject(context.cwd, project.id);
        if (ok) {
          if (context.getActiveProjectId?.() === project.id) {
            context.setActiveProjectId?.(null);
            context.setProjectContext?.(null);
          }
          context.emit('text', `Deleted project "${project.name}".\n`);
          context.emit('done');
          return { handled: true };
        }
        context.emit('text', `Failed to delete project "${project.name}".\n`);
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', 'Unknown /projects command. Use /projects help.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /plans - Manage plans for the active project
 */
export function plansCommand(): Command {
  return {
    name: 'plans',
    description: 'Manage plans linked to the active project',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const parts = splitArgs(args);
      const sub = parts[0] || '';

      // Interactive UI mode - default when no args or explicit 'ui'
      if (!sub || sub === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'plans' as const };
      }

      // Show help with explicit help command
      if (sub === 'help') {
        const project = await ensureActiveProject(context, false);

        let output = '\n📋 **Plans** - Manage plans for the active project\n\n';
        output += '**Commands:**\n';
        output += '  /plans                                  Interactive plan manager\n';
        output += '  /plans list                             List all plans\n';
        output += '  /plans new <title>                      Create new plan\n';
        output += '  /plans show <planId>                    Show plan details\n';
        output += '  /plans add <planId> <step>              Add step to plan\n';
        output += '  /plans set <planId> <stepId> <status>   Update step status\n';
        output += '  /plans remove <planId> <stepId>         Remove step\n';
        output += '  /plans delete <planId>                  Delete plan\n';
        output += '\n';

        if (project) {
          output += `**Active project:** ${singleLine(project.name)} (${project.id})\n`;
          output += `**Plans:** ${project.plans.length}\n`;
        } else {
          output += '**No active project.** Use `/projects new <name>` first.\n';
        }

        context.emit('text', output);
        context.emit('done');
        return { handled: true };
      }

      const project = await ensureActiveProject(context, true);
      if (!project) {
        context.emit('text', 'No project found. Use /projects new <name> first.\n');
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'list' || sub === 'ls') {
        if (project.plans.length === 0) {
          context.emit('text', `\nNo plans for project "${project.name}".\n`);
          context.emit('done');
          return { handled: true };
        }
        let output = `\n**Plans (${singleLine(project.name)})**\n\n`;
        for (const plan of project.plans) {
          output += `- ${plan.id} ${singleLine(plan.title)} (${plan.steps.length} steps)\n`;
        }
        context.emit('text', output);
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'new' || sub === 'create') {
        const title = parts.slice(1).join(' ').trim();
        if (!title) {
          context.emit('text', 'Usage: /plans new <title>\n');
          context.emit('done');
          return { handled: true };
        }
        const now = Date.now();
        const plan: ProjectPlan = {
          id: generateId(),
          title,
          createdAt: now,
          updatedAt: now,
          steps: [],
        };
        const updated = await updateProject(context.cwd, project.id, (current) => ({
          ...current,
          plans: [...current.plans, plan],
          updatedAt: now,
        }));
        if (updated) {
          await applyProjectContext(context, updated);
          context.emit('text', `Created plan "${plan.title}" (${plan.id}).\n`);
          context.emit('done');
          return { handled: true };
        }
        context.emit('text', `Failed to create plan "${plan.title}".\n`);
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'show') {
        const id = parts[1];
        if (!id) {
          context.emit('text', 'Usage: /plans show <planId>\n');
          context.emit('done');
          return { handled: true };
        }
        const plan = project.plans.find((p) => p.id === id);
        if (!plan) {
          context.emit('text', `Plan not found: ${id}\n`);
          context.emit('done');
          return { handled: true };
        }
        let output = `\n**Plan: ${singleLine(plan.title)}**\n\n`;
        output += `ID: ${plan.id}\n`;
        if (plan.steps.length === 0) {
          output += 'No steps yet.\n';
        } else {
          for (const step of plan.steps) {
            output += `- ${step.id} [${step.status}] ${singleLine(step.text)}\n`;
          }
        }
        context.emit('text', output);
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'add') {
        const planId = parts[1];
        const text = parts.slice(2).join(' ').trim();
        if (!planId || !text) {
          context.emit('text', 'Usage: /plans add <planId> <step>\n');
          context.emit('done');
          return { handled: true };
        }
        if (!project.plans.some((plan) => plan.id === planId)) {
          context.emit('text', `Plan not found: ${planId}\n`);
          context.emit('done');
          return { handled: true };
        }
        const now = Date.now();
        const step: ProjectPlanStep = {
          id: generateId(),
          text,
          status: 'todo',
          createdAt: now,
          updatedAt: now,
        };
        const updated = await updateProject(context.cwd, project.id, (current) => ({
          ...current,
          plans: current.plans.map((plan) =>
            plan.id === planId
              ? { ...plan, steps: [...plan.steps, step], updatedAt: now }
              : plan
          ),
          updatedAt: now,
        }));
        if (updated) {
          await applyProjectContext(context, updated);
          context.emit('text', `Added step to plan ${planId}.\n`);
          context.emit('done');
          return { handled: true };
        }
        context.emit('text', `Failed to add step to plan ${planId}.\n`);
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'set') {
        const planId = parts[1];
        const stepId = parts[2];
        const status = parts[3] as ProjectPlanStep['status'] | undefined;
        if (!planId || !stepId || !status) {
          context.emit('text', 'Usage: /plans set <planId> <stepId> <todo|doing|done|blocked>\n');
          context.emit('done');
          return { handled: true };
        }
        const plan = project.plans.find((item) => item.id === planId);
        if (!plan) {
          context.emit('text', `Plan not found: ${planId}\n`);
          context.emit('done');
          return { handled: true };
        }
        if (!plan.steps.some((step) => step.id === stepId)) {
          context.emit('text', `Step not found: ${stepId}\n`);
          context.emit('done');
          return { handled: true };
        }
        const allowed: ProjectPlanStep['status'][] = ['todo', 'doing', 'done', 'blocked'];
        if (!allowed.includes(status)) {
          context.emit('text', 'Invalid status. Use todo, doing, done, or blocked.\n');
          context.emit('done');
          return { handled: true };
        }
        const now = Date.now();
        const updated = await updateProject(context.cwd, project.id, (current) => ({
          ...current,
          plans: current.plans.map((plan) =>
            plan.id === planId
              ? {
                  ...plan,
                  steps: plan.steps.map((step) =>
                    step.id === stepId ? { ...step, status, updatedAt: now } : step
                  ),
                  updatedAt: now,
                }
              : plan
          ),
          updatedAt: now,
        }));
        if (updated) {
          await applyProjectContext(context, updated);
          context.emit('text', `Updated step ${stepId} to ${status}.\n`);
          context.emit('done');
          return { handled: true };
        }
        context.emit('text', `Failed to update step ${stepId}.\n`);
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'remove') {
        const planId = parts[1];
        const stepId = parts[2];
        if (!planId || !stepId) {
          context.emit('text', 'Usage: /plans remove <planId> <stepId>\n');
          context.emit('done');
          return { handled: true };
        }
        const plan = project.plans.find((item) => item.id === planId);
        if (!plan) {
          context.emit('text', `Plan not found: ${planId}\n`);
          context.emit('done');
          return { handled: true };
        }
        if (!plan.steps.some((step) => step.id === stepId)) {
          context.emit('text', `Step not found: ${stepId}\n`);
          context.emit('done');
          return { handled: true };
        }
        const now = Date.now();
        const updated = await updateProject(context.cwd, project.id, (current) => ({
          ...current,
          plans: current.plans.map((plan) =>
            plan.id === planId
              ? { ...plan, steps: plan.steps.filter((step) => step.id !== stepId), updatedAt: now }
              : plan
          ),
          updatedAt: now,
        }));
        if (updated) {
          await applyProjectContext(context, updated);
          context.emit('text', `Removed step ${stepId} from plan ${planId}.\n`);
          context.emit('done');
          return { handled: true };
        }
        context.emit('text', `Failed to remove step ${stepId} from plan ${planId}.\n`);
        context.emit('done');
        return { handled: true };
      }

      if (sub === 'delete' || sub === 'rm') {
        const planId = parts[1];
        if (!planId) {
          context.emit('text', 'Usage: /plans delete <planId>\n');
          context.emit('done');
          return { handled: true };
        }
        if (!project.plans.some((plan) => plan.id === planId)) {
          context.emit('text', `Plan not found: ${planId}\n`);
          context.emit('done');
          return { handled: true };
        }
        const now = Date.now();
        const updated = await updateProject(context.cwd, project.id, (current) => ({
          ...current,
          plans: current.plans.filter((plan) => plan.id !== planId),
          updatedAt: now,
        }));
        if (updated) {
          await applyProjectContext(context, updated);
          context.emit('text', `Deleted plan ${planId}.\n`);
          context.emit('done');
          return { handled: true };
        }
        context.emit('text', `Failed to delete plan ${planId}.\n`);
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', 'Unknown /plans command. Use /plans help.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /workspace - Manage shared workspaces for agent collaboration
 */
export function workspaceCommand(): Command {
  return {
    name: 'workspace',
    description: 'Manage shared workspaces for agent collaboration',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const { SharedWorkspaceManager, getActiveWorkspaceId, setActiveWorkspaceId } = await import('../workspace');
      const manager = new SharedWorkspaceManager();
      const trimmedArgs = args.trim();
      const parts = trimmedArgs.split(/\s+/);
      const action = parts[0]?.toLowerCase() || '';

      // /workspace (no args) - show interactive panel
      if (action === '') {
        context.emit('done');
        return { handled: true, showPanel: 'workspace' as const };
      }

      // /workspace help
      if (action === 'help') {
        let message = '\n## Workspace Commands\n\n';
        message += '/workspace                       Browse workspaces interactively\n';
        message += '/workspace list                  List all workspaces\n';
        message += '/workspace create <name>         Create a new shared workspace\n';
        message += '/workspace use <id|name>         Set active workspace\n';
        message += '/workspace current              Show active workspace\n';
        message += '/workspace clear                Clear active workspace (use global)\n';
        message += '/workspace info <id>             Show workspace details\n';
        message += '/workspace archive <id>          Archive a workspace\n';
        message += '/workspace help                  Show this help\n';
        context.emit('text', message);
        context.emit('done');
        return { handled: true };
      }

      // /workspace list
      if (action === 'list') {
        const activeId = getActiveWorkspaceId();
        const workspaces = manager.list();
        if (workspaces.length === 0) {
          context.emit('text', '\nNo shared workspaces. Use /workspace create <name> to create one.\n');
        } else {
          let message = '\n**Shared Workspaces**\n\n';
          for (const ws of workspaces) {
            const prefix = ws.id === activeId ? '* ' : '- ';
            message += `${prefix}**${ws.name}** (${ws.id})\n`;
            message += `  Participants: ${ws.participants.length} | Status: ${ws.status}\n`;
            message += `  Created: ${new Date(ws.createdAt).toLocaleString()}\n`;
          }
          context.emit('text', message);
        }
        context.emit('done');
        return { handled: true };
      }

      // /workspace create <name>
      if (action === 'create') {
        const name = parts.slice(1).join(' ').trim();
        if (!name) {
          context.emit('text', '\nUsage: /workspace create <name>\n');
          context.emit('done');
          return { handled: true };
        }
        const creatorId = context.sessionId || 'default';
        const workspace = manager.create(name, creatorId, []);
        context.emit('text', `\n✓ Workspace created: **${workspace.name}** (${workspace.id})\n`);
        context.emit('text', `  Path: ${manager.getPath(workspace.id)}\n`);
        context.emit('done');
        return { handled: true };
      }

      // /workspace use <id|name>
      if (action === 'use' || action === 'switch') {
        const target = parts.slice(1).join(' ').trim();
        if (!target) {
          context.emit('text', '\nUsage: /workspace use <id|name>\n');
          context.emit('done');
          return { handled: true };
        }
        const all = manager.list(true);
        const workspace = manager.get(target)
          || all.find((ws) => ws.name.toLowerCase() === target.toLowerCase());
        if (!workspace) {
          context.emit('text', `\nWorkspace ${target} not found.\n`);
          context.emit('done');
          return { handled: true };
        }
        setActiveWorkspaceId(workspace.id);
        context.emit('text', `\n✓ Active workspace set: **${workspace.name}** (${workspace.id})\n`);
        context.emit('done');
        return { handled: true };
      }

      // /workspace current
      if (action === 'current' || action === 'active') {
        const activeId = getActiveWorkspaceId();
        if (!activeId) {
          context.emit('text', '\nNo active workspace (using global context).\n');
          context.emit('done');
          return { handled: true };
        }
        const workspace = manager.get(activeId);
        if (!workspace) {
          context.emit('text', `\nActive workspace ${activeId} not found.\n`);
          context.emit('done');
          return { handled: true };
        }
        context.emit('text', `\nActive workspace: **${workspace.name}** (${workspace.id})\n`);
        context.emit('done');
        return { handled: true };
      }

      // /workspace clear
      if (action === 'clear' || action === 'reset') {
        setActiveWorkspaceId(null);
        context.emit('text', '\n✓ Cleared active workspace (using global context).\n');
        context.emit('done');
        return { handled: true };
      }

      // /workspace info <id>
      if (action === 'info') {
        const id = parts[1]?.trim();
        if (!id) {
          context.emit('text', '\nUsage: /workspace info <id>\n');
          context.emit('done');
          return { handled: true };
        }
        const workspace = manager.get(id);
        if (!workspace) {
          context.emit('text', `\nWorkspace ${id} not found.\n`);
        } else {
          let message = `\n**Workspace: ${workspace.name}**\n\n`;
          message += `ID: ${workspace.id}\n`;
          message += `Status: ${workspace.status}\n`;
          message += `Created by: ${workspace.createdBy}\n`;
          message += `Participants: ${workspace.participants.join(', ')}\n`;
          message += `Created: ${new Date(workspace.createdAt).toLocaleString()}\n`;
          message += `Path: ${manager.getPath(workspace.id)}\n`;
          if (workspace.description) {
            message += `Description: ${workspace.description}\n`;
          }
          context.emit('text', message);
        }
        context.emit('done');
        return { handled: true };
      }

      // /workspace archive <id>
      if (action === 'archive') {
        const id = parts[1]?.trim();
        if (!id) {
          context.emit('text', '\nUsage: /workspace archive <id>\n');
          context.emit('done');
          return { handled: true };
        }
        manager.archive(id);
        context.emit('text', `\n✓ Workspace ${id} archived.\n`);
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', '\nUnknown workspace command. Use /workspace help for available commands.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}
