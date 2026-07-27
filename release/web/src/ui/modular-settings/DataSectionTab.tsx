/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ShieldAlert, Database, Plus, Trash2, Edit3, Search, RefreshCw, ChevronLeft, ChevronRight, Save, X } from 'lucide-react';

interface DataSectionTabProps {
  settings: any;
  setSettings: (val: any) => void;
}

const DatabaseCrudInspector: React.FC = () => {
  const [tables, setTables] = useState<{ name: string; count: number }[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [loadingTables, setLoadingTables] = useState(false);

  // Table content state
  const [tableData, setTableData] = useState<any>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const limit = 15;

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | null }>({ text: '', type: null });

  // Fetch tables list
  const fetchTables = async () => {
    setLoadingTables(true);
    try {
      const res = await fetch('/api/db/tables');
      const data = await res.json();
      if (data.success && Array.isArray(data.tables)) {
        setTables(data.tables);
        if (!selectedTable && data.tables.length > 0) {
          setSelectedTable(data.tables[0].name);
        }
      }
    } catch (e: any) {
      console.error("Failed to fetch tables:", e);
    } finally {
      setLoadingTables(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  // Fetch rows for selected table
  const fetchRows = async () => {
    if (!selectedTable) return;
    setLoadingRows(true);
    try {
      const offset = page * limit;
      const res = await fetch(`/api/db/table/${encodeURIComponent(selectedTable)}?limit=${limit}&offset=${offset}&search=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (data.success) {
        setTableData(data);
      } else {
        setStatusMsg({ text: data.error || 'Failed to load table content', type: 'error' });
      }
    } catch (e: any) {
      setStatusMsg({ text: e.message || 'Error loading records', type: 'error' });
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    if (selectedTable) {
      fetchRows();
    }
  }, [selectedTable, page, search]);

  const handleOpenCreate = () => {
    setIsEditing(false);
    const initialValues: Record<string, any> = {};
    if (tableData?.columns) {
      tableData.columns.forEach((col: any) => {
        initialValues[col.name] = '';
      });
    }
    setFormValues(initialValues);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (row: any) => {
    setIsEditing(true);
    setFormValues({ ...row });
    setIsModalOpen(true);
  };

  // Handle Save (Create or Edit)
  const handleSaveRecord = async () => {
    try {
      const res = await fetch(`/api/db/record/${encodeURIComponent(selectedTable)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ text: `Record saved in '${selectedTable}'`, type: 'success' });
        setIsModalOpen(false);
        fetchRows();
        fetchTables();
      } else {
        setStatusMsg({ text: data.error || 'Failed to save record', type: 'error' });
      }
    } catch (e: any) {
      setStatusMsg({ text: e.message || 'Failed to execute query', type: 'error' });
    }
  };

  // Handle Delete
  const handleDeleteRecord = async (row: any) => {
    const pkCol = tableData?.primaryKey || 'id';
    const pkVal = row[pkCol];
    if (pkVal === undefined) {
      alert("Could not determine primary key value for deletion.");
      return;
    }
    if (!confirm(`Permanently delete record (${pkCol} = ${pkVal}) from '${selectedTable}'?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/db/record/${encodeURIComponent(selectedTable)}?pkColumn=${encodeURIComponent(pkCol)}&pkValue=${encodeURIComponent(pkVal)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ text: `Record deleted from '${selectedTable}'`, type: 'success' });
        fetchRows();
        fetchTables();
      } else {
        setStatusMsg({ text: data.error || 'Deletion failed', type: 'error' });
      }
    } catch (e: any) {
      setStatusMsg({ text: e.message || 'Error deleting record', type: 'error' });
    }
  };

  const totalPages = tableData?.total ? Math.ceil(tableData.total / limit) : 1;

  return (
    <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-5 font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/5 pb-4">
        <div>
          <h5 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
            <Database size={16} className="text-cyan-400" /> Database Explorer & CRUD
          </h5>
          <p className="text-[11px] text-zinc-500 mt-0.5">Direct query, edit, and insert records into system SQLite database tables.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchTables}
            className="p-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl border border-white/5 transition-all cursor-pointer"
            title="Refresh tables"
          >
            <RefreshCw size={14} className={loadingTables ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            disabled={!selectedTable}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-xs font-mono font-bold rounded-xl border border-cyan-500/20 transition-all cursor-pointer disabled:opacity-40"
          >
            <Plus size={14} /> New Record
          </button>
        </div>
      </div>

      {statusMsg.text && (
        <div className={`p-3 rounded-xl text-xs font-mono flex items-center justify-between ${
          statusMsg.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
        }`}>
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg({ text: '', type: null })} className="text-white/50 hover:text-white"><X size={12} /></button>
        </div>
      )}

      {/* Table Selector & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="w-full sm:w-1/3">
          <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Select Table ({tables.length})</label>
          <select
            value={selectedTable}
            onChange={(e) => {
              setSelectedTable(e.target.value);
              setPage(0);
              setSearch('');
            }}
            className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-cyan-500/50"
          >
            {tables.map(t => (
              <option key={t.name} value={t.name} className="bg-zinc-900 text-white">
                {t.name} ({t.count} records)
              </option>
            ))}
          </select>
        </div>

        <div className="w-full sm:w-2/3">
          <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">Search Table Records</label>
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Filter row values..."
              className="w-full bg-black/60 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white font-mono outline-none focus:border-cyan-500/50"
            />
            <Search size={14} className="absolute left-3 top-2.5 text-zinc-500" />
          </div>
        </div>
      </div>

      {/* Table Content Data Grid */}
      <div className="border border-white/5 bg-black/40 rounded-xl overflow-hidden">
        {loadingRows ? (
          <div className="py-12 text-center text-xs font-mono text-zinc-500 flex items-center justify-center gap-2">
            <RefreshCw size={14} className="animate-spin text-cyan-400" /> Loading database table rows...
          </div>
        ) : tableData && tableData.rows && tableData.rows.length > 0 ? (
          <div className="overflow-x-auto max-h-[350px]">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-white/5 border-b border-white/5 sticky top-0 backdrop-blur-md">
                <tr>
                  <th className="p-3 text-[10px] uppercase text-zinc-400 font-bold">Actions</th>
                  {tableData.columns.map((col: any) => (
                    <th key={col.name} className="p-3 text-[10px] uppercase text-zinc-400 font-bold whitespace-nowrap">
                      {col.name} {col.pk ? '🔑' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {tableData.rows.map((row: any, idx: number) => (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(row)}
                          className="p-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded transition-all cursor-pointer"
                          title="Edit Row"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(row)}
                          className="p-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded transition-all cursor-pointer"
                          title="Delete Row"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                    {tableData.columns.map((col: any) => {
                      const val = row[col.name];
                      const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
                      return (
                        <td key={col.name} className="p-3 text-zinc-300 max-w-[200px] truncate" title={valStr}>
                          {valStr}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-xs font-mono text-zinc-500">
            No records found in '{selectedTable}'.
          </div>
        )}

        {/* Pagination Bar */}
        {tableData && tableData.total > limit && (
          <div className="p-3 bg-white/[0.02] border-t border-white/5 flex justify-between items-center text-[10px] font-mono text-zinc-400">
            <span>
              Showing {page * limit + 1}-{Math.min((page + 1) * limit, tableData.total)} of {tableData.total}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className="p-1 bg-white/5 hover:bg-white/10 rounded disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft size={14} />
              </button>
              <span>Page {page + 1} of {totalPages}</span>
              <button
                disabled={page + 1 >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-1 bg-white/5 hover:bg-white/10 rounded disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Record Edit/Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0e0e14] border border-white/10 rounded-2xl max-w-xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col font-sans">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <h4 className="text-sm font-bold text-white font-mono">
                {isEditing ? `Edit Record in '${selectedTable}'` : `Create Record in '${selectedTable}'`}
              </h4>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-white"><X size={16} /></button>
            </div>

            <div className="space-y-3 overflow-y-auto flex-1 pr-2 scrollbar-thin">
              {tableData?.columns?.map((col: any) => {
                const isPk = Boolean(col.pk);
                return (
                  <div key={col.name} className="space-y-1">
                    <label className="text-[10px] font-mono text-zinc-400 flex items-center justify-between">
                      <span>{col.name} {isPk ? '(Primary Key)' : ''}</span>
                      <span className="text-zinc-600 text-[9px]">{col.type}</span>
                    </label>
                    <textarea
                      value={formValues[col.name] !== undefined ? formValues[col.name] : ''}
                      onChange={(e) => setFormValues(prev => ({ ...prev, [col.name]: e.target.value }))}
                      rows={col.type.toUpperCase().includes('TEXT') ? 3 : 1}
                      disabled={isEditing && isPk}
                      className="w-full bg-black/60 border border-white/10 rounded-xl p-2.5 text-xs text-white font-mono outline-none focus:border-cyan-500/50 disabled:opacity-50 resize-y"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/5">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-xs font-mono text-white/70 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRecord}
                className="flex items-center gap-1.5 px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-mono font-bold rounded-xl cursor-pointer"
              >
                <Save size={14} /> Save Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const DataSectionTab: React.FC<DataSectionTabProps> = ({ settings, setSettings }) => {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  return (
    <div className="space-y-6">
      {/* Interactive SQLite Database Inspector & CRUD Table Editor */}
      <DatabaseCrudInspector />

      {/* Toast Notification */}
      {toast && (
        <div 
          onClick={() => setToast(null)}
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 transform scale-100 hover:scale-102 active:scale-98 cursor-pointer max-w-md w-[90%] sm:w-auto animate-in fade-in slide-in-from-top-5 ${
            toast.type === 'success' 
              ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300 shadow-emerald-500/10' 
              : 'bg-rose-950/90 border-rose-500/30 text-rose-300 shadow-rose-500/10'
          }`}
        >
          <span className={`w-2 h-2 rounded-full shrink-0 animate-pulse ${toast.type === 'success' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span className="text-xs font-semibold font-mono tracking-wide flex-1">{toast.message}</span>
        </div>
      )}

      {/* Chat Sessions Card Segment */}
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4">
        <div>
          <h5 className="text-sm font-bold text-white tracking-wide">Chats</h5>
          <p className="text-[11px] text-zinc-500">Export or import conversation sessions.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            type="button"
            onClick={async () => {
              try {
                const [historyRes, memoriesRes] = await Promise.all([
                  fetch('/api/storage/history'),
                  fetch('/api/storage/memories')
                ]);
                const history = await historyRes.json();
                const memories = await memoriesRes.json();
                
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ history, memories }, null, 2));
                const downloadAnchor = document.createElement('a');
                downloadAnchor.setAttribute("href", dataStr);
                downloadAnchor.setAttribute("download", `yuihime_chat_export_${Date.now()}.json`);
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
                setToast({ message: "Conversations exported successfully! ✨", type: 'success' });
              } catch (err: any) {
                setToast({ message: `Export failed: ${err.message}`, type: 'error' });
              }
            }}
            className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white/80 text-xs font-bold uppercase tracking-wider rounded-xl border border-white/5 transition-all text-center cursor-pointer font-sans"
          >
            Export chats
          </button>
          <button 
            type="button"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json';
              input.onchange = async (e: any) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async (evt: any) => {
                  try {
                    const parsed = JSON.parse(evt.target.result);
                    if (!parsed.history && !parsed.memories) {
                      setToast({ message: "Invalid JSON format. File must contain 'history' or 'memories'.", type: 'error' });
                      return;
                    }

                    const res = await fetch('/api/storage/import', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        history: parsed.history || [],
                        memories: parsed.memories || []
                      })
                    });
                    const data = await res.json();
                    if (data.success) {
                      setToast({ message: "Chats successfully imported! Reloading...", type: 'success' });
                      setTimeout(() => window.location.reload(), 1500);
                    } else {
                      setToast({ message: `Import failed: ${data.error || 'Unknown error'}`, type: 'error' });
                    }
                  } catch (err: any) {
                    setToast({ message: `Read error: ${err.message}`, type: 'error' });
                  }
                };
                reader.readAsText(file);
              };
              input.click();
            }}
            className="flex-1 py-3 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 text-xs font-bold uppercase tracking-wider rounded-xl border border-teal-500/20 transition-all text-center cursor-pointer font-sans"
          >
            Import chats
          </button>
          <button 
            type="button"
            onClick={async () => {
              if (confirm("SEVERE ALERT: Are you absolutely sure you wish to permanently erase ALL stored chat histories and memories?")) {
                try {
                  const res = await fetch('/api/storage/purge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'soft' })
                  });
                  const data = await res.json();
                  if (data.success) {
                    setToast({ message: "Chat history cleared successfully! Reloading...", type: 'success' });
                    setTimeout(() => window.location.reload(), 1500);
                  } else {
                    setToast({ message: `Purge failed: ${data.error}`, type: 'error' });
                  }
                } catch (err: any) {
                  setToast({ message: `Connection error: ${err.message}`, type: 'error' });
                }
              }
            }}
            className="py-3 px-5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold uppercase tracking-wider rounded-xl border border-rose-500/20 transition-all text-center cursor-pointer font-sans"
          >
            Purge chats
          </button>
        </div>
      </div>

      {/* Models Card Segment */}
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4">
        <div>
          <h5 className="text-sm font-bold text-white tracking-wide">Avatars</h5>
          <p className="text-[11px] text-zinc-500">Reset Live2D/VRM custom avatar mappings.</p>
        </div>
        <button 
          type="button"
          onClick={() => {
            if (confirm("Remove models list registry mappings from localStorage web-cache?")) {
              localStorage.removeItem('yuihime_cached_models_v2');
              setToast({ message: "Model list wiped successfully! Reloading...", type: 'success' });
              setTimeout(() => window.location.reload(), 1500);
            }
          }}
          className="w-full sm:w-auto py-3 px-6 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold uppercase tracking-wider rounded-xl border border-rose-500/20 transition-all cursor-pointer font-sans"
        >
          Reset avatars
        </button>
      </div>

      {/* Modules Card Segment */}
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-2xl space-y-4">
        <div>
          <h5 className="text-sm font-bold text-white tracking-wide">Parameters</h5>
          <p className="text-[11px] text-zinc-500">Reset active modular configurations back to defaults.</p>
        </div>
        <button 
          type="button"
          onClick={async () => {
            if (confirm("Reset dynamic neural routing and modular weights settings back to default configurations?")) {
              try {
                const preservedSettings = {
                  official_chat: settings.official_chat,
                  openrouter: settings.openrouter,
                  aihubmix: settings.aihubmix,
                  gemini: settings.gemini,
                  openai: settings.openai,
                  anthropic: settings.anthropic,
                  elevenlabs: settings.elevenlabs,
                  groq: settings.groq,
                  ollama: settings.ollama,
                  lmstudio: settings.lmstudio,
                };
                
                const res = await fetch('/api/settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(preservedSettings)
                });
                await res.json();
                setToast({ message: "Modules successfully reset to defaults! Reloading...", type: 'success' });
                setTimeout(() => window.location.reload(), 1500);
              } catch (err: any) {
                setToast({ message: `Reset failed: ${err.message}`, type: 'error' });
              }
            }
          }}
          className="w-full sm:w-auto py-3 px-6 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-bold uppercase tracking-wider rounded-xl border border-amber-500/20 transition-all cursor-pointer font-sans"
        >
          Reset modules
        </button>
      </div>

      {/* DANGER ZONE RED BORDERED BLOCK */}
      <div className="border border-rose-500/30 bg-rose-500/[0.02] p-6 rounded-2xl space-y-5 animate-fade-in">
        <div className="border-b border-rose-500/10 pb-2">
          <h4 className="text-sm font-bold text-rose-400 tracking-wide flex items-center gap-2 font-sans">
            <ShieldAlert size={16} /> Danger zone
          </h4>
          <p className="text-[11px] text-zinc-500 mt-0.5 font-sans">Irreversible. Export back-up snapshots beforehand.</p>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/5 pb-4">
          <div>
            <h5 className="text-xs font-bold text-white tracking-wide font-sans">API Credentials</h5>
            <p className="text-[10px] text-zinc-500 mt-1 font-sans">Wipe all stored API keys and custom providers settings.</p>
          </div>
          <button 
            type="button"
            onClick={() => {
              if (confirm("IRREVERSIBLE ALERT: Wipe all stored credentials, API Keys, and customized models settings?")) {
                setSettings({});
                setToast({ message: "Provider credentials cleared successfully!", type: 'success' });
              }
            }}
            className="py-2.5 px-5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] uppercase font-mono tracking-widest rounded-xl transition-all cursor-pointer font-bold shrink-0 shadow-lg"
          >
            Clear credentials
          </button>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h5 className="text-xs font-bold text-white tracking-wide font-sans">Total Factory Reset</h5>
            <p className="text-[10px] text-zinc-500 mt-1 font-sans">Erase all localStorage, cached avatars, and full local states.</p>
          </div>
          <button 
            type="button"
            onClick={() => {
              if (confirm("TOTAL DESTRUCTION: This will completely clean all localStorage and indexDB registers. Wipe clean now?")) {
                localStorage.clear();
                setToast({ message: "Full database wiped. Redirecting...", type: 'success' });
                setTimeout(() => window.location.reload(), 1500);
              }
            }}
            className="py-2.5 px-5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] uppercase font-mono tracking-widest rounded-xl transition-all cursor-pointer font-bold shrink-0 shadow-lg"
          >
            Wipe all data
          </button>
        </div>
      </div>
    </div>
  );
};
