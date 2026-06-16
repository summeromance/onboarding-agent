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

  // ── Initial load ──────────────────────────────────────────────────────
  useEffect(() => { fetchHealth(); fetchLogs(); }, [fetchHealth, fetchLogs]);

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
                    {entry.details && (
                      <span className="text-gray-300 flex-shrink-0 mt-0.5">
                        {expandedLog === entry.id ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                  {expandedLog === entry.id && entry.details && (
                    <pre className="mt-2 ml-28 p-2 bg-gray-900 text-green-300 rounded text-[10px] overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(entry.details, null, 2)}
                    </pre>
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
