import { NextResponse } from 'next/server';
import { getSessionMessages } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const messages = getSessionMessages(sessionId);

    const parsed = messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      toolCalls: m.tool_calls ? JSON.parse(m.tool_calls) : undefined,
      toolResults: m.tool_results ? JSON.parse(m.tool_results) : undefined,
    }));

    return NextResponse.json({ messages: parsed });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}
