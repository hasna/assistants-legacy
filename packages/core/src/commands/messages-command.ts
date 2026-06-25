import type { Command } from './types';
import { splitArgs, parseDisclosureOptions, pageItems, disclosureHint, truncateText } from './helpers';
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
        const optionParts: string[] = [];
        for (const part of parts.slice(1)) {
          if (part === '--unread' || part === '-u') continue;
          if (/^\d+$/.test(part)) optionParts.push('--limit', part);
          else optionParts.push(part);
        }
        const outputOptions = parseDisclosureOptions(optionParts);
        if (outputOptions.error) {
          context.emit('text', `${outputOptions.error}\n`);
          context.emit('done');
          return { handled: true };
        }

        try {
          const messages = await manager.list({ limit: Math.min(100, outputOptions.cursor + outputOptions.limit), unreadOnly });
          const page = pageItems(messages, outputOptions);
          if (messages.length === 0) {
            context.emit('text', unreadOnly ? 'No unread messages.\n' : 'Inbox is empty.\n');
          } else if (outputOptions.json) {
            context.emit('text', JSON.stringify({
              messages: page.items,
              total: page.total,
              limit: outputOptions.limit,
              cursor: outputOptions.cursor,
              nextCursor: page.nextCursor,
            }, null, 2));
          } else {
            context.emit('text', `\n## Messages (${page.shown}/${page.total} message${page.total === 1 ? '' : 's'})\n\n`);
            for (const msg of page.items) {
              const statusIcon = msg.status === 'read' ? '📖' : msg.status === 'injected' ? '👁️' : '📬';
              const priorityIcon =
                msg.priority === 'urgent'
                  ? ' 🔴'
                  : msg.priority === 'high'
                  ? ' 🟠'
                  : '';
              const date = new Date(msg.createdAt).toLocaleDateString();
              context.emit('text', `${statusIcon}${priorityIcon} **${msg.id}**\n`);
              context.emit('text', `   From: ${truncateText(msg.fromAssistantName, 48)}\n`);
              if (msg.subject) {
                context.emit('text', `   Subject: ${truncateText(msg.subject, outputOptions.verbose ? 120 : 60)}\n`);
              }
              context.emit('text', `   Preview: ${truncateText(msg.preview, outputOptions.verbose ? 180 : 80)}\n`);
              context.emit('text', `   Date: ${date}${msg.replyCount > 0 ? ` | ${msg.replyCount} replies` : ''}\n\n`);
            }
            context.emit('text', disclosureHint(outputOptions, page.total, page.shown, '/messages read <id>'));
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
          const outputOptions = parseDisclosureOptions(parts.slice(1));
          if (outputOptions.error) {
            context.emit('text', `${outputOptions.error}\n`);
            context.emit('done');
            return { handled: true };
          }
          const threads = await manager.listThreads();
          const page = pageItems(threads, outputOptions);
          if (threads.length === 0) {
            context.emit('text', 'No conversation threads found.\n');
          } else if (outputOptions.json) {
            context.emit('text', JSON.stringify({
              threads: page.items,
              total: page.total,
              limit: outputOptions.limit,
              cursor: outputOptions.cursor,
              nextCursor: page.nextCursor,
            }, null, 2));
          } else {
            context.emit('text', `\n## Threads (${page.shown}/${page.total})\n\n`);
            for (const thread of page.items) {
              const participants = truncateText(thread.participants.map((p) => p.assistantName).join(', '), outputOptions.verbose ? 160 : 80);
              const updated = new Date(thread.updatedAt).toLocaleDateString();
              context.emit('text', `**${thread.threadId}**\n`);
              if (thread.subject) {
                context.emit('text', `   Subject: ${truncateText(thread.subject, outputOptions.verbose ? 120 : 60)}\n`);
              }
              context.emit('text', `   Participants: ${participants}\n`);
              context.emit('text', `   Messages: ${thread.messageCount} (${thread.unreadCount} unread)\n`);
              context.emit('text', `   Updated: ${updated}\n\n`);
            }
            context.emit('text', disclosureHint(outputOptions, page.total, page.shown, '/messages thread <id>'));
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
          const outputOptions = parseDisclosureOptions(parts.slice(2));
          const full = outputOptions.args.includes('--full');
          if (outputOptions.error) {
            context.emit('text', `${outputOptions.error}\n`);
            context.emit('done');
            return { handled: true };
          }
          const message = await manager.read(messageId);
          if (!message) {
            context.emit('text', `Message ${messageId} not found.\n`);
          } else if (outputOptions.json) {
            context.emit('text', JSON.stringify(message, null, 2));
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
            context.emit('text', `${full ? message.body : truncateText(message.body, outputOptions.verbose ? 1000 : 400)}\n`);
            if (!full) {
              context.emit('text', '\nUse --verbose for a longer preview or --full for the full body.\n');
            }
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
          const outputOptions = parseDisclosureOptions(parts.slice(2));
          const full = outputOptions.args.includes('--full');
          if (outputOptions.error) {
            context.emit('text', `${outputOptions.error}\n`);
            context.emit('done');
            return { handled: true };
          }
          const messages = await manager.readThread(threadId);
          const page = pageItems(messages, outputOptions);
          if (messages.length === 0) {
            context.emit('text', `Thread ${threadId} not found or empty.\n`);
          } else if (outputOptions.json) {
            context.emit('text', JSON.stringify({
              messages: page.items,
              total: page.total,
              limit: outputOptions.limit,
              cursor: outputOptions.cursor,
              nextCursor: page.nextCursor,
            }, null, 2));
          } else {
            context.emit('text', `\n## Thread: ${threadId}\n`);
            context.emit('text', `**${page.shown}/${page.total} message(s)**\n\n`);
            for (const msg of page.items) {
              context.emit('text', '---\n');
              context.emit('text', `### From: ${msg.fromAssistantName} → ${msg.toAssistantName}\n`);
              if (msg.subject) {
                context.emit('text', `**Subject:** ${truncateText(msg.subject, outputOptions.verbose ? 120 : 60)}\n`);
              }
              context.emit('text', `**Sent:** ${new Date(msg.createdAt).toLocaleString()}\n\n`);
              context.emit('text', `${full ? msg.body : truncateText(msg.body, outputOptions.verbose ? 1000 : 300)}\n`);
              context.emit('text', `*ID: ${msg.id}*\n\n`);
            }
            context.emit('text', disclosureHint(outputOptions, page.total, page.shown, '/messages read <id> --full'));
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
          const outputOptions = parseDisclosureOptions(parts.slice(1));
          if (outputOptions.error) {
            context.emit('text', `${outputOptions.error}\n`);
            context.emit('done');
            return { handled: true };
          }
          const assistants = await manager.listAssistants();
          const page = pageItems(assistants, outputOptions);
          if (assistants.length === 0) {
            context.emit('text', 'No other assistants found. Assistants appear here after sending or receiving messages.\n');
          } else if (outputOptions.json) {
            context.emit('text', JSON.stringify({
              assistants: page.items,
              total: page.total,
              limit: outputOptions.limit,
              cursor: outputOptions.cursor,
              nextCursor: page.nextCursor,
            }, null, 2));
          } else {
            context.emit('text', `\n## Known Assistants (${page.shown}/${page.total})\n\n`);
            for (const assistant of page.items) {
              const lastSeen = new Date(assistant.lastSeen).toLocaleDateString();
              context.emit('text', `- **${truncateText(assistant.name, outputOptions.verbose ? 80 : 40)}** (ID: ${assistant.id})\n`);
              context.emit('text', `  Last seen: ${lastSeen}\n`);
            }
            context.emit('text', disclosureHint(outputOptions, page.total, page.shown, '/messages send'));
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
