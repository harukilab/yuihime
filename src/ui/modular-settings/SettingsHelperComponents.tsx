/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';

export interface ControlledInputProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
  type?: string;
}

export const ControlledTextInput: React.FC<ControlledInputProps> = ({
  value,
  onChange,
  className,
  placeholder,
  type = 'text'
}) => {
  const [localVal, setLocalVal] = useState(value);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalVal(value);
    }
  }, [value, isFocused]);

  return (
    <input
      key={type}
      type={type}
      value={localVal}
      onChange={(e) => {
        setLocalVal(e.target.value);
        onChange(e.target.value);
      }}
      onFocus={() => setIsFocused(true)}
      onBlur={() => {
        setIsFocused(false);
        onChange(localVal);
      }}
      className={className}
      placeholder={placeholder}
      autoComplete={type === 'password' ? 'new-password' : 'off'}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
    />
  );
};

export const ControlledTextarea: React.FC<ControlledInputProps & { rows?: number }> = ({
  value,
  onChange,
  className,
  placeholder,
  rows = 4
}) => {
  const [localVal, setLocalVal] = useState(value);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalVal(value);
    }
  }, [value, isFocused]);

  return (
    <textarea
      rows={rows}
      value={localVal}
      onChange={(e) => {
        setLocalVal(e.target.value);
        onChange(e.target.value);
      }}
      onFocus={() => setIsFocused(true)}
      onBlur={() => {
        setIsFocused(false);
        onChange(localVal);
      }}
      className={className}
      placeholder={placeholder}
    />
  );
};

export const LlmLogCard: React.FC<{ log: any }> = ({ log }) => {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);

  const logTimeStr = new Date(log.timestamp).toLocaleTimeString();
  const isSuccess = !log.error;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(log.prompt || '');
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleCopyResponse = () => {
    navigator.clipboard.writeText(log.response || log.error || '');
    setCopiedResponse(true);
    setTimeout(() => setCopiedResponse(false), 2000);
  };

  return (
    <div className="bg-black/55 border border-white/[0.04] rounded-2xl p-3 sm:p-4 space-y-3 hover:border-cyan-500/20 transition-all font-sans text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.04] pb-2 font-mono">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="text-[9px] sm:text-[9.5px] text-zinc-600 font-bold">{logTimeStr}</span>
          <span className="text-zinc-200 text-[10px] sm:text-[11px] font-bold font-sans tracking-wide uppercase text-cyan-400">
            {log.provider}
          </span>
          <span className="text-[9px] sm:text-[9.5px] text-amber-500 font-mono font-semibold truncate max-w-[120px] sm:max-w-none">
            [{log.model}]
          </span>
          {log.durationMs !== undefined && (
            <span className="text-[8.5px] sm:text-[9px] text-zinc-500">
              ({log.durationMs}ms)
            </span>
          )}
          {log.tokens !== undefined && (
            <span className="text-[8.5px] sm:text-[9px] text-indigo-400">
              {log.tokens} tokens
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <span className={`text-[8px] sm:text-[8.5px] px-1.5 sm:px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${isSuccess ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'bg-rose-500/10 text-rose-400 border border-rose-500/15'} border font-mono`}>
            {isSuccess ? 'SUCCESS' : 'ERROR'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 font-sans justify-items-stretch">
        <div className="space-y-1 text-left w-full min-w-0">
          <div className="flex justify-between items-center gap-2">
            <span className="text-[8.5px] sm:text-[9px] text-zinc-500 font-mono tracking-wider uppercase font-bold truncate">Input Prompt</span>
            <button
              onClick={handleCopyPrompt}
              className={`text-[8.5px] sm:text-[9px] font-mono px-2 py-0.5 rounded transition-all cursor-pointer whitespace-nowrap ${copiedPrompt ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'text-cyan-400 hover:text-white bg-white/5 hover:bg-white/10'}`}
            >
              {copiedPrompt ? 'Copied ✔' : 'Copy Prompt'}
            </button>
          </div>
          <div className="bg-[#050508]/85 border border-white/[0.02] rounded-xl p-2.5 sm:p-3 text-[10px] sm:text-[10.5px] text-zinc-300 max-h-[120px] sm:max-h-[160px] overflow-y-auto font-mono whitespace-pre-wrap break-words leading-relaxed select-text shadow-inner w-full">
            {log.prompt}
          </div>
        </div>

        <div className="space-y-1 text-left w-full min-w-0">
          <div className="flex justify-between items-center gap-2">
            <span className="text-[8.5px] sm:text-[9px] text-zinc-500 font-mono tracking-wider uppercase font-bold truncate">
              {isSuccess ? 'Output Response' : 'Model Error StackTrace'}
            </span>
            <button
              onClick={handleCopyResponse}
              className={`text-[8.5px] sm:text-[9px] font-mono px-2 py-0.5 rounded transition-all cursor-pointer whitespace-nowrap ${copiedResponse ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'text-indigo-400 hover:text-white bg-white/5 hover:bg-white/10'}`}
            >
              {copiedResponse ? 'Copied ✔' : 'Copy Response'}
            </button>
          </div>
          <div className={`bg-[#050508]/85 border border-white/[0.02] rounded-xl p-2.5 sm:p-3 text-[10px] sm:text-[10.5px] ${isSuccess ? 'text-amber-200' : 'text-rose-400'} max-h-[120px] sm:max-h-[160px] overflow-y-auto font-mono whitespace-pre-wrap break-words leading-relaxed select-text shadow-inner w-full`}>
            {isSuccess ? log.response : log.error}
          </div>
        </div>
      </div>
    </div>
  );
};

export const AuditLogCard: React.FC<{ log: any }> = ({ log }) => {
  const [copiedRaw, setCopiedRaw] = useState(false);

  const logTimeStr = new Date(log.timestamp).toLocaleTimeString();
  const isSuccess = log.status === 'SUCCESS';

  const handleCopyRaw = () => {
    navigator.clipboard.writeText(JSON.stringify(log.response || log.error || {}, null, 2));
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  return (
    <div className="bg-black/55 border border-white/[0.04] rounded-2xl p-3 sm:p-4 space-y-3 hover:border-amber-500/20 transition-all font-sans text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.04] pb-2 font-mono">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="text-[8.5px] sm:text-[9px] text-zinc-600 font-bold">{logTimeStr}</span>
          <span className="text-zinc-200 text-[10px] sm:text-[11px] font-bold font-sans tracking-wide">
            {log.toolName || 'AI Schema Check'}
          </span>
          <span className="text-[8.5px] sm:text-[9.5px] text-[#818cf8] truncate max-w-[120px] sm:max-w-none">
            ({log.endpointPath || '/api/cortex/think'})
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
          <span className={`text-[8px] sm:text-[8.5px] px-1.5 sm:px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${isSuccess ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'bg-rose-500/10 text-rose-400 border border-rose-500/15'} border font-mono`}>
            {log.status}
          </span>
          <span className={`text-[8px] sm:text-[8.5px] px-1.5 sm:px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${log.standardsCompliance ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/15' : 'bg-amber-500/10 text-amber-500 border border-amber-500/15'} border font-mono`}>
            {log.standardsCompliance ? 'OpenAI Compliant' : 'Non-Object'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-1 text-left w-full min-w-0">
          <span className="text-[8.5px] sm:text-[9px] text-zinc-500 font-mono tracking-wider uppercase font-bold block truncate">Input Arguments (Payload)</span>
          <pre className="bg-[#050508]/85 border border-white/[0.02] rounded-xl p-2 sm:p-2.5 text-[9.5px] sm:text-[10px] text-cyan-400 overflow-x-auto max-h-[145px] font-mono whitespace-pre-wrap break-words leading-relaxed select-text scrollbar-thin">
            {JSON.stringify(log.parameters, null, 2)}
          </pre>
        </div>

        <div className="space-y-1 text-left w-full min-w-0">
          <span className="text-[8.5px] sm:text-[9px] text-zinc-500 font-mono tracking-wider uppercase font-bold block truncate">
            {isSuccess ? 'Inferred Response Schema' : 'Error Trace'}
          </span>
          <pre className={`bg-[#050508]/85 border border-white/[0.02] rounded-xl p-2 sm:p-2.5 text-[9.5px] sm:text-[10px] ${isSuccess ? 'text-indigo-400' : 'text-rose-400'} overflow-x-auto max-h-[145px] font-mono whitespace-pre-wrap break-words leading-relaxed select-text scrollbar-thin`}>
            {isSuccess ? JSON.stringify(log.responseSchema, null, 2) : log.error}
          </pre>
        </div>
      </div>
      
      {isSuccess && (
        <div className="space-y-1 bg-[#050508]/45 border border-white/[0.02] p-2 sm:p-2.5 rounded-xl text-left w-full min-w-0">
          <div className="flex justify-between items-center gap-2 mb-1">
            <span className="text-[8.5px] sm:text-[9px] text-zinc-500 font-mono tracking-wider uppercase font-bold truncate">Raw JSON Intercept</span>
            <button
              onClick={handleCopyRaw}
              className={`text-[8.5px] sm:text-[9px] font-mono px-2 py-0.5 rounded transition-all cursor-pointer whitespace-nowrap ${copiedRaw ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'text-amber-400 hover:text-white bg-white/5 hover:bg-white/10'}`}
            >
              {copiedRaw ? 'Copied ✔' : 'Copy JSON'}
            </button>
          </div>
          <pre className="text-[9.5px] sm:text-[10px] text-zinc-400 overflow-x-auto max-h-[125px] font-mono whitespace-pre-wrap break-words leading-relaxed select-text scrollbar-thin">
            {JSON.stringify(log.response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
