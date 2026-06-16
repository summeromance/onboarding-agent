import fs from 'fs';
import path from 'path';
import OpenAI, { toFile } from 'openai';

export const BUNDLED_DIR = path.join(process.cwd(), 'rag-data');
const VS_NAME = 'onboarding-docs';

function getOpenAI(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY_TEMP });
}

// Cache within the same serverless instance
let cachedVSId: string | null = process.env.OPENAI_VECTOR_STORE_ID ?? null;

export async function getVectorStoreId(): Promise<string> {
  if (cachedVSId) return cachedVSId;

  const openai = getOpenAI();
  const stores = await openai.vectorStores.list();
  const existing = stores.data.find((s) => s.name === VS_NAME);

  cachedVSId = existing
    ? existing.id
    : (await openai.vectorStores.create({ name: VS_NAME })).id;

  return cachedVSId;
}

export interface DocInfo {
  id: string;
  filename: string;
  status: string;
}

export async function listDocuments(): Promise<DocInfo[]> {
  const openai = getOpenAI();
  const vsId = await getVectorStoreId();
  const vsFiles = await openai.vectorStores.files.list(vsId, { limit: 100 });

  const results: DocInfo[] = [];
  for (const vsFile of vsFiles.data) {
    try {
      const info = await openai.files.retrieve(vsFile.id);
      results.push({ id: vsFile.id, filename: info.filename, status: vsFile.status });
    } catch {
      // file may have been deleted from OpenAI files but still in VS
    }
  }
  return results;
}

export async function uploadDocument(filename: string, buffer: Buffer): Promise<DocInfo> {
  const openai = getOpenAI();
  const vsId = await getVectorStoreId();

  const file = await toFile(buffer, filename, { type: 'application/pdf' });
  const uploaded = await openai.files.create({ file, purpose: 'assistants' });
  await openai.vectorStores.files.create(vsId, { file_id: uploaded.id });

  return { id: uploaded.id, filename, status: 'in_progress' };
}

export async function deleteDocument(fileId: string): Promise<void> {
  const openai = getOpenAI();
  const vsId = await getVectorStoreId();
  try { await openai.vectorStores.files.delete(fileId, { vector_store_id: vsId }); } catch { /* ignore */ }
  try { await openai.files.delete(fileId); } catch { /* ignore */ }
}

export async function syncBundledPDFs(): Promise<{ uploaded: string[]; skipped: string[] }> {
  if (!fs.existsSync(BUNDLED_DIR)) return { uploaded: [], skipped: [] };

  const pdfs = fs.readdirSync(BUNDLED_DIR).filter((f) => f.toLowerCase().endsWith('.pdf'));
  const existing = await listDocuments();
  const existingNames = new Set(existing.map((d) => d.filename));

  const uploaded: string[] = [];
  const skipped: string[] = [];

  for (const pdf of pdfs) {
    if (existingNames.has(pdf)) {
      skipped.push(pdf);
      continue;
    }
    const buffer = fs.readFileSync(path.join(BUNDLED_DIR, pdf));
    await uploadDocument(pdf, buffer);
    uploaded.push(pdf);
  }

  return { uploaded, skipped };
}

export async function queryRAG(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<{ answer: string; sources: string[] }> {
  const openai = getOpenAI();
  const vsId = await getVectorStoreId();

  const input = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: message },
  ];

  const response = await openai.responses.create({
    model: 'gpt-4o-mini',
    instructions: `당신은 신입사원 온보딩을 도와주는 AI 어시스턴트입니다.
제공된 회사 문서를 참고하여 신입사원의 질문에 친절하고 정확하게 한국어로 답변하세요.
문서에 없는 내용은 "해당 내용은 제공된 문서에서 찾을 수 없습니다"라고 솔직하게 말하세요.`,
    tools: [{ type: 'file_search', vector_store_ids: [vsId] }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: input as any,
  });

  const answer = response.output_text ?? '';

  // Extract cited filenames from annotations
  const sources: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type === 'message') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const content of (item as any).content ?? []) {
        for (const ann of content.annotations ?? []) {
          if (ann.type === 'file_citation' && ann.filename && !sources.includes(ann.filename)) {
            sources.push(ann.filename);
          }
        }
      }
    }
  }

  return { answer, sources };
}
