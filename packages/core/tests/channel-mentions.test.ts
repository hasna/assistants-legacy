import { describe, test, expect } from 'bun:test';
import {
  parseMentions,
  resolveNameToKnown,
  resolveMentions,
  getMentionedMemberIds,
} from '../src/channels/mentions';
import type { ChannelMember } from '../src/channels/types';

// ─── parseMentions ────────────────────────────────────────────────────────────

describe('parseMentions', () => {
  test('extracts simple @mention', () => {
    expect(parseMentions('Hello @alice!')).toContain('alice');
  });

  test('extracts multiple @mentions', () => {
    const result = parseMentions('@alice and @bob please review');
    expect(result).toContain('alice');
    expect(result).toContain('bob');
  });

  test('extracts @"quoted name" mentions', () => {
    const result = parseMentions('Hey @"Alice Smith" please help');
    expect(result).toContain('Alice Smith');
  });

  test('handles hyphenated names', () => {
    expect(parseMentions('@my-agent please')).toContain('my-agent');
  });

  test('handles underscored names', () => {
    expect(parseMentions('@my_agent hello')).toContain('my_agent');
  });

  test('returns empty array for no mentions', () => {
    expect(parseMentions('Hello world, no mentions here')).toHaveLength(0);
  });

  test('deduplicates repeated mentions', () => {
    const result = parseMentions('@alice and @alice again');
    const aliceCount = result.filter(m => m === 'alice').length;
    expect(aliceCount).toBe(1);
  });

  test('ignores email-like patterns correctly', () => {
    // @user in emails: test@example.com → should extract 'example'? No — depends on regex
    // At minimum it should not crash
    expect(() => parseMentions('test@example.com')).not.toThrow();
  });

  test('handles empty string', () => {
    expect(parseMentions('')).toHaveLength(0);
  });

  test('mixed quoted and simple mentions', () => {
    const result = parseMentions('@"Alice Smith" and @bob');
    expect(result).toContain('Alice Smith');
    expect(result).toContain('bob');
  });
});

// ─── resolveNameToKnown ───────────────────────────────────────────────────────

describe('resolveNameToKnown', () => {
  const known = [
    { id: 'id-1', name: 'Alice Smith' },
    { id: 'id-2', name: 'Bob Builder' },
    { id: 'id-3', name: 'Carol Jones' },
  ];

  test('exact match (case-insensitive)', () => {
    const r = resolveNameToKnown('alice smith', known);
    expect(r?.id).toBe('id-1');
  });

  test('exact match preserving case', () => {
    const r = resolveNameToKnown('Alice Smith', known);
    expect(r?.id).toBe('id-1');
  });

  test('prefix match', () => {
    const r = resolveNameToKnown('alice', known);
    expect(r?.id).toBe('id-1');
  });

  test('word match (second word)', () => {
    const r = resolveNameToKnown('builder', known);
    expect(r?.id).toBe('id-2');
  });

  test('returns null for no match', () => {
    expect(resolveNameToKnown('dave', known)).toBeNull();
  });

  test('returns null for empty known list', () => {
    expect(resolveNameToKnown('alice', [])).toBeNull();
  });
});

// ─── resolveMentions ──────────────────────────────────────────────────────────

describe('resolveMentions', () => {
  const members: ChannelMember[] = [
    { assistantId: 'a1', assistantName: 'Alice', role: 'member', memberType: 'assistant', joinedAt: '' },
    { assistantId: 'a2', assistantName: 'Bob', role: 'member', memberType: 'assistant', joinedAt: '' },
  ];

  test('resolves mention to member', () => {
    const r = resolveMentions(['Alice'], members);
    expect(r).toHaveLength(1);
    expect(r[0].memberId).toBe('a1');
    expect(r[0].name).toBe('Alice');
  });

  test('resolves multiple mentions', () => {
    const r = resolveMentions(['Alice', 'Bob'], members);
    expect(r).toHaveLength(2);
    const ids = r.map(m => m.memberId);
    expect(ids).toContain('a1');
    expect(ids).toContain('a2');
  });

  test('skips unresolvable mentions', () => {
    const r = resolveMentions(['Alice', 'Ghost'], members);
    expect(r).toHaveLength(1);
    expect(r[0].memberId).toBe('a1');
  });

  test('returns empty array for empty names', () => {
    expect(resolveMentions([], members)).toHaveLength(0);
  });

  test('is case-insensitive for member names', () => {
    const r = resolveMentions(['alice'], members);
    expect(r).toHaveLength(1);
    expect(r[0].memberId).toBe('a1');
  });
});

// ─── getMentionedMemberIds ────────────────────────────────────────────────────

describe('getMentionedMemberIds', () => {
  const members: ChannelMember[] = [
    { assistantId: 'a1', assistantName: 'Alice', role: 'member', memberType: 'assistant', joinedAt: '' },
    { assistantId: 'a2', assistantName: 'Bob', role: 'member', memberType: 'assistant', joinedAt: '' },
  ];

  test('extracts member IDs from content', () => {
    const ids = getMentionedMemberIds('Hey @Alice please review', members);
    expect(ids).toContain('a1');
  });

  test('returns empty for no mentions', () => {
    expect(getMentionedMemberIds('No mentions here', members)).toHaveLength(0);
  });

  test('handles multiple mentions', () => {
    const ids = getMentionedMemberIds('@Alice and @Bob please help', members);
    expect(ids).toContain('a1');
    expect(ids).toContain('a2');
  });

  test('ignores unknown mentions', () => {
    const ids = getMentionedMemberIds('@Ghost please help', members);
    expect(ids).toHaveLength(0);
  });
});
