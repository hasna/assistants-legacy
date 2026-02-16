import { NextResponse } from 'next/server';
import { getMemories } from '@/lib/db';

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
