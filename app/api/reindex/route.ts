import { NextResponse } from 'next/server';
import { syncBundledPDFs } from '@/lib/rag';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await syncBundledPDFs();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[/api/reindex]', err);
    return NextResponse.json({ error: '동기화 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
