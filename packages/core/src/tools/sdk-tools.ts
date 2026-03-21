/**
 * SDK Tools — registers tools for all @hasna/* SDK integrations.
 *
 * Each SDK is lazy-imported inside its executor to avoid module-level side effects.
 * Tools are organized by domain. All tool names follow the pattern: {domain}_{action}.
 *
 * This file is the single entry point for all SDK tool registration.
 */

import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor, ToolRegistry } from './registry';

// ─── Helper: register a batch of tools ────────────────────────────────────────

function reg(registry: ToolRegistry, tools: Array<{ tool: Tool; executor: ToolExecutor }>) {
  for (const { tool, executor } of tools) {
    registry.register(tool, executor);
  }
}

function mkTool(name: string, description: string, params: Record<string, unknown>, required?: string[]): Tool {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      properties: params as any,
      ...(required ? { required } : {}),
    },
  };
}

function str(desc: string) { return { type: 'string', description: desc }; }
function num(desc: string) { return { type: 'number', description: desc }; }

// ─── Economy ──────────────────────────────────────────────────────────────────

function economyTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('economy_summary', 'Get cost summary across all sessions and projects.', {}),
      executor: async () => { const a = await import('../economy/sdk-adapter') as any; const r = await a.getCostSummary(); return r ? JSON.stringify(r, null, 2) : 'No cost data available.'; } },
    { tool: mkTool('economy_sessions', 'List sessions with their token/cost usage.', { limit: num('Max results') }),
      executor: async (i) => { const a = await import('../economy/sdk-adapter') as any; const r = await a.getSessions(Number(i.limit || 20)); return r?.length ? JSON.stringify(r, null, 2) : 'No sessions found.'; } },
    { tool: mkTool('economy_budget', 'Check budget status and remaining allowance.', {}),
      executor: async () => { const a = await import('../economy/sdk-adapter') as any; const r = await a.getBudgetStatus(); return r ? JSON.stringify(r, null, 2) : 'No budget configured.'; } },
    { tool: mkTool('economy_models', 'Get cost breakdown by model.', {}),
      executor: async () => { const a = await import('../economy/sdk-adapter') as any; const r = await a.getModelBreakdown(); return r ? JSON.stringify(r, null, 2) : 'No model data.'; } },
    { tool: mkTool('economy_sync', 'Sync cost data from agent session logs.', {}),
      executor: async () => { const a = await import('../economy/sdk-adapter') as any; await a.sync(); return 'Economy data synced.'; } },
  ];
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

function sessionsTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('sessions_sdk_search', 'Search across all AI agent sessions by keyword.', { query: str('Search query') }, ['query']),
      executor: async (i) => { const a = await import('../sessions-sdk/sdk-adapter') as any; const r = await a.searchSessions(String(i.query)); return r?.length ? JSON.stringify(r.slice(0, 10), null, 2) : 'No sessions found.'; } },
    { tool: mkTool('sessions_sdk_ingest', 'Ingest new sessions from agent log directories.', {}),
      executor: async () => { const a = await import('../sessions-sdk/sdk-adapter') as any; await a.ingestSessions(); return 'Sessions ingested.'; } },
    { tool: mkTool('sessions_sdk_summarize', 'Summarize a session by ID.', { session_id: str('Session ID') }, ['session_id']),
      executor: async (i) => { const a = await import('../sessions-sdk/sdk-adapter') as any; const r = await a.summarizeSession(String(i.session_id)); return r || 'Session not found.'; } },
  ];
}

// ─── Emails ───────────────────────────────────────────────────────────────────

function emailsTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('emails_send', 'Send an email.', { to: str('Recipient email'), subject: str('Subject'), body: str('Email body (HTML or plain text)'), from: str('Sender address (optional)') }, ['to', 'subject', 'body']),
      executor: async (i) => { const a = await import('../emails/sdk-adapter') as any; const r = await a.sendEmail({ to: String(i.to), subject: String(i.subject), body: String(i.body), from: i.from ? String(i.from) : undefined }); return r ? `Email sent: ${JSON.stringify(r)}` : 'Failed to send email.'; } },
    { tool: mkTool('emails_list', 'List sent emails.', { limit: num('Max results') }),
      executor: async (i) => { const a = await import('../emails/sdk-adapter') as any; const r = await a.listEmails(Number(i.limit || 20)); return r?.length ? JSON.stringify(r, null, 2) : 'No emails found.'; } },
    { tool: mkTool('emails_search', 'Search emails by keyword.', { query: str('Search query') }, ['query']),
      executor: async (i) => { const a = await import('../emails/sdk-adapter') as any; const r = await a.searchEmails(String(i.query)); return r?.length ? JSON.stringify(r.slice(0, 10), null, 2) : 'No emails matched.'; } },
    { tool: mkTool('emails_inbox', 'List inbound emails.', { limit: num('Max results') }),
      executor: async (i) => { const a = await import('../emails/sdk-adapter') as any; const r = await a.listInboundEmails(Number(i.limit || 20)); return r?.length ? JSON.stringify(r, null, 2) : 'Inbox empty.'; } },
    { tool: mkTool('emails_stats', 'Get email sending statistics.', {}),
      executor: async () => { const a = await import('../emails/sdk-adapter') as any; const r = await a.getStats(); return r ? JSON.stringify(r, null, 2) : 'No stats available.'; } },
  ];
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

function promptsTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('prompts_save', 'Save a reusable prompt template.', { name: str('Prompt name'), body: str('Prompt body text'), collection: str('Collection name (optional)') }, ['name', 'body']),
      executor: async (i) => { const a = await import('../prompts-sdk/sdk-adapter') as any; const r = await a.promptsSave({ name: String(i.name), body: String(i.body), collection: i.collection ? String(i.collection) : undefined }); return r ? `Saved: ${JSON.stringify(r)}` : 'Failed to save prompt.'; } },
    { tool: mkTool('prompts_list', 'List saved prompts.', { collection: str('Filter by collection (optional)') }),
      executor: async (i) => { const a = await import('../prompts-sdk/sdk-adapter') as any; const r = await a.promptsList(i.collection ? String(i.collection) : undefined); return r?.length ? JSON.stringify(r, null, 2) : 'No prompts saved.'; } },
    { tool: mkTool('prompts_get', 'Get a prompt by name.', { name: str('Prompt name') }, ['name']),
      executor: async (i) => { const a = await import('../prompts-sdk/sdk-adapter') as any; const r = await a.promptsGet(String(i.name)); return r ? JSON.stringify(r, null, 2) : 'Prompt not found.'; } },
    { tool: mkTool('prompts_search', 'Search prompts by keyword.', { query: str('Search query') }, ['query']),
      executor: async (i) => { const a = await import('../prompts-sdk/sdk-adapter') as any; const r = await a.promptsSearch(String(i.query)); return r?.length ? JSON.stringify(r, null, 2) : 'No prompts matched.'; } },
    { tool: mkTool('prompts_render', 'Render a prompt with variable substitution.', { name: str('Prompt name'), vars: str('JSON object of variables') }, ['name']),
      executor: async (i) => { const a = await import('../prompts-sdk/sdk-adapter') as any; const vars = i.vars ? JSON.parse(String(i.vars)) : {}; const r = await a.promptsRender(String(i.name), vars); return r || 'Failed to render prompt.'; } },
  ];
}

// ─── Attachments ──────────────────────────────────────────────────────────────

function attachmentsTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('attachments_upload', 'Upload a file as an attachment.', { file_path: str('Local file path'), tag: str('Tag for organization (optional)') }, ['file_path']),
      executor: async (i) => { const a = await import('../attachments/sdk-adapter') as any; const r = await a.uploadAttachment(String(i.file_path), i.tag ? String(i.tag) : undefined); return r ? `Uploaded: ${JSON.stringify(r)}` : 'Upload failed.'; } },
    { tool: mkTool('attachments_list', 'List uploaded attachments.', { tag: str('Filter by tag (optional)') }),
      executor: async (i) => { const a = await import('../attachments/sdk-adapter') as any; const r = await a.listAttachments(i.tag ? String(i.tag) : undefined); return r?.length ? JSON.stringify(r, null, 2) : 'No attachments.'; } },
    { tool: mkTool('attachments_download', 'Download an attachment by ID.', { id: str('Attachment ID'), dest: str('Destination path') }, ['id', 'dest']),
      executor: async (i) => { const a = await import('../attachments/sdk-adapter') as any; const r = await a.downloadAttachment(String(i.id), String(i.dest)); return r ? `Downloaded to: ${r}` : 'Download failed.'; } },
    { tool: mkTool('attachments_link', 'Get a shareable link for an attachment.', { id: str('Attachment ID') }, ['id']),
      executor: async (i) => { const a = await import('../attachments/sdk-adapter') as any; const r = await a.getLink(String(i.id)); return r || 'Link generation failed.'; } },
  ];
}

// ─── Recordings ───────────────────────────────────────────────────────────────

function recordingsTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('recordings_list', 'List saved recordings.', { limit: num('Max results') }),
      executor: async (i) => { const a = await import('../recordings/sdk-adapter') as any; const r = await a.listRecordings(Number(i.limit || 20)); return r?.length ? JSON.stringify(r, null, 2) : 'No recordings.'; } },
    { tool: mkTool('recordings_transcribe', 'Transcribe an audio file to text.', { file_path: str('Audio file path') }, ['file_path']),
      executor: async (i) => { const a = await import('../recordings/sdk-adapter') as any; const r = await a.transcribeAudio(String(i.file_path)); return r || 'Transcription failed.'; } },
    { tool: mkTool('recordings_search', 'Search recordings by keyword.', { query: str('Search query') }, ['query']),
      executor: async (i) => { const a = await import('../recordings/sdk-adapter') as any; const r = await a.searchRecordings(String(i.query)); return r?.length ? JSON.stringify(r, null, 2) : 'No recordings matched.'; } },
  ];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function hooksRegistryTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('hooks_registry_list', 'List available hooks from the @hasna/hooks registry.', {}),
      executor: async () => { const a = await import('../hooks-sdk/sdk-adapter') as any; const r = await a.listAvailableHooks(); return r?.length ? JSON.stringify(r, null, 2) : 'No hooks available.'; } },
    { tool: mkTool('hooks_registry_install', 'Install a hook from the registry.', { name: str('Hook name'), scope: str('global or project') }, ['name']),
      executor: async (i) => { const a = await import('../hooks-sdk/sdk-adapter') as any; const r = await a.installHook(String(i.name), (String(i.scope || 'project')) as 'global' | 'project'); return r ? `Hook installed: ${i.name}` : 'Install failed.'; } },
  ];
}

// ─── Browser ──────────────────────────────────────────────────────────────────

function browserTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('browser_navigate', 'Navigate to a URL in a headless browser.', { url: str('URL to navigate to') }, ['url']),
      executor: async (i) => { const a = await import('../browser/sdk-adapter') as any; const r = await a.browserNavigate(String(i.url)); return r ? JSON.stringify(r, null, 2) : 'Navigation failed.'; } },
    { tool: mkTool('browser_screenshot', 'Take a screenshot of the current page.', { path: str('Save path (optional)') }),
      executor: async (i) => { const a = await import('../browser/sdk-adapter') as any; const r = await a.browserScreenshot(i.path ? String(i.path) : undefined); return r ? `Screenshot saved: ${r}` : 'Screenshot failed.'; } },
    { tool: mkTool('browser_extract', 'Extract structured data from the current page.', { selector: str('CSS selector or description') }, ['selector']),
      executor: async (i) => { const a = await import('../browser/sdk-adapter') as any; const r = await a.browserExtract(String(i.selector)); return r ? JSON.stringify(r, null, 2) : 'Extraction failed.'; } },
    { tool: mkTool('browser_get_text', 'Get text content of the current page.', {}),
      executor: async () => { const a = await import('../browser/sdk-adapter') as any; const r = await a.browserGetText(); return r || 'No text content.'; } },
    { tool: mkTool('browser_click', 'Click an element on the page.', { selector: str('CSS selector or text to click') }, ['selector']),
      executor: async (i) => { const a = await import('../browser/sdk-adapter') as any; await a.browserClick(String(i.selector)); return `Clicked: ${i.selector}`; } },
  ];
}

// ─── Crawl ────────────────────────────────────────────────────────────────────

function crawlTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('crawl_url', 'Crawl a single URL and extract content.', { url: str('URL to crawl') }, ['url']),
      executor: async (i) => { const a = await import('../crawl/sdk-adapter') as any; const r = await a.crawlUrl(String(i.url)); return r ? JSON.stringify(r, null, 2) : 'Crawl failed.'; } },
    { tool: mkTool('crawl_site', 'Crawl an entire website.', { url: str('Starting URL'), max_pages: num('Max pages to crawl (default: 50)') }, ['url']),
      executor: async (i) => { const a = await import('../crawl/sdk-adapter') as any; const r = await a.crawlSite(String(i.url), Number(i.max_pages || 50)); return r ? JSON.stringify(r, null, 2) : 'Crawl failed.'; } },
    { tool: mkTool('crawl_search', 'Search the web using Firecrawl.', { query: str('Search query') }, ['query']),
      executor: async (i) => { const a = await import('../crawl/sdk-adapter') as any; const r = await a.searchWeb(String(i.query)); return r?.length ? JSON.stringify(r, null, 2) : 'No results.'; } },
    { tool: mkTool('crawl_extract', 'Extract structured data from a URL.', { url: str('URL to extract from'), schema: str('JSON schema for extraction (optional)') }, ['url']),
      executor: async (i) => { const a = await import('../crawl/sdk-adapter') as any; const r = await a.extractData(String(i.url), i.schema ? String(i.schema) : undefined); return r ? JSON.stringify(r, null, 2) : 'Extraction failed.'; } },
  ];
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

function logsTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('logs_create', 'Create a structured log entry.', { message: str('Log message'), level: str('Log level: info, warn, error, debug') }, ['message']),
      executor: async (i) => { const a = await import('../logs-sdk/sdk-adapter') as any; await a.createLog(String(i.message), String(i.level || 'info')); return 'Log created.'; } },
    { tool: mkTool('logs_list', 'List recent log entries.', { limit: num('Max entries'), level: str('Filter by level') }),
      executor: async (i) => { const a = await import('../logs-sdk/sdk-adapter') as any; const r = await a.listLogs(Number(i.limit || 20), i.level ? String(i.level) : undefined); return r?.length ? JSON.stringify(r, null, 2) : 'No logs.'; } },
    { tool: mkTool('logs_stats', 'Get log statistics.', {}),
      executor: async () => { const a = await import('../logs-sdk/sdk-adapter') as any; const r = await a.getStats(); return r ? JSON.stringify(r, null, 2) : 'No stats.'; } },
  ];
}

// ─── Testers ──────────────────────────────────────────────────────────────────

function testersTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('testers_create', 'Create a QA test scenario.', { title: str('Scenario title'), url: str('URL to test'), steps: str('Test steps (JSON array or description)') }, ['title', 'url']),
      executor: async (i) => { const a = await import('../testers/sdk-adapter') as any; const r = await a.createScenario({ title: String(i.title), url: String(i.url), steps: i.steps ? String(i.steps) : undefined }); return r ? `Scenario created: ${JSON.stringify(r)}` : 'Failed.'; } },
    { tool: mkTool('testers_list', 'List QA test scenarios.', {}),
      executor: async () => { const a = await import('../testers/sdk-adapter') as any; const r = await a.listScenarios(); return r?.length ? JSON.stringify(r, null, 2) : 'No scenarios.'; } },
    { tool: mkTool('testers_run', 'Run test scenarios.', { scenario_ids: str('Comma-separated scenario IDs (optional — all if omitted)') }),
      executor: async (i) => { const a = await import('../testers/sdk-adapter') as any; const ids = i.scenario_ids ? String(i.scenario_ids).split(',').map(s => s.trim()) : undefined; const r = await a.runScenarios(ids); return r ? `Run started: ${JSON.stringify(r)}` : 'Failed to start run.'; } },
    { tool: mkTool('testers_results', 'Get test run results.', { run_id: str('Run ID') }, ['run_id']),
      executor: async (i) => { const a = await import('../testers/sdk-adapter') as any; const r = await a.getResults(String(i.run_id)); return r ? JSON.stringify(r, null, 2) : 'Results not found.'; } },
  ];
}

// ─── Wallets ──────────────────────────────────────────────────────────────────

function walletsTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('wallets_balance', 'Get wallet balance.', {}),
      executor: async () => { const a = await import('../wallets-sdk/sdk-adapter') as any; const r = await a.getBalance(); return r ? JSON.stringify(r, null, 2) : 'No balance info.'; } },
    { tool: mkTool('wallets_cards', 'List payment cards.', {}),
      executor: async () => { const a = await import('../wallets-sdk/sdk-adapter') as any; const r = await a.listCards(); return r?.length ? JSON.stringify(r, null, 2) : 'No cards.'; } },
    { tool: mkTool('wallets_transactions', 'List recent transactions.', { limit: num('Max results') }),
      executor: async (i) => { const a = await import('../wallets-sdk/sdk-adapter') as any; const r = await a.listTransactions(Number(i.limit || 20)); return r?.length ? JSON.stringify(r, null, 2) : 'No transactions.'; } },
  ];
}

// ─── Deployment ───────────────────────────────────────────────────────────────

function deploymentTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('deploy_app', 'Deploy an application.', { project: str('Project name or path'), environment: str('Target environment (default: production)') }, ['project']),
      executor: async (i) => { const a = await import('../deployment/sdk-adapter') as any; const r = await a.deploy(String(i.project), String(i.environment || 'production')); return r ? JSON.stringify(r, null, 2) : 'Deploy failed.'; } },
    { tool: mkTool('deploy_status', 'Get deployment status.', { deployment_id: str('Deployment ID') }, ['deployment_id']),
      executor: async (i) => { const a = await import('../deployment/sdk-adapter') as any; const r = await a.getDeploymentStatus(String(i.deployment_id)); return r ? JSON.stringify(r, null, 2) : 'Not found.'; } },
    { tool: mkTool('deploy_list', 'List deployments.', { limit: num('Max results') }),
      executor: async (i) => { const a = await import('../deployment/sdk-adapter') as any; const r = await a.listDeployments(Number(i.limit || 10)); return r?.length ? JSON.stringify(r, null, 2) : 'No deployments.'; } },
    { tool: mkTool('deploy_rollback', 'Rollback a deployment.', { deployment_id: str('Deployment ID') }, ['deployment_id']),
      executor: async (i) => { const a = await import('../deployment/sdk-adapter') as any; const r = await a.rollback(String(i.deployment_id)); return r ? 'Rollback initiated.' : 'Rollback failed.'; } },
  ];
}

// ─── Sandboxes ────────────────────────────────────────────────────────────────

function sandboxesTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('sandbox_create', 'Create a cloud sandbox.', { template: str('Template or image name (optional)') }),
      executor: async (i) => { const a = await import('../sandboxes/sdk-adapter') as any; const r = await a.createSandbox(i.template ? String(i.template) : undefined); return r ? JSON.stringify(r, null, 2) : 'Failed.'; } },
    { tool: mkTool('sandbox_exec', 'Execute a command in a sandbox.', { sandbox_id: str('Sandbox ID'), command: str('Shell command') }, ['sandbox_id', 'command']),
      executor: async (i) => { const a = await import('../sandboxes/sdk-adapter') as any; const r = await a.execCommand(String(i.sandbox_id), String(i.command)); return r ?? 'Execution failed.'; } },
    { tool: mkTool('sandbox_list', 'List active sandboxes.', {}),
      executor: async () => { const a = await import('../sandboxes/sdk-adapter') as any; const r = await a.listSandboxes(); return r?.length ? JSON.stringify(r, null, 2) : 'No sandboxes.'; } },
    { tool: mkTool('sandbox_delete', 'Delete a sandbox.', { sandbox_id: str('Sandbox ID') }, ['sandbox_id']),
      executor: async (i) => { const a = await import('../sandboxes/sdk-adapter') as any; await a.deleteSandbox(String(i.sandbox_id)); return 'Sandbox deleted.'; } },
  ];
}

// ─── Researcher ───────────────────────────────────────────────────────────────

function researcherTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('research_run', 'Run an autonomous research cycle on a topic.', { topic: str('Research topic or question'), depth: str('shallow, medium, or deep (default: medium)') }, ['topic']),
      executor: async (i) => { const a = await import('../researcher/sdk-adapter') as any; const r = await a.runCycle(String(i.topic), String(i.depth || 'medium')); return r ? JSON.stringify(r, null, 2) : 'Research failed.'; } },
    { tool: mkTool('research_query', 'Query the research knowledge base.', { query: str('Question to ask the knowledge base') }, ['query']),
      executor: async (i) => { const a = await import('../researcher/sdk-adapter') as any; const r = await a.queryKnowledge(String(i.query)); return r || 'No knowledge found.'; } },
    { tool: mkTool('research_status', 'Get research workspace status.', {}),
      executor: async () => { const a = await import('../researcher/sdk-adapter') as any; const r = await a.getStatus(); return r ? JSON.stringify(r, null, 2) : 'No research workspace.'; } },
  ];
}

// ─── Microservices ────────────────────────────────────────────────────────────

function microservicesTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('microservices_list', 'List available microservice apps.', { category: str('Filter by category (optional)') }),
      executor: async (i) => { const a = await import('../microservices/sdk-adapter') as any; const r = await a.listMicroservices(i.category ? String(i.category) : undefined); return r?.length ? JSON.stringify(r, null, 2) : 'No microservices.'; } },
    { tool: mkTool('microservices_run', 'Run a microservice operation.', { name: str('Microservice name'), operation: str('Operation to run'), args: str('Arguments (JSON string)') }, ['name', 'operation']),
      executor: async (i) => { const a = await import('../microservices/sdk-adapter') as any; const r = await a.runMicroservice(String(i.name), String(i.operation), i.args ? String(i.args) : undefined); return r ? JSON.stringify(r, null, 2) : 'Failed.'; } },
    { tool: mkTool('microservices_install', 'Install a microservice.', { name: str('Microservice name') }, ['name']),
      executor: async (i) => { const a = await import('../microservices/sdk-adapter') as any; const r = await a.installMicroservice(String(i.name)); return r ? 'Installed.' : 'Install failed.'; } },
  ];
}

// ─── Implementations ──────────────────────────────────────────────────────────

function implementationsTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('impl_plan_create', 'Create an implementation plan.', { title: str('Plan title'), description: str('Plan description') }, ['title']),
      executor: async (i) => { const a = await import('../implementations/sdk-adapter') as any; const r = await a.createPlan(String(i.title), i.description ? String(i.description) : undefined); return r ? JSON.stringify(r, null, 2) : 'Failed.'; } },
    { tool: mkTool('impl_plan_list', 'List implementation plans.', {}),
      executor: async () => { const a = await import('../implementations/sdk-adapter') as any; const r = await a.listPlans(); return r?.length ? JSON.stringify(r, null, 2) : 'No plans.'; } },
    { tool: mkTool('impl_audit_create', 'Create an implementation audit.', { plan_id: str('Plan ID'), notes: str('Audit notes') }, ['plan_id']),
      executor: async (i) => { const a = await import('../implementations/sdk-adapter') as any; const r = await a.createAudit(String(i.plan_id), i.notes ? String(i.notes) : undefined); return r ? JSON.stringify(r, null, 2) : 'Failed.'; } },
    { tool: mkTool('impl_log', 'Create an implementation log entry.', { message: str('Log message'), plan_id: str('Plan ID (optional)') }, ['message']),
      executor: async (i) => { const a = await import('../implementations/sdk-adapter') as any; const r = await a.createLog(String(i.message), i.plan_id ? String(i.plan_id) : undefined); return r ? 'Logged.' : 'Failed.'; } },
  ];
}

// ─── Terminal ─────────────────────────────────────────────────────────────────

function terminalTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('terminal_exec', 'Execute a command via the smart terminal wrapper (structured output, token-efficient).', { command: str('Shell command to execute') }, ['command']),
      executor: async (i) => { const a = await import('../terminal-sdk/sdk-adapter') as any; const r = await a.execCommand(String(i.command)); return r ?? 'Execution failed.'; } },
  ];
}

// ─── MCPs ─────────────────────────────────────────────────────────────────────

function mcpsTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('mcps_list', 'List all known MCP servers.', {}),
      executor: async () => { const a = await import('../mcps-sdk/sdk-adapter') as any; const r = await a.listMcpServers(); return r?.length ? JSON.stringify(r, null, 2) : 'No MCP servers registered.'; } },
    { tool: mkTool('mcps_search', 'Search MCP server registry.', { query: str('Search query') }, ['query']),
      executor: async (i) => { const a = await import('../mcps-sdk/sdk-adapter') as any; const r = await a.searchMcpServers(String(i.query)); return r?.length ? JSON.stringify(r, null, 2) : 'No results.'; } },
  ];
}

// ─── Configs ──────────────────────────────────────────────────────────────────

function configsTools(): Array<{ tool: Tool; executor: ToolExecutor }> {
  return [
    { tool: mkTool('configs_list', 'List managed agent configurations.', {}),
      executor: async () => { const a = await import('../configs-sdk/sdk-adapter') as any; const r = await a.listConfigs(); return r?.length ? JSON.stringify(r, null, 2) : 'No configs.'; } },
    { tool: mkTool('configs_get', 'Get a specific configuration by name.', { name: str('Config name') }, ['name']),
      executor: async (i) => { const a = await import('../configs-sdk/sdk-adapter') as any; const r = await a.getConfig(String(i.name)); return r ? JSON.stringify(r, null, 2) : 'Config not found.'; } },
    { tool: mkTool('configs_apply', 'Apply a configuration profile.', { name: str('Config or profile name') }, ['name']),
      executor: async (i) => { const a = await import('../configs-sdk/sdk-adapter') as any; const r = await a.applyConfig(String(i.name)); return r ? 'Config applied.' : 'Apply failed.'; } },
    { tool: mkTool('configs_scan', 'Scan for exposed secrets in config files.', {}),
      executor: async () => { const a = await import('../configs-sdk/sdk-adapter') as any; const r = await a.scanSecrets(); return r ? JSON.stringify(r, null, 2) : 'No secrets found.'; } },
  ];
}

// ─── Public registration function ─────────────────────────────────────────────

/**
 * Register all SDK-backed tools with the given registry.
 * Called once during agent loop initialization.
 * All imports are lazy — no module-level side effects.
 */
export function registerAllSdkTools(registry: ToolRegistry): void {
  reg(registry, economyTools());
  reg(registry, sessionsTools());
  reg(registry, emailsTools());
  reg(registry, promptsTools());
  reg(registry, attachmentsTools());
  reg(registry, recordingsTools());
  reg(registry, hooksRegistryTools());
  reg(registry, browserTools());
  reg(registry, crawlTools());
  reg(registry, logsTools());
  reg(registry, testersTools());
  reg(registry, walletsTools());
  reg(registry, terminalTools());
  reg(registry, deploymentTools());
  reg(registry, sandboxesTools());
  reg(registry, researcherTools());
  reg(registry, microservicesTools());
  reg(registry, implementationsTools());
  reg(registry, mcpsTools());
  reg(registry, configsTools());
}
