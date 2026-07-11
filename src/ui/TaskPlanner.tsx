import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Circle, Clock, AlertCircle } from 'lucide-react';
import { TaskPlan } from '../include/types';

export const TaskPlanner: React.FC<{ plan?: TaskPlan }> = ({ plan }) => {
  if (!plan || !plan.tasks || plan.tasks.length === 0) {
    return (
      <div id="task-planner-empty" className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[400px]">
        <div className="w-20 h-20 rounded-full bg-amber-500/5 flex items-center justify-center mb-6 border border-amber-500/10">
          <Clock className="w-10 h-10 text-amber-500/20" />
        </div>
        <h2 className="text-2xl font-serif italic text-white/80 mb-2">No Active Neural Path</h2>
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-white/30 max-w-xs leading-relaxed">
          The agent has not synthesized a task sequence yet. Ask it to do something complex to trigger planning.
        </p>
      </div>
    );
  }

  return (
    <div id="task-planner" className="p-4 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl font-mono text-xs">
      <div className="flex items-center gap-2 mb-4 text-[#d4d4d8]">
        <Clock className="w-4 h-4 text-amber-500" />
        <span className="uppercase tracking-widest font-bold">Neural Plan: {plan.originalGoal.substring(0, 30)}...</span>
      </div>
      
      <div className="space-y-3">
        {plan.tasks.map((task, idx) => (
          <motion.div 
            key={task.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={`flex items-start gap-3 p-2 rounded ${idx === plan.currentTaskIndex ? 'bg-amber-500/10 border border-amber-500/20' : 'opacity-60'}`}
          >
            <div className="mt-0.5">
              {task.status === 'completed' ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : task.status === 'failed' ? (
                <AlertCircle className="w-4 h-4 text-red-500" />
              ) : (
                <Circle className={`w-4 h-4 ${idx === plan.currentTaskIndex ? 'text-amber-500 animate-pulse' : 'text-[#333]'}`} />
              )}
            </div>
            <div className="flex-1">
              <div className={idx === plan.currentTaskIndex ? 'text-white' : 'text-[#888]'}>
                {task.description}
              </div>
              {idx === plan.currentTaskIndex && (
                <div className="text-[10px] text-amber-500/70 mt-1 uppercase tracking-tighter">
                  Executing segment...
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-[#1A1A1A] flex justify-between items-center text-[10px] text-[#555]">
        <div>PROGRESS: {Math.round(((plan.tasks.filter(t => t.status === 'completed').length) / plan.tasks.length) * 100)}%</div>
        <div className="uppercase">{plan.isComplete ? 'SEQUENCE FINALIZED' : 'NEURAL PATH ACTIVE'}</div>
      </div>
    </div>
  );
};
