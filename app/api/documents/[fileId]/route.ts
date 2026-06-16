import { NextRequest, NextResponse } from 'next/server';
import { deleteDocument } from '@/lib/rag';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    await deleteDocument(fileId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[/api/documents DELETE]', err);
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
