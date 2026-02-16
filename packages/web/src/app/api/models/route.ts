import { NextResponse } from 'next/server';
import { WEB_MODELS } from '@/lib/models';

export async function GET() {
  return NextResponse.json({ models: WEB_MODELS });
}
