import React, { useState, useRef } from 'react';
import { Upload, Terminal, Play, Trash2, Layers, Search, Eye, ChevronLeft, ChevronRight, HelpCircle, Database, AlertTriangle } from 'lucide-react';

interface StagedEntry {
  input: string;
  output: string;
  wordCountInput: number;
  wordCountOutput: number;
}

interface DatasetImportProps {
  onRefreshMemories?: () => void;
  onRefreshKnowledge?: () => void;
  onShowInfo?: (title: string, text: string) => void;
}

export const DatasetImport: React.FC<DatasetImportProps> = ({
  onRefreshMemories,
  onRefreshKnowledge,
  onShowInfo
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [fileDetails, setFileDetails] = useState<{ name: string; size: number } | null>(null);
  const [stagedEntries, setStagedEntries] = useState<StagedEntry[]>([]);
  const [importTarget, setImportTarget] = useState<'both' | 'system2' | 'system1'>('both');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedingLog, setSeedingLog] = useState<string[]>([]);
  const [seedingProgress, setSeedingProgress] = useState(0);
  const [seedResult, setSeedResult] = useState<{ success: boolean; system1Count?: number; system2Count?: number; message?: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const entriesPerPage = 10;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFile = (file: File) => {
    const isJson = file.name.endsWith('.json');
    const isJsonl = file.name.endsWith('.jsonl');

    if (!isJson && !isJsonl) {
      setErrorMessage("Unsupported file format! Please upload a .json or .jsonl file.");
      return;
    }

    setErrorMessage(null);
    setSeedResult(null);
    setFileDetails({ name: file.name, size: file.size });

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parsed: StagedEntry[] = [];
        
        if (isJsonl) {
          const lines = text.split('\n');
          lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            try {
              const obj = JSON.parse(trimmed);
              const extracted = extractQAFromObject(obj);
              if (extracted) parsed.push(extracted);
            } catch (err) {
              console.warn(`Failed parsing line ${index + 1}: ${err}`);
            }
          });
        } else {
          const data = JSON.parse(text);
          if (Array.isArray(data)) {
            data.forEach((item) => {
              const extracted = extractQAFromObject(item);
              if (extracted) {
                parsed.push(extracted);
              } else if (item && (Array.isArray(item.messages) || Array.isArray(item.conversations))) {
                const ex = extractQAFromConversations(item.messages || item.conversations);
                if (ex) parsed.push(ex);
              }
            });
          } else if (data && (Array.isArray(data.messages) || Array.isArray(data.conversations))) {
            const list = data.messages || data.conversations;
            const listExtracted = extractQAFromConversations(list);
            if (listExtracted) parsed.push(listExtracted);
          } else if (typeof data === 'object' && data !== null) {
            const extracted = extractQAFromObject(data);
            if (extracted) parsed.push(extracted);
          }
        }

        if (parsed.length === 0) {
          setErrorMessage("Could not extract any conversations from file. Check format.");
          setStagedEntries([]);
        } else {
          setStagedEntries(parsed);
          setCurrentPage(1);
        }
      } catch (err: any) {
        setErrorMessage(`Failed to read JSON: ${err.message || err}`);
        setStagedEntries([]);
      }
    };
    reader.readAsText(file);
  };

  const extractQAFromObject = (obj: any): StagedEntry | null => {
    if (!obj || typeof obj !== 'object') return null;

    const inputKeys = ['input', 'prompt', 'question', 'user', 'query', 'user_input'];
    const outputKeys = ['output', 'response', 'answer', 'assistant', 'completion', 'ai_output'];

    let input = '';
    let output = '';

    for (const key of inputKeys) {
      if (obj[key] && typeof obj[key] === 'string') {
        input = obj[key];
        break;
      }
    }

    for (const key of outputKeys) {
      if (obj[key] && typeof obj[key] === 'string') {
        output = obj[key];
        break;
      }
    }

    if ((!input || !output) && Array.isArray(obj.messages)) {
      return extractQAFromConversations(obj.messages);
    }
    if ((!input || !output) && Array.isArray(obj.conversations)) {
      return extractQAFromConversations(obj.conversations);
    }

    if (input && output) {
      return {
        input: input.trim(),
        output: output.trim(),
        wordCountInput: input.trim().split(/\s+/).filter(Boolean).length,
        wordCountOutput: output.trim().split(/\s+/).filter(Boolean).length
      };
    }

    return null;
  };

  const extractQAFromConversations = (arr: any[]): StagedEntry | null => {
    let input = '';
    let output = '';

    arr.forEach(msg => {
      if (!msg) return;
      const role = msg.role || msg.from;
      const content = msg.content || msg.value;

      if (typeof content !== 'string') return;

      if (role === 'user' || role === 'human') {
        input = content;
      } else if (role === 'assistant' || role === 'gpt') {
        output = content;
      }
    });

    if (input && output) {
      return {
        input: input.trim(),
        output: output.trim(),
        wordCountInput: input.trim().split(/\s+/).filter(Boolean).length,
        wordCountOutput: output.trim().split(/\s+/).filter(Boolean).length
      };
    }
    return null;
  };

  const handleClear = () => {
    setFileDetails(null);
    setStagedEntries([]);
    setSeedResult(null);
    setSeedingLog([]);
    setSeedingProgress(0);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLaunchSeeding = async () => {
    if (stagedEntries.length === 0) return;
    setIsSeeding(true);
    setSeedResult(null);
    setSeedingLog(["Initializing seeding engines...", `Queued ${stagedEntries.length} entries for local ingestion.`]);
    setSeedingProgress(10);

    try {
      const res = await fetch("/api/cortex/synthesizer/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: stagedEntries,
          target: importTarget
        })
      });

      setSeedingProgress(60);
      const data = await res.json();
      setSeedingProgress(100);

      if (res.ok && data.success) {
        setSeedResult({
          success: true,
          system1Count: data.system1Count,
          system2Count: data.system2Count,
          message: data.message
        });
        setSeedingLog(prev => [
          ...prev,
          `Successfully injected ${data.system1Count || 0} entries to System 1 Cache.`,
          `Successfully injected ${data.system2Count || 0} entries to SQLite Memory DB.`,
          "Synchronization complete. Yuihime's active soul parameters adjusted."
        ]);
        
        onRefreshMemories?.();
        onRefreshKnowledge?.();
      } else {
        setSeedResult({ success: false, message: data.error || "Failed during seeding run." });
        setSeedingLog(prev => [...prev, `[CRITICAL ERROR]: ${data.error || "Seeding runtime failed."}`]);
      }
    } catch (err: any) {
      setSeedingProgress(100);
      setSeedResult({ success: false, message: err.message || String(err) });
      setSeedingLog(prev => [...prev, `[NETWORK ERROR]: ${err.message || String(err)}`]);
    } finally {
      setIsSeeding(false);
    }
  };

  const filteredEntries = stagedEntries.filter(entry => 
    entry.input.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.output.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredEntries.length / entriesPerPage);
  const displayedEntries = filteredEntries.slice((currentPage - 1) * entriesPerPage, currentPage * entriesPerPage);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start text-left animate-fade-in">
      {/* LEFT COLUMN: Import and Seeding controls */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl space-y-6">
          <div className="border-b border-white/5 pb-3">
            <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-400 block font-bold mb-1">DATA INTEGRATOR</span>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>SFT Ingestion Engine</span>
              <button 
                type="button" 
                onClick={() => setHelpOpen(!helpOpen)}
                className="text-zinc-550 hover:text-white transition-colors focus:outline-none"
              >
                <HelpCircle size={13} />
              </button>
            </h3>
          </div>

          {/* Collapsible Info Help Banner */}
          {helpOpen && (
            <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-2xl text-[9.5px] text-zinc-400 leading-normal space-y-1.5">
              <p className="font-bold text-blue-400">Supported Formats:</p>
              <ul className="list-disc pl-3.5 space-y-0.5">
                <li>Alpaca formats (instruction, input, output)</li>
                <li>Standard dialog files (prompt / response pairs)</li>
                <li>ChatML/ShareGPT format arrays of messages</li>
              </ul>
            </div>
          )}

          {/* Drag & Drop File Loader Zone */}
          <div 
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={triggerFileInput}
            className={`border-2 border-dashed p-6 rounded-2xl text-center cursor-pointer transition-all ${
              dragActive 
                ? 'border-amber-500 bg-amber-500/5' 
                : 'border-white/10 hover:border-white/20 bg-black/30'
            }`}
          >
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".json,.jsonl"
              className="hidden" 
              onChange={handleFileInput}
            />
            <Upload className="mx-auto text-zinc-550 mb-2.5" size={24} />
            <span className="text-[11px] font-bold text-white block">Upload Dataset File</span>
            <span className="text-[9px] text-zinc-500 mt-1 block">Drag and drop .json/.jsonl here, or click to browse</span>
          </div>

          {/* Staged File Details or Error Alerts */}
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[9px] text-red-400 font-mono flex items-start gap-1.5 leading-tight">
              <AlertTriangle className="shrink-0 mt-0.5" size={12} />
              <span>{errorMessage}</span>
            </div>
          )}

          {fileDetails && (
            <div className="space-y-3 bg-[#07070a] border border-white/5 p-4 rounded-2xl">
              <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 block font-bold">Staged File Parameters</span>
              <div className="space-y-1.5 font-mono text-[9px] uppercase">
                <div className="flex justify-between items-center bg-black/30 p-2.5 rounded-xl border border-white/5">
                  <span className="text-zinc-500">File Name</span>
                  <span className="text-white font-bold truncate max-w-[160px]">{fileDetails.name}</span>
                </div>
                <div className="flex justify-between items-center bg-black/30 p-2.5 rounded-xl border border-white/5">
                  <span className="text-zinc-500">File Size</span>
                  <span className="text-white font-bold">{(fileDetails.size / 1024).toFixed(1)} KB</span>
                </div>
                <div className="flex justify-between items-center bg-black/30 p-2.5 rounded-xl border border-white/5">
                  <span className="text-zinc-500">Dialogue Threads</span>
                  <span className="text-amber-500 font-extrabold">{stagedEntries.length} Q&A Pairs</span>
                </div>
              </div>

              {/* Injection Target Setup */}
              <div className="space-y-2 border-t border-white/5 pt-3">
                <label className="text-[10px] uppercase font-mono tracking-widest text-zinc-400 block font-bold">Injection Circuit Target</label>
                <div className="grid grid-cols-1 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setImportTarget('both')}
                    className={`p-2.5 border rounded-xl flex items-start gap-2.5 transition-all text-left cursor-pointer ${
                      importTarget === 'both' 
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' 
                        : 'bg-black/30 border-white/5 text-zinc-400 hover:border-white/10'
                    }`}
                  >
                    <Layers size={13} className="mt-0.5" />
                    <div>
                      <h5 className="text-[10.5px] font-bold">Dual Injection (Sys 1 & Sys 2)</h5>
                      <p className="text-[9px] text-zinc-500 mt-0.5 leading-normal">Injects into both episodic short-term memory (cache) and sqlite databases.</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImportTarget('system2')}
                    className={`p-2.5 border rounded-xl flex items-start gap-2.5 transition-all text-left cursor-pointer ${
                      importTarget === 'system2' 
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' 
                        : 'bg-black/30 border-white/5 text-zinc-400 hover:border-white/10'
                    }`}
                  >
                    <Database size={13} className="mt-0.5" />
                    <div>
                      <h5 className="text-[10.5px] font-bold">System 2 Only (SQLite DB)</h5>
                      <p className="text-[9px] text-zinc-500 mt-0.5 leading-normal">Saves exclusively into the SQL databases for deep contextual RAG queries.</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImportTarget('system1')}
                    className={`p-2.5 border rounded-xl flex items-start gap-2.5 transition-all text-left cursor-pointer ${
                      importTarget === 'system1' 
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' 
                        : 'bg-black/30 border-white/5 text-zinc-400 hover:border-white/10'
                    }`}
                  >
                    <Terminal size={13} className="mt-0.5" />
                    <div>
                      <h5 className="text-[10.5px] font-bold">System 1 Only (Fast Cache)</h5>
                      <p className="text-[9px] text-zinc-500 mt-0.5 leading-normal">Loads exclusively into fast cached lists (first 150 items) for instant retrieval.</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Activation action buttons */}
              <div className="space-y-1.5 border-t border-white/5 pt-3">
                <button
                  type="button"
                  onClick={handleLaunchSeeding}
                  disabled={isSeeding || stagedEntries.length === 0}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[10.5px] uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(245,158,11,0.15)] disabled:opacity-50"
                >
                  <Play size={11} fill="currentColor" /> Launch Seeding Engine
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={isSeeding}
                  className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/5 font-bold text-[10.5px] uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 size={11} /> Clear Data
                </button>
              </div>
            </div>
          )}

          {/* Progress Logs Panel */}
          {(isSeeding || seedingLog.length > 0) && (
            <div className="space-y-2 border-t border-white/5 pt-4">
              <div className="flex justify-between items-center text-[9px] font-mono text-zinc-400">
                <span>SEEDING LOGS</span>
                <span className="font-bold text-amber-500">{seedingProgress}%</span>
              </div>
              <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                <div 
                  className="bg-amber-500 h-full transition-all duration-300"
                  style={{ width: `${seedingProgress}%` }}
                />
              </div>
              <div className="h-32 overflow-y-auto p-3 bg-black/40 border border-white/5 rounded-xl font-mono text-[9px] text-zinc-400 space-y-1 leading-normal">
                {seedingLog.map((log, lIdx) => (
                  <div key={lIdx} className={log.startsWith('[CRITICAL') ? 'text-red-400' : log.startsWith('[NETWORK') ? 'text-orange-400' : 'text-zinc-300'}>
                    &gt; {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT STAGED DATA PREVIEW COLUMN */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
            <div className="flex items-center gap-2">
              <Eye className="text-amber-500" size={15} />
              <span className="text-xs font-bold text-white tracking-wide">Parsed Memory Library ({filteredEntries.length})</span>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 text-zinc-550" size={13} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search dialogue keywords..."
                className="w-full bg-[#07070a] border border-white/5 rounded-xl pl-8 pr-4 py-1.5 text-[11px] text-white focus:outline-none focus:border-amber-500/50 font-mono transition-colors"
              />
            </div>
          </div>

          {/* Staging Data Grid */}
          <div className="overflow-hidden border border-white/5 rounded-2xl divide-y divide-white/5">
            {displayedEntries.length === 0 ? (
              <div className="p-8 text-center text-zinc-550 text-[11px] italic">
                No dialogue drafts match your search filters or library is currently empty.
              </div>
            ) : (
              displayedEntries.map((entry, index) => {
                const globalIdx = (currentPage - 1) * entriesPerPage + index + 1;
                return (
                  <div key={index} className="p-3.5 grid grid-cols-1 md:grid-cols-2 gap-3.5 bg-[#050508]/10 hover:bg-[#0c0c12]/30 transition-all text-left">
                    <div className="space-y-1 pr-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-400 font-bold">
                          #{globalIdx} Input (User)
                        </span>
                        <span className="text-[8px] font-mono text-zinc-550">
                          {entry.wordCountInput} words
                        </span>
                      </div>
                      <p className="text-zinc-300 text-[11px] italic font-mono leading-relaxed truncate md:whitespace-normal md:line-clamp-3">
                        "{entry.input}"
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold">
                          Yuihime (Bot)
                        </span>
                        <span className="text-[8px] font-mono text-zinc-550">
                          {entry.wordCountOutput} words
                        </span>
                      </div>
                      <p className="text-[#f59e0b]/90 text-[11px] font-normal leading-relaxed truncate md:whitespace-normal md:line-clamp-3">
                        "{entry.output}"
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 text-[10px] font-mono">
              <span className="text-zinc-550">Page {currentPage} of {totalPages}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-1 px-2.5 bg-white/5 border border-white/5 hover:bg-white/10 rounded-lg text-white disabled:opacity-30 cursor-pointer active:scale-95 transition-all font-bold"
                >
                  <ChevronLeft size={11} className="inline" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-1 px-2.5 bg-white/5 border border-white/5 hover:bg-white/10 rounded-lg text-white disabled:opacity-30 cursor-pointer active:scale-95 transition-all font-bold"
                >
                  Next <ChevronRight size={11} className="inline" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
