import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const BUNDLED_DIR = path.join(process.cwd(), 'rag-data');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function getGenAI(): GoogleGenerativeAI {
  return new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
}

export interface DocInfo {
  id: string;
  filename: string;
  status: string;
}

export async function checkGeminiConnectivity(): Promise<void> {
  const genai = getGenAI();
  const model = genai.getGenerativeModel({ model: 'models/gemini-3.5-flash' });
  await model.generateContent('ping');
}

export async function listDocuments(): Promise<DocInfo[]> {
  if (!fs.existsSync(UPLOADS_DIR)) return [];
  const files = fs.readdirSync(UPLOADS_DIR).filter((f) => f.toLowerCase().endsWith('.pdf'));
  return files.map((f) => ({ id: f, filename: f, status: 'completed' }));
}

export async function uploadDocument(filename: string, buffer: Buffer): Promise<DocInfo> {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const safeName = path.basename(filename);
  fs.writeFileSync(path.join(UPLOADS_DIR, safeName), buffer);
  return { id: safeName, filename: safeName, status: 'completed' };
}

export async function deleteDocument(fileId: string): Promise<void> {
  const safeName = path.basename(fileId);
  const filePath = path.join(UPLOADS_DIR, safeName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export async function syncBundledPDFs(): Promise<{ uploaded: string[]; skipped: string[] }> {
  if (!fs.existsSync(BUNDLED_DIR)) return { uploaded: [], skipped: [] };
  const pdfs = fs.readdirSync(BUNDLED_DIR).filter((f) => f.toLowerCase().endsWith('.pdf'));
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
  const genai = getGenAI();
  const docTexts = await loadAllDocumentTexts();
  const docsSection =
    docTexts.length > 0
      ? `참고 문서:\n\n${docTexts.join('\n\n---\n\n')}`
      : '현재 업로드된 문서가 없습니다.';

  const model = genai.getGenerativeModel({
    model: 'models/gemini-3.5-flash',
    systemInstruction: `당신은 신입사원 온보딩을 도와주는 AI 어시스턴트입니다.
제공된 회사 문서를 참고하여 신입사원의 질문에 친절하고 정확하게 한국어로 답변하세요.
문서에 없는 내용은 "해당 내용은 제공된 문서에서 찾을 수 없습니다"라고 솔직하게 말하세요.

${docsSection}`,
  });

  const chat = model.startChat({
    history: history.map((h) => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }],
    })),
  });

  const result = await chat.sendMessage(message);
  const answer = result.response.text();

  return { answer, sources: [] };
}
