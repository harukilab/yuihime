import React, { useState, useEffect } from 'react';
import { SystemRegistry } from '@shared/core/registry';
import { Activity, Cpu, Play, Square, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';

export const SubAgentManagerPanel: React.FC = () => {
  const [agents, setAgents] = useState<any[]>([]);
  const [activeRuns, setActiveRuns] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshData = async () => {
    try {
      const [agentsRes, runsRes] = await Promise.all([
        fetch('/api/sub-agents'),
        fetch('/api/sub-agents/active-runs')
      ]);
      if (agentsRes.ok) setAgents(await agentsRes.json());
      if (runsRes.ok) setActiveRuns(await runsRes.json());
    } catch (e) {
      console.error('Failed to load sub-agent data:', e);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise(r => setTimeout(r, 500));
    refreshData();
    setIsRefreshing(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Cpu className="w-6 h-6 text-cyan-400" />
            Sub-Agent Management
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Monitor and manage specialized sub-agents spawned by Yui
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
        >
          <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <div className="text-zinc-400 text-sm">Registered Agents</div>
          <div className="text-3xl font-bold text-white mt-1">{agents.length}</div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <div className="text-zinc-400 text-sm">Active Runs</div>
          <div className="text-3xl font-bold text-cyan-400 mt-1">{activeRuns.length}</div>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <div className="text-zinc-400 text-sm">System Status</div>
          <div className="text-3xl font-bold text-emerald-400 mt-1">Online</div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Registered Sub-Agents</h3>
        {agents.length === 0 ? (
          <div className="text-zinc-500 text-center py-8">
            No sub-agents registered. Add agent definitions to <code className="text-zinc-400">src/core/agents/definitions/</code>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map((agent) => (
              <div key={agent.id} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-white font-medium">{agent.name}</h4>
                    <p className="text-zinc-400 text-sm mt-1">{agent.description}</p>
                  </div>
                  <span className="px-2 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Ready
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {agent.capabilities.map((cap: string) => (
                    <span key={cap} className="px-2 py-1 rounded-md text-xs bg-zinc-800 text-zinc-300">
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeRuns.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            Active Runs
          </h3>
          <div className="space-y-2">
            {activeRuns.map((run) => (
              <div key={run.id} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">{run.agentId}</div>
                  <div className="text-zinc-400 text-sm">
                    Input: {run.options.input.substring(0, 60)}{run.options.input.length > 60 ? '...' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-zinc-400">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">
                    {((Date.now() - run.startTime) / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
