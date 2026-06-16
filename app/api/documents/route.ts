import { NextRequest, NextResponse } from 'next/server';
import { listDocuments, uploadDocument } from '@/lib/rag';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const documents = await listDocuments();
    return NextResponse.json({ documents });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('documents', `목록 조회 실패: ${msg}`);
    return NextResponse.json({ error: '문서 목록을 가져오는 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const t = Date.now();
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    if (!file.name.toLowerCase().endsWith('.pdf'))
      return NextResponse.json({ error: 'PDF 파일만 업로드 가능합니다.' }, { status: 400 });

    log.info('documents', `업로드 시작: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);
    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await uploadDocument(file.name, buffer);
    log.info('documents', `업로드 완료: ${file.name} → ${doc.id}`, undefined, Date.now() - t);
    return NextResponse.json({ success: true, document: doc });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('documents', `업로드 실패: ${msg}`, { stack: err instanceof Error ? err.stack : undefined }, Date.now() - t);
    return NextResponse.json({ error: '업로드 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
