/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Save, Search, Terminal, Activity, CheckCircle2, XCircle } from 'lucide-react';
import { LlmLogCard, AuditLogCard } from './SettingsHelperComponents';

const ToolExecutionTimeline: React.FC<{ auditLogs: any[] }> = ({ auditLogs }) => {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Get last 10 tool execution logs (newest first for stats, reversed for timeline)
  const sortedAudits = [...auditLogs].sort((a, b) => b.timestamp - a.timestamp);
  const last10 = sortedAudits.slice(0, 10);
  const timelineData = [...last10].reverse();

  // Calculate success rates for each unique tool
  const toolStats: Record<string, { success: number; total: number }> = {};
  auditLogs.forEach(log => {
    const name = log.toolName || 'System Check';
    if (!toolStats[name]) {
      toolStats[name] = { success: 0, total: 0 };
    }
    toolStats[name].total += 1;
    if (log.status === 'SUCCESS') {
      toolStats[name].success += 1;
    }
  });

  if (auditLogs.length === 0) {
    return (
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl text-center select-none">
        <Activity className="mx-auto text-zinc-600 mb-2 stroke-[1.5]" size={28} />
        <p className="text-xs font-bold text-zinc-400">Waiting for Tool Executions...</p>
        <p className="text-[10px] text-zinc-500 mt-1">Run any automated commands or triggers to populate the real-time timeline.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0e0e14]/55 border border-white/5 p-5 rounded-2xl space-y-4 font-sans text-left">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-white/[0.04] pb-3">
        <div>
          <h5 className="text-xs font-bold text-white tracking-wider flex items-center gap-2 uppercase font-mono">
            <Activity className="text-amber-500 animate-pulse" size={14} />
            Tool Execution Pulse & Metrics
          </h5>
          <p className="text-[10px] text-zinc-500 mt-0.5">Chronological stream of the last 10 tool operations and historical success rates.</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-mono px-2 py-0.5 rounded-lg font-bold">
          TOTAL EXECUTIONS: {auditLogs.length}
        </div>
      </div>

      {/* Success/Failure rates by tool */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(toolStats).map(([toolName, stats]) => {
          const rate = Math.round((stats.success / stats.total) * 100);
          return (
            <div key={toolName} className="bg-black/30 border border-white/[0.03] p-3 rounded-xl flex flex-col justify-between space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-zinc-300 truncate font-mono max-w-[70%]">{toolName}</span>
                <span className={`text-[10px] font-mono font-bold ${rate >= 80 ? 'text-emerald-400' : rate >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                  {rate}% Success
                </span>
              </div>
              <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${rate}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[9px] text-zinc-500 font-mono">
                <span>Runs: {stats.total}</span>
                <span>Success: {stats.success} | Fails: {stats.total - stats.success}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Timeline tracker */}
      <div className="bg-black/45 border border-white/[0.02] rounded-xl p-4 space-y-4">
        <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider font-mono block">Timeline (Oldest ➔ Newest)</span>
        
        <div className="relative flex items-center justify-between overflow-x-auto pb-4 pt-2 scrollbar-none gap-4">
          {/* Connector Line */}
          <div className="absolute left-4 right-4 h-0.5 bg-white/[0.04] top-6 -translate-y-1/2 z-0 min-w-[500px]" />

          {timelineData.map((run, idx) => {
            const isSuccess = run.status === 'SUCCESS';
            const runTime = new Date(run.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const isSelected = selectedRunId === run.id;

            return (
              <button
                key={run.id || idx}
                onClick={() => setSelectedRunId(isSelected ? null : run.id)}
                className="flex flex-col items-center text-center space-y-1.5 focus:outline-none z-10 shrink-0 min-w-[70px] cursor-pointer group"
              >
                <div className={`relative w-8 h-8 rounded-full flex items-center justify-center border transition-all duration-300 ${isSuccess ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 group-hover:border-emerald-400 group-hover:bg-emerald-500/20' : 'bg-rose-500/10 border-rose-500/30 text-rose-400 group-hover:border-rose-400 group-hover:bg-rose-500/20'} ${isSelected ? 'ring-2 ring-amber-500/50 scale-110 border-amber-500' : ''}`}>
                  {isSuccess ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  <span className="absolute -top-1 -right-1 text-[8px] font-mono font-bold px-1 rounded-full bg-zinc-800 text-zinc-400 border border-white/5 select-none">
                    {idx + 1}
                  </span>
                </div>
                <div className="space-y-0.5 max-w-[85px]">
                  <span className="text-[10px] font-bold text-zinc-300 truncate block font-mono">{run.toolName || 'Check'}</span>
                  <span className="text-[8.5px] text-zinc-500 font-mono block">{runTime}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected run details */}
        {selectedRunId && (() => {
          const run = last10.find(r => r.id === selectedRunId);
          if (!run) return null;
          const isSuccess = run.status === 'SUCCESS';
          return (
            <div className="bg-black/60 border border-white/5 p-4 rounded-xl space-y-3 animate-fade-in text-left">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-white/[0.04] pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-amber-500 font-mono font-bold text-[11px]">{run.toolName}</span>
                  <span className="text-[9px] text-zinc-500 font-mono">{new Date(run.timestamp).toLocaleTimeString()}</span>
                </div>
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${isSuccess ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'bg-rose-500/10 text-rose-400 border border-rose-500/15'} border`}>
                  {run.status}
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
                <div className="space-y-1">
                  <span className="text-zinc-500 font-mono font-bold">Arguments:</span>
                  <pre className="bg-[#050508]/60 border border-white/[0.02] p-2 rounded-lg text-cyan-400 overflow-x-auto max-h-[100px] font-mono text-[9px] scrollbar-thin">
                    {JSON.stringify(run.parameters, null, 2)}
                  </pre>
                </div>
                <div className="space-y-1">
                  <span className="text-zinc-500 font-mono font-bold">Result:</span>
                  {isSuccess ? (
                    <pre className="bg-[#050508]/60 border border-white/[0.02] p-2 rounded-lg text-zinc-300 overflow-x-auto max-h-[100px] font-mono text-[9px] scrollbar-thin">
                      {JSON.stringify(run.response, null, 2)}
                    </pre>
                  ) : (
                    <pre className="bg-rose-950/10 border border-rose-500/10 p-2 rounded-lg text-rose-400 overflow-x-auto max-h-[100px] font-mono text-[9px] scrollbar-thin">
                      {run.error}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export interface LogsSectionTabProps {
  selectedSection?: string;
  logStreamType: string;
  setLogStreamType: (val: any) => void;
  clearAuditLogs: () => void;
  clearLlmLogs: () => void;
  setClearedLogsTimestamp: (val: number) => void;
  backgroundLogs: any[];
  logs: any[];
  logSearchQuery: string;
  setLogSearchQuery: (val: string) => void;
  logLevelFilter: string;
  setLogLevelFilter: (val: any) => void;
  clearedLogsTimestamp: number;
  fetchAuditLogs: () => void;
  fetchLlmLogs: () => void;
  auditLogs: any[];
  llmLogs: any[];
  llmLogsLoading: boolean;
  auditLogsLoading: boolean;
}

export const LogsSectionTab: React.FC<LogsSectionTabProps> = ({
  logStreamType,
  setLogStreamType,
  clearAuditLogs,
  clearLlmLogs,
  setClearedLogsTimestamp,
  backgroundLogs,
  logs,
  logSearchQuery,
  setLogSearchQuery,
  logLevelFilter,
  setLogLevelFilter,
  clearedLogsTimestamp,
  fetchAuditLogs,
  fetchLlmLogs,
  auditLogs,
  llmLogs,
  llmLogsLoading,
  auditLogsLoading
}) => {
  return (
    <div className="space-y-6 animate-fade-in font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl">
        <div>
          <h4 className="text-sm font-bold text-white tracking-wide">Yuihime System Telemetry Console</h4>
          <p className="text-[11px] text-zinc-500 mt-0.5">Observe live system outputs, background traces, and intercepted low-level event streams.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (logStreamType === 'audit') {
                clearAuditLogs();
              } else if (logStreamType === 'llm') {
                clearLlmLogs();
              } else {
                setClearedLogsTimestamp(Date.now());
              }
            }}
            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-mono tracking-wider uppercase border border-red-500/20 rounded-xl transition-all cursor-pointer"
          >
            Clear {logStreamType === 'audit' ? 'Audits' : logStreamType === 'llm' ? 'LLM Logs' : 'Logs'}
          </button>
          {logStreamType !== 'audit' && logStreamType !== 'llm' && (
            <button
              type="button"
              onClick={() => {
                const activeLogSource = logStreamType === 'console' ? backgroundLogs : logs;
                const filtered = activeLogSource.filter(l => {
                  const matchesSearch = l.content.toLowerCase().includes(logSearchQuery.toLowerCase());
                  if (!matchesSearch) return false;
                  if (logLevelFilter === 'all') return true;
                  const levelStr = String(l.content || '').toUpperCase();
                  if (logLevelFilter === 'info' && levelStr.includes('INFO')) return true;
                  if (logLevelFilter === 'warn' && (levelStr.includes('WARN') || levelStr.includes('WARNING'))) return true;
                  if (logLevelFilter === 'error' && (levelStr.includes('ERROR') || levelStr.includes('ERR') || levelStr.includes('CRITICAL'))) return true;
                  if (logLevelFilter === 'agent' && (l.type === 'agent' || levelStr.includes('AGENT'))) return true;
                  if (logLevelFilter === 'user' && (l.type === 'user' || levelStr.includes('USER'))) return true;
                  if (logLevelFilter === 'system' && (l.type === 'system' || levelStr.includes('SYSTEM') || levelStr.includes('KERNEL'))) return true;
                  return false;
                }).filter(l => l.timestamp > clearedLogsTimestamp);

                const text = filtered.map(l => {
                  const timeStr = new Date(l.timestamp).toISOString();
                  return `[${timeStr}] [${l.type?.toUpperCase()}] ${l.content}`;
                }).join('\n');
                const blob = new Blob([text], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `yuihime_${logStreamType}_logs_${Date.now()}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-[10px] font-mono tracking-wider uppercase border border-amber-500/20 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-bold"
            >
              <Save size={11} className="transform rotate-180" /> Export logs
            </button>
          )}
          {logStreamType === 'audit' && (
            <button
              type="button"
              onClick={() => fetchAuditLogs()}
              className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-[10px] font-mono tracking-wider uppercase border border-amber-500/20 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-bold"
            >
              Refresh Logs
            </button>
          )}
          {logStreamType === 'llm' && (
            <button
              type="button"
              onClick={() => fetchLlmLogs()}
              className="px-3 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 text-[10px] font-mono tracking-wider uppercase border border-cyan-500/20 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-bold"
            >
              Refresh Prompts
            </button>
          )}
        </div>
      </div>

      <ToolExecutionTimeline auditLogs={auditLogs} />

      <div className="grid grid-cols-1 gap-4">
        <div className="bg-[#0e0e14]/55 border border-white/5 p-3.5 sm:p-4 rounded-2xl flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-3">
          <div className="flex bg-black/45 rounded-xl p-1 border border-white/[0.03] space-x-1 self-start overflow-x-auto max-w-full scrollbar-none snap-x whitespace-nowrap">
            <button
              type="button"
              onClick={() => setLogStreamType('console')}
              className={`px-3 py-1.5 rounded-lg text-[10.5px] font-bold font-mono uppercase tracking-wide transition-all cursor-pointer whitespace-nowrap snap-start ${logStreamType === 'console' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/15 font-semibold' : 'text-zinc-500 hover:text-white'}`}
            >
              Console Traces ({backgroundLogs.filter(l => l.timestamp > clearedLogsTimestamp).length})
            </button>
            <button
              type="button"
              onClick={() => setLogStreamType('cognitive')}
              className={`px-3 py-1.5 rounded-lg text-[10.5px] font-bold font-mono uppercase tracking-wide transition-all cursor-pointer whitespace-nowrap snap-start ${logStreamType === 'cognitive' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/15 font-semibold' : 'text-zinc-500 hover:text-white'}`}
            >
              Cognitive Streams ({logs.filter(l => l.timestamp > clearedLogsTimestamp).length})
            </button>
            <button
              type="button"
              onClick={() => setLogStreamType('audit')}
              className={`px-3 py-1.5 rounded-lg text-[10.5px] font-bold font-mono uppercase tracking-wide transition-all cursor-pointer whitespace-nowrap snap-start ${logStreamType === 'audit' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/15 font-semibold' : 'text-zinc-500 hover:text-white'}`}
            >
              Tool Execution Logs ({auditLogs.length})
            </button>
            <button
              type="button"
              onClick={() => setLogStreamType('llm')}
              className={`px-3 py-1.5 rounded-lg text-[10.5px] font-bold font-mono uppercase tracking-wide transition-all cursor-pointer whitespace-nowrap snap-start ${logStreamType === 'llm' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/15 font-semibold' : 'text-zinc-500 hover:text-white'}`}
            >
              LLM Direct Prompts ({llmLogs.length})
            </button>
          </div>

          {logStreamType !== 'audit' && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 md:max-w-xl">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={13} />
                <input
                  type="text"
                  placeholder="Search in log content..."
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  className="w-full bg-[#050508]/65 border border-white/5 hover:border-white/10 focus:border-amber-500/40 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-600 outline-none font-mono transition-colors"
                />
              </div>

              <select
                value={logLevelFilter}
                onChange={(e) => setLogLevelFilter(e.target.value as any)}
                className="bg-[#050508]/65 border border-white/5 hover:border-white/10 focus:border-amber-500/40 rounded-xl px-3 py-2 text-xs text-white outline-none font-mono cursor-pointer"
              >
                <option value="all">ALL LEVELS</option>
                <option value="info">INFO ONLY</option>
                <option value="warn">WARNINGS</option>
                <option value="error">ERRORS</option>
                <option value="agent">AGENT SENTENCES</option>
                <option value="user">USER INPUTS</option>
                <option value="system">SYSTEM COGNITION</option>
              </select>
            </div>
          )}
        </div>

        <div className="bg-[#050508]/95 border border-white/5 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 font-mono text-[11px] leading-relaxed relative flex flex-col min-h-[450px] shadow-[inset_0_4px_30px_rgba(0,0,0,0.8)] overflow-hidden w-full">
          <div className="absolute top-3.5 right-4 z-10 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[8.5px] text-zinc-500 tracking-widest uppercase font-bold select-none">
              {logStreamType === 'audit' ? 'Live Tool Interceptor' : 'Active Monitor Stream'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[550px] pr-1 select-text scrollbar-thin">
            {(() => {
              if (logStreamType === 'llm') {
                if (llmLogsLoading && llmLogs.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-600">
                      <span className="animate-spin text-cyan-400 text-xl font-bold font-sans mb-2">●</span>
                      <p className="text-[10px] uppercase tracking-wider">Retrieving prompt trace buffers from SQLite batin...</p>
                    </div>
                  );
                }

                const filteredLlmLogs = llmLogs.filter(log => {
                  const term = logSearchQuery.toLowerCase();
                  return !term || 
                    (log.prompt && log.prompt.toLowerCase().includes(term)) || 
                    (log.response && log.response.toLowerCase().includes(term)) ||
                    (log.model && log.model.toLowerCase().includes(term)) ||
                    (log.provider && log.provider.toLowerCase().includes(term));
                });

                if (filteredLlmLogs.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-600 select-none">
                      <Terminal size={24} className="mb-2 text-zinc-600 stroke-[1.5]" />
                      <p className="text-[10px] tracking-wide uppercase font-bold">No direct model prompts traced yet.</p>
                      <p className="text-[9px] text-zinc-500 mt-1">Interactions with Yuihime via Chat or Reflection will create detailed prompt/response logs here.</p>
                    </div>
                  );
                }

                const sortedLlmLogs = [...filteredLlmLogs].sort((a, b) => b.timestamp - a.timestamp);

                return (
                  <div className="space-y-4 pr-1">
                    {sortedLlmLogs.map((log) => (
                      <LlmLogCard key={log.id || log.timestamp} log={log} />
                    ))}
                  </div>
                );
              }

              if (logStreamType === 'audit') {
                if (auditLogsLoading && auditLogs.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-600">
                      <span className="animate-spin text-amber-500 text-xl font-bold font-sans mb-2">●</span>
                      <p className="text-[10px] uppercase tracking-wider">Syncing tool execution logs from backend...</p>
                    </div>
                  );
                }

                if (auditLogs.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-600 select-none">
                      <Terminal size={24} className="mb-2 text-zinc-600 stroke-[1.5]" />
                      <p className="text-[10px] tracking-wide select-none uppercase font-bold">No tool execution logs intercepted yet.</p>
                      <p className="text-[9px] text-zinc-500 mt-1 select-none">Execution of tools of capabilities registers raw responses here instantly.</p>
                    </div>
                  );
                }

                const sortedAuditLogs = [...auditLogs].sort((a, b) => b.timestamp - a.timestamp);

                return (
                  <div className="space-y-4 pr-1">
                    {sortedAuditLogs.map((log) => (
                      <AuditLogCard key={log.id} log={log} />
                    ))}
                  </div>
                );
              }

              const activeLogSource = logStreamType === 'console' ? backgroundLogs : logs;
              const filtered = activeLogSource.filter(l => {
                const matchesSearch = l.content.toLowerCase().includes(logSearchQuery.toLowerCase());
                if (!matchesSearch) return false;
                if (logLevelFilter === 'all') return true;
                const levelStr = String(l.content || '').toUpperCase();
                if (logLevelFilter === 'info' && levelStr.includes('INFO')) return true;
                if (logLevelFilter === 'warn' && (levelStr.includes('WARN') || levelStr.includes('WARNING'))) return true;
                if (logLevelFilter === 'error' && (levelStr.includes('ERROR') || levelStr.includes('ERR') || levelStr.includes('CRITICAL'))) return true;
                if (logLevelFilter === 'agent' && (l.type === 'agent' || levelStr.includes('AGENT'))) return true;
                if (logLevelFilter === 'user' && (l.type === 'user' || levelStr.includes('USER'))) return true;
                if (logLevelFilter === 'system' && (l.type === 'system' || levelStr.includes('SYSTEM') || levelStr.includes('KERNEL'))) return true;
                return false;
              }).filter(l => l.timestamp > clearedLogsTimestamp);

              if (filtered.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-600 select-none">
                    <Terminal size={24} className="mb-2 text-zinc-600 stroke-[1.5]" />
                    <p className="text-[10px] tracking-wide select-none uppercase font-bold">No diagnostic logs found matching criteria.</p>
                    <p className="text-[9px] text-zinc-500 mt-1 select-none">Logs accumulate automatically during interaction.</p>
                  </div>
                );
              }

              const sortedFiltered = [...filtered].sort((a, b) => b.timestamp - a.timestamp);

              return sortedFiltered.map((l, index) => {
                const timeStr = new Date(l.timestamp).toLocaleTimeString();
                let labelColor = 'text-blue-400';
                let contentColor = 'text-zinc-300';
                const contentStr = l.content || '';

                if (l.type === 'user' || contentStr.includes('[USER]')) {
                  labelColor = 'text-cyan-400';
                } else if (l.type === 'agent' || contentStr.includes('AGENT')) {
                  labelColor = 'text-amber-500';
                } else if (contentStr.toUpperCase().includes('ERROR') || contentStr.toUpperCase().includes('FAIL') || contentStr.toUpperCase().includes('CRITICAL')) {
                  labelColor = 'text-rose-500 font-bold';
                  contentColor = 'text-rose-300/90';
                } else if (contentStr.toUpperCase().includes('WARN') || contentStr.toUpperCase().includes('WARNING')) {
                  labelColor = 'text-yellow-400';
                  contentColor = 'text-yellow-100/90';
                } else if (l.type === 'system' || contentStr.toUpperCase().includes('SYSTEM') || contentStr.toUpperCase().includes('CORE') || contentStr.toUpperCase().includes('KERNEL')) {
                  labelColor = 'text-purple-400';
                }

                return (
                  <div key={`log-${l.timestamp}-${index}`} className="flex flex-col sm:flex-row items-start gap-1 sm:gap-2.5 break-words whitespace-pre-wrap leading-relaxed hover:bg-white/[0.02] border-l-2 border-transparent hover:border-amber-400/20 pl-1.5 rounded pr-2 py-1 transition-colors text-left w-full min-w-0">
                    <div className="flex items-center gap-2 select-none shrink-0 font-bold">
                      <span className="text-[9px] text-zinc-500">{timeStr}</span>
                      <span className={`text-[9px] uppercase tracking-wider font-extrabold ${labelColor}`}>
                        [{l.type || 'SYS'}]
                      </span>
                    </div>
                    <span className={`text-[10px] sm:text-[10.5px] flex-1 font-mono tracking-wide ${contentColor} break-words min-w-0 w-full`}>
                      {contentStr}
                    </span>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};

export interface AuditSectionTabProps {
  clearAuditLogs: () => void;
  fetchAuditLogs: () => void;
  auditLogs: any[];
  auditLogsLoading: boolean;
}

export const AuditSectionTab: React.FC<AuditSectionTabProps> = ({
  clearAuditLogs,
  fetchAuditLogs,
  auditLogs,
  auditLogsLoading
}) => {
  return (
    <div className="space-y-6 animate-fade-in font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl">
        <div>
          <h4 className="text-sm font-bold text-white tracking-wide">Tool Execution Audit Console</h4>
          <p className="text-[11px] text-zinc-500 mt-0.5">Observe live local tool execution streams, parameters, response metrics, and execution history.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => clearAuditLogs()}
            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-mono tracking-wider uppercase border border-red-500/20 rounded-xl transition-all cursor-pointer font-bold animate-pulse"
          >
            Clear Audits
          </button>
          <button
            type="button"
            onClick={() => fetchAuditLogs()}
            className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-[10px] font-mono tracking-wider uppercase border border-amber-500/20 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-bold"
          >
            Refresh Logs
          </button>
        </div>
      </div>

      <div className="bg-[#050508]/95 border border-white/5 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 font-mono text-[11px] leading-relaxed relative flex flex-col min-h-[500px] shadow-[inset_0_4px_30px_rgba(0,0,0,0.8)] overflow-hidden w-full">
        <div className="absolute top-3.5 right-4 z-10 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <span className="text-[8.5px] text-zinc-500 tracking-widest uppercase font-bold select-none">
            Live Tool Interceptor
          </span>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[600px] pr-1 select-text scrollbar-thin">
          {auditLogsLoading && auditLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-600">
              <span className="animate-spin text-amber-500 text-xl font-bold font-sans mb-2">●</span>
              <p className="text-[10px] uppercase tracking-wider">Syncing tool execution logs from backend...</p>
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center text-zinc-600 select-none">
              <Terminal size={24} className="mb-2 text-zinc-600 stroke-[1.5]" />
              <p className="text-[10px] tracking-wide select-none uppercase font-bold text-zinc-500">No tool execution logs intercepted yet.</p>
              <p className="text-[9px] text-zinc-500 mt-1 select-none">Execute commands, files operations, or other tools to record execution logs.</p>
            </div>
          ) : (
            <div className="space-y-4 pr-1">
              {(() => {
                const sortedAudits = [...auditLogs].sort((a, b) => b.timestamp - a.timestamp);
                return sortedAudits.map((log) => (
                  <AuditLogCard key={log.id} log={log} />
                ));
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
