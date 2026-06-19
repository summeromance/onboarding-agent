'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

// ── Types ──────────────────────────────────────────────────────────────────
interface CheckResult {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  latencyMs?: number;
}

interface HealthData {
  status: 'ok' | 'warning' | 'error';
  checks: CheckResult[];
  timestamp: string;
  totalMs: number;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  category: string;
  message: string;
  details?: Record<string, unknown>;
  durationMs?: number;
}

interface LogStats {
  total: number;
  info: number;
  warn: number;
  error: number;
}

interface DocInfo {
  id: string;
  filename: string;
  status: string;
  uploadedAt?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  ok:      { dot: 'bg-green-500',  badge: 'bg-green-50 text-green-700 border-green-200',  label: '정상' },
  warning: { dot: 'bg-yellow-400', badge: 'bg-yellow-50 text-yellow-700 border-yellow-200', label: '주의' },
  error:   { dot: 'bg-red-500',    badge: 'bg-red-50 text-red-700 border-red-200',        label: '오류' },
};

const LEVEL_COLOR = {
  info:  'text-blue-600 bg-blue-50',
  warn:  'text-yellow-700 bg-yellow-50',
  error: 'text-red-600 bg-red-50',
};

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour12: false });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { hour12: false });
}

// ── Component ──────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [health, setHealth]           = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [logs, setLogs]               = useState<LogEntry[]>([]);
  const [stats, setStats]             = useState<LogStats | null>(null);
  const [logLevel, setLogLevel]       = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [logsLoading, setLogsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [docs, setDocs]               = useState<DocInfo[]>([]);
  const [lastIndexedAt, setLastIndexedAt] = useState<string | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [docStatus, setDocStatus]     = useState<string | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);

  const fileInputRef    = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch health ──────────────────────────────────────────────────────
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/admin/health');
      setHealth(await res.json());
    } finally {
      setHealthLoading(false);
    }
  }, []);

  // ── Fetch logs ────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const lvl = logLevel !== 'all' ? `&level=${logLevel}` : '';
      const res = await fetch(`/api/admin/logs?limit=200${lvl}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
      setStats(data.stats ?? null);
    } finally {
      setLogsLoading(false);
    }
  }, [logLevel]);

  const clearLogs = async () => {
    await fetch('/api/admin/logs', { method: 'DELETE' });
    setLogs([]);
    setStats(null);
  };

  const copyEntry = (entry: LogEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const lines: string[] = [
      `[${fmtDate(entry.timestamp)}] ${entry.level.toUpperCase()} [${entry.category}] ${entry.message}${entry.durationMs !== undefined ? ` (${entry.durationMs}ms)` : ''}`,
    ];
    if (entry.details) {
      lines.push(JSON.stringify(entry.details, null, 2));
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId((prev) => (prev === entry.id ? null : prev)), 1500);
  };

  const copyAllLogs = () => {
    const text = logs
      .map((entry) => {
        const line = `[${fmtDate(entry.timestamp)}] ${entry.level.toUpperCase()} [${entry.category}] ${entry.message}${entry.durationMs !== undefined ? ` (${entry.durationMs}ms)` : ''}`;
        return entry.details ? `${line}\n${JSON.stringify(entry.details, null, 2)}` : line;
      })
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setCopiedId('__all__');
    setTimeout(() => setCopiedId((prev) => (prev === '__all__' ? null : prev)), 1500);
  };

  // ── Fetch documents ───────────────────────────────────────────────────
  const fetchDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      setDocs(data.documents ?? []);
      setLastIndexedAt(data.lastIndexedAt ?? null);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  const uploadFile = async (file: File, targetFilename?: string) => {
    setUploading(true);
    setDocStatus(null);
    const formData = new FormData();
    const blob = new Blob([await file.arrayBuffer()], { type: 'application/pdf' });
    formData.append('file', blob, targetFilename ?? file.name);
    try {
      const res = await fetch('/api/documents', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        await fetchDocs();
        setDocStatus(`"${data.document?.filename}" 업로드 완료.`);
      } else {
        setDocStatus(data.error ?? '업로드 실패');
      }
    } finally {
      setUploading(false);
      setReplaceTarget(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  const deleteDoc = async (doc: DocInfo) => {
    await fetch(`/api/documents/${encodeURIComponent(doc.id)}`, { method: 'DELETE' });
    await fetchDocs();
    setDocStatus(`"${doc.filename}" 삭제 완료.`);
  };

  const syncDocs = async () => {
    setSyncing(true);
    setDocStatus('동기화 중...');
    try {
      const res = await fetch('/api/reindex', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        await fetchDocs();
        setDocStatus(
          data.uploaded?.length
            ? `${data.uploaded.length}개 업로드됨, ${data.skipped?.length ?? 0}개 기존 유지`
            : '모든 문서가 이미 동기화되어 있습니다.'
        );
      } else {
        setDocStatus(data.error ?? '동기화 실패');
      }
    } catch {
      setDocStatus('동기화 중 오류가 발생했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  // ── Initial load ──────────────────────────────────────────────────────
  useEffect(() => { fetchHealth(); fetchLogs(); fetchDocs(); }, [fetchHealth, fetchLogs, fetchDocs]);

  // ── Auto-refresh logs ─────────────────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 10_000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchLogs]);

  // ── Re-fetch logs when filter changes ─────────────────────────────────
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const overallColor = health ? STATUS_COLOR[health.status] : STATUS_COLOR.ok;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* ── Header ── */}
      <header className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-xl">🔧</span>
          <div>
            <h1 className="text-lg font-bold">관리자 대시보드</h1>
            <p className="text-gray-400 text-xs">온보딩 에이전트 모니터링</p>
          </div>
        </div>
        <Link
          href="/"
          className="text-sm text-gray-300 hover:text-white transition-colors flex items-center gap-1"
        >
          ← 메인으로
        </Link>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ── Service Health ── */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-800">서비스 상태</h2>
              {health && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${overallColor.badge}`}>
                  {overallColor.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {health && (
                <span className="text-xs text-gray-400">
                  {fmtDate(health.timestamp)} · {health.totalMs}ms
                </span>
              )}
              <button
                onClick={fetchHealth}
                disabled={healthLoading}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {healthLoading ? '확인 중…' : '🔄 새로고침'}
              </button>
            </div>
          </div>

          <div className="divide-y divide-gray-50">
            {health ? (
              health.checks.map((c) => {
                const col = STATUS_COLOR[c.status];
                return (
                  <div key={c.name} className="px-5 py-3.5 flex items-center gap-4">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${col.dot}`} />
                    <span className="w-28 text-sm font-medium text-gray-700">{c.name}</span>
                    <span className="flex-1 text-sm text-gray-600">{c.message}</span>
                    {c.latencyMs !== undefined && (
                      <span className="text-xs text-gray-400 tabular-nums">{c.latencyMs}ms</span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="px-5 py-8 text-center text-sm text-gray-400">
                {healthLoading ? '서비스 상태 확인 중…' : '새로고침을 눌러 상태를 확인하세요.'}
              </div>
            )}
          </div>
        </section>

        {/* ── Document Management ── */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-gray-800">문서 관리</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                {docs.length}개
              </span>
            </div>
            <div className="flex items-center gap-2">
              {lastIndexedAt && (
                <span className="text-xs text-gray-400">
                  마지막 인덱싱: {fmtDate(lastIndexedAt)}
                </span>
              )}
              <button
                onClick={fetchDocs}
                disabled={docsLoading}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {docsLoading ? '…' : '🔄 새로고침'}
              </button>
            </div>
          </div>

          {/* File list */}
          <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
            {docs.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">
                <p className="text-2xl mb-2">📄</p>
                <p>등록된 문서가 없습니다.</p>
                <p className="mt-1 text-xs">PDF 파일을 업로드해 주세요.</p>
              </div>
            ) : (
              docs.map((doc) => (
                <div key={doc.id} className="px-5 py-3 flex items-center gap-3 group hover:bg-gray-50">
                  <span className="text-base flex-shrink-0">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{doc.filename}</p>
                    {doc.uploadedAt && (
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(doc.uploadedAt)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => { setReplaceTarget(doc.filename); replaceInputRef.current?.click(); }}
                      className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      교체
                    </button>
                    <button
                      onClick={() => deleteDoc(doc)}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Status message */}
          {docStatus && (
            <div className="mx-5 my-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700">{docStatus}</p>
            </div>
          )}

          {/* Actions */}
          <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".pdf"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
              className="hidden"
            />
            <input ref={replaceInputRef} type="file" accept=".pdf"
              onChange={(e) => { const f = e.target.files?.[0]; if (f && replaceTarget) uploadFile(f, replaceTarget); }}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {uploading ? '업로드 중...' : '+ PDF 추가'}
            </button>
            <button
              onClick={syncDocs}
              disabled={syncing}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {syncing ? '동기화 중...' : '🔄 번들 동기화'}
            </button>
          </div>
        </section>

        {/* ── Logs ── */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-gray-800">실시간 로그</h2>
              {stats && (
                <div className="flex gap-1.5 text-xs">
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">전체 {stats.total}</span>
                  {stats.error > 0 && (
                    <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-full">오류 {stats.error}</span>
                  )}
                  {stats.warn > 0 && (
                    <span className="px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded-full">경고 {stats.warn}</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Level filter */}
              <select
                value={logLevel}
                onChange={(e) => setLogLevel(e.target.value as typeof logLevel)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="all">전체</option>
                <option value="info">INFO</option>
                <option value="warn">WARN</option>
                <option value="error">ERROR</option>
              </select>

              {/* Auto-refresh toggle */}
              <button
                onClick={() => setAutoRefresh((v) => !v)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  autoRefresh
                    ? 'bg-blue-50 text-blue-600 border border-blue-200'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {autoRefresh ? '● 자동 갱신 ON' : '○ 자동 갱신 OFF'}
              </button>

              <button
                onClick={fetchLogs}
                disabled={logsLoading}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {logsLoading ? '…' : '🔄'}
              </button>

              {logs.length > 0 && (
                <button
                  onClick={copyAllLogs}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {copiedId === '__all__' ? '✓ 복사됨' : '📋 전체 복사'}
                </button>
              )}

              <button
                onClick={clearLogs}
                className="text-xs bg-red-50 hover:bg-red-100 text-red-500 px-3 py-1.5 rounded-lg transition-colors"
              >
                🗑 지우기
              </button>
            </div>
          </div>

          {/* Log entries */}
          <div className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto font-mono text-xs">
            {logs.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-400 font-sans text-sm">
                <p className="text-2xl mb-2">📋</p>
                <p>로그가 없습니다.</p>
                <p className="mt-1 text-xs">
                  API 호출 시 로그가 쌓입니다.{' '}
                  <span className="text-amber-600">
                    서버리스 환경에서는 동일 인스턴스의 로그만 표시됩니다.
                  </span>
                </p>
              </div>
            ) : (
              logs.map((entry) => (
                <div
                  key={entry.id}
                  className="px-4 py-2 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpandedLog(expandedLog === entry.id ? null : entry.id)}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-gray-400 flex-shrink-0 tabular-nums mt-0.5">
                      {fmt(entry.timestamp)}
                    </span>
                    <span
                      className={`flex-shrink-0 px-1.5 rounded text-[10px] font-bold uppercase mt-0.5 ${LEVEL_COLOR[entry.level]}`}
                    >
                      {entry.level}
                    </span>
                    <span className="flex-shrink-0 text-purple-600 mt-0.5">[{entry.category}]</span>
                    <span className="text-gray-700 flex-1 break-all">{entry.message}</span>
                    {entry.durationMs !== undefined && (
                      <span className="text-gray-400 flex-shrink-0 tabular-nums mt-0.5">
                        {entry.durationMs}ms
                      </span>
                    )}
                    <button
                      onClick={(e) => copyEntry(entry, e)}
                      className="flex-shrink-0 mt-0.5 text-gray-300 hover:text-gray-500 transition-colors px-1"
                      title="복사"
                    >
                      {copiedId === entry.id ? '✓' : '⎘'}
                    </button>
                    {entry.details && (
                      <span className="text-gray-300 flex-shrink-0 mt-0.5">
                        {expandedLog === entry.id ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                  {expandedLog === entry.id && entry.details && (
                    <div className="mt-2 ml-28 relative">
                      <button
                        onClick={(e) => copyEntry(entry, e)}
                        className="absolute top-2 right-2 text-[10px] text-gray-400 hover:text-green-300 bg-gray-800 hover:bg-gray-700 px-2 py-0.5 rounded transition-colors z-10"
                      >
                        {copiedId === entry.id ? '✓ 복사됨' : '복사'}
                      </button>
                      <pre className="p-2 bg-gray-900 text-green-300 rounded text-[10px] overflow-x-auto whitespace-pre-wrap break-all">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {logs.length > 0 && (
            <div className="px-5 py-2 border-t border-gray-100 text-xs text-gray-400 font-sans">
              {logs.length}개 표시 중 · 최근 순 · 클릭하면 상세 정보를 확인할 수 있습니다.
            </div>
          )}
        </section>

        {/* ── Notice ── */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-xs text-amber-700">
          <strong>참고:</strong> 로그는 동일한 서버리스 함수 인스턴스 내에서만 공유됩니다.
          Vercel 프로덕션 환경의 전체 로그는{' '}
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-amber-900"
          >
            Vercel 대시보드 → Functions → Logs
          </a>
          에서 확인하세요.
        </div>
      </div>
    </div>
  );
}
