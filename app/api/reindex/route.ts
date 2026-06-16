import { NextResponse } from 'next/server';
import { buildIndex, invalidateIndex } from '@/lib/rag';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    invalidateIndex();
    await buildIndex(true);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[/api/reindex]', err);
    return NextResponse.json({ error: '인덱싱 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
