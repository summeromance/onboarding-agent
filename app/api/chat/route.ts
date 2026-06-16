import { NextRequest, NextResponse } from 'next/server';
import { queryRAG } from '@/lib/rag';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { message, history } = await request.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: '메시지가 필요합니다.' }, { status: 400 });
    }
    const result = await queryRAG(message, history ?? []);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/chat]', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
