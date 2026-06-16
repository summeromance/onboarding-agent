import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// On Vercel, project files are read-only; uploads go to /tmp
const IS_VERCEL = !!process.env.VERCEL;
export const BUNDLED_DIR = path.join(process.cwd(), 'rag-data');
export const UPLOAD_DIR = IS_VERCEL ? '/tmp/rag-data' : BUNDLED_DIR;

interface Chunk {
  text: string;
  embedding: number[];
  filename: string;
}

// Module-level cache (lives for the duration of the serverless function instance)
let cachedChunks: Chunk[] | null = null;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function splitText(text: string, size = 800, overlap = 150): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const chunk = text.slice(start, start + size).trim();
    if (chunk.length > 50) chunks.push(chunk);
    start += size - overlap;
  }
  return chunks;
}

async function parsePDF(buffer: Buffer): Promise<string> {
  const { extractText } = await import('unpdf');
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
  return text as string;
}

function getPDFPaths(): { filename: string; filepath: string }[] {
  const seen = new Set<string>();
  const results: { filename: string; filepath: string }[] = [];

  for (const dir of [BUNDLED_DIR, ...(IS_VERCEL ? [UPLOAD_DIR] : [])]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.toLowerCase().endsWith('.pdf') && !seen.has(f)) {
        seen.add(f);
        results.push({ filename: f, filepath: path.join(dir, f) });
      }
    }
  }

  return results;
}

export async function buildIndex(force = false): Promise<void> {
  if (cachedChunks && !force) return;

  const pdfs = getPDFPaths();
  const chunks: Chunk[] = [];

  for (const { filename, filepath } of pdfs) {
    try {
      const buffer = fs.readFileSync(filepath);
      const text = await parsePDF(buffer);
      const textChunks = splitText(text);

      // Batch embed (max 20 per request to stay within limits)
      const batchSize = 20;
      for (let i = 0; i < textChunks.length; i += batchSize) {
        const batch = textChunks.slice(i, i + batchSize);
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: batch,
        });
        for (let j = 0; j < batch.length; j++) {
          chunks.push({
            text: batch[j],
            embedding: response.data[j].embedding,
            filename,
          });
        }
      }
    } catch (err) {
      console.error(`[RAG] Failed to parse ${filename}:`, err);
    }
  }

  cachedChunks = chunks;
}

export async function queryRAG(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<{ answer: string; sources: string[] }> {
  await buildIndex();

  if (!cachedChunks || cachedChunks.length === 0) {
    return {
      answer: '등록된 문서가 없습니다. 오른쪽 패널에서 PDF 문서를 업로드해 주세요.',
      sources: [],
    };
  }

  const embRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: message,
  });
  const qEmb = embRes.data[0].embedding;

  const topChunks = cachedChunks
    .map((chunk) => ({ chunk, score: cosineSimilarity(qEmb, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const context = topChunks
    .map((s) => `[${s.chunk.filename}]\n${s.chunk.text}`)
    .join('\n\n---\n\n');

  const sources = [...new Set(topChunks.map((s) => s.chunk.filename))];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `당신은 신입사원 온보딩을 도와주는 AI 어시스턴트입니다.
아래 회사 문서를 참고하여 신입사원의 질문에 친절하고 정확하게 한국어로 답변하세요.
문서에 없는 내용은 "해당 내용은 제공된 문서에서 찾을 수 없습니다"라고 솔직하게 말하세요.

[참고 문서]
${context}`,
      },
      ...history,
      { role: 'user', content: message },
    ],
  });

  return {
    answer: response.choices[0].message.content ?? '',
    sources,
  };
}

export function getDocumentList(): { filename: string; source: 'bundled' | 'uploaded' }[] {
  const results: { filename: string; source: 'bundled' | 'uploaded' }[] = [];
  const seen = new Set<string>();

  if (fs.existsSync(BUNDLED_DIR)) {
    for (const f of fs.readdirSync(BUNDLED_DIR)) {
      if (f.toLowerCase().endsWith('.pdf')) {
        results.push({ filename: f, source: 'bundled' });
        seen.add(f);
      }
    }
  }

  if (IS_VERCEL && fs.existsSync(UPLOAD_DIR)) {
    for (const f of fs.readdirSync(UPLOAD_DIR)) {
      if (f.toLowerCase().endsWith('.pdf') && !seen.has(f)) {
        results.push({ filename: f, source: 'uploaded' });
      }
    }
  }

  return results;
}

export function saveDocument(filename: string, buffer: Buffer): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  cachedChunks = null; // invalidate cache
}

export function deleteDocument(filename: string): boolean {
  // Try upload dir first, then bundled dir (only in local dev)
  for (const dir of [UPLOAD_DIR, ...(IS_VERCEL ? [] : [BUNDLED_DIR])]) {
    const filepath = path.join(dir, filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      cachedChunks = null;
      return true;
    }
  }
  return false;
}

export function invalidateIndex(): void {
  cachedChunks = null;
}
