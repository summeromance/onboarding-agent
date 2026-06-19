import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

export const BUNDLED_DIR = path.join(process.cwd(), 'rag-data');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function getOpenAI(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const LAST_INDEXED_FILE = path.join(process.cwd(), 'uploads', '.last-indexed');

export interface DocInfo {
  id: string;
  filename: string;
  status: string;
  source: 'upload' | 'bundled';
  uploadedAt?: string;
}

export function getLastIndexedAt(): string | null {
  try {
    if (!fs.existsSync(LAST_INDEXED_FILE)) return null;
    return fs.statSync(LAST_INDEXED_FILE).mtime.toISOString();
  } catch {
    return null;
  }
}

function touchLastIndexed(): void {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(LAST_INDEXED_FILE, new Date().toISOString());
}

export async function checkGeminiConnectivity(): Promise<void> {
  const openai = getOpenAI();
  await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 1,
  });
}

export async function listDocuments(): Promise<DocInfo[]> {
  const result: DocInfo[] = [];

  if (fs.existsSync(BUNDLED_DIR)) {
    for (const f of fs.readdirSync(BUNDLED_DIR).filter((f) => f.toLowerCase().endsWith('.pdf'))) {
      const uploadedAt = fs.statSync(path.join(BUNDLED_DIR, f)).mtime.toISOString();
      result.push({ id: `bundled:${f}`, filename: f, status: 'completed', source: 'bundled', uploadedAt });
    }
  }

  if (fs.existsSync(UPLOADS_DIR)) {
    for (const f of fs.readdirSync(UPLOADS_DIR).filter((f) => f.toLowerCase().endsWith('.pdf'))) {
      const uploadedAt = fs.statSync(path.join(UPLOADS_DIR, f)).mtime.toISOString();
      result.push({ id: f, filename: f, status: 'completed', source: 'upload', uploadedAt });
    }
  }

  return result;
}

export async function uploadDocument(filename: string, buffer: Buffer): Promise<DocInfo> {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const safeName = path.basename(filename);
  fs.writeFileSync(path.join(UPLOADS_DIR, safeName), buffer);
  touchLastIndexed();
  const uploadedAt = fs.statSync(path.join(UPLOADS_DIR, safeName)).mtime.toISOString();
  return { id: safeName, filename: safeName, status: 'completed', source: 'upload', uploadedAt };
}

export async function deleteDocument(fileId: string): Promise<void> {
  const safeName = path.basename(fileId);
  const filePath = path.join(UPLOADS_DIR, safeName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export async function syncBundledPDFs(): Promise<{ uploaded: string[]; skipped: string[] }> {
  if (!fs.existsSync(BUNDLED_DIR)) return { uploaded: [], skipped: [] };
  const pdfs = fs.readdirSync(BUNDLED_DIR).filter((f) => f.toLowerCase().endsWith('.pdf'));
  touchLastIndexed();
  return { uploaded: [], skipped: pdfs };
}

async function extractPDFText(buffer: Buffer): Promise<string> {
  const { extractText } = await import('unpdf');
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
  return text;
}

async function loadAllDocumentTexts(): Promise<string[]> {
  const texts: string[] = [];

  for (const dir of [UPLOADS_DIR, BUNDLED_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf'))) {
      try {
        const buffer = fs.readFileSync(path.join(dir, file));
        const text = await extractPDFText(buffer);
        texts.push(`[문서: ${file}]\n${text}`);
      } catch {
        // skip unreadable files
      }
    }
  }

  return texts;
}

export async function queryRAG(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<{ answer: string; sources: string[] }> {
  const openai = getOpenAI();
  const docTexts = await loadAllDocumentTexts();
  const docsSection =
    docTexts.length > 0
      ? `참고 문서:\n\n${docTexts.join('\n\n---\n\n')}`
      : '현재 업로드된 문서가 없습니다.';

  const systemPrompt = `당신은 신입사원 온보딩을 도와주는 AI 어시스턴트입니다.
제공된 회사 문서를 참고하여 신입사원의 질문에 친절하고 정확하게 한국어로 답변하세요.
문서에 없는 내용은 "해당 내용은 제공된 문서에서 찾을 수 없습니다"라고 솔직하게 말하세요.

${docsSection}`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((h) => ({ role: h.role, content: h.content } as OpenAI.Chat.ChatCompletionMessageParam)),
    { role: 'user', content: message },
  ];

  const result = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
  });

  const answer = result.choices[0]?.message?.content ?? '';
  return { answer, sources: [] };
}
