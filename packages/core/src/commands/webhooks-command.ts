import type { Command } from './types';
import { splitArgs, parseDisclosureOptions, pageItems, disclosureHint, truncateText } from './helpers';

export function webhooksCommand(): Command {
  return {
    name: 'webhooks',
    description: 'Manage webhooks for receiving push events from external sources',
    builtin: true,
    selfHandled: true,
    content: '',
    handler: async (args, context) => {
      const parts = splitArgs(args);
      const [subcommand, ...rest] = parts;
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
          const outputOptions = parseDisclosureOptions(rest);
          if (outputOptions.error) {
            context.emit('text', `${outputOptions.error}\n`);
            context.emit('done');
            return { handled: true };
          }
          const webhooks = await manager.list();
          const page = pageItems(webhooks, outputOptions);
          if (webhooks.length === 0) {
            context.emit('text', 'No webhooks registered. Use /webhooks create <name> <source> to create one.\n');
          } else if (outputOptions.json) {
            context.emit('text', JSON.stringify({
              webhooks: page.items,
              total: page.total,
              limit: outputOptions.limit,
              cursor: outputOptions.cursor,
              nextCursor: page.nextCursor,
            }, null, 2));
          } else {
            context.emit('text', `Webhooks (${page.shown}/${page.total}):\n\n`);
            for (const wh of page.items) {
              const statusIcon = wh.status === 'active' ? '●' : wh.status === 'paused' ? '◐' : '✗';
              const lastDelivery = wh.lastDeliveryAt
                ? new Date(wh.lastDeliveryAt).toLocaleDateString()
                : 'never';
              context.emit('text', `  ${statusIcon} ${truncateText(wh.name, outputOptions.verbose ? 100 : 48)} (${wh.id})\n`);
              context.emit('text', `    Source: ${truncateText(wh.source, 40)} | Events: ${wh.deliveryCount} | Last: ${lastDelivery}\n`);
            }
            context.emit('text', disclosureHint(outputOptions, page.total, page.shown, '/webhooks events <id>'));
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
