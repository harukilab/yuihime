import React, { useState, useEffect } from "react";
import { 
  Trash2, 
  Play, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Send 
} from "lucide-react";
import { StorageService } from "@shared/drivers/storage";

interface PendingMessage {
  id: string;
  input: string;
  sender_name: string;
  context_id: string;
  chat_type: string;
  timestamp: number;
  attempts: number;
  status: string;
}

export function PendingQueueManager() {
  const [messages, setMessages] = useState<PendingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingAll, setRetryingAll] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchQueue = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout: server did not respond within 15 seconds.")), 15000)
      );
      const data = await Promise.race([StorageService.getPendingMessages(), timeoutPromise]);
      setMessages(data || []);
    } catch (err: any) {
      console.error("Failed to load pending queue:", err);
      setErrorMsg(err?.message || "Failed to sync queue data from the database.");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleClearQueue = async () => {
    if (!window.confirm("Are you sure you want to clear the entire pending message queue?")) return;
    try {
      setActiveActionId("clear");
      const success = await StorageService.clearPendingQueue();
      if (success) {
        setSuccessMsg("The entire pending message queue was cleared successfully.");
        setMessages([]);
      } else {
        setErrorMsg("Failed to clear the queue.");
      }
    } catch (e: any) {
      setErrorMsg(e.message || "An error occurred.");
    } finally {
      setActiveActionId(null);
    }
  };

  const handleRetryAll = async () => {
    try {
      setRetryingAll(true);
      setSuccessMsg(null);
      setErrorMsg(null);
      const success = await StorageService.retryPendingQueue();
      if (success) {
        setSuccessMsg("Asynchronous resend of the entire queue has been triggered in the background.");
        // Give the background worker some time to run then refresh
        setTimeout(fetchQueue, 3000);
      } else {
        setErrorMsg("Failed to trigger queue resend.");
      }
    } catch (e: any) {
      setErrorMsg(e.message || "A sending error occurred.");
    } finally {
      setRetryingAll(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      setActiveActionId(id);
      const success = await StorageService.deletePendingMessage(id);
      if (success) {
        setMessages(prev => prev.filter(m => m.id !== id));
        setSuccessMsg("Message removed from the queue successfully.");
      } else {
        setErrorMsg("Failed to remove message from the queue.");
      }
    } catch (e: any) {
      setErrorMsg(e.message || "An error occurred.");
    } finally {
      setActiveActionId(null);
    }
  };

  const handleRetrySingle = async (id: string) => {
    try {
      setActiveActionId(`retry_${id}`);
      setSuccessMsg(null);
      setErrorMsg(null);
      const success = await StorageService.retrySinglePendingMessage(id);
      if (success) {
        setSuccessMsg("Message was processed by Yuihime's inner cognition and sent back successfully!");
        // Refresh queue
        fetchQueue();
      } else {
        setErrorMsg("Cognition module failed or returned an empty response. Check your internet or API key.");
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Correction failed, LLM Gateway is still offline.");
    } finally {
      setActiveActionId(null);
    }
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  };

  return (
    <div className="space-y-4 font-sans text-zinc-300">
      
      {/* Alert Messages banner */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-xs animate-fade-in">
          <CheckCircle2 size={15} className="shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl text-xs animate-fade-in">
          <AlertCircle size={15} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111118]/40 border border-white/5 p-4 rounded-2xl">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-bold border border-white/5">
            Total Antrean: {messages.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchQueue}
            disabled={loading}
            className="p-2 bg-zinc-800 hover:bg-zinc-750 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border border-white/5"
            title="Refresh Antrean"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {messages.length > 0 && (
            <>
              {/* Clear Queue Button */}
              <button
                type="button"
                onClick={handleClearQueue}
                disabled={activeActionId === "clear"}
                className="p-2 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 text-rose-400 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border border-rose-500/10"
                title="Clear All Queue"
              >
                {activeActionId === "clear" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Trash2 size={13} />
                )}
                <span>Clear All</span>
              </button>

              {/* Retry All button */}
              <button
                type="button"
                onClick={handleRetryAll}
                disabled={retryingAll}
                className="p-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-md"
                title="Resend Entire Queue"
              >
                {retryingAll ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Play size={13} />
                )}
                <span>Retry All Queue</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
          <Loader2 size={24} className="animate-spin text-cyan-400 mb-2" />
          <p className="text-xs font-mono">Syncing queue from database...</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-white/5 rounded-2xl bg-[#0a0a0f]/20">
          <CheckCircle2 size={32} className="mx-auto text-emerald-500/40 mb-3" />
          <p className="text-xs font-bold text-zinc-400">No Pending Queue!</p>
          <p className="text-[11px] text-zinc-600 mt-1 max-w-sm mx-auto">
            All offline messages or cognition errors have been delivered, discarded, or fully processed by Yuihime's inner self.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
          {messages.map((msg) => {
            const isSingleRetrying = activeActionId === `retry_${msg.id}`;
            const isDeleting = activeActionId === msg.id;

            return (
              <div 
                key={msg.id} 
                className="bg-[#101018]/60 border border-white/5 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-white/10"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                    <span className="px-2 py-0.5 rounded bg-cyan-950/40 text-cyan-400 font-bold border border-cyan-500/10">
                      {msg.chat_type || "Unknown Channel"}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 font-bold border border-white/5">
                      Sender: @{msg.sender_name}
                    </span>
                    <span className="text-zinc-500 font-medium">
                      {formatTime(msg.timestamp)}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded font-extrabold tracking-wide uppercase ${
                      msg.status === "failed" 
                        ? "bg-rose-950/40 text-rose-400 border border-rose-500/10"
                        : "bg-amber-950/40 text-amber-400 border border-amber-500/10"
                    }`}>
                      {msg.status} (Attempts: {msg.attempts}/5)
                    </span>
                  </div>

                  <p className="text-xs text-zinc-200 bg-black/20 p-2.5 rounded-xl border border-white/[0.03] break-words font-mono line-clamp-3" title={msg.input}>
                    "{msg.input}"
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 justify-end">
                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(msg.id)}
                    disabled={isDeleting || isSingleRetrying}
                    className="p-2 hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 rounded-xl transition-all active:scale-95 disabled:opacity-50 cursor-pointer border border-transparent hover:border-rose-500/10"
                    title="Manually remove from queue"
                  >
                    {isDeleting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>

                  {/* Manual trigger retry button */}
                  <button
                    type="button"
                    onClick={() => handleRetrySingle(msg.id)}
                    disabled={isDeleting || isSingleRetrying}
                    className="px-3 py-1.5 bg-cyan-950/40 hover:bg-cyan-900 border border-cyan-500/20 text-cyan-400 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                    title="Try reprocessing this message now"
                  >
                    {isSingleRetrying ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Send size={12} />
                    )}
                    <span>Retry</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-[10px] text-zinc-500 mt-2 flex items-center gap-1.5 border-t border-white/5 pt-2 font-mono">
        <AlertCircle size={11} />
        <span>The system will automatically retry sending every 30 seconds once the inner LLM neural connection is back online.</span>
      </div>

    </div>
  );
}
