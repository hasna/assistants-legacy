/**
 * Contacts module
 *
 * Tools use the @hasna/contacts SDK adapter (sdk-adapter.ts).
 * Terminal UI panel uses the internal ContactsManager (manager.ts) for
 * synchronous access — can be migrated to async SDK in a future pass.
 */

// Internal manager — still used by terminal ContactsPanel
export { ContactsStore } from './store';
export { ContactsManager, createContactsManager } from './manager';

// SDK adapter (used by tools)
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

// Internal types — used by terminal ContactsPanel
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
