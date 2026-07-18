import React, { useState, useEffect } from 'react';
import { Play, Pause, Plus, Trash2, Clock, Activity, Edit2, Check, X, AlertTriangle, RefreshCw, FileText } from 'lucide-react';

interface CronTask {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  repeating: boolean;
  lastRun?: number;
  prompt?: string;
  context_id?: string;
  chat_type?: string;
  sender_name?: string;
}

const DEFAULT_PROMPT_HINT = 'Leave empty to use default: [CRON_SIGNAL]: <Task Name>. Please process this scheduled request now.';

export const CronManager: React.FC = () => {
  const [tasks, setTasks] = useState<CronTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State (for Create & Edit)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formId, setFormId] = useState<string | null>(null); // null means adding new task
  const [formName, setFormName] = useState('');
  const [formSchedule, setFormSchedule] = useState('5m');
  const [formRepeating, setFormRepeating] = useState(true);
  const [formPrompt, setFormPrompt] = useState('');
  const [formContextId, setFormContextId] = useState<string | undefined>(undefined);
  const [formChatType, setFormChatType] = useState<string | undefined>(undefined);
  const [formSenderName, setFormSenderName] = useState<string | undefined>(undefined);
  const [formEnabled, setFormEnabled] = useState(true);

  // Delete Confirm State
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  // Expand prompt preview in list
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(() => {
      fetchTasks(true);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchTasks = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await fetch('/api/cron');
      const data = await res.json();
      setTasks(data);
    } catch (e) {
      console.error('Failed to fetch cron tasks');
      setErrorMsg('Failed to sync scheduler list.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  const toggleTask = async (task: CronTask) => {
    try {
      await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...task, enabled: !task.enabled })
      });
      fetchTasks();
    } catch (e) {
      console.error('Failed to toggle task');
    }
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formSchedule.trim()) {
      setErrorMsg('Task name and schedule are required.');
      return;
    }

    try {
      const isEditing = formId !== null;
      const payload: Record<string, unknown> = {
        id: isEditing ? formId : `task_${Date.now()}`,
        name: formName.trim(),
        schedule: formSchedule.trim(),
        enabled: isEditing ? formEnabled : true,
        repeating: formRepeating,
        prompt: formPrompt
      };

      // Preserve channel targeting on edit
      if (isEditing) {
        if (formContextId) payload.context_id = formContextId;
        if (formChatType) payload.chat_type = formChatType;
        if (formSenderName) payload.sender_name = formSenderName;
      }

      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsFormOpen(false);
        resetFormState();
        fetchTasks();
      } else {
        setErrorMsg('Sync failed. Neural Kernel rejected the schedule.');
      }
    } catch (err) {
      console.error('Failed to save cron task', err);
      setErrorMsg('Connection error while saving.');
    }
  };

  const startEdit = (task: CronTask) => {
    setFormId(task.id);
    setFormName(task.name);
    setFormSchedule(task.schedule);
    setFormRepeating(task.repeating);
    setFormPrompt(task.prompt || '');
    setFormContextId(task.context_id);
    setFormChatType(task.chat_type);
    setFormSenderName(task.sender_name);
    setFormEnabled(task.enabled);
    setIsFormOpen(true);
  };

  const startAdd = () => {
    setFormId(null);
    setFormName('');
    setFormSchedule('5m');
    setFormRepeating(true);
    setFormPrompt('');
    setFormContextId(undefined);
    setFormChatType(undefined);
    setFormSenderName(undefined);
    setFormEnabled(true);
    setIsFormOpen(true);
  };

  const resetFormState = () => {
    setFormId(null);
    setFormName('');
    setFormSchedule('5m');
    setFormRepeating(true);
    setFormPrompt('');
    setFormContextId(undefined);
    setFormChatType(undefined);
    setFormSenderName(undefined);
    setFormEnabled(true);
    setErrorMsg(null);
  };

  const executeDelete = async () => {
    if (!deletingTaskId) return;
    try {
      const res = await fetch(`/api/cron/${deletingTaskId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeletingTaskId(null);
        fetchTasks();
      } else {
        setErrorMsg('Failed to delete task from Kernel.');
      }
    } catch (e) {
      console.error('Failed to delete task', e);
      setErrorMsg('Connection error.');
    }
  };

  const triggerTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/cron/${taskId}/trigger`, { method: 'POST' });
      if (res.ok) {
        fetchTasks(true);
      } else {
        setErrorMsg('Failed to manually trigger cognitive task.');
      }
    } catch (e) {
      console.error('Failed to trigger task', e);
      setErrorMsg('Connection error.');
    }
  };

  const promptPreview = (task: CronTask) => {
    const p = (task.prompt || '').trim();
    if (!p) return null;
    return p.length > 120 ? `${p.slice(0, 120)}…` : p;
  };

  if (loading && tasks.length === 0) {
    return (
      <div className="text-[#a1a1aa] p-8 text-center flex flex-col items-center justify-center gap-2 font-mono text-xs">
        <RefreshCw className="animate-spin text-cyan-400" size={18} />
        <span>SCANNING NEURAL CORE SCHEDULER...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 relative">
      <div className="flex justify-between items-center sm:flex-row flex-col gap-3">
        <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-2 select-none">
          <Clock size={16} /> Cognitive Scheduler
        </h3>
        <button 
          onClick={startAdd}
          className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 hover:from-blue-600/30 hover:to-cyan-600/30 border border-cyan-500/20 rounded-xl text-cyan-400 text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 cursor-pointer shadow-lg shadow-cyan-950/10"
        >
          <Plus size={14} /> Add Task
        </button>
      </div>

      {/* ERROR DISPLAY */}
      {errorMsg && (
        <div className="p-3 bg-red-950/30 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-red-400 text-xs text-left animate-fade-in">
          <AlertTriangle size={14} className="shrink-0" />
          <div className="flex-1 font-sans">{errorMsg}</div>
          <button onClick={() => setErrorMsg(null)} className="hover:text-red-300 text-red-500 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* CRON FORM MODAL INLINE */}
      {isFormOpen && (
        <div className="p-5 bg-zinc-900/90 border border-cyan-500/20 rounded-2xl flex flex-col gap-4 animate-fade-in">
          <div className="flex justify-between items-center border-b border-white/5 pb-2.5">
            <h4 className="text-xs font-bold text-gray-200 tracking-wide">
              {formId ? 'Edit Cognitive Task' : 'Create Cognitive Task'}
            </h4>
            <button 
              onClick={() => { setIsFormOpen(false); resetFormState(); }}
              className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={submitForm} className="space-y-4 text-xs">
            {/* Task Name */}
            <div className="flex flex-col gap-1.5 text-left">
              <label className="text-zinc-400 font-semibold">Task Name</label>
              <input 
                type="text"
                placeholder="e.g., Morning Greeting, Memory Consolidation, Sleep Pulse"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full bg-[#0d0d12] border border-white/5 rounded-xl px-3 py-2 text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/10 transition-all font-sans"
              />
            </div>

            {/* Schedule */}
            <div className="flex flex-col gap-1.5 text-left">
              <label className="text-zinc-400 font-semibold">Schedule Expression</label>
              <input 
                type="text"
                placeholder="e.g., '5m' (every 5 mins), '1h' (every hour), or Cron ('0 7 * * *')"
                value={formSchedule}
                onChange={(e) => setFormSchedule(e.target.value)}
                className="w-full bg-[#0d0d12] border border-white/5 rounded-xl px-3 py-2 text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/10 transition-all font-mono"
              />
              <span className="text-[10px] text-zinc-500 leading-relaxed font-sans">
                * Use short format like <strong className="text-indigo-400">5m</strong>, <strong className="text-indigo-400">1h</strong>, or standard cron <strong className="text-indigo-400">* * * * *</strong>. Live-sync will trigger cognitive processes asynchronously.
              </span>
            </div>

            {/* Prompt */}
            <div className="flex flex-col gap-1.5 text-left">
              <label className="text-zinc-400 font-semibold flex items-center gap-1.5">
                <FileText size={12} className="text-cyan-500/80" />
                Task Prompt
              </label>
              <textarea
                rows={5}
                placeholder="e.g. Check the weather and send a short morning greeting to user in a tsundere style."
                value={formPrompt}
                onChange={(e) => setFormPrompt(e.target.value)}
                className="w-full bg-[#0d0d12] border border-white/5 rounded-xl px-3 py-2.5 text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/10 transition-all font-sans resize-y min-h-[96px] leading-relaxed"
              />
              <span className="text-[10px] text-zinc-500 leading-relaxed font-sans">
                {DEFAULT_PROMPT_HINT}
              </span>
            </div>

            {/* Repeating Toggle */}
            <div className="flex items-center justify-between border-t border-b border-white/5 py-3">
              <div className="flex flex-col text-left">
                <span className="font-semibold text-zinc-300">Recurring Execution</span>
                <span className="text-[10px] text-zinc-500">Repeats continuously (not a one-shot task)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={formRepeating}
                  onChange={(e) => setFormRepeating(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 peer-checked:after:bg-cyan-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-950/50 peer-checked:border peer-checked:border-cyan-500/30"></div>
              </label>
            </div>

            {/* Actions Buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
              <button 
                type="button"
                onClick={() => { setIsFormOpen(false); resetFormState(); }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/5 rounded-xl transition-all cursor-pointer font-bold duration-150"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/35 border border-cyan-500/30 text-cyan-400 rounded-xl transition-all font-bold duration-150 flex items-center gap-1 cursor-pointer"
              >
                <Check size={14} /> Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DELETE CONFIRM DIALOG */}
      {deletingTaskId && (
        <div className="p-4 bg-red-950/20 border border-red-500/25 rounded-2xl flex flex-col gap-3.5 text-left animate-fade-in">
          <div className="flex items-center gap-2.5 text-red-400 text-xs font-bold">
            <AlertTriangle size={15} />
            <span>Confirm Task Deletion</span>
          </div>
          <p className="text-zinc-400 text-xs font-sans leading-relaxed">
            Are you sure you want to permanently delete this task from the Neural Kernel? It will no longer run in the background.
          </p>
          <div className="flex justify-end gap-2 font-mono text-xs">
            <button 
              onClick={() => setDeletingTaskId(null)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-white/5 text-zinc-300 rounded-lg cursor-pointer font-bold transition-all duration-150"
            >
              Cancel
            </button>
            <button 
              onClick={executeDelete}
              className="px-3 py-1.5 bg-red-650/20 hover:bg-red-650/40 border border-red-500/30 text-red-400 rounded-lg cursor-pointer font-bold transition-all duration-150"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* TASKS LIST */}
      <div className="grid grid-cols-1 gap-2.5">
        {tasks.map(task => {
          const preview = promptPreview(task);
          const isExpanded = expandedPromptId === task.id;
          const fullPrompt = (task.prompt || '').trim();

          return (
            <div 
              key={task.id} 
              className="p-3.5 bg-zinc-950/20 border border-white/5 hover:border-white/10 rounded-2xl flex flex-col gap-2 group transition-all duration-200"
            >
              <div className="flex justify-between items-center gap-2">
                <div className="flex flex-col text-left gap-0.5 max-w-[70%] min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-heading font-semibold text-gray-200 leading-tight text-xs tracking-wide">
                      {task.name}
                    </span>
                    {!task.repeating && (
                      <span className="text-[9px] bg-indigo-550/20 text-indigo-300 border border-indigo-500/10 px-1.5 py-0.5 rounded-full select-none font-bold tracking-wide uppercase">
                        Oneshot
                      </span>
                    )}
                    {fullPrompt && (
                      <span className="text-[9px] bg-cyan-550/15 text-cyan-300/90 border border-cyan-500/15 px-1.5 py-0.5 rounded-full select-none font-bold tracking-wide uppercase">
                        Custom Prompt
                      </span>
                    )}
                  </div>
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] text-zinc-500">
                    <span className="flex items-center gap-1 font-mono font-medium">
                      <Activity size={11} className={task.enabled ? 'text-emerald-500' : 'text-zinc-600'} />
                      {task.schedule}
                    </span>
                    {task.lastRun ? (
                      <span className="font-sans">
                        Last run: {new Date(task.lastRun).toLocaleTimeString()}
                      </span>
                    ) : (
                      <span className="text-zinc-600 italic">Never run</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button 
                    onClick={() => triggerTask(task.id)}
                    title="Trigger Now"
                    className="p-2 bg-cyan-600/15 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-600/25 rounded-xl transition-all duration-200 cursor-pointer active:scale-90"
                  >
                    <RefreshCw size={13} />
                  </button>
                  <button 
                    onClick={() => toggleTask(task)}
                    title={task.enabled ? "Disable Task" : "Enable Task"}
                    className={`p-2 rounded-xl border transition-all duration-200 cursor-pointer active:scale-90 ${task.enabled ? 'bg-emerald-600/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-600/25' : 'bg-zinc-800/15 text-zinc-400 border-white/5 hover:bg-zinc-800/30'}`}
                  >
                    {task.enabled ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                  <button 
                    onClick={() => startEdit(task)}
                    title="Edit Task & Prompt"
                    className="p-2 bg-indigo-650/15 text-indigo-400 border border-indigo-550/20 hover:bg-indigo-650/25 rounded-xl transition-all duration-200 cursor-pointer active:scale-90"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button 
                    onClick={() => setDeletingTaskId(task.id)}
                    title="Delete Task"
                    className="p-2 bg-red-650/15 text-red-400 border border-red-550/20 hover:bg-red-650/25 rounded-xl transition-all duration-200 cursor-pointer active:scale-90"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Prompt preview row */}
              <div className="text-left">
                {fullPrompt ? (
                  <button
                    type="button"
                    onClick={() => setExpandedPromptId(isExpanded ? null : task.id)}
                    className="w-full text-left bg-black/30 border border-white/5 hover:border-cyan-500/15 rounded-xl px-3 py-2 transition-all cursor-pointer"
                  >
                    <div className="flex items-start gap-1.5">
                      <FileText size={11} className="text-cyan-500/70 mt-0.5 shrink-0" />
                      <p className={`text-[10px] text-zinc-400 font-sans leading-relaxed whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-2'}`}>
                        {isExpanded ? fullPrompt : preview}
                      </p>
                    </div>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 px-1 text-[10px] text-zinc-600 italic font-sans">
                    <FileText size={10} className="opacity-50" />
                    Default prompt (based on task name)
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {tasks.length === 0 && !loading && (
          <div className="text-center py-7 text-zinc-600 italic font-mono text-xs border border-dashed border-white/5 rounded-2xl select-none">
            NO COGNITIVE TASKS SCHEDULED.
          </div>
        )}
      </div>
    </div>
  );
};
