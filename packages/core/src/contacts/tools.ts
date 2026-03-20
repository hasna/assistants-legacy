/**
 * Contacts tools — backed by @hasna/contacts SDK adapter
 *
 * Uses ~/.contacts/contacts.db (same DB as the @hasna/contacts CLI).
 * Includes contacts, groups, companies, tasks, and events.
 */

import type { Tool } from '@hasna/assistants-shared';
import type { ToolExecutor, ToolRegistry } from '../tools/registry';
import {
  createContact, getContact, getContactByEmail, listContacts, updateContact,
  deleteContact, searchContacts, archiveContact,
  createCompany, getCompany, listCompanies, updateCompany, deleteCompany, searchCompanies, listCompanyEmployees,
  createGroup, listGroups, deleteGroup, addContactToGroup, removeContactFromGroup, listContactsInGroup,
  listTags, getTagByName, createTag,
  createContactTask, listContactTasks,
  logEvent, listEvents,
  addNote, listNotes,
  getContactTimeline,
} from './sdk-adapter';
import type { ContactWithDetails, CompanyWithDetails } from './sdk-adapter';

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatContact(c: ContactWithDetails): string {
  const name = c.display_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.id;
  const email = c.emails?.[0]?.address ?? '—';
  const phone = c.phones?.[0]?.number ?? '—';
  const company = (c as any).company?.name ?? '';
  return `**${name}** (${c.id})${company ? ` · ${company}` : ''}${c.job_title ? ` · ${c.job_title}` : ''}\n  Email: ${email} · Phone: ${phone}${c.notes ? `\n  Notes: ${c.notes}` : ''}`;
}

function formatContactsList(contacts: ContactWithDetails[]): string {
  if (contacts.length === 0) return 'No contacts found.';
  const lines = contacts.map(c => {
    const name = c.display_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.id;
    const email = c.emails?.[0]?.address;
    return `- **${name}** (${c.id})${email ? ` — ${email}` : ''}${(c as any).company?.name ? ` · ${(c as any).company.name}` : ''}`;
  });
  return `## Contacts (${contacts.length})\n\n${lines.join('\n')}`;
}

// ─── Tool definitions (schemas unchanged for backward compat) ─────────────────

export const contactsListTool: Tool = {
  name: 'contacts_list',
  description: 'List contacts from the address book. Supports filtering by query, tag, group, or favorites.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query to filter by name, company, email, or phone' },
      tag: { type: 'string', description: 'Filter by tag name' },
      group: { type: 'string', description: 'Filter by group name or ID' },
      limit: { type: 'number', description: 'Maximum contacts to return (default: 50)' },
      offset: { type: 'number', description: 'Offset for pagination' },
    },
  },
};

export const contactsGetTool: Tool = {
  name: 'contacts_get',
  description: 'Get full details for a contact by ID, including emails, phones, addresses, and timeline.',
  parameters: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Contact ID' } },
    required: ['id'],
  },
};

export const contactsCreateTool: Tool = {
  name: 'contacts_create',
  description: 'Create a new contact in the address book.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Contact full name' },
      first_name: { type: 'string', description: 'First name' },
      last_name: { type: 'string', description: 'Last name' },
      company: { type: 'string', description: 'Company name (looks up or creates)' },
      title: { type: 'string', description: 'Job title' },
      birthday: { type: 'string', description: 'Birthday in YYYY-MM-DD format' },
      notes: { type: 'string', description: 'Freeform notes' },
      emails: {
        type: 'array',
        description: 'Email addresses',
        items: { type: 'object', description: 'Email', properties: { email: { type: 'string', description: 'Address' }, label: { type: 'string', description: 'Label' }, isPrimary: { type: 'boolean', description: 'Primary flag' } }, required: ['email'] },
      },
      phones: {
        type: 'array',
        description: 'Phone numbers',
        items: { type: 'object', description: 'Phone', properties: { phone: { type: 'string', description: 'Number' }, label: { type: 'string', description: 'Label' }, isPrimary: { type: 'boolean', description: 'Primary flag' } }, required: ['phone'] },
      },
      tags: { type: 'array', description: 'Tags', items: { type: 'string', description: 'Tag name' } },
    },
    required: ['name'],
  },
};

export const contactsUpdateTool: Tool = {
  name: 'contacts_update',
  description: 'Update an existing contact. Only provided fields are updated.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Contact ID' },
      name: { type: 'string', description: 'Updated name' },
      title: { type: 'string', description: 'Updated job title' },
      notes: { type: 'string', description: 'Updated notes' },
      birthday: { type: 'string', description: 'Updated birthday (YYYY-MM-DD)' },
      emails: { type: 'array', description: 'Emails to add', items: { type: 'object', description: 'Email', properties: { email: { type: 'string', description: 'Address' }, isPrimary: { type: 'boolean', description: 'Primary' } }, required: ['email'] } },
      phones: { type: 'array', description: 'Phones to add', items: { type: 'object', description: 'Phone', properties: { phone: { type: 'string', description: 'Number' }, isPrimary: { type: 'boolean', description: 'Primary' } }, required: ['phone'] } },
    },
    required: ['id'],
  },
};

export const contactsDeleteTool: Tool = {
  name: 'contacts_delete',
  description: 'Delete a contact from the address book.',
  parameters: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Contact ID' } },
    required: ['id'],
  },
};

export const contactsSearchTool: Tool = {
  name: 'contacts_search',
  description: 'Full-text search across contacts by name, company, email, phone, or notes.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Search query' } },
    required: ['query'],
  },
};

export const contactsGroupsListTool: Tool = {
  name: 'contacts_groups_list',
  description: 'List all contact groups.',
  parameters: { type: 'object', properties: {} },
};

export const contactsGroupsCreateTool: Tool = {
  name: 'contacts_groups_create',
  description: 'Create a new contact group.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Group name (must be unique)' },
      description: { type: 'string', description: 'Group description' },
    },
    required: ['name'],
  },
};

export const contactsGroupsDeleteTool: Tool = {
  name: 'contacts_groups_delete',
  description: 'Delete a contact group. Members are not deleted.',
  parameters: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Group ID' } },
    required: ['id'],
  },
};

export const contactsGroupsAddMemberTool: Tool = {
  name: 'contacts_groups_add_member',
  description: 'Add a contact to a group.',
  parameters: {
    type: 'object',
    properties: {
      group_id: { type: 'string', description: 'Group ID' },
      contact_id: { type: 'string', description: 'Contact ID' },
    },
    required: ['group_id', 'contact_id'],
  },
};

export const contactsGroupsRemoveMemberTool: Tool = {
  name: 'contacts_groups_remove_member',
  description: 'Remove a contact from a group.',
  parameters: {
    type: 'object',
    properties: {
      group_id: { type: 'string', description: 'Group ID' },
      contact_id: { type: 'string', description: 'Contact ID' },
    },
    required: ['group_id', 'contact_id'],
  },
};

// ─── Company tools (new — @hasna/contacts SDK) ────────────────────────────────

export const contactsCompaniesListTool: Tool = {
  name: 'contacts_companies_list',
  description: 'List companies in the contacts database.',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max companies to return (default: 50)' },
      offset: { type: 'number', description: 'Offset for pagination' },
    },
  },
};

export const contactsCompaniesGetTool: Tool = {
  name: 'contacts_companies_get',
  description: 'Get full details for a company by ID.',
  parameters: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Company ID' } },
    required: ['id'],
  },
};

export const contactsCompaniesCreateTool: Tool = {
  name: 'contacts_companies_create',
  description: 'Create a new company in the contacts database.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Company name' },
      domain: { type: 'string', description: 'Website domain (e.g., example.com)' },
      industry: { type: 'string', description: 'Industry category' },
      notes: { type: 'string', description: 'Notes about the company' },
    },
    required: ['name'],
  },
};

export const contactsCompaniesUpdateTool: Tool = {
  name: 'contacts_companies_update',
  description: 'Update a company.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Company ID' },
      name: { type: 'string', description: 'Updated name' },
      domain: { type: 'string', description: 'Updated domain' },
      industry: { type: 'string', description: 'Updated industry' },
      notes: { type: 'string', description: 'Updated notes' },
    },
    required: ['id'],
  },
};

export const contactsCompaniesDeleteTool: Tool = {
  name: 'contacts_companies_delete',
  description: 'Delete a company.',
  parameters: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Company ID' } },
    required: ['id'],
  },
};

export const contactsCompaniesSearchTool: Tool = {
  name: 'contacts_companies_search',
  description: 'Search companies by name or domain.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Search query' } },
    required: ['query'],
  },
};

export const contactsCompaniesEmployeesTool: Tool = {
  name: 'contacts_companies_employees',
  description: 'List contacts who work at a company.',
  parameters: {
    type: 'object',
    properties: { company_id: { type: 'string', description: 'Company ID' } },
    required: ['company_id'],
  },
};

// ─── All tools ────────────────────────────────────────────────────────────────

export const contactsTools: Tool[] = [
  contactsListTool, contactsGetTool, contactsCreateTool, contactsUpdateTool,
  contactsDeleteTool, contactsSearchTool,
  contactsGroupsListTool, contactsGroupsCreateTool, contactsGroupsDeleteTool,
  contactsGroupsAddMemberTool, contactsGroupsRemoveMemberTool,
  contactsCompaniesListTool, contactsCompaniesGetTool, contactsCompaniesCreateTool,
  contactsCompaniesUpdateTool, contactsCompaniesDeleteTool,
  contactsCompaniesSearchTool, contactsCompaniesEmployeesTool,
];

// ─── Executors ────────────────────────────────────────────────────────────────

function createContactsExecutors(): Record<string, ToolExecutor> {
  return {
    contacts_list: async (input) => {
      try {
        const query = typeof input.query === 'string' ? input.query.trim() : undefined;
        const tag = typeof input.tag === 'string' ? input.tag.trim() : undefined;
        const group = typeof input.group === 'string' ? input.group.trim() : undefined;
        const limit = typeof input.limit === 'number' ? input.limit : 50;
        const offset = typeof input.offset === 'number' ? input.offset : undefined;

        let contacts: ContactWithDetails[] = [];

        if (query) {
          contacts = await searchContacts(query);
        } else if (group) {
          // Find group by name or ID and list members
          const groups = await listGroups();
          const found = groups.find(g => g.id === group || g.name.toLowerCase() === group.toLowerCase());
          if (!found) return `Group "${group}" not found.`;
          contacts = await listContactsInGroup(found.id);
        } else if (tag) {
          // Get tag by name, then filter
          const tagObj = await getTagByName(tag);
          if (!tagObj) return `Tag "${tag}" not found.`;
          const result = await listContacts({ tag_id: tagObj.id, limit, offset });
          contacts = result.contacts;
        } else {
          const result = await listContacts({ limit, offset });
          contacts = result.contacts;
        }

        return formatContactsList(contacts);
      } catch (e) {
        return `Error listing contacts: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    contacts_get: async (input) => {
      const id = typeof input.id === 'string' ? input.id.trim() : '';
      if (!id) return 'Error: id is required.';
      try {
        const contact = await getContact(id);
        if (!contact) return `Contact not found: ${id}`;
        const lines: string[] = [
          `## ${contact.display_name || contact.id}`,
          `ID: ${contact.id}`,
        ];
        if (contact.job_title) lines.push(`Title: ${contact.job_title}`);
        if ((contact as any).company) lines.push(`Company: ${(contact as any).company.name}`);
        if (contact.birthday) lines.push(`Birthday: ${contact.birthday}`);
        if (contact.notes) lines.push(`Notes: ${contact.notes}`);
        if (contact.emails?.length) lines.push(`Emails: ${contact.emails.map(e => `${e.address}${e.is_primary ? ' (primary)' : ''}`).join(', ')}`);
        if (contact.phones?.length) lines.push(`Phones: ${contact.phones.map(p => `${p.number}${p.is_primary ? ' (primary)' : ''}`).join(', ')}`);
        if (contact.social_profiles?.length) lines.push(`Social: ${contact.social_profiles.map(s => `${s.platform}: ${s.handle || s.url}`).join(', ')}`);
        return lines.join('\n');
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    contacts_create: async (input) => {
      const displayName = typeof input.name === 'string' ? input.name.trim() : '';
      if (!displayName) return 'Error: name is required.';
      try {
        const emails = Array.isArray(input.emails)
          ? (input.emails as Array<{ email: string; label?: string; isPrimary?: boolean }>).map(e => ({ address: e.email, is_primary: e.isPrimary }))
          : undefined;
        const phones = Array.isArray(input.phones)
          ? (input.phones as Array<{ phone: string; label?: string; isPrimary?: boolean }>).map(p => ({ number: p.phone, is_primary: p.isPrimary }))
          : undefined;

        // Handle tags: resolve or create by name
        let tagIds: string[] | undefined;
        if (Array.isArray(input.tags) && (input.tags as string[]).length > 0) {
          const allTags = await listTags();
          tagIds = await Promise.all((input.tags as string[]).map(async (tagName: string) => {
            const existing = allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
            if (existing) return existing.id;
            const newTag = await createTag({ name: tagName, color: '#6B7280' });
            return newTag.id;
          }));
        }

        const contact = await createContact({
          display_name: displayName,
          first_name: typeof input.first_name === 'string' ? input.first_name : undefined,
          last_name: typeof input.last_name === 'string' ? input.last_name : undefined,
          job_title: typeof input.title === 'string' ? input.title : undefined,
          birthday: typeof input.birthday === 'string' ? input.birthday : undefined,
          notes: typeof input.notes === 'string' ? input.notes : undefined,
          emails,
          phones,
          tag_ids: tagIds,
        });

        return `Contact created: ${contact.display_name} (${contact.id})`;
      } catch (e) {
        return `Error creating contact: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    contacts_update: async (input) => {
      const id = typeof input.id === 'string' ? input.id.trim() : '';
      if (!id) return 'Error: id is required.';
      try {
        const updates: Record<string, unknown> = {};
        if (typeof input.name === 'string') updates.display_name = input.name;
        if (typeof input.title === 'string') updates.job_title = input.title;
        if (typeof input.notes === 'string') updates.notes = input.notes;
        if (typeof input.birthday === 'string') updates.birthday = input.birthday;
        if (Array.isArray(input.emails)) {
          updates.emails_add = (input.emails as Array<{ email: string; isPrimary?: boolean }>).map(e => ({ address: e.email, is_primary: e.isPrimary }));
        }
        if (Array.isArray(input.phones)) {
          updates.phones_add = (input.phones as Array<{ phone: string; isPrimary?: boolean }>).map(p => ({ number: p.phone, is_primary: p.isPrimary }));
        }

        const contact = await updateContact(id, updates as any);
        return `Updated: ${contact.display_name} (${contact.id})`;
      } catch (e) {
        return `Error updating contact: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    contacts_delete: async (input) => {
      const id = typeof input.id === 'string' ? input.id.trim() : '';
      if (!id) return 'Error: id is required.';
      try {
        const deleted = await deleteContact(id);
        return deleted ? `Contact deleted: ${id}` : `Contact not found: ${id}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    contacts_search: async (input) => {
      const query = typeof input.query === 'string' ? input.query.trim() : '';
      if (!query) return 'Error: query is required.';
      try {
        const contacts = await searchContacts(query);
        return formatContactsList(contacts);
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    contacts_groups_list: async () => {
      try {
        const groups = await listGroups();
        if (groups.length === 0) return 'No groups found.';
        const lines = groups.map(g => `- **${g.name}** (${g.id})${g.description ? ` — ${g.description}` : ''}`);
        return `## Groups (${groups.length})\n\n${lines.join('\n')}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    contacts_groups_create: async (input) => {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return 'Error: name is required.';
      try {
        const group = await createGroup({ name, description: typeof input.description === 'string' ? input.description : undefined });
        return `Group created: ${group.name} (${group.id})`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    contacts_groups_delete: async (input) => {
      const id = typeof input.id === 'string' ? input.id.trim() : '';
      if (!id) return 'Error: id is required.';
      try {
        const deleted = await deleteGroup(id);
        return deleted ? `Group deleted: ${id}` : `Group not found: ${id}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    contacts_groups_add_member: async (input) => {
      const groupId = typeof input.group_id === 'string' ? input.group_id.trim() : '';
      const contactId = typeof input.contact_id === 'string' ? input.contact_id.trim() : '';
      if (!groupId || !contactId) return 'Error: group_id and contact_id are required.';
      try {
        await addContactToGroup(groupId, contactId);
        return `Contact ${contactId} added to group ${groupId}.`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    contacts_groups_remove_member: async (input) => {
      const groupId = typeof input.group_id === 'string' ? input.group_id.trim() : '';
      const contactId = typeof input.contact_id === 'string' ? input.contact_id.trim() : '';
      if (!groupId || !contactId) return 'Error: group_id and contact_id are required.';
      try {
        await removeContactFromGroup(groupId, contactId);
        return `Contact ${contactId} removed from group ${groupId}.`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    // ─── Companies ────────────────────────────────────────────────────────────

    contacts_companies_list: async (input) => {
      try {
        const result = await listCompanies({ limit: Number(input.limit || 50), offset: Number(input.offset || 0) });
        const companies = Array.isArray(result) ? result : (result as any).companies ?? [];
        if (companies.length === 0) return 'No companies found.';
        const lines = companies.map((c: any) => `- **${c.name}** (${c.id})${c.domain ? ` · ${c.domain}` : ''}${c.industry ? ` · ${c.industry}` : ''}`);
        return `## Companies (${companies.length})\n\n${lines.join('\n')}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    contacts_companies_get: async (input) => {
      const id = typeof input.id === 'string' ? input.id.trim() : '';
      if (!id) return 'Error: id is required.';
      try {
        const company = await getCompany(id);
        if (!company) return `Company not found: ${id}`;
        return JSON.stringify({ id: company.id, name: company.name, domain: (company as any).domain, industry: (company as any).industry, notes: company.notes }, null, 2);
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    contacts_companies_create: async (input) => {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) return 'Error: name is required.';
      try {
        const company = await createCompany({
          name,
          domain: typeof input.domain === 'string' ? input.domain : undefined,
          industry: typeof input.industry === 'string' ? input.industry : undefined,
          notes: typeof input.notes === 'string' ? input.notes : undefined,
        } as any);
        return `Company created: ${company.name} (${company.id})`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    contacts_companies_update: async (input) => {
      const id = typeof input.id === 'string' ? input.id.trim() : '';
      if (!id) return 'Error: id is required.';
      try {
        const updates: Record<string, unknown> = {};
        if (typeof input.name === 'string') updates.name = input.name;
        if (typeof input.domain === 'string') updates.domain = input.domain;
        if (typeof input.industry === 'string') updates.industry = input.industry;
        if (typeof input.notes === 'string') updates.notes = input.notes;
        const company = await updateCompany(id, updates as any);
        return `Updated: ${company.name} (${company.id})`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    contacts_companies_delete: async (input) => {
      const id = typeof input.id === 'string' ? input.id.trim() : '';
      if (!id) return 'Error: id is required.';
      try {
        const deleted = await deleteCompany(id);
        return deleted ? `Company deleted: ${id}` : `Company not found: ${id}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    contacts_companies_search: async (input) => {
      const query = typeof input.query === 'string' ? input.query.trim() : '';
      if (!query) return 'Error: query is required.';
      try {
        const companies = await searchCompanies(query);
        if (companies.length === 0) return `No companies found matching "${query}".`;
        const lines = (Array.isArray(companies) ? companies : []).map((c: any) => `- **${c.name}** (${c.id})${c.domain ? ` · ${c.domain}` : ''}`);
        return `## Companies: "${query}" (${companies.length})\n\n${lines.join('\n')}`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    contacts_companies_employees: async (input) => {
      const companyId = typeof input.company_id === 'string' ? input.company_id.trim() : '';
      if (!companyId) return 'Error: company_id is required.';
      try {
        const employees = await listCompanyEmployees(companyId);
        return formatContactsList(employees as import('./sdk-adapter').ContactWithDetails[]);
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerContactsTools(
  registry: ToolRegistry,
  _getManager?: () => unknown,
): void {
  const executors = createContactsExecutors();
  for (const tool of contactsTools) {
    registry.register(tool, executors[tool.name]);
  }
}

/** @deprecated Use registerContactsTools without a manager getter. */
export function createContactsToolExecutors(
  _getManager?: () => unknown,
): Record<string, ToolExecutor> {
  return createContactsExecutors();
}
