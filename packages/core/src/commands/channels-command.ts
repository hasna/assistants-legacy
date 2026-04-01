import type { Command } from './types';
import { splitArgs } from './helpers';
import { parseMentions, resolveNameToKnown } from '../channels/mentions';

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
