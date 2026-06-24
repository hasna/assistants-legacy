/**
 * Communication commands — messages, webhooks, channels, people, contacts, telephony.
 * Larger commands are split into domain files and re-exported here for backward compat.
 */
import type { Command } from './types';
import { splitArgs, parseDisclosureOptions, pageItems, disclosureHint, truncateText } from './helpers';
import { parseMentions, resolveNameToKnown } from '../channels/mentions';

export { messagesCommand } from './messages-command';
export { webhooksCommand } from './webhooks-command';
export { channelsCommand } from './channels-command';

export function peopleCommand(): Command {
  return {
    name: 'people',
    description: 'Manage human participants',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const trimmed = args.trim();
      const [subcommand, ...rest] = trimmed.split(/\s+/);
      const subArgs = rest.join(' ');

      // /people (no args) → open interactive panel
      if (!subcommand || subcommand === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'people' };
      }

      const manager = context.getPeopleManager?.();
      if (!manager) {
        context.emit('text', 'People system is not available.\n');
        context.emit('done');
        return { handled: true };
      }

      // /people list
      if (subcommand === 'list') {
        const outputOptions = parseDisclosureOptions(rest);
        if (outputOptions.error) {
          context.emit('text', `${outputOptions.error}\n`);
          context.emit('done');
          return { handled: true };
        }
        const people = manager.listPeople();
        const page = pageItems(people, outputOptions);
        if (people.length === 0) {
          context.emit('text', 'No people registered. Use /people create <name> to add one.\n');
        } else if (outputOptions.json) {
          context.emit('text', JSON.stringify({
            people: page.items,
            total: page.total,
            limit: outputOptions.limit,
            cursor: outputOptions.cursor,
            nextCursor: page.nextCursor,
          }, null, 2));
        } else {
          context.emit('text', `People (${page.shown}/${page.total}):\n\n`);
          for (const p of page.items) {
            const active = p.isActive ? ' (active)' : '';
            const email = p.email ? ` <${truncateText(p.email, 48)}>` : '';
            context.emit('text', `  ${truncateText(p.name, outputOptions.verbose ? 80 : 40)}${email}${active}\n`);
          }
          context.emit('text', disclosureHint(outputOptions, page.total, page.shown, '/people whoami'));
        }
        context.emit('done');
        return { handled: true };
      }

      // /people create <name> [email]
      if (subcommand === 'create') {
        const parts = splitArgs(subArgs);
        const name = parts[0];
        const email = parts[1] || undefined;

        if (!name) {
          context.emit('text', 'Usage: /people create <name> [email]\n');
          context.emit('text', 'Example: /people create Jane jane@example.com\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const person = await manager.createPerson({ name, email });
          context.emit('text', `Person created: ${person.name} (${person.id})\n`);
          // Auto-login to new person
          await manager.setActivePerson(person.id);
          context.emit('text', `Logged in as ${person.name}.\n`);
        } catch (err) {
          context.emit('text', `Error: ${err instanceof Error ? err.message : String(err)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /people login <name>
      if (subcommand === 'login') {
        const name = subArgs.trim();
        if (!name) {
          context.emit('text', 'Usage: /people login <name>\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const person = await manager.setActivePerson(name);
          context.emit('text', `Logged in as ${person.name} (${person.id}).\n`);
        } catch (err) {
          context.emit('text', `Error: ${err instanceof Error ? err.message : String(err)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /people logout
      if (subcommand === 'logout') {
        await manager.logout();
        context.emit('text', 'Logged out.\n');
        context.emit('done');
        return { handled: true };
      }

      // /people whoami
      if (subcommand === 'whoami') {
        const active = manager.getActivePerson();
        if (active) {
          const email = active.email ? ` <${active.email}>` : '';
          context.emit('text', `${active.name}${email} (${active.id})\n`);
        } else {
          context.emit('text', 'Not logged in. Use /people login <name> to log in.\n');
        }
        context.emit('done');
        return { handled: true };
      }

      // /people delete <name>
      if (subcommand === 'delete') {
        const name = subArgs.trim();
        if (!name) {
          context.emit('text', 'Usage: /people delete <name>\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          await manager.deletePerson(name);
          context.emit('text', `Person "${name}" deleted.\n`);
        } catch (err) {
          context.emit('text', `Error: ${err instanceof Error ? err.message : String(err)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /people help
      if (subcommand === 'help') {
        context.emit('text', 'People Commands:\n\n');
        context.emit('text', '/people                       Open people panel\n');
        context.emit('text', '/people list                  List all people\n');
        context.emit('text', '/people create <name> [email] Create a person\n');
        context.emit('text', '/people login <name>          Switch active person\n');
        context.emit('text', '/people logout                Deactivate person\n');
        context.emit('text', '/people whoami                Show current person\n');
        context.emit('text', '/people delete <name>         Remove a person\n');
        context.emit('text', '/people help                  Show this help\n');
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', `Unknown command: ${subcommand}\n`);
      context.emit('text', 'Use /people help for available commands.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /contacts - Address book management
 */
export function contactsCommand(): Command {
  return {
    name: 'contacts',
    description: 'Manage contacts address book',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (_args, context) => {
      context.emit('done');
      return { handled: true, showPanel: 'contacts' };
    },
  };
}


/**
 * /communication - Telephony management (SMS, calls, WhatsApp)
 */
export function communicationCommand(): Command {
  return {
    name: 'communication',
    aliases: ['phone', 'telephony'],
    description: 'Manage communication: SMS, calls, WhatsApp, routing',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const trimmed = args.trim();
      const [subcommand, ...rest] = trimmed.split(/\s+/);
      const subArgs = rest.join(' ');

      // /communication (no args) → open interactive panel
      if (!subcommand || subcommand === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'telephony' };
      }

      const manager = context.getTelephonyManager?.();
      if (!manager) {
        context.emit('text', 'Telephony is not enabled. Set telephony.enabled: true in config.\n');
        context.emit('done');
        return { handled: true };
      }

      // /communication numbers
      if (subcommand === 'numbers') {
        const outputOptions = parseDisclosureOptions(rest);
        if (outputOptions.error) {
          context.emit('text', `${outputOptions.error}\n`);
          context.emit('done');
          return { handled: true };
        }
        const numbers = manager.listPhoneNumbers();
        const page = pageItems(numbers, outputOptions);
        if (numbers.length === 0) {
          context.emit('text', 'No phone numbers configured. Use /communication sync to import from Twilio.\n');
        } else if (outputOptions.json) {
          context.emit('text', JSON.stringify({
            numbers: page.items,
            total: page.total,
            limit: outputOptions.limit,
            cursor: outputOptions.cursor,
            nextCursor: page.nextCursor,
          }, null, 2));
        } else {
          context.emit('text', `Phone Numbers (${page.shown}/${page.total}):\n\n`);
          for (const num of page.items) {
            const caps: string[] = [];
            if (num.capabilities.voice) caps.push('voice');
            if (num.capabilities.sms) caps.push('sms');
            if (num.capabilities.whatsapp) caps.push('whatsapp');
            const name = num.friendlyName ? ` (${truncateText(num.friendlyName, outputOptions.verbose ? 80 : 40)})` : '';
            context.emit('text', `  ${num.number}${name} [${caps.join(', ')}]\n`);
          }
          context.emit('text', disclosureHint(outputOptions, page.total, page.shown, '/communication default <number>'));
        }
        context.emit('done');
        return { handled: true };
      }

      // /communication sync
      if (subcommand === 'sync') {
        context.emit('text', 'Syncing phone numbers from Twilio...\n');
        const result = await manager.syncPhoneNumbers();
        context.emit('text', `${result.success ? result.message : `Error: ${result.message}`}\n`);
        context.emit('done');
        return { handled: true };
      }

      // /communication default <number>
      if (subcommand === 'default') {
        const number = subArgs.trim();
        if (!number) {
          context.emit('text', 'Usage: /communication default <phone-number>\n');
          context.emit('done');
          return { handled: true };
        }
        const result = manager.setDefaultPhoneNumber(number);
        context.emit('text', `${result.success ? result.message : `Error: ${result.message}`}\n`);
        context.emit('done');
        return { handled: true };
      }

      // /communication sms send <to> <body>
      if (subcommand === 'sms') {
        const smsParts = subArgs.trim().split(/\s+/);
        const smsAction = smsParts[0];

        if (smsAction === 'send') {
          const to = smsParts[1];
          const body = smsParts.slice(2).join(' ');
          if (!to || !body) {
            context.emit('text', 'Usage: /communication sms send <to> <body>\n');
            context.emit('done');
            return { handled: true };
          }
          const result = await manager.sendSms(to, body);
          context.emit('text', `${result.success ? result.message : `Error: ${result.message}`}\n`);
        } else if (smsAction === 'list' || !smsAction) {
          const messages = manager.getSmsHistory({ limit: 20 });
          if (messages.length === 0) {
            context.emit('text', 'No SMS history.\n');
          } else {
            context.emit('text', `Recent SMS (${messages.length}):\n\n`);
            for (const msg of messages) {
              const dir = msg.direction === 'inbound' ? 'IN' : 'OUT';
              context.emit('text', `  [${dir}] ${msg.fromNumber} → ${msg.toNumber}: ${msg.bodyPreview}\n`);
            }
          }
        } else {
          context.emit('text', 'Usage: /communication sms [send <to> <body> | list]\n');
        }
        context.emit('done');
        return { handled: true };
      }

      // /communication call <to>
      if (subcommand === 'call') {
        const to = subArgs.trim();
        if (!to) {
          context.emit('text', 'Usage: /communication call <to>\n');
          context.emit('done');
          return { handled: true };
        }
        const result = await manager.makeCall(to);
        context.emit('text', `${result.success ? result.message : `Error: ${result.message}`}\n`);
        context.emit('done');
        return { handled: true };
      }

      // /communication calls
      if (subcommand === 'calls') {
        const calls = manager.getCallHistory({ limit: 20 });
        if (calls.length === 0) {
          context.emit('text', 'No call history.\n');
        } else {
          context.emit('text', `Recent Calls (${calls.length}):\n\n`);
          for (const call of calls) {
            const dir = call.direction === 'inbound' ? 'IN' : 'OUT';
            const dur = call.duration != null ? `${call.duration}s` : '-';
            context.emit('text', `  [${dir}] ${call.fromNumber} → ${call.toNumber} | ${call.status} | ${dur}\n`);
          }
        }
        context.emit('done');
        return { handled: true };
      }

      // /communication routes
      if (subcommand === 'routes') {
        const rules = manager.listRoutingRules();
        if (rules.length === 0) {
          context.emit('text', 'No routing rules configured.\n');
        } else {
          context.emit('text', `Routing Rules (${rules.length}):\n\n`);
          for (const rule of rules) {
            const enabled = rule.enabled ? '' : ' [DISABLED]';
            context.emit('text', `  ${rule.name} (priority: ${rule.priority})${enabled}\n`);
            context.emit('text', `    Target: ${rule.targetAssistantName} | Type: ${rule.messageType}\n`);
          }
        }
        context.emit('done');
        return { handled: true };
      }

      // /communication status
      if (subcommand === 'status') {
        const status = manager.getStatus();
        context.emit('text', 'Telephony Status:\n\n');
        context.emit('text', `  Enabled:       ${status.enabled ? 'Yes' : 'No'}\n`);
        context.emit('text', `  Twilio:        ${status.twilioConfigured ? 'Configured' : 'Not configured'}\n`);
        context.emit('text', `  ElevenLabs:    ${status.elevenLabsConfigured ? 'Configured' : 'Not configured'}\n`);
        context.emit('text', `  Default #:     ${status.defaultPhoneNumber ?? 'not set'}${status.defaultPhoneNumberSource ? ` (${status.defaultPhoneNumberSource})` : ''}\n`);
        context.emit('text', `  Numbers:       ${status.phoneNumbers}\n`);
        context.emit('text', `  Active calls:  ${status.activeCalls}\n`);
        context.emit('text', `  Routes:        ${status.routingRules}\n`);
        context.emit('done');
        return { handled: true };
      }

      // /communication help
      if (subcommand === 'help') {
        context.emit('text', 'Communication Commands:\n\n');
        context.emit('text', '/communication                         Open communication panel\n');
        context.emit('text', '/communication numbers                 List phone numbers\n');
        context.emit('text', '/communication sync                    Sync numbers from Twilio\n');
        context.emit('text', '/communication default <number>        Set default phone number\n');
        context.emit('text', '/communication sms send <to> <body>    Send SMS\n');
        context.emit('text', '/communication sms list                Recent SMS\n');
        context.emit('text', '/communication call <to>               Initiate call\n');
        context.emit('text', '/communication calls                   Recent calls\n');
        context.emit('text', '/communication routes                  Routing rules\n');
        context.emit('text', '/communication status                  Status summary\n');
        context.emit('text', '/communication help                    Show this help\n');
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', `Unknown command: ${subcommand}\n`);
      context.emit('text', 'Use /communication help for available commands.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /call - Quick shortcut to initiate a phone call
 */
export function callCommand(): Command {
  return {
    name: 'call',
    description: 'Initiate a phone call (shortcut for /communication call)',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const to = args.trim();

      const manager = context.getTelephonyManager?.();
      if (!manager) {
        context.emit('text', 'Telephony is not enabled. Set telephony.enabled: true in config.\n');
        context.emit('done');
        return { handled: true };
      }

      if (!to) {
        context.emit('text', 'Usage: /call <phone-number>\n');
        context.emit('text', '\nExamples:\n');
        context.emit('text', '  /call +1234567890\n');
        context.emit('text', '  /call +44 20 7946 0958\n');
        context.emit('done');
        return { handled: true };
      }

      const result = await manager.makeCall(to);
      context.emit('text', `${result.success ? result.message : `Error: ${result.message}`}\n`);
      context.emit('done');
      return { handled: true };
    },
  };
}
