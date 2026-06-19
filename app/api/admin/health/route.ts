import { NextResponse } from 'next/server';
import fs from 'fs';
import { checkGeminiConnectivity, listDocuments, BUNDLED_DIR } from '@/lib/rag';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export interface CheckResult {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  latencyMs?: number;
}

export async function GET() {
  const checks: CheckResult[] = [];
  const startAll = Date.now();

  // ── 1. 환경변수 ───────────────────────────────────────────────
  if (process.env.OPENAI_API_KEY) {
    checks.push({ name: '환경변수', status: 'ok', message: 'OPENAI_API_KEY 설정됨' });
  } else {
    checks.push({ name: '환경변수', status: 'error', message: 'OPENAI_API_KEY 없음' });
    log.error('health', 'OPENAI_API_KEY 환경변수 없음');
  }

  // ── 2. OpenAI API 연결 ────────────────────────────────────────
  const t1 = Date.now();
  let openaiOk = false;
  try {
    await checkGeminiConnectivity();
    const latencyMs = Date.now() - t1;
    openaiOk = true;
    checks.push({ name: 'OpenAI API', status: 'ok', message: `연결 성공 (${latencyMs}ms)`, latencyMs });
    log.info('health', `OpenAI API 연결 성공 ${latencyMs}ms`);
  } catch (err) {
    const latencyMs = Date.now() - t1;
    const msg = err instanceof Error ? err.message : String(err);
    checks.push({ name: 'OpenAI API', status: 'error', message: `연결 실패: ${msg}`, latencyMs });
    log.error('health', 'OpenAI API 연결 실패', { error: msg });
  }

  // ── 3. 업로드 문서 ────────────────────────────────────────────
  if (openaiOk) {
    const t2 = Date.now();
    try {
      const docs = await listDocuments();
      const latencyMs = Date.now() - t2;
      checks.push({
        name: '업로드 문서',
        status: docs.length > 0 ? 'ok' : 'warning',
        message: docs.length > 0 ? `${docs.length}개 문서 확인됨` : '업로드된 문서 없음',
        latencyMs,
      });
      log.info('health', `업로드 문서 확인 완료: ${docs.length}개`);
    } catch (err) {
      const latencyMs = Date.now() - t2;
      const msg = err instanceof Error ? err.message : String(err);
      checks.push({ name: '업로드 문서', status: 'error', message: `조회 실패: ${msg}`, latencyMs });
      log.error('health', '업로드 문서 조회 실패', { error: msg });
    }
  } else {
    checks.push({ name: '업로드 문서', status: 'error', message: 'OpenAI 연결 실패로 확인 불가' });
  }

  // ── 4. 파일 시스템 ────────────────────────────────────────────
  try {
    if (fs.existsSync(BUNDLED_DIR)) {
      const pdfs = fs.readdirSync(BUNDLED_DIR).filter((f) => f.toLowerCase().endsWith('.pdf'));
      checks.push({
        name: '파일 시스템',
        status: pdfs.length > 0 ? 'ok' : 'warning',
        message: pdfs.length > 0 ? `rag-data/ 내 PDF ${pdfs.length}개` : 'rag-data/ 에 PDF 없음',
      });
    } else {
      checks.push({ name: '파일 시스템', status: 'warning', message: 'rag-data/ 폴더 없음' });
    }
  } catch (err) {
    checks.push({ name: '파일 시스템', status: 'error', message: `오류: ${err instanceof Error ? err.message : String(err)}` });
  }

  const overallStatus: CheckResult['status'] =
    checks.some((c) => c.status === 'error')
      ? 'error'
      : checks.some((c) => c.status === 'warning')
      ? 'warning'
      : 'ok';

  return NextResponse.json({
    status: overallStatus,
    checks,
    timestamp: new Date().toISOString(),
    totalMs: Date.now() - startAll,
  });
}
