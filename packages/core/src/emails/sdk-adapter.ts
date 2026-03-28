/**
 * Emails SDK adapter — lazy loader for @hasna/emails
 *
 * Wraps @hasna/emails SDK functions with graceful error handling.
 * Each function returns null/[] on failure so callers don't need try/catch.
 */

let _lib: any | null = null;
async function lib(): Promise<any> {
  if (!_lib) _lib = await import('@hasna/emails');
  return _lib;
}

/** Safe wrapper — returns fallback on error */
async function safe<T>(fn: (sdk: any) => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(await lib()); } catch { return fallback; }
}

// ─── Core email operations ───────────────────────────────────────────────────

export const sendEmail = (args?: any) => safe(s => s.sendEmail(args), null);
export const listEmails = (args?: any) => safe(s => s.listEmails(args), []);
export const getEmail = (id: string) => safe(s => s.getEmail(id), null);
export const getEmailContent = (id: string) => safe(s => s.getEmailContent(id), null);
export const searchEmails = (query: string) => safe(s => s.searchEmails(query), []);
export const deleteEmail = (id: string) => safe(s => s.deleteEmail(id), null);
export const updateEmailStatus = (id: string, status: string) => safe(s => s.updateEmailStatus(id, status), null);

// ─── Sending ─────────────────────────────────────────────────────────────────

export const batchSend = (args?: any) => safe(s => s.batchSend(args), null);
export const sendWithFailover = (args?: any) => safe(s => s.sendWithFailover(args), null);
export const scheduleEmail = (args?: any) => safe(s => s.createScheduledEmail(args), null);
export const listScheduledEmails = () => safe(s => s.listScheduledEmails(), []);
export const cancelScheduledEmail = (id: string) => safe(s => s.cancelScheduledEmail(id), null);

// ─── Inbound & sync ─────────────────────────────────────────────────────────

export const syncInbox = (args?: any) => safe(s => s.syncAll(args), null);
export const listInboundEmails = (args?: any) => safe(s => s.listInboundEmails(args), []);
export const listReplies = (emailId: string) => safe(s => s.listReplies(emailId), []);

// ─── Triage (AI-powered) ────────────────────────────────────────────────────

export const triageEmail = (args?: any) => safe(s => s.triageEmail(args), null);
export const triageBatch = (args?: any) => safe(s => s.triageBatch(args), null);
export const generateDraftReply = (args?: any) => safe(s => s.generateDraftReply(args), null);

// ─── Contacts ────────────────────────────────────────────────────────────────

export const listContacts = (args?: any) => safe(s => s.listContacts(args), []);
export const suppressContact = (email: string) => safe(s => s.suppressContact(email), null);
export const unsuppressContact = (email: string) => safe(s => s.unsuppressContact(email), null);

// ─── Templates ───────────────────────────────────────────────────────────────

export const listTemplates = () => safe(s => s.listTemplates(), []);
export const getTemplate = (name: string) => safe(s => s.getTemplateByName(name), null);
export const renderTemplate = (name: string, vars: Record<string, string>) => safe(s => s.renderTemplate(name, vars), null);

// ─── Addresses & domains ────────────────────────────────────────────────────

export const listAddresses = (args?: any) => safe(s => s.listAddresses(args), []);
export const listDomains = () => safe(s => s.listDomains(), []);
export const verifyEmailAddress = (email: string) => safe(s => s.verifyEmailAddress(email), null);

// ─── Providers ───────────────────────────────────────────────────────────────

export const listProviders = () => safe(s => s.listProviders(), []);

// ─── Sequences ───────────────────────────────────────────────────────────────

export const listSequences = () => safe(s => s.listSequences(), []);
export const enrollContact = (seqId: string, contactEmail: string) => safe(s => s.enroll(seqId, contactEmail), null);

// ─── Analytics & stats ──────────────────────────────────────────────────────

export const getStats = () => safe(s => s.getLocalStats(), null);
export const getAnalytics = (args?: any) => safe(s => s.getAnalytics(args), null);
