/**
 * Contacts SDK adapter — wraps @hasna/contacts
 *
 * @hasna/contacts stores data at: ~/.contacts/contacts.db (CONTACTS_DB_PATH env)
 *
 * Notes on the API:
 * - contacts/companies/tasks/events: `db` is an optional last arg (auto-resolved)
 * - groups: `db` is a required first arg (must call getDatabase())
 * - deleteContact/deleteCompany return void (not boolean)
 * - addContactToGroup returns { added, already_member } not void
 */

let _lib: typeof import('@hasna/contacts') | null = null;

async function lib(): Promise<typeof import('@hasna/contacts')> {
  if (!_lib) _lib = await import('@hasna/contacts');
  return _lib;
}

// Re-export types
export type {
  Contact,
  ContactWithDetails,
  Company,
  CompanyWithDetails,
  Tag,
  Group,
  CreateGroupInput,
  ContactTask,
  ContactEvent,
  ContactNote,
  CreateContactInput,
  UpdateContactInput,
  ContactListOptions,
  CreateCompanyInput,
  UpdateCompanyInput,
  CompanyListOptions,
  CreateTagInput,
  CreateContactTaskInput,
  ListContactTasksOptions,
  CreateEventInput,
  ListEventsOptions,
} from '@hasna/contacts';

// ─── Contacts ─────────────────────────────────────────────────────────────────

export async function createContact(input: import('@hasna/contacts').CreateContactInput) {
  return (await lib()).createContact(input);
}

export async function getContact(id: string) {
  return (await lib()).getContact(id);
}

export async function getContactByEmail(email: string) {
  return (await lib()).getContactByEmail(email);
}

export async function listContacts(options: import('@hasna/contacts').ContactListOptions = {}) {
  return (await lib()).listContacts(options);
}

export async function updateContact(id: string, input: import('@hasna/contacts').UpdateContactInput) {
  return (await lib()).updateContact(id, input);
}

/** Returns true if deleted (deleteContact returns void, we check via try/catch) */
export async function deleteContact(id: string): Promise<boolean> {
  const l = await lib();
  try {
    l.deleteContact(id);
    return true;
  } catch {
    return false;
  }
}

export async function searchContacts(query: string) {
  return (await lib()).searchContacts(query);
}

export async function archiveContact(id: string): Promise<void> {
  (await lib()).archiveContact(id);
}

export async function unarchiveContact(id: string): Promise<void> {
  (await lib()).unarchiveContact(id);
}

export async function listRecentContacts(limit = 20) {
  return (await lib()).listRecentContacts(limit);
}

export async function mergeContacts(primaryId: string, secondaryId: string) {
  return (await lib()).mergeContacts(primaryId, secondaryId);
}

// ─── Companies ───────────────────────────────────────────────────────────────

export async function createCompany(input: import('@hasna/contacts').CreateCompanyInput) {
  return (await lib()).createCompany(input);
}

export async function getCompany(id: string) {
  return (await lib()).getCompany(id);
}

export async function listCompanies(options: import('@hasna/contacts').CompanyListOptions = {}) {
  return (await lib()).listCompanies(options);
}

export async function updateCompany(id: string, input: import('@hasna/contacts').UpdateCompanyInput) {
  return (await lib()).updateCompany(id, input);
}

/** Returns true if deleted */
export async function deleteCompany(id: string): Promise<boolean> {
  const l = await lib();
  try {
    l.deleteCompany(id);
    return true;
  } catch {
    return false;
  }
}

export async function searchCompanies(query: string) {
  return (await lib()).searchCompanies(query);
}

export async function listCompanyEmployees(companyId: string) {
  return (await lib()).listCompanyEmployees(companyId);
}

// ─── Tags ────────────────────────────────────────────────────────────────────

export async function listTags() {
  return (await lib()).listTags();
}

export async function createTag(input: import('@hasna/contacts').CreateTagInput) {
  return (await lib()).createTag(input);
}

export async function getTagByName(name: string) {
  return (await lib()).getTagByName(name);
}

export async function addTagToContact(contactId: string, tagId: string): Promise<void> {
  (await lib()).addTagToContact(contactId, tagId);
}

export async function removeTagFromContact(contactId: string, tagId: string): Promise<void> {
  (await lib()).removeTagFromContact(contactId, tagId);
}

export async function listContactsByTag(tagId: string) {
  return (await lib()).listContactsByTag(tagId);
}

// ─── Groups (require db as first arg — call getDatabase()) ───────────────────

async function getDb() {
  return (await lib()).getDatabase();
}

export async function createGroup(input: import('@hasna/contacts').CreateGroupInput) {
  const l = await lib();
  const db = l.getDatabase();
  return l.createGroup(db, input);
}

export async function listGroups() {
  const l = await lib();
  const db = l.getDatabase();
  return l.listGroups(db);
}

/** Returns true if deleted (deleteGroup returns void) */
export async function deleteGroup(id: string): Promise<boolean> {
  const l = await lib();
  const db = l.getDatabase();
  try {
    l.deleteGroup(db, id);
    return true;
  } catch {
    return false;
  }
}

export async function addContactToGroup(groupId: string, contactId: string): Promise<void> {
  const l = await lib();
  const db = l.getDatabase();
  // API is addContactToGroup(db, contactId, groupId)
  l.addContactToGroup(db, contactId, groupId);
}

export async function removeContactFromGroup(groupId: string, contactId: string): Promise<void> {
  const l = await lib();
  const db = l.getDatabase();
  l.removeContactFromGroup(db, contactId, groupId);
}

export async function listContactsInGroup(groupId: string): Promise<import('@hasna/contacts').ContactWithDetails[]> {
  const l = await lib();
  const db = l.getDatabase();
  // listContactsInGroup returns string[] (contact IDs)
  const ids = l.listContactsInGroup(db, groupId);
  const contacts = await Promise.all(ids.map(id => l.getContact(id)));
  return contacts.filter((c): c is import('@hasna/contacts').ContactWithDetails => !!c);
}

export async function listGroupsForContact(contactId: string) {
  const l = await lib();
  const db = l.getDatabase();
  return l.listGroupsForContact(db, contactId);
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function createContactTask(input: import('@hasna/contacts').CreateContactTaskInput) {
  return (await lib()).createContactTask(input);
}

export async function listContactTasks(options?: import('@hasna/contacts').ListContactTasksOptions) {
  return (await lib()).listContactTasks(options ?? {});
}

export async function listOverdueTasks() {
  return (await lib()).listOverdueTasks();
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function logEvent(input: import('@hasna/contacts').CreateEventInput) {
  return (await lib()).logEvent(input);
}

export async function listEvents(options?: import('@hasna/contacts').ListEventsOptions) {
  return (await lib()).listEvents(options ?? {});
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export async function addNote(contactId: string, content: string, companyId?: string) {
  return (await lib()).addNote(contactId, content, undefined, undefined, companyId);
}

export async function listNotes(contactId: string) {
  return (await lib()).listNotes(contactId);
}

// ─── Timeline ────────────────────────────────────────────────────────────────

export async function getContactTimeline(contactId: string) {
  return (await lib()).getContactTimeline(contactId);
}
