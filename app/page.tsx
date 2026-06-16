'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
}

interface Document {
  id: string;
  filename: string;
  status: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        '안녕하세요! 신입사원 온보딩 에이전트입니다.\n회사 규정, 업무 절차, 복리후생 등 궁금한 점을 자유롭게 질문해 주세요.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<string | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchDocuments = useCallback(async () => {
    const res = await fetch('/api/documents');
    const data = await res.json();
    setDocuments(data.documents ?? []);
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');

    const newHistory = [...messages, { role: 'user' as const, content: userMessage }];
    setMessages(newHistory);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: messages.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      setMessages([
        ...newHistory,
        { role: 'assistant', content: data.answer ?? data.error, sources: data.sources },
      ]);
    } catch {
      setMessages([
        ...newHistory,
        { role: 'assistant', content: '오류가 발생했습니다. 다시 시도해 주세요.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async (file: File, targetFilename?: string) => {
    setUploading(true);
    const formData = new FormData();
    const blob = new Blob([await file.arrayBuffer()], { type: 'application/pdf' });
    formData.append('file', blob, targetFilename ?? file.name);

    try {
      const res = await fetch('/api/documents', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        await fetchDocuments();
        setIndexStatus(`"${data.document?.filename}" 업로드 완료. OpenAI가 인덱싱 중입니다.`);
      } else {
        setIndexStatus(data.error ?? '업로드 실패');
      }
    } finally {
      setUploading(false);
      setReplaceTarget(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  const handleAddFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleReplaceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && replaceTarget) uploadFile(file, replaceTarget);
  };

  const deleteDocument = async (doc: Document) => {
    await fetch(`/api/documents/${encodeURIComponent(doc.id)}`, { method: 'DELETE' });
    await fetchDocuments();
    setIndexStatus(`"${doc.filename}" 삭제 완료.`);
  };

  const reindex = async () => {
    setIndexing(true);
    setIndexStatus('동기화 중...');
    try {
      const res = await fetch('/api/reindex', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        await fetchDocuments();
        const msg = data.uploaded?.length
          ? `✅ ${data.uploaded.length}개 업로드됨, ${data.skipped?.length ?? 0}개 기존 유지`
          : `✅ 모든 문서가 이미 동기화되어 있습니다.`;
        setIndexStatus(msg);
      } else {
        setIndexStatus(data.error ?? '동기화 실패');
      }
    } catch {
      setIndexStatus('동기화 중 오류가 발생했습니다.');
    } finally {
      setIndexing(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* ── Chat Panel ── */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="relative bg-blue-600 text-white px-6 py-4 shadow-md flex-shrink-0">
          <h1 className="text-xl font-bold tracking-tight">신입사원 온보딩 에이전트</h1>
          <p className="text-blue-200 text-xs mt-0.5">회사 문서 기반 AI 어시스턴트</p>
          <Link href="/admin" className="absolute right-6 top-1/2 -translate-y-1/2 text-xs text-blue-200 hover:text-white transition-colors">
            🔧 관리자
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0 mt-1">
                  AI
                </div>
              )}
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-tl-sm'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.sources && msg.sources.length > 0 && (
                  <p className="text-xs mt-2 opacity-60 border-t border-gray-200 pt-1">
                    📎 출처: {msg.sources.join(', ')}
                  </p>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0">
                AI
              </div>
              <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-100">
                <div className="flex space-x-1 items-center h-4">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="px-6 py-4 bg-white border-t border-gray-200 flex-shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="질문을 입력하세요... (Enter로 전송)"
              className="flex-1 border border-gray-300 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              전송
            </button>
          </div>
        </div>
      </div>

      {/* ── Document Panel ── */}
      <div className="w-72 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-sm">📁 문서 관리</h2>
          <p className="text-xs text-gray-400 mt-0.5">{documents.length}개 문서 등록됨</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {documents.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-2xl mb-2">📄</p>
              <p className="text-xs">등록된 문서가 없습니다.</p>
              <p className="text-xs mt-1">PDF를 추가해 주세요.</p>
            </div>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.filename}
                className="flex items-start gap-2 p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 group"
              >
                <span className="text-base flex-shrink-0 mt-0.5">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 break-all leading-snug">{doc.filename}</p>
                  {doc.status !== 'completed' && (
                    <span className="text-[10px] text-amber-500">인덱싱 중...</span>
                  )}
                </div>
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={() => {
                      setReplaceTarget(doc.filename);
                      replaceInputRef.current?.click();
                    }}
                    className="text-[10px] text-blue-500 hover:text-blue-700"
                  >
                    교체
                  </button>
                  <button
                    onClick={() => deleteDocument(doc)}
                    className="text-[10px] text-red-400 hover:text-red-600"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {indexStatus && (
          <div className="mx-4 mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-700">{indexStatus}</p>
          </div>
        )}

        <div className="px-4 py-4 border-t border-gray-100 space-y-2">
          <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleAddFile} className="hidden" />
          <input ref={replaceInputRef} type="file" accept=".pdf" onChange={handleReplaceFile} className="hidden" />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg py-2 text-xs font-medium transition-colors disabled:opacity-50"
          >
            {uploading ? '업로드 중...' : '+ PDF 문서 추가'}
          </button>

          <button
            onClick={reindex}
            disabled={indexing}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-xs font-medium transition-colors disabled:opacity-50"
          >
            {indexing ? '동기화 중...' : '🔄 문서 동기화'}
          </button>
        </div>
      </div>
    </div>
  );
}
