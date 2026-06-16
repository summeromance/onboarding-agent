import { NextRequest, NextResponse } from 'next/server';
import { deleteDocument } from '@/lib/rag';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const decoded = decodeURIComponent(filename);
    const deleted = deleteDocument(decoded);

    if (!deleted) {
      return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[/api/documents DELETE]', err);
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
