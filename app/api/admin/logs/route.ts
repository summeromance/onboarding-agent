import { NextRequest, NextResponse } from 'next/server';
import { getLogs, clearLogs, getStats, type LogLevel } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(params.get('limit') ?? '100'), 300);
  const level = (params.get('level') ?? '') as LogLevel | '';

  return NextResponse.json({
    logs: getLogs(limit, level || undefined),
    stats: getStats(),
  });
}

export async function DELETE() {
  clearLogs();
  return NextResponse.json({ success: true });
}
