import { NextRequest, NextResponse } from 'next/server';
import { listDocuments, uploadDocument } from '@/lib/rag';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const documents = await listDocuments();
    return NextResponse.json({ documents });
  } catch (err) {
    console.error('[/api/documents GET]', err);
    return NextResponse.json({ error: '문서 목록을 가져오는 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    if (!file.name.toLowerCase().endsWith('.pdf'))
      return NextResponse.json({ error: 'PDF 파일만 업로드 가능합니다.' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await uploadDocument(file.name, buffer);
    return NextResponse.json({ success: true, document: doc });
  } catch (err) {
    console.error('[/api/documents POST]', err);
    return NextResponse.json({ error: '업로드 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
