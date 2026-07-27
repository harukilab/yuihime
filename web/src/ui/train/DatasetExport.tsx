import React, { useState } from 'react';
import { Brain, Search, Eye, ChevronLeft, ChevronRight, Download, RefreshCw, Cpu, Layers } from 'lucide-react';

interface DatasetExportProps {
  onRefreshMemories?: () => void;
  onRefreshKnowledge?: () => void;
}

export const DatasetExport: React.FC<DatasetExportProps> = ({
  onRefreshMemories,
  onRefreshKnowledge
}) => {
  const [exportLimit, setExportLimit] = useState<number>(100);
  const [exportLimitUnlimited, setExportLimitUnlimited] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<'openai' | 'sharegpt' | 'alpaca'>('openai');
  const [exportOutputFormat, setExportOutputFormat] = useState<'json_cot' | 'raw_text'>('json_cot');
  const [exportThoughtTemplate, setExportThoughtTemplate] = useState<string>('Responding to {sender} regarding "{message}". {character} is formulating a sweet response to capture their feelings.');
  const [exportCustomRegexes, setExportCustomRegexes] = useState<string>('');
  const [exportUserFallback, setExportUserFallback] = useState<string>("user, Penonton, Subscriber, Chatter, Kawan");
  const [exportAiFallback, setExportAiFallback] = useState<string>("Yui");
  const [exportRelationVerb, setExportRelationVerb] = useState<string>("berkata");
  const [exportSmartSynthesize, setExportSmartSynthesize] = useState<boolean>(false);
  const [exportOnlySynthesized, setExportOnlySynthesized] = useState<boolean>(false);
  const [viewingRawRecord, setViewingRawRecord] = useState<any | null>(null);
  const [rawTab, setRawTab] = useState<'database' | 'chatml'>('database');
  const [exportSystemPrompt, setExportSystemPrompt] = useState<string>("You are Yuihime, a protective companion digital soul running on Perfect Giftia OS. Output strictly valid JSON.");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportResult, setExportResult] = useState<any[] | null>(null);
  const [exportLogs, setExportLogs] = useState<string[]>([]);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportErrorMessage, setExportErrorMessage] = useState<string | null>(null);
  const [exportSearchQuery, setExportSearchQuery] = useState<string>('');
  const [exportCurrentPage, setExportCurrentPage] = useState<number>(1);

  const entriesPerPage = 10;

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const handleLaunchExport = async () => {
    setIsExporting(true);
    setExportLogs([]);
    setExportProgress(5);
    setExportResult(null);
    setExportErrorMessage(null);

    const log = (msg: string) => {
      setExportLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    try {
      log("Initializing Yuihime Cognitive Dataset Exporter...");
      await sleep(250);
      setExportProgress(15);

      log("Connecting to core SQLite database and loading memories...");
      await sleep(250);
      setExportProgress(35);

      log(`Conversion method: ${exportSmartSynthesize ? "Deep Cognitive Synthesis (Gemini)" : "Fast Offline Mapping"}`);
      await sleep(250);
      setExportProgress(55);

      log("Transmitting parameters to core Cortex router...");
      setExportProgress(75);

      const res = await fetch('/api/cortex/export-dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: exportLimitUnlimited ? "unlimited" : exportLimit,
          smartSynthesize: exportSmartSynthesize,
          systemPrompt: exportSystemPrompt,
          userFallback: exportUserFallback,
          aiFallback: exportAiFallback,
          relationVerb: exportRelationVerb,
          format: exportFormat,
          outputFormat: exportOutputFormat,
          thoughtTemplate: exportThoughtTemplate,
          customRegexes: exportCustomRegexes.split('\n').map(line => line.trim()).filter(Boolean),
          onlySynthesized: exportOnlySynthesized
        })
      });

      setExportProgress(90);
      await sleep(200);

      if (res.ok) {
        const result = await res.json();
        setExportProgress(100);
        await sleep(200);

        if (result.entries && result.entries.length > 0) {
          log(`SUCCESS: Compiled ${result.entries.length} training sessions.`);
          setExportResult(result.entries);
          setExportErrorMessage(null);
        } else {
          log("⚠️ Database memories empty or no structured conversation logs found.");
          setExportResult([]);
          setExportErrorMessage("No valid conversations found in database for export.");
        }
      } else {
        const errData = await res.json();
        throw new Error(errData.error || errData.message || "Failed to query dataset exporter.");
      }
    } catch (err: any) {
      log(`🛑 ERROR: ${err.message || err}`);
      setExportErrorMessage(err.message || String(err));
      setExportResult([]);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadDataset = (format: 'json' | 'jsonl') => {
    if (!exportResult || exportResult.length === 0) return;

    let fileContent = "";
    let fileExtension = "";

    if (format === 'json') {
      fileContent = JSON.stringify(exportResult, null, 2);
      fileExtension = "json";
    } else {
      fileContent = exportResult.map(entry => JSON.stringify(entry)).join('\n');
      fileExtension = "jsonl";
    }

    const blob = new Blob([fileContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `yuihime_sft_dataset_${Date.now()}.${fileExtension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredExportEntries = (exportResult || []).filter(entry => {
    if (!exportSearchQuery) return true;
    const s = exportSearchQuery.toLowerCase();
    if (Array.isArray(entry.messages)) {
      return entry.messages.some((msg: any) => (msg.content || '').toLowerCase().includes(s));
    }
    if (Array.isArray(entry.conversations)) {
      return entry.conversations.some((msg: any) => (msg.value || '').toLowerCase().includes(s));
    }
    const inst = entry.instruction ? String(entry.instruction).toLowerCase() : '';
    const inp = entry.input ? String(entry.input).toLowerCase() : '';
    const out = entry.output ? String(entry.output).toLowerCase() : '';
    return inst.includes(s) || inp.includes(s) || out.includes(s);
  });

  const exportTotalPages = Math.ceil(filteredExportEntries.length / entriesPerPage);
  const displayedExportEntries = filteredExportEntries.slice((exportCurrentPage - 1) * entriesPerPage, exportCurrentPage * entriesPerPage);

  // Tiny collapsible inline desc utility to optimize layout on small devices
  const CollapsibleText: React.FC<{ text: string }> = ({ text }) => {
    const [expanded, setExpanded] = useState(false);
    const limit = 80;
    if (text.length <= limit) return <span className="text-[9px] text-zinc-500 block leading-tight">{text}</span>;
    return (
      <span className="text-[9px] text-zinc-500 block leading-tight">
        {expanded ? text : `${text.slice(0, limit)}...`}{' '}
        <button 
          onClick={() => setExpanded(!expanded)} 
          className="text-amber-500 hover:underline font-bold font-mono ml-1 focus:outline-none inline"
        >
          {expanded ? '[Less]' : '[Detail]'}
        </button>
      </span>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start text-left animate-fade-in">
      {/* LEFT COLUMN: Export configuration settings */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl space-y-6">
          <div className="border-b border-white/5 pb-3">
            <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-400 block font-bold mb-1">CONFIGURATION</span>
            <h3 className="text-sm font-bold text-white">SFT Dataset Constructor</h3>
          </div>

          {/* SFT Limits */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[10.5px] font-mono">
              <span className="text-zinc-400 font-bold uppercase">Session Limit</span>
              <div className="flex items-center gap-1.5">
                <label className="flex items-center gap-1 cursor-pointer text-zinc-400 hover:text-white transition-colors">
                  <input
                    type="checkbox"
                    checked={exportLimitUnlimited}
                    onChange={(e) => setExportLimitUnlimited(e.target.checked)}
                    className="rounded border-white/10 bg-black/40 text-amber-500 focus:ring-0 focus:ring-offset-0 w-3 h-3 cursor-pointer accent-amber-500"
                  />
                  <span className="text-[10px]">Unlimited</span>
                </label>
                <span className="text-zinc-700">|</span>
                <span className="text-amber-500 font-bold">
                  {exportLimitUnlimited ? "Unlimited" : `${exportLimit} Sessions`}
                </span>
              </div>
            </div>
            {!exportLimitUnlimited ? (
              <input
                type="range"
                min="5"
                max="500"
                step="5"
                value={exportLimit}
                onChange={(e) => setExportLimit(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer h-1 bg-white/5 rounded-lg appearance-none"
              />
            ) : (
              <div className="py-1 px-3 border border-amber-500/10 bg-amber-500/5 rounded-xl text-center text-[9px] text-amber-500 font-mono tracking-wide leading-none my-1">
                🔄 Retrieving entire memory & activity databases
              </div>
            )}
            <CollapsibleText text="Restricts the training data pool fetched. Setting to 'Unlimited' will retrieve every parsed memory block and offline activity ever registered." />
          </div>

          {/* SFT target format */}
          <div className="space-y-2 pt-3 border-t border-white/[0.03]">
            <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 block font-bold">Target Format</span>
            <div className="grid grid-cols-3 gap-1 bg-black/40 border border-white/5 rounded-2xl p-1">
              {(['openai', 'sharegpt', 'alpaca'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setExportFormat(fmt)}
                  className={`px-1.5 py-2 rounded-xl text-[9px] uppercase font-mono transition-all font-bold cursor-pointer text-center leading-none ${
                    exportFormat === fmt
                      ? 'bg-amber-500 text-black shadow-sm font-extrabold'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
            <p className="text-[8.5px] text-zinc-500 leading-tight">
              {exportFormat === 'openai' && "Standard OpenAI: array of messages (system, user, assistant)."}
              {exportFormat === 'sharegpt' && "Vicuna / ShareGPT layout (from: human, value, system)."}
              {exportFormat === 'alpaca' && "Alpaca instruction paradigm (instruction, input, output)."}
            </p>
          </div>

          {/* Name prefix configuration */}
          <div className="space-y-4 pt-3 border-t border-white/[0.03]">
            <span className="text-[10px] uppercase font-mono tracking-wider text-amber-500/80 block font-bold">Name & Verb Prefix Rules</span>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <span className="text-[10px] text-zinc-400 font-mono block">User Fallback CSV Pool</span>
                <input
                  type="text"
                  value={exportUserFallback}
                  onChange={(e) => setExportUserFallback(e.target.value)}
                  placeholder="e.g. Brother, Chatter, user"
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:border-amber-500/50 outline-none transition-all"
                />
                <CollapsibleText text="List of alternate random names used in datasets if sender's real name isn't found. This keeps training generic." />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-400 font-mono block">Character Name</span>
                <input
                  type="text"
                  value={exportAiFallback}
                  onChange={(e) => setExportAiFallback(e.target.value)}
                  placeholder="e.g. Yui"
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:border-amber-500/50 outline-none transition-all"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-400 font-mono block">Action Verb</span>
                <input
                  type="text"
                  value={exportRelationVerb}
                  onChange={(e) => setExportRelationVerb(e.target.value)}
                  placeholder="e.g. says"
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:border-amber-500/50 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* SFT layout and thought templates */}
          <div className="space-y-4 pt-3 border-t border-white/[0.03]">
            <span className="text-[10px] uppercase font-mono tracking-wider text-amber-500/80 block font-bold">CoT Customization</span>

            <div className="space-y-1.5">
              <span className="text-[10px] text-zinc-400 font-mono block">Dialogue Layout</span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-black/40 border border-white/5 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setExportOutputFormat('json_cot')}
                  className={`px-2 py-1.5 rounded-xl text-[9px] uppercase font-mono transition-all font-bold cursor-pointer text-center leading-none ${
                    exportOutputFormat === 'json_cot'
                      ? 'bg-amber-500 text-black shadow-sm font-extrabold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  JSON CoT
                </button>
                <button
                  type="button"
                  onClick={() => setExportOutputFormat('raw_text')}
                  className={`px-2 py-1.5 rounded-xl text-[9px] uppercase font-mono transition-all font-bold cursor-pointer text-center leading-none ${
                    exportOutputFormat === 'raw_text'
                      ? 'bg-amber-500 text-black shadow-sm font-extrabold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Pure Speech
                </button>
              </div>
              <CollapsibleText text={exportOutputFormat === 'json_cot' ? "Exports with inner mental reasoning logs, emotional balances, animations, and mood offsets." : "Exports pure clean spoken sentences suitable for universal model tuning."} />
            </div>

            {exportOutputFormat === 'json_cot' && (
              <div className="space-y-1 animate-fade-in text-left">
                <span className="text-[10px] text-zinc-400 font-mono block">Thought Prompt Template</span>
                <textarea
                  rows={2}
                  value={exportThoughtTemplate}
                  onChange={(e) => setExportThoughtTemplate(e.target.value)}
                  className="w-full bg-[#07070a] border border-white/5 rounded-xl p-2 text-[10px] text-zinc-300 font-mono focus:outline-none focus:border-amber-500/50 resize-none leading-relaxed"
                />
                <span className="text-[8.5px] text-zinc-500 block leading-tight">
                  Variables: <code>{"{sender}"}</code>, <code>{"{character}"}</code>, <code>{"{message}"}</code>.
                </span>
              </div>
            )}
          </div>

          {/* Filtering Only Synthesized */}
          <div className="space-y-3 pt-3 border-t border-white/[0.03]">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5 text-left">
                <span className="text-[10.5px] font-bold text-white block">Synthesized Only (CRUD SFT)</span>
                <CollapsibleText text="Only export custom synthetic rows crafted inside the dataset editor. This ignores uncompiled activity logs." />
              </div>
              <button
                type="button"
                onClick={() => setExportOnlySynthesized(!exportOnlySynthesized)}
                disabled={isExporting}
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 cursor-pointer ${
                  exportOnlySynthesized ? 'bg-emerald-500 border-emerald-500 text-black' : 'border-white/20 bg-black/40'
                }`}
              >
                {exportOnlySynthesized && <span className="text-[9px] font-bold">✔</span>}
              </button>
            </div>
          </div>

          {/* Launch Synthesis Buttons */}
          <div className="pt-3 border-t border-white/[0.03] space-y-2">
            <button
              type="button"
              onClick={handleLaunchExport}
              disabled={isExporting}
              className="w-full bg-amber-500 hover:bg-amber-450 text-black font-extrabold text-[10.5px] uppercase tracking-wider py-3 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(245,158,11,0.15)] disabled:opacity-50"
            >
              <Cpu size={12} /> Synthesize Activity Dataset
            </button>
          </div>

          {/* Export Log Progress */}
          {(isExporting || exportLogs.length > 0) && (
            <div className="space-y-2 border-t border-white/5 pt-4">
              <div className="flex justify-between items-center text-[9px] font-mono text-zinc-400">
                <span>EXPORT PROGRESS</span>
                <span className="font-bold text-amber-500">{exportProgress}%</span>
              </div>
              <div className="h-28 overflow-y-auto p-2 bg-black/40 border border-white/5 rounded-xl font-mono text-[9px] text-zinc-400 space-y-0.5 leading-normal">
                {exportLogs.map((log, idx) => (
                  <div key={idx} className="text-zinc-300">
                    &gt; {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Output display and download triggers */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
            <div className="flex items-center gap-2">
              <Brain className="text-amber-500" size={15} />
              <span className="text-xs font-bold text-white tracking-wide">Synthesized Output ({filteredExportEntries.length})</span>
            </div>
            
            {/* Download Buttons */}
            {exportResult && exportResult.length > 0 && (
              <div className="flex items-center gap-1.5 justify-end">
                <button
                  onClick={() => downloadDataset('json')}
                  className="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-black font-extrabold text-[9px] uppercase tracking-wider rounded-lg font-mono flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Download size={10} /> JSON
                </button>
                <button
                  onClick={() => downloadDataset('jsonl')}
                  className="px-2.5 py-1.5 bg-blue-500 hover:bg-blue-600 text-white font-extrabold text-[9px] uppercase tracking-wider rounded-lg font-mono flex items-center gap-1 transition-all cursor-pointer border border-blue-600/20"
                >
                  <Download size={10} /> JSONL
                </button>
              </div>
            )}
          </div>

          {!exportResult ? (
            <div className="p-16 text-center flex flex-col items-center justify-center gap-4 text-zinc-500">
              <div className="p-4 bg-white/5 rounded-2xl text-zinc-400">
                <Brain size={28} className="animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white mb-1">Dataset Not Yet Synthesized</h4>
                <p className="text-[11px] text-zinc-500 max-w-xs mx-auto leading-normal">
                  Click <strong>Synthesize Activity Dataset</strong> in the panel to convert your real conversational logs into structural SFT rows.
                </p>
              </div>
            </div>
          ) : filteredExportEntries.length === 0 ? (
            <div className="p-12 text-center text-zinc-555 text-xs italic">
              {exportErrorMessage || "No exported sessions match your search filter."}
            </div>
          ) : (
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {displayedExportEntries.map((session: any, sIdx) => {
                const globalIdx = (exportCurrentPage - 1) * entriesPerPage + sIdx + 1;
                
                let messagesToRender: any[] = [];
                if (Array.isArray(session.messages)) {
                  messagesToRender = session.messages;
                } else if (Array.isArray(session.conversations)) {
                  messagesToRender = session.conversations.map((c: any) => ({
                    role: c.from === 'human' ? 'user' : c.from === 'system' ? 'system' : 'assistant',
                    content: c.value
                  }));
                } else if (session.instruction !== undefined || session.input !== undefined) {
                  messagesToRender = [];
                  if (session.instruction) messagesToRender.push({ role: 'system', content: session.instruction });
                  if (session.input) messagesToRender.push({ role: 'user', content: session.input });
                  if (session.output) messagesToRender.push({ role: 'assistant', content: session.output });
                }

                return (
                  <div key={sIdx} className="bg-black/35 border border-white/5 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-white/[0.03] pb-2 text-[10px] font-mono">
                      <span className="text-amber-500 font-bold uppercase">Training Session #{globalIdx}</span>
                      <span className="text-zinc-500">{messagesToRender.length} message units</span>
                    </div>

                    <div className="space-y-3 font-mono text-[10.5px] leading-relaxed select-text">
                      {messagesToRender.map((item: any, mIdx: number) => {
                        if (item.role === 'system') {
                          return (
                            <div key={mIdx} className="p-3 bg-white/5 rounded-xl border border-white/5">
                              <span className="text-[8px] uppercase font-bold text-zinc-400 block mb-1">⚙️ System Instruction:</span>
                              <p className="text-zinc-350">{item.content}</p>
                            </div>
                          );
                        }

                        if (item.role === 'user') {
                          return (
                            <div key={mIdx} className="p-3 bg-[#0a0a0f]/40 rounded-xl border border-white/5 text-left">
                              <span className="text-[8px] uppercase font-bold text-[#f59e0b] block mb-1">💬 User (Sender):</span>
                              <p className="text-zinc-200">"{item.content}"</p>
                            </div>
                          );
                        }

                        let parsedObj: any = null;
                        try {
                          parsedObj = JSON.parse(item.content);
                        } catch (_) {}

                        return (
                          <div key={mIdx} className="p-3 bg-amber-500/5 rounded-xl border border-amber-500/10 text-left">
                            <span className="text-[8px] uppercase font-bold text-amber-500 block mb-2">🎀 Assistant (Yuihime):</span>
                            {parsedObj ? (
                              <div className="space-y-2 pl-2 border-l border-amber-500/20 text-[9.5px]">
                                <div>
                                  <span className="text-[8px] uppercase text-zinc-500 block">Thought Process:</span>
                                  <p className="text-zinc-350 italic">"{parsedObj.thought}"</p>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-2">
                                  <div>
                                    <span className="text-[8px] uppercase text-zinc-500 block">Animations:</span>
                                    <span className="bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded font-bold text-[8.5px]">
                                      {parsedObj.animations?.join(', ') || "SMILE"}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[8px] uppercase text-zinc-500 block">Mood Impact:</span>
                                    <span className="text-zinc-400 font-mono text-[8.5px]">
                                      {JSON.stringify(parsedObj.mood_impact || { joy: 1 })}
                                    </span>
                                  </div>
                                </div>
                                <div>
                                  <span className="text-[8px] uppercase text-zinc-500 block">Spoken Speech:</span>
                                  <p className="text-amber-300 font-bold font-sans text-xs pt-1">
                                    "{parsedObj.tool_calls?.[0]?.args?.speech || parsedObj.speech}"
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <p className="text-zinc-300">"{item.content}"</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {exportResult && exportTotalPages > 1 && (
            <div className="flex items-center justify-between mt-3 text-[10px] font-mono border-t border-white/[0.03] pt-3">
              <span className="text-zinc-500">Page {exportCurrentPage} of {exportTotalPages}</span>
              <div className="flex items-center gap-1 justify-end">
                <button
                  type="button"
                  onClick={() => setExportCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={exportCurrentPage === 1}
                  className="p-1 px-2.5 bg-white/5 border border-white/5 hover:bg-white/10 rounded-lg text-white disabled:opacity-30 cursor-pointer active:scale-95 transition-all font-bold"
                >
                  <ChevronLeft size={11} className="inline" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => setExportCurrentPage(prev => Math.min(prev + 1, exportTotalPages))}
                  disabled={exportCurrentPage === exportTotalPages}
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
