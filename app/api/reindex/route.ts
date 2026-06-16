import { NextResponse } from 'next/server';
import { syncBundledPDFs } from '@/lib/rag';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST() {
  const t = Date.now();
  try {
    log.info('sync', '번들 PDF 동기화 시작');
    const result = await syncBundledPDFs();
    log.info(
      'sync',
      `동기화 완료 · 업로드 ${result.uploaded.length}개, 유지 ${result.skipped.length}개`,
      { uploaded: result.uploaded, skipped: result.skipped },
      Date.now() - t
    );
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('sync', `동기화 실패: ${msg}`, { stack: err instanceof Error ? err.stack : undefined }, Date.now() - t);
    return NextResponse.json({ error: '동기화 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
