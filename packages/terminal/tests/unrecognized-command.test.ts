/**
 * Regression tests for isUnrecognizedSlashCommand.
 *
 * Bug: the TUI's "Unknown command" pre-filter used a hardcoded allowlist, so
 * registered panel commands handled by the agent (/webhooks, /channels, /people,
 * /contacts, /telephony, /orders, /workspace, /heartbeat) were rejected before
 * ever reaching the agent. The predicate now also accepts anything in the loaded
 * command registry.
 */
import { describe, expect, test } from 'bun:test';
import { isUnrecognizedSlashCommand } from '../src/components/appHelpers';

const registry = ['/webhooks', '/channels', '/people', '/connectors', '/skills'];

describe('isUnrecognizedSlashCommand', () => {
  test('rejects a truly unknown bare command', () => {
    expect(isUnrecognizedSlashCommand('/nonsense', registry)).toBe(true);
  });

  test('accepts LLM-handled commands even if not in the registry', () => {
    expect(isUnrecognizedSlashCommand('/help', [])).toBe(false);
    expect(isUnrecognizedSlashCommand('/status', [])).toBe(false);
  });

  test('accepts registered panel commands (the bug fix)', () => {
    expect(isUnrecognizedSlashCommand('/webhooks', registry)).toBe(false);
    expect(isUnrecognizedSlashCommand('/channels', registry)).toBe(false);
    expect(isUnrecognizedSlashCommand('/people', registry)).toBe(false);
  });

  test('is case-insensitive', () => {
    expect(isUnrecognizedSlashCommand('/WebHooks', registry)).toBe(false);
  });

  test('never flags input with arguments or non bare-slash input', () => {
    expect(isUnrecognizedSlashCommand('/webhooks list', registry)).toBe(false);
    expect(isUnrecognizedSlashCommand('hello there', registry)).toBe(false);
    expect(isUnrecognizedSlashCommand('/say hi', registry)).toBe(false);
  });
});
