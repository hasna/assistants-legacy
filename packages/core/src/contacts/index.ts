/**
 * Contacts module — fully backed by @hasna/contacts SDK
 *
 * The SDK handles all CRUD and storage (~/.contacts/contacts.db).
 * sdk-adapter.ts provides async wrappers with lazy-loading.
 * tools.ts provides LLM tool definitions and executors.
 *
 * Legacy: store.ts, manager.ts, types.ts are retained for backward
 * compatibility but are no longer used by the main code paths.
 */

// SDK adapter (used by tools and ContactsPanel)
export {
  createContact, getContact, getContactByEmail, listContacts, updateContact,
  deleteContact, searchContacts, archiveContact, unarchiveContact, mergeContacts, listRecentContacts,
  createCompany, getCompany, listCompanies, updateCompany, deleteCompany, searchCompanies, listCompanyEmployees,
  listTags, createTag, addTagToContact, removeTagFromContact, listContactsByTag, getTagByName,
  createGroup, listGroups, deleteGroup, addContactToGroup, removeContactFromGroup,
  listContactsInGroup, listGroupsForContact,
  createContactTask, listContactTasks, listOverdueTasks,
  logEvent, listEvents,
  addNote, listNotes,
  getContactTimeline,
} from './sdk-adapter';

export type {
  ContactWithDetails, Company, CompanyWithDetails, Tag, Group,
  CreateGroupInput, ContactTask, ContactNote, ContactEvent,
  CreateContactInput, UpdateContactInput, ContactListOptions,
  CreateCompanyInput, UpdateCompanyInput, CompanyListOptions,
} from './sdk-adapter';

// Tools
export {
  contactsTools,
  contactsListTool, contactsGetTool, contactsCreateTool, contactsUpdateTool,
  contactsDeleteTool, contactsSearchTool,
  contactsGroupsListTool, contactsGroupsCreateTool, contactsGroupsDeleteTool,
  contactsGroupsAddMemberTool, contactsGroupsRemoveMemberTool,
  contactsCompaniesListTool, contactsCompaniesGetTool, contactsCompaniesCreateTool,
  contactsCompaniesUpdateTool, contactsCompaniesDeleteTool,
  contactsCompaniesSearchTool, contactsCompaniesEmployeesTool,
  createContactsToolExecutors,
  registerContactsTools,
} from './tools';

// Legacy exports — retained for backward compat, no longer actively used
export { ContactsStore } from './store';
export { ContactsManager, createContactsManager } from './manager';
export type {
  Contact,
  ContactEmail,
  ContactPhone,
  ContactAddress,
  ContactSocial,
  ContactGroupRef,
  ContactListItem,
  ContactGroup,
  ContactRelationship,
  CreateContactOptions,
  UpdateContactOptions,
  ContactsListOptions,
} from './types';
