import type { Command } from './types';
import { splitArgs } from './helpers';
import { parseMentions, resolveNameToKnown } from '../channels/mentions';

/**
 * /messages - Assistant-to-assistant messaging
 */
export function messagesCommand(): Command {
  return {
    name: 'messages',
    aliases: ['inbox'],
    description: 'Assistant messaging and email inbox',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const manager = context.getMessagesManager?.();
      const inboxManager = context.getInboxManager?.();

      // If neither is enabled, show error
      if (!manager && !inboxManager) {
        context.emit('text', 'Messages are not enabled. Configure messages in config.json.\n');
        context.emit('text', '\nTo enable:\n');
        context.emit('text', '```json\n');
        context.emit('text', '{\n');
        context.emit('text', '  "messages": {\n');
        context.emit('text', '    "enabled": true\n');
        context.emit('text', '  }\n');
        context.emit('text', '}\n');
        context.emit('text', '```\n');
        context.emit('done');
        return { handled: true };
      }

      const parts = splitArgs(args);
      const subcommand = parts[0]?.toLowerCase() || '';

      // /messages (no args) or /messages ui - show interactive panel
      if (!subcommand || subcommand === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'messages' };
      }

      // --- Inbox subcommands (delegated to InboxManager) ---

      // /messages fetch [limit] (inbox)
      if (subcommand === 'fetch') {
        if (!inboxManager) {
          context.emit('text', 'Inbox is not enabled. Configure inbox in config.json.\n');
          context.emit('done');
          return { handled: true };
        }

        const limitArg = parts[1];
        const limit = limitArg ? parseInt(limitArg, 10) : 20;

        context.emit('text', 'Fetching emails...\n');
        try {
          const count = await inboxManager.fetch({ limit });
          if (count === 0) {
            context.emit('text', 'No new emails found.\n');
          } else {
            context.emit('text', `Fetched ${count} new email(s).\n`);
          }
        } catch (error) {
          context.emit('text', `Error fetching: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /messages email <id> (read email by id)
      if (subcommand === 'email') {
        if (!inboxManager) {
          context.emit('text', 'Inbox is not enabled. Configure inbox in config.json.\n');
          context.emit('done');
          return { handled: true };
        }

        const emailId = parts[1];
        if (!emailId) {
          context.emit('text', 'Usage: /messages email <id>\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const email = await inboxManager.read(emailId);
          if (!email) {
            context.emit('text', `Email ${emailId} not found.\n`);
          } else {
            const { formatEmailAsMarkdown } = await import('../inbox/parser/email-parser');
            context.emit('text', '\n' + formatEmailAsMarkdown(email) + '\n');
          }
        } catch (error) {
          context.emit('text', `Error reading: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /messages download <id> <index> (inbox attachment)
      if (subcommand === 'download') {
        if (!inboxManager) {
          context.emit('text', 'Inbox is not enabled. Configure inbox in config.json.\n');
          context.emit('done');
          return { handled: true };
        }

        const emailId = parts[1];
        const indexArg = parts[2];

        if (!emailId || !indexArg) {
          context.emit('text', 'Usage: /messages download <email-id> <attachment-index>\n');
          context.emit('done');
          return { handled: true };
        }

        const index = parseInt(indexArg, 10);
        if (isNaN(index) || index < 0) {
          context.emit('text', 'Invalid attachment index.\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          // Validate index against actual attachment count
          const email = await inboxManager.read(emailId);
          if (email && email.attachments) {
            if (index >= email.attachments.length) {
              context.emit('text', `Invalid attachment index. Email has ${email.attachments.length} attachment(s) (0-${email.attachments.length - 1}).\n`);
              context.emit('done');
              return { handled: true };
            }
          }
          const path = await inboxManager.downloadAttachment(emailId, index);
          context.emit('text', `Downloaded to: ${path}\n`);
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /messages compose <to> <subject> (inbox send)
      if (subcommand === 'compose') {
        if (!inboxManager) {
          context.emit('text', 'Inbox is not enabled. Configure inbox in config.json.\n');
          context.emit('done');
          return { handled: true };
        }

        const to = parts[1];
        const subject = parts.slice(2).join(' ');

        if (!to || !subject) {
          context.emit('text', 'Usage: /messages compose <to> <subject>\n');
          context.emit('text', 'Then type your message and send.\n');
          context.emit('done');
          return { handled: true };
        }

        context.emit('done');
        return {
          handled: false,
          prompt: `Help me compose an email to ${to} with subject "${subject}". Ask me what I want to say, then use the inbox_send tool to send it.`,
        };
      }

      // /messages address (inbox email address)
      if (subcommand === 'address') {
        if (!inboxManager) {
          context.emit('text', 'Inbox is not enabled. Configure inbox in config.json.\n');
          context.emit('done');
          return { handled: true };
        }

        const address = inboxManager.getEmailAddress();
        context.emit('text', `Assistant email address: ${address}\n`);
        context.emit('done');
        return { handled: true };
      }

      // --- Assistant messages subcommands (delegated to MessagesManager) ---

      // /messages list
      if (subcommand === 'list') {
        if (!manager) {
          context.emit('text', 'Messages are not enabled.\n');
          context.emit('done');
          return { handled: true };
        }

        const unreadOnly = parts.includes('--unread') || parts.includes('-u');
        const limitArg = parts.find((p) => p.match(/^\d+$/));
        const limit = limitArg ? parseInt(limitArg, 10) : 20;

        try {
          const messages = await manager.list({ limit, unreadOnly });
          if (messages.length === 0) {
            context.emit('text', unreadOnly ? 'No unread messages.\n' : 'Inbox is empty.\n');
          } else {
            context.emit('text', `\n## Messages (${messages.length} message${messages.length === 1 ? '' : 's'})\n\n`);
            for (const msg of messages) {
              const statusIcon = msg.status === 'read' ? '📖' : msg.status === 'injected' ? '👁️' : '📬';
              const priorityIcon =
                msg.priority === 'urgent'
                  ? ' 🔴'
                  : msg.priority === 'high'
                  ? ' 🟠'
                  : '';
              const date = new Date(msg.createdAt).toLocaleDateString();
              context.emit('text', `${statusIcon}${priorityIcon} **${msg.id}**\n`);
              context.emit('text', `   From: ${msg.fromAssistantName}\n`);
              if (msg.subject) {
                context.emit('text', `   Subject: ${msg.subject}\n`);
              }
              context.emit('text', `   Preview: ${msg.preview}\n`);
              context.emit('text', `   Date: ${date}${msg.replyCount > 0 ? ` | ${msg.replyCount} replies` : ''}\n\n`);
            }
          }
        } catch (error) {
          context.emit('text', `Error listing messages: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /messages threads
      if (subcommand === 'threads') {
        if (!manager) {
          context.emit('text', 'Messages are not enabled.\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const threads = await manager.listThreads();
          if (threads.length === 0) {
            context.emit('text', 'No conversation threads found.\n');
          } else {
            context.emit('text', `\n## Threads (${threads.length})\n\n`);
            for (const thread of threads) {
              const participants = thread.participants.map((p) => p.assistantName).join(', ');
              const updated = new Date(thread.updatedAt).toLocaleDateString();
              context.emit('text', `**${thread.threadId}**\n`);
              if (thread.subject) {
                context.emit('text', `   Subject: ${thread.subject}\n`);
              }
              context.emit('text', `   Participants: ${participants}\n`);
              context.emit('text', `   Messages: ${thread.messageCount} (${thread.unreadCount} unread)\n`);
              context.emit('text', `   Updated: ${updated}\n\n`);
            }
          }
        } catch (error) {
          context.emit('text', `Error listing threads: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /messages read <id>
      if (subcommand === 'read') {
        if (!manager) {
          context.emit('text', 'Messages are not enabled.\n');
          context.emit('done');
          return { handled: true };
        }

        const messageId = parts[1];
        if (!messageId) {
          context.emit('text', 'Usage: /messages read <id>\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const message = await manager.read(messageId);
          if (!message) {
            context.emit('text', `Message ${messageId} not found.\n`);
          } else {
            context.emit('text', `\n## Message: ${message.id}\n\n`);
            context.emit('text', `**From:** ${message.fromAssistantName} (${message.fromAssistantId})\n`);
            context.emit('text', `**To:** ${message.toAssistantName} (${message.toAssistantId})\n`);
            if (message.subject) {
              context.emit('text', `**Subject:** ${message.subject}\n`);
            }
            context.emit('text', `**Priority:** ${message.priority}\n`);
            context.emit('text', `**Sent:** ${new Date(message.createdAt).toLocaleString()}\n`);
            if (message.readAt) {
              context.emit('text', `**Read:** ${new Date(message.readAt).toLocaleString()}\n`);
            }
            context.emit('text', `**Thread:** ${message.threadId}\n`);
            if (message.parentId) {
              context.emit('text', `**In reply to:** ${message.parentId}\n`);
            }
            context.emit('text', '\n---\n\n');
            context.emit('text', message.body + '\n');
          }
        } catch (error) {
          context.emit('text', `Error reading message: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /messages thread <id>
      if (subcommand === 'thread') {
        if (!manager) {
          context.emit('text', 'Messages are not enabled.\n');
          context.emit('done');
          return { handled: true };
        }

        const threadId = parts[1];
        if (!threadId) {
          context.emit('text', 'Usage: /messages thread <id>\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const messages = await manager.readThread(threadId);
          if (messages.length === 0) {
            context.emit('text', `Thread ${threadId} not found or empty.\n`);
          } else {
            context.emit('text', `\n## Thread: ${threadId}\n`);
            context.emit('text', `**${messages.length} message(s)**\n\n`);
            for (const msg of messages) {
              context.emit('text', '---\n');
              context.emit('text', `### From: ${msg.fromAssistantName} → ${msg.toAssistantName}\n`);
              if (msg.subject) {
                context.emit('text', `**Subject:** ${msg.subject}\n`);
              }
              context.emit('text', `**Sent:** ${new Date(msg.createdAt).toLocaleString()}\n\n`);
              context.emit('text', msg.body + '\n');
              context.emit('text', `*ID: ${msg.id}*\n\n`);
            }
          }
        } catch (error) {
          context.emit('text', `Error reading thread: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /messages send <to> <subject>
      if (subcommand === 'send') {
        if (!manager) {
          context.emit('text', 'Messages are not enabled.\n');
          context.emit('done');
          return { handled: true };
        }

        context.emit('text', 'To send a message, use the messages_send tool:\n\n');
        context.emit('text', 'Example:\n');
        context.emit('text', '```\n');
        context.emit('text', 'Use messages_send with:\n');
        context.emit('text', '  to: "AssistantName"  (or assistant ID)\n');
        context.emit('text', '  body: "Your message content"\n');
        context.emit('text', '  subject: "Optional subject" (optional)\n');
        context.emit('text', '  priority: "normal" (optional: low, normal, high, urgent)\n');
        context.emit('text', '```\n');
        context.emit('done');
        return { handled: true };
      }

      // /messages reply <id>
      if (subcommand === 'reply') {
        if (!manager) {
          context.emit('text', 'Messages are not enabled.\n');
          context.emit('done');
          return { handled: true };
        }

        const messageId = parts[1];
        if (!messageId) {
          context.emit('text', 'Usage: /messages reply <id>\n');
          context.emit('done');
          return { handled: true };
        }

        context.emit('text', `To reply to message ${messageId}, use the messages_send tool:\n\n`);
        context.emit('text', 'Example:\n');
        context.emit('text', '```\n');
        context.emit('text', 'Use messages_send with:\n');
        context.emit('text', '  to: "<recipient>"\n');
        context.emit('text', '  body: "Your reply"\n');
        context.emit('text', `  replyTo: "${messageId}"\n`);
        context.emit('text', '```\n');
        context.emit('done');
        return { handled: true };
      }

      // /messages delete <id>
      if (subcommand === 'delete') {
        if (!manager) {
          context.emit('text', 'Messages are not enabled.\n');
          context.emit('done');
          return { handled: true };
        }

        const messageId = parts[1];
        if (!messageId) {
          context.emit('text', 'Usage: /messages delete <id>\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const result = await manager.delete(messageId);
          context.emit('text', result.message + '\n');
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /messages assistants
      if (subcommand === 'assistants') {
        if (!manager) {
          context.emit('text', 'Messages are not enabled.\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const assistants = await manager.listAssistants();
          if (assistants.length === 0) {
            context.emit('text', 'No other assistants found. Assistants appear here after sending or receiving messages.\n');
          } else {
            context.emit('text', `\n## Known Assistants (${assistants.length})\n\n`);
            for (const assistant of assistants) {
              const lastSeen = new Date(assistant.lastSeen).toLocaleDateString();
              context.emit('text', `- **${assistant.name}** (ID: ${assistant.id})\n`);
              context.emit('text', `  Last seen: ${lastSeen}\n`);
            }
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /messages stats
      if (subcommand === 'stats') {
        if (!manager) {
          context.emit('text', 'Messages are not enabled.\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const stats = await manager.getStats();
          context.emit('text', '\n## Messages Statistics\n\n');
          context.emit('text', `Total Messages: ${stats.totalMessages}\n`);
          context.emit('text', `Unread: ${stats.unreadCount}\n`);
          context.emit('text', `Threads: ${stats.threadCount}\n`);
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /messages help
      if (subcommand === 'help') {
        context.emit('text', '\n## Messages Commands\n\n');
        context.emit('text', '### Assistant Messages\n\n');
        context.emit('text', '/messages                Open messages panel\n');
        context.emit('text', '/messages list [--unread] List messages, optionally unread only\n');
        context.emit('text', '/messages threads        List conversation threads\n');
        context.emit('text', '/messages read <id>      Read specific message\n');
        context.emit('text', '/messages thread <id>    Read entire thread\n');
        context.emit('text', '/messages send           Show how to send messages\n');
        context.emit('text', '/messages reply <id>     Show how to reply\n');
        context.emit('text', '/messages delete <id>    Delete a message\n');
        context.emit('text', '/messages assistants     List known assistants\n');
        context.emit('text', '/messages stats          Show inbox statistics\n');
        context.emit('text', '\n### Email Inbox\n\n');
        context.emit('text', '/messages fetch [limit]     Sync emails from S3 (default: 20)\n');
        context.emit('text', '/messages email <id>        Read specific email\n');
        context.emit('text', '/messages download <id> <n> Download attachment\n');
        context.emit('text', '/messages compose <to> <subj> Compose and send email\n');
        context.emit('text', '/messages address           Show assistant email address\n');
        context.emit('text', '\n### Tools\n\n');
        context.emit('text', 'messages_send            Send a message to another assistant\n');
        context.emit('text', 'messages_list            List inbox messages\n');
        context.emit('text', 'messages_read            Read a specific message\n');
        context.emit('text', 'messages_read_thread     Read entire thread\n');
        context.emit('text', 'messages_delete          Delete a message\n');
        context.emit('text', 'messages_list_assistants  List known assistants\n');
        context.emit('text', 'inbox_fetch              Fetch emails from server\n');
        context.emit('text', 'inbox_list               List emails\n');
        context.emit('text', 'inbox_read               Read specific email\n');
        context.emit('text', 'inbox_send               Send/reply to email\n');
        context.emit('text', '\n/inbox is an alias for /messages.\n');
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', `Unknown messages command: ${subcommand}\n`);
      context.emit('text', 'Use /messages help for available commands.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /webhooks - Manage webhooks for receiving external events
 */
export function webhooksCommand(): Command {
  return {
    name: 'webhooks',
    description: 'Manage webhooks for receiving push events from external sources',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const trimmed = args.trim();
      const [subcommand, ...rest] = trimmed.split(/\s+/);
      const subArgs = rest.join(' ');

      // /webhooks (no args) or /webhooks ui → open interactive panel
      if (!subcommand || subcommand === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'webhooks' };
      }

      const manager = context.getWebhooksManager?.();
      if (!manager) {
        context.emit('text', 'Webhooks are not enabled. Set webhooks.enabled: true in config.\n');
        context.emit('done');
        return { handled: true };
      }

      // /webhooks list
      if (subcommand === 'list') {
        try {
          const webhooks = await manager.list();
          if (webhooks.length === 0) {
            context.emit('text', 'No webhooks registered. Use /webhooks create <name> <source> to create one.\n');
          } else {
            context.emit('text', `Webhooks (${webhooks.length}):\n\n`);
            for (const wh of webhooks) {
              const statusIcon = wh.status === 'active' ? '●' : wh.status === 'paused' ? '◐' : '✗';
              const lastDelivery = wh.lastDeliveryAt
                ? new Date(wh.lastDeliveryAt).toLocaleDateString()
                : 'never';
              context.emit('text', `  ${statusIcon} ${wh.name} (${wh.id})\n`);
              context.emit('text', `    Source: ${wh.source} | Events: ${wh.deliveryCount} | Last: ${lastDelivery}\n`);
            }
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /webhooks create <name> <source>
      if (subcommand === 'create') {
        const parts = subArgs.split(/\s+/);
        const name = parts[0];
        const source = parts[1] || 'custom';

        if (!name) {
          context.emit('text', 'Usage: /webhooks create <name> [source]\n');
          context.emit('text', 'Example: /webhooks create gmail-hook gmail\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const result = await manager.create({ name, source });
          if (result.success) {
            context.emit('text', `Webhook created!\n\n`);
            context.emit('text', `  ID:     ${result.webhookId}\n`);
            context.emit('text', `  URL:    ${result.url}\n`);
            context.emit('text', `  Secret: ${result.secret}\n`);
            context.emit('text', `\nConfigure the external source with the URL and secret above.\n`);
          } else {
            context.emit('text', `Error: ${result.message}\n`);
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /webhooks delete <id>
      if (subcommand === 'delete') {
        const id = subArgs.trim();
        if (!id) {
          context.emit('text', 'Usage: /webhooks delete <webhook-id>\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const result = await manager.delete(id);
          context.emit('text', `${result.message}\n`);
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /webhooks events <webhookId>
      if (subcommand === 'events') {
        const webhookId = subArgs.trim();
        if (!webhookId) {
          context.emit('text', 'Usage: /webhooks events <webhook-id>\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const events = await manager.listEvents(webhookId, { limit: 20 });
          if (events.length === 0) {
            context.emit('text', 'No events received for this webhook.\n');
          } else {
            context.emit('text', `Recent events (${events.length}):\n\n`);
            for (const evt of events) {
              const statusIcon = evt.status === 'pending' ? '⏳' : evt.status === 'injected' ? '📨' : '✓';
              context.emit('text', `  ${statusIcon} ${evt.eventType} (${evt.id})\n`);
              context.emit('text', `    ${new Date(evt.timestamp).toLocaleString()} | ${evt.preview}\n`);
            }
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /webhooks test <id>
      if (subcommand === 'test') {
        const id = subArgs.trim();
        if (!id) {
          context.emit('text', 'Usage: /webhooks test <webhook-id>\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const result = await manager.sendTestEvent(id);
          if (result.success) {
            context.emit('text', `Test event sent! Event ID: ${result.eventId}\n`);
          } else {
            context.emit('text', `Error: ${result.message}\n`);
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /webhooks help
      if (subcommand === 'help') {
        context.emit('text', 'Webhook Commands:\n\n');
        context.emit('text', '/webhooks                Open webhooks panel\n');
        context.emit('text', '/webhooks list           List all webhooks\n');
        context.emit('text', '/webhooks create <name> <source>  Create a webhook\n');
        context.emit('text', '/webhooks delete <id>    Delete a webhook\n');
        context.emit('text', '/webhooks events <id>    List events for a webhook\n');
        context.emit('text', '/webhooks test <id>      Send a test event\n');
        context.emit('text', '/webhooks help           Show this help\n');
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', `Unknown command: ${subcommand}\n`);
      context.emit('text', 'Use /webhooks help for available commands.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /channels - Slack-like channel collaboration
 */
export function channelsCommand(): Command {
  return {
    name: 'channels',
    description: 'Manage channels for agent collaboration',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const trimmed = args.trim();
      const [subcommand, ...rest] = trimmed.split(/\s+/);
      const subArgs = rest.join(' ');

      // /channels (no args) or /channels ui → open interactive panel
      if (!subcommand || subcommand === 'ui') {
        context.emit('done');
        return { handled: true, showPanel: 'channels' };
      }

      const manager = context.getChannelsManager?.();
      if (!manager) {
        context.emit('text', 'Channels are not enabled. Set channels.enabled: true in config.\n');
        context.emit('done');
        return { handled: true };
      }

      // /channels list
      if (subcommand === 'list') {
        try {
          const channels = manager.listChannels();
          if (channels.length === 0) {
            context.emit('text', 'No channels exist. Use /channels create <name> to create one.\n');
          } else {
            context.emit('text', `Channels (${channels.length}):\n\n`);
            for (const ch of channels) {
              const unread = ch.unreadCount > 0 ? ` (${ch.unreadCount} unread)` : '';
              context.emit('text', `  #${ch.name}${unread}\n`);
              if (ch.description) {
                context.emit('text', `    ${ch.description}\n`);
              }
              context.emit('text', `    Members: ${ch.memberCount} | Last: ${ch.lastMessagePreview || 'no messages'}\n`);
            }
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /channels create <name> [description]
      if (subcommand === 'create') {
        const parts = splitArgs(subArgs);
        const name = parts[0];
        const description = parts.slice(1).join(' ') || undefined;

        if (!name) {
          context.emit('text', 'Usage: /channels create <name> [description]\n');
          context.emit('text', 'Example: /channels create general "Team discussion"\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const result = manager.createChannel(name, description);
          if (result.success) {
            context.emit('text', `Channel created!\n\n`);
            context.emit('text', `  Name: #${name}\n`);
            context.emit('text', `  ID:   ${result.channelId}\n`);
            if (description) {
              context.emit('text', `  Desc: ${description}\n`);
            }
          } else {
            context.emit('text', `Error: ${result.message}\n`);
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /channels join <channel>
      if (subcommand === 'join') {
        const channel = subArgs.trim();
        if (!channel) {
          context.emit('text', 'Usage: /channels join <channel-name>\n');
          context.emit('done');
          return { handled: true };
        }

        const result = manager.join(channel);
        context.emit('text', `${result.success ? result.message : `Error: ${result.message}`}\n`);
        context.emit('done');
        return { handled: true };
      }

      // /channels leave <channel>
      if (subcommand === 'leave') {
        const channel = subArgs.trim();
        if (!channel) {
          context.emit('text', 'Usage: /channels leave <channel-name>\n');
          context.emit('done');
          return { handled: true };
        }

        const result = manager.leave(channel);
        context.emit('text', `${result.success ? result.message : `Error: ${result.message}`}\n`);
        context.emit('done');
        return { handled: true };
      }

      // /channels send <channel> <message>
      if (subcommand === 'send') {
        const parts = splitArgs(subArgs);
        const channel = parts[0];
        const message = parts.slice(1).join(' ');

        if (!channel || !message) {
          context.emit('text', 'Usage: /channels send <channel> <message>\n');
          context.emit('done');
          return { handled: true };
        }

        // If a person is logged in, send as that person and trigger assistant response
        const peopleManager = context.getPeopleManager?.();
        const activePerson = peopleManager?.getActivePerson();
        let result;
        if (activePerson) {
          result = manager.sendAs(channel, message, activePerson.id, activePerson.name);
        } else {
          result = manager.send(channel, message);
        }
        context.emit('text', `${result.success ? result.message : `Error: ${result.message}`}\n`);
        context.emit('done');

        // When a person sends a message, trigger multi-agent responses via pool
        if (activePerson && result.success) {
          const agentPool = context.getChannelAgentPool?.();
          const members = manager.getMembers(channel);
          const currentAssistantId = context.getAssistantManager?.()?.getActive?.()?.id;
          if (agentPool && members.length > 0) {
            // Pool handles @mention filtering, concurrent sends, and client caching
            // Exclude the current assistant (it responds via the prompt return below)
            agentPool.triggerResponses(
              channel,
              activePerson.name,
              message,
              members,
              currentAssistantId || undefined,
            );
          }

          // Check @mentions — only trigger active assistant if mentioned (or no mentions)
          const mentions = parseMentions(message);
          if (mentions.length > 0) {
            const assistantMembers = members.filter((m) => m.memberType === 'assistant');
            const knownNames = assistantMembers.map((m) => ({ id: m.assistantId, name: m.assistantName }));
            const resolved = mentions
              .map((m) => resolveNameToKnown(m, knownNames))
              .filter(Boolean) as Array<{ id: string; name: string }>;
            if (resolved.length > 0) {
              // Mentions resolved — only trigger if active assistant is mentioned
              if (!resolved.some((r) => r.id === currentAssistantId)) {
                return { handled: true };
              }
            } else {
              // Mentions present but none resolved — don't trigger anyone
              return { handled: true };
            }
          }

          // Trigger the active session's assistant via prompt return
          return {
            handled: false,
            prompt: `[Channel Message] ${activePerson.name} posted in #${channel}: "${message}"\n\nYou are in a group channel with other assistants and people. Respond in #${channel} using channel_send. Be helpful and conversational. You may reference or build on what other assistants have said.`,
          };
        }
        return { handled: true };
      }

      // /channels read <channel> [limit]
      if (subcommand === 'read') {
        const parts = subArgs.trim().split(/\s+/);
        const channel = parts[0];
        const limit = parts[1] ? parseInt(parts[1], 10) : 20;

        if (!channel) {
          context.emit('text', 'Usage: /channels read <channel> [limit]\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const result = manager.readMessages(channel, limit);
          if (!result) {
            context.emit('text', `Channel "${channel}" not found.\n`);
          } else if (result.messages.length === 0) {
            context.emit('text', `No messages in #${result.channel.name}.\n`);
          } else {
            context.emit('text', `#${result.channel.name} — Recent (${result.messages.length}):\n\n`);
            for (const msg of result.messages) {
              const date = new Date(msg.createdAt).toLocaleString();
              context.emit('text', `  [${msg.senderName}] (${date})\n`);
              context.emit('text', `  ${msg.content}\n\n`);
            }
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /channels members <channel>
      if (subcommand === 'members') {
        const channel = subArgs.trim();
        if (!channel) {
          context.emit('text', 'Usage: /channels members <channel>\n');
          context.emit('done');
          return { handled: true };
        }

        try {
          const ch = manager.getChannel(channel);
          if (!ch) {
            context.emit('text', `Channel "${channel}" not found.\n`);
          } else {
            const members = manager.getMembers(channel);
            context.emit('text', `#${ch.name} Members (${members.length}):\n\n`);
            for (const m of members) {
              const roleTag = m.role === 'owner' ? ' (owner)' : '';
              context.emit('text', `  ${m.assistantName}${roleTag}\n`);
            }
          }
        } catch (error) {
          context.emit('text', `Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        context.emit('done');
        return { handled: true };
      }

      // /channels invite <channel> <name>
      if (subcommand === 'invite') {
        const parts = subArgs.trim().split(/\s+/);
        const channel = parts[0];
        const name = parts[1];

        if (!channel || !name) {
          context.emit('text', 'Usage: /channels invite <channel> <name>\n');
          context.emit('done');
          return { handled: true };
        }

        // Check if name matches a person first, then fall back to assistant
        const peopleManager = context.getPeopleManager?.();
        const person = peopleManager?.getPerson(name);
        const memberType = person ? 'person' as const : 'assistant' as const;
        const memberId = person ? person.id : name;
        const memberName = person ? person.name : name;

        const result = manager.invite(channel, memberId, memberName, memberType);
        context.emit('text', `${result.success ? result.message : `Error: ${result.message}`}\n`);
        context.emit('done');
        return { handled: true };
      }

      // /channels delete <channel>
      if (subcommand === 'delete') {
        const channel = subArgs.trim();
        if (!channel) {
          context.emit('text', 'Usage: /channels delete <channel>\n');
          context.emit('done');
          return { handled: true };
        }

        const result = manager.archiveChannel(channel);
        context.emit('text', `${result.success ? result.message : `Error: ${result.message}`}\n`);
        context.emit('done');
        return { handled: true };
      }

      // /channels help
      if (subcommand === 'help') {
        context.emit('text', 'Channel Commands:\n\n');
        context.emit('text', '/channels                      Open channels panel\n');
        context.emit('text', '/channels list                 List all channels\n');
        context.emit('text', '/channels create <name> [desc] Create a channel\n');
        context.emit('text', '/channels join <channel>       Join a channel\n');
        context.emit('text', '/channels leave <channel>      Leave a channel\n');
        context.emit('text', '/channels send <ch> <msg>      Send a message\n');
        context.emit('text', '/channels read <ch> [limit]    Read messages\n');
        context.emit('text', '/channels members <ch>         List members\n');
        context.emit('text', '/channels invite <ch> <name>   Invite person/agent\n');
        context.emit('text', '/channels delete <ch>          Archive a channel\n');
        context.emit('text', '/channels help                 Show this help\n');
        context.emit('done');
        return { handled: true };
      }

      context.emit('text', `Unknown command: ${subcommand}\n`);
      context.emit('text', 'Use /channels help for available commands.\n');
      context.emit('done');
      return { handled: true };
    },
  };
}


/**
 * /people - Human participant management
 */
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
        const people = manager.listPeople();
        if (people.length === 0) {
          context.emit('text', 'No people registered. Use /people create <name> to add one.\n');
        } else {
          context.emit('text', `People (${people.length}):\n\n`);
          for (const p of people) {
            const active = p.isActive ? ' (active)' : '';
            const email = p.email ? ` <${p.email}>` : '';
            context.emit('text', `  ${p.name}${email}${active}\n`);
          }
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
        const numbers = manager.listPhoneNumbers();
        if (numbers.length === 0) {
          context.emit('text', 'No phone numbers configured. Use /communication sync to import from Twilio.\n');
        } else {
          context.emit('text', `Phone Numbers (${numbers.length}):\n\n`);
          for (const num of numbers) {
            const caps: string[] = [];
            if (num.capabilities.voice) caps.push('voice');
            if (num.capabilities.sms) caps.push('sms');
            if (num.capabilities.whatsapp) caps.push('whatsapp');
            const name = num.friendlyName ? ` (${num.friendlyName})` : '';
            context.emit('text', `  ${num.number}${name} [${caps.join(', ')}]\n`);
          }
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
