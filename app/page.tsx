'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
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

  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      <div className="flex flex-col flex-1 min-w-0">
        <div className="relative bg-blue-600 text-white px-6 py-4 shadow-md flex-shrink-0">
          <h1 className="text-xl font-bold tracking-tight">신입사원 온보딩 에이전트</h1>
          <p className="text-blue-200 text-xs mt-0.5">회사 문서 기반 AI 어시스턴트</p>
          <Link
            href="/admin"
            className="absolute right-6 top-1/2 -translate-y-1/2 text-xs text-blue-200 hover:text-white transition-colors"
          >
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
    </div>
  );
}
