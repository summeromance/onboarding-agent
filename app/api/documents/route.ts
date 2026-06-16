import { NextRequest, NextResponse } from 'next/server';
import { getDocumentList, saveDocument } from '@/lib/rag';

export const dynamic = 'force-dynamic';

export async function GET() {
  const documents = getDocumentList();
  return NextResponse.json({ documents });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'PDF 파일만 업로드 가능합니다.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    saveDocument(file.name, buffer);

    return NextResponse.json({ success: true, filename: file.name });
  } catch (err) {
    console.error('[/api/documents POST]', err);
    return NextResponse.json({ error: '업로드 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
