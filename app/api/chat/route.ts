import { NextRequest, NextResponse } from 'next/server';
import { queryRAG } from '@/lib/rag';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const t = Date.now();
  try {
    const { message, history } = await request.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: '메시지가 필요합니다.' }, { status: 400 });
    }
    log.info('chat', `질문 수신: "${message.slice(0, 60)}${message.length > 60 ? '…' : ''}"`);
    const result = await queryRAG(message, history ?? []);
    log.info('chat', `답변 완료 · 출처: ${result.sources.join(', ') || '없음'}`, undefined, Date.now() - t);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('chat', `오류 발생: ${msg}`, { stack: err instanceof Error ? err.stack : undefined }, Date.now() - t);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
