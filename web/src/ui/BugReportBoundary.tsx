import React from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class BugReportBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Core Logic Disruption Trace:', error, errorInfo);
    // Log to background if possible
    window.dispatchEvent(new CustomEvent('neural_error', { detail: { error, errorInfo } }));
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-red-500/5 scanline" />
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20 relative animate-pulse">
            <span className="text-red-500 text-4xl font-mono">!</span>
          </div>
          <h1 className="text-2xl font-serif italic text-white mb-4 z-10">Neural Disruption Detected</h1>
          <p className="text-white/40 text-[10px] max-w-md mb-8 font-mono uppercase tracking-[0.3em] leading-relaxed z-10">
            The cognitive link has been severed due to a critical runtime exception in the application layer.
          </p>
          <div className="bg-white/5 border border-white/10 p-6 rounded-2xl text-left mb-8 w-full max-w-2xl overflow-auto z-10 backdrop-blur-md">
             <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/10">
               <div className="w-2 h-2 bg-red-500 rounded-full" />
               <span className="text-[10px] font-mono text-white/60 uppercase tracking-widest">Stack Trace: {this.state.error?.name || 'Error'}</span>
             </div>
             <code className="text-[10px] text-red-400 font-mono leading-loose block whitespace-pre-wrap">
               {this.state.error?.message || 'Unknown neural corruption'}
               {"\n\n"}
               {this.state.error?.stack?.substring(0, 500)}...
             </code>
          </div>
          <div className="flex gap-4 z-10">
            <button 
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="px-6 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-red-400 text-[10px] uppercase tracking-widest transition-all font-bold"
            >
              Emergency Wipe & Reset
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/80 text-[10px] uppercase tracking-widest transition-all font-bold"
            >
              Re-establish Link
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
