import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

interface NeuralBackdropProps {
  activeTab: string;
}

export const NeuralBackdrop: React.FC<NeuralBackdropProps> = ({ activeTab }) => {
  const [backdropType, setBackdropType] = useState<string>(() => {
    return localStorage.getItem('yuihime_stage_backdrop') || 'matrix';
  });
  const [customUrl, setCustomUrl] = useState<string>(() => {
    return localStorage.getItem('yuihime_stage_backdrop_custom') || '';
  });

  useEffect(() => {
    const handleBackdropChanged = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setBackdropType(customEvent.detail.type || 'matrix');
        setCustomUrl(customEvent.detail.customImgUrl || '');
      }
    };

    window.addEventListener('yuihime_backdrop_changed', handleBackdropChanged);
    return () => {
      window.removeEventListener('yuihime_backdrop_changed', handleBackdropChanged);
    };
  }, []);

  const getStyle = (): React.CSSProperties => {
    if (activeTab !== 'stage') {
      return { backgroundColor: '#080808' };
    }

    switch (backdropType) {
      case 'transparent':
        return { backgroundColor: 'transparent' };
      case 'chroma-green':
        return { backgroundColor: '#00ff00' };
      case 'chroma-blue':
        return { backgroundColor: '#0000ff' };
      case 'chroma-cyan':
        return { backgroundColor: '#00ffff' };
      case 'black':
        return { backgroundColor: '#000000' };
      case 'custom':
        if (customUrl) {
          return {
            backgroundImage: `url(${customUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          };
        }
        return { backgroundColor: '#080808' };
      case 'neon':
        return {
          background: 'radial-gradient(circle at center, #1b092e 0%, #050209 100%)'
        };
      case 'matrix':
      default:
        return { backgroundColor: '#080808' };
    }
  };

  return (
    <>
      <div className="absolute inset-0 opacity-10 pointer-events-none z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-amber-500/10 blur-3xl"></div>
      </div>

      {/* Neural Avatar Background - Deepest Layer */}
      <div 
        className="absolute inset-0 transition-all duration-700 z-0"
        style={getStyle()}
      >
        {activeTab !== 'stage' && (
          <>
            <div className="absolute top-0 right-0 p-8 text-[12vw] font-serif italic text-white/[0.02] leading-none pointer-events-none uppercase select-none">Yui_Hime</div>
            <div className="absolute bottom-0 left-0 p-8 text-[12vw] font-serif italic text-white/[0.02] leading-none pointer-events-none uppercase select-none">System_OS</div>
          </>
        )}
        
        {/* If Neon grid background, draw a cute glow grid */}
        {activeTab === 'stage' && backdropType === 'neon' && (
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(236,72,153,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(236,72,153,0.05)_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-35" />
        )}
      </div>
    </>
  );
};
