import { NextResponse } from 'next/server';
import { getMemories, getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') || undefined;
    const category = searchParams.get('category') || undefined;
    const search = searchParams.get('search') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const memories = getMemories({ scope, category, search, limit });

    const parsed = memories.map(m => ({
      id: m.id,
      scope: m.scope,
      category: m.category,
      key: m.key,
      value: (() => {
        try { return JSON.parse(m.value); } catch { return m.value; }
      })(),
      summary: m.summary,
      importance: m.importance,
      tags: (() => {
        try { return JSON.parse(m.tags); } catch { return []; }
      })(),
      source: m.source,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    }));

    return NextResponse.json({ memories: parsed, count: parsed.length });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch memories' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      key: string; value: string; scope?: string; category?: string; importance?: number; summary?: string; tags?: string[]
    }
    if (!body.key || !body.value) {
      return NextResponse.json({ error: 'key and value are required' }, { status: 400 })
    }
    const db = getDb()
    const id = randomUUID()
    const now = new Date().toISOString()
    const tagsJson = body.tags && body.tags.length > 0 ? JSON.stringify(body.tags) : '[]'
    db.prepare(`
      INSERT INTO memories (id, scope, scope_id, category, key, value, summary, importance, tags, source, status, created_at, updated_at)
      VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, 'dashboard', 'active', ?, ?)
    `).run(
      id,
      body.scope ?? 'shared',
      body.category ?? 'knowledge',
      body.key,
      body.value,
      body.summary ?? null,
      body.importance ?? 5,
      tagsJson,
      now, now
    )
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
