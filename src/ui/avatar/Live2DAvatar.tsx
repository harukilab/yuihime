import React, { useState, useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display';
import { MoodState } from '../../include/types';
import { getActiveVowel } from './vowelExtractor';
import { getBaseUrl, resolveModelUrl, HIYORI_ALTERNATIVES } from './avatarUtils';
import { SpeechService } from '../../core/speech';
import { useSpeechSync } from './useSpeechSync';
import { useCustomExpressions } from './useCustomExpressions';
import { useGazeTracking } from './useGazeTracking';

// Establish PIXI globally for Live2D subsystems that expect it
if (typeof window !== 'undefined') {
  const mutableTarget: any = {};
  (window as any).PIXI = new Proxy(mutableTarget, {
    set(target, prop, value) {
      if (prop === 'live2d') {
        (window as any)._pixi_live2d = value;
      }
      target[prop] = value;
      return true;
    },
    get(target, prop) {
      if (prop === 'live2d') return (window as any)._pixi_live2d;
      if (prop in target) return target[prop];
      return Reflect.get(PIXI, prop);
    }
  });
  // Ensure the internal live2d object is initialized
  (window as any)._pixi_live2d = (window as any)._pixi_live2d || {};
}

// Register Ticker for Live2D
try {
  Live2DModel.registerTicker(PIXI.Ticker);
} catch (e) {
  console.warn("Live2D: Ticker registration warning:", e);
}

interface Live2DAvatarProps {
  mood: MoodState;
  status: string;
  modelUrl: string;
  scale?: number;
  xOffset?: number;
  yOffset?: number;
  isTyping?: boolean;
  isSpeaking?: boolean;
  volume: number;
  typedSubtitle?: string;
  activeSubtitle?: string;
  animations?: string[];
  isActive?: boolean;
  disableMouseTracking?: boolean;
  onLoadingStateChange: (isLoading: boolean) => void;
  onLoadError: () => void;
}

export const Live2DAvatar: React.FC<Live2DAvatarProps> = ({
  mood,
  status,
  modelUrl,
  scale = 1,
  xOffset = 0,
  yOffset = 0,
  isTyping,
  isSpeaking,
  volume,
  typedSubtitle = '',
  activeSubtitle = '',
  animations = [],
  isActive = true,
  disableMouseTracking = false,
  onLoadingStateChange,
  onLoadError
}) => {
  const pixiContainerRef = useRef<HTMLDivElement>(null);
  const pixiApp = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Modular Speech Synchronization
  const {
    isSpeakingRef,
    volumeRef,
    typedSubtitleRef,
    activeSubtitleRef,
    currentVowel,
  } = useSpeechSync({
    isSpeaking,
    volume,
    typedSubtitle,
    activeSubtitle,
  });

  // Modular Custom Expressions
  const {
    customExpressions,
    customExpressionsRef,
  } = useCustomExpressions();

  // Modular Gaze & Saccade Tracking
  const {
    gazeOverrideRef,
    gazeTimeoutRef,
    currentGazeX,
    currentGazeY,
    setGazeOverride,
    updateGaze,
  } = useGazeTracking({
    disableMouseTracking,
    status,
    isSpeakingRef,
  });

  // Procedural Animation State
  const procOffset = useRef({ x: 0, y: 0, z: 0 });
  const procEyeOverride = useRef<{ left: number | null; right: number | null }>({ left: null, right: null });

  // Tracking refs specific to Live2D loops
  const isTypingRef = useRef(false);
  const activeAnimationsRef = useRef<string[]>([]);

  // Sync props to refs
  useEffect(() => { isTypingRef.current = !!isTyping; }, [isTyping]);
  useEffect(() => { activeAnimationsRef.current = animations || []; }, [animations]);

  // Real-time organic animation tracking
  const nextBlinkTime = useRef(0);
  const blinkEndTime = useRef(0);
  const isDoubleBlinking = useRef(false);
  const doubleBlinkTime = useRef(0);
  const lastHeadPatTime = useRef(0);
  const lastTextLength = useRef(0);
  const lastMouthOpen = useRef(0);
  const currentMouthForm = useRef(0);

  const headTrackingOffset = useRef({ x: 0, y: 0, z: 0 });
  const headTrackingVelocity = useRef({ x: 0, y: 0, z: 0 });

  const triggeredWordsRef = useRef<Set<string>>(new Set());
  const tempExpressionOverride = useRef<{ name: string; weight: number; endTime: number } | null>(null);
  const tempBlushOverride = useRef<{ weight: number; endTime: number } | null>(null);

  const lastInstructionTimeRef = useRef<number>(0);
  const activeTimeoutsRef = useRef<any[]>([]);
  const isExecutingInstructionRef = useRef<boolean>(false);

  // References for smoothing facial parameters and avoiding sudden glitches
  const smoothEyeSmile = useRef(0);
  const smoothMouthForm = useRef(0);
  const smoothCheek = useRef(0);
  const smoothBrowInnerY = useRef(0);

  const performProceduralBlink = () => {
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      if (frame < 3) procEyeOverride.current = { left: 0, right: 0 };
      else if (frame < 6) procEyeOverride.current = { left: 0.5, right: 0.5 };
      else {
        clearInterval(interval);
        procEyeOverride.current = { left: null, right: null };
      }
    }, 40);
  };

  const performProceduralWink = () => {
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      if (frame < 5) procEyeOverride.current = { left: 0, right: 1 };
      else if (frame < 18) procEyeOverride.current = { left: 0, right: 1 };
      else if (frame < 28) {
        const ratio = (frame - 18) / 10;
        procEyeOverride.current = { left: ratio, right: 1 };
      } else {
        clearInterval(interval);
        procEyeOverride.current = { left: null, right: null };
      }
    }, 50);
  };

  const performProceduralNod = () => {
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      const decay = Math.max(0, 1 - frame / 40);
      procOffset.current.y = Math.sin(frame * 0.2) * 22 * decay;
      procOffset.current.z = Math.sin(frame * 0.1) * 5 * decay;
      if (frame >= 40) {
        clearInterval(interval);
        procOffset.current.y = 0;
        procOffset.current.z = 0;
      }
    }, 45);
  };

  const performProceduralShake = () => {
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      const decay = Math.max(0, 1 - frame / 45);
      procOffset.current.x = Math.sin(frame * 0.25) * 28 * decay;
      if (frame >= 45) {
        clearInterval(interval);
        procOffset.current.x = 0;
      }
    }, 40);
  };

  const performProceduralShiver = () => {
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      const decay = Math.max(0, 1 - frame / 50);
      procOffset.current.x = Math.sin(frame * 1.5) * 4.5 * decay;
      procOffset.current.y = Math.cos(frame * 1.7) * 3.0 * decay;
      if (frame >= 50) {
        clearInterval(interval);
        procOffset.current.x = 0;
        procOffset.current.y = 0;
      }
    }, 25);
  };

  const clearActiveTimeouts = () => {
    activeTimeoutsRef.current.forEach(t => clearTimeout(t));
    activeTimeoutsRef.current = [];
  };

  // Status animations
  useEffect(() => {
    if (modelRef.current && status && !isExecutingInstructionRef.current) {
      const lowerStatus = status.toLowerCase();
      const model = modelRef.current;
      
      if (lowerStatus === 'learning' || lowerStatus === 'reflecting' || lowerStatus === 'thinking') {
        if (typeof model.motion === 'function') {
          model.motion('Think', 0, 2);
        }
      } else if (lowerStatus === 'dreaming' || lowerStatus === 'sleeping') {
        if (typeof model.motion === 'function') {
          model.motion('Sleep', 0, 2) || model.motion('Idle', 0, 2);
        }
      } else if (lowerStatus === 'awake' || lowerStatus === 'idle') {
        if (typeof model.motion === 'function') {
          model.motion('Wave', 0, 2) || model.motion('Idle', 0, 2);
        }
      }
    }
  }, [status]);

  // Sequence anims
  useEffect(() => {
    if (animations.length > 0 && modelRef.current) {
      console.log('[AVATAR] Mapped animations instruction set received:', animations);
      const model = modelRef.current;
      clearActiveTimeouts();
      isExecutingInstructionRef.current = true;
      lastInstructionTimeRef.current = Date.now();

      if (model.internalModel?.motionManager && typeof model.internalModel.motionManager.stopAllMotions === 'function') {
        model.internalModel.motionManager.stopAllMotions();
      }

      animations.forEach((anim, index) => {
        const timeout = setTimeout(() => {
          if (!modelRef.current) return;
          const currentModel = modelRef.current;
          const lowerAnim = anim.toLowerCase();
          
          lastInstructionTimeRef.current = Date.now();

          // Gaze offsets
          if (lowerAnim.includes('left') || lowerAnim.includes('kiri')) gazeOverrideRef.current = { x: -0.8, y: 0.1 };
          else if (lowerAnim.includes('right') || lowerAnim.includes('kanan')) gazeOverrideRef.current = { x: 0.8, y: 0.1 };
          else if (lowerAnim.includes('up') || lowerAnim.includes('atas')) gazeOverrideRef.current = { x: 0, y: -0.7 };
          else if (lowerAnim.includes('down') || lowerAnim.includes('bawah')) gazeOverrideRef.current = { x: 0, y: 0.7 };
          else if (lowerAnim.includes('center') || lowerAnim.includes('pusat')) gazeOverrideRef.current = { x: 0, y: 0 };

          if (lowerAnim.includes('look') || lowerAnim.includes('lirik') || lowerAnim.includes('tengok')) {
             if (gazeTimeoutRef.current) clearTimeout(gazeTimeoutRef.current);
             gazeTimeoutRef.current = setTimeout(() => { gazeOverrideRef.current = null; }, 3500);
          }

          if (lowerAnim === 'blink' || lowerAnim === 'kedip') performProceduralBlink();
          else if (lowerAnim === 'wink') performProceduralWink();
          else if (lowerAnim === 'shiver' || lowerAnim === 'gemetar') performProceduralShiver();

          let expressionToPlay = '';
          let motionGroupToPlay = '';
          let motionIndexToPlay = 0;
          let triggerNod = false;
          let triggerShake = false;

          const matchingCustomExpr = customExpressionsRef.current?.find(e => e.key === lowerAnim || e.key === anim.toLowerCase());

          if (matchingCustomExpr) {
            expressionToPlay = matchingCustomExpr.expressionId || '';
            motionGroupToPlay = matchingCustomExpr.motionGroup || '';
            motionIndexToPlay = Number(matchingCustomExpr.motionIndex) || 0;
            if (matchingCustomExpr.key === 'nod' || matchingCustomExpr.key.includes('nod') || matchingCustomExpr.key.includes('angguk')) triggerNod = true;
            if (matchingCustomExpr.key === 'shake' || matchingCustomExpr.key.includes('shake') || matchingCustomExpr.key.includes('geleng')) triggerShake = true;
          } else if (lowerAnim.includes('smile') || lowerAnim.includes('senyum')) {
            expressionToPlay = 'f01';
            motionGroupToPlay = 'Idle';
            motionIndexToPlay = 1;
          } else if (lowerAnim.includes('laugh') || lowerAnim.includes('tawa') || lowerAnim.includes('ketawa') || lowerAnim.includes('tertawa') || lowerAnim.includes('haha') || lowerAnim.includes('wkwk')) {
            expressionToPlay = 'f02';
            motionGroupToPlay = 'Tap';
            motionIndexToPlay = 1;
          } else if (lowerAnim.includes('embarrassed') || lowerAnim.includes('malu') || lowerAnim.includes('blush') || lowerAnim.includes('uwu') || lowerAnim.includes('salting')) {
            expressionToPlay = 'f07';
            motionGroupToPlay = 'Idle';
            motionIndexToPlay = 2;
          } else if (lowerAnim.includes('angry') || lowerAnim.includes('marah') || lowerAnim.includes('kesal') || lowerAnim.includes('sebal') || lowerAnim.includes('benci')) {
            expressionToPlay = 'f05';
            motionGroupToPlay = 'Tap';
            motionIndexToPlay = 0;
          } else if (lowerAnim.includes('sad') || lowerAnim.includes('sedih') || lowerAnim.includes('hiks') || lowerAnim.includes('kecewa')) {
            expressionToPlay = 'f03';
            motionGroupToPlay = 'Idle';
            motionIndexToPlay = 2;
          } else if (lowerAnim.includes('surprise') || lowerAnim.includes('kaget') || lowerAnim.includes('terkejut') || lowerAnim.includes('serius')) {
            expressionToPlay = 'f06';
            motionGroupToPlay = 'Tap';
            motionIndexToPlay = 0;
          } else if (lowerAnim.includes('think') || lowerAnim.includes('pikir') || lowerAnim.includes('mikir')) {
            expressionToPlay = 'f04';
            motionGroupToPlay = 'Idle';
            motionIndexToPlay = 2;
          } else if (lowerAnim.includes('nod') || lowerAnim.includes('angguk')) {
            expressionToPlay = 'f01';
            motionGroupToPlay = 'Tap';
            motionIndexToPlay = 1;
            triggerNod = true;
          } else if (lowerAnim.includes('shake') || lowerAnim.includes('geleng')) {
            motionGroupToPlay = 'Idle';
            motionIndexToPlay = 2;
            triggerShake = true;
          } else if (lowerAnim.includes('shiver') || lowerAnim.includes('gemetar')) {
            expressionToPlay = 'f03';
            motionGroupToPlay = 'Idle';
            motionIndexToPlay = 2;
          } else if (lowerAnim.includes('wave') || lowerAnim.includes('lambai') || lowerAnim.includes('melambai') || lowerAnim.includes('greeting') || lowerAnim.includes('halo') || lowerAnim.includes('hai')) {
            expressionToPlay = 'f01';
            motionGroupToPlay = 'Tap';
            motionIndexToPlay = 1;
          }

          if (expressionToPlay && typeof currentModel.expression === 'function') {
            currentModel.expression(expressionToPlay) || currentModel.expression(expressionToPlay.toUpperCase());
          } else if (typeof currentModel.expression === 'function') {
            currentModel.expression(anim) || currentModel.expression(lowerAnim);
          }

          if (triggerNod) performProceduralNod();
          if (triggerShake) performProceduralShake();

          let triedExact = false;
          if (typeof currentModel.motion === 'function') {
            const groups = Object.keys(currentModel.internalModel?.motionManager?.motionGroups || {});
            let foundGroup = groups.find(g => g.toLowerCase() === lowerAnim);
            if (!foundGroup) {
              foundGroup = groups.find(g => g.toLowerCase().includes(lowerAnim));
            }
            if (foundGroup) {
              currentModel.motion(foundGroup, 0, 3);
              triedExact = true;
            }
            if (!triedExact && motionGroupToPlay) {
              const fallbackGroup = groups.find(g => g.toLowerCase() === motionGroupToPlay.toLowerCase());
              if (fallbackGroup) {
                currentModel.motion(fallbackGroup, motionIndexToPlay, 3);
              }
            }
          }

          if (index === animations.length - 1) {
             setTimeout(() => {
               isExecutingInstructionRef.current = false;
             }, 5000);
          }
        }, 500 + (index * 3000));
        activeTimeoutsRef.current.push(timeout);
      });
    }
    return () => clearActiveTimeouts();
  }, [animations]);

  // Handle position parameters dynamically
  useEffect(() => {
    if (pixiApp.current && modelRef.current && !modelRef.current.destroyed && modelRef.current.scale) {
      const app = pixiApp.current;
      const model = modelRef.current;
      const margin = 0.9 * scale;
      
      const mWidth = model.internalModel?.width || 1;
      const mHeight = model.internalModel?.height || 1;
      
      const calculatedScale = Math.min(
        app.screen.width / Math.max(1, mWidth),
        app.screen.height / Math.max(1, mHeight)
      ) * margin;

      if (model.scale) {
        model.scale.set(calculatedScale);
      }
      model.x = (app.screen.width / 2) + xOffset;
      model.y = (app.screen.height / 2) + yOffset;
    }
  }, [scale, xOffset, yOffset]);

  // Initialize/Destruct PIXI core
  useEffect(() => {
    let active = true;
    let retryCount = 0;
    const maxRetries = 20;

    async function initPixi() {
      if (!pixiContainerRef.current || !active) return;
      onLoadingStateChange(true);

      try {
        if (pixiContainerRef.current.replaceChildren) {
          pixiContainerRef.current.replaceChildren();
        } else {
          pixiContainerRef.current.innerHTML = '';
        }
      } catch (e) {
        console.warn("Live2D: Container clear warning:", e);
      }

      if (pixiApp.current) {
        try {
          pixiApp.current.destroy(false, { children: true, texture: true, baseTexture: true });
        } catch (e) {
          console.warn("Live2D: Cleanup warning:", e);
        }
        pixiApp.current = null;
      }
      modelRef.current = null;

      const injectScript = (id: string, sources: string[]) => {
        return new Promise<void>(async (resolve) => {
          if (document.getElementById(id)) {
            resolve();
            return;
          }
          for (const src of sources) {
            try {
              await new Promise<void>((res, rej) => {
                const s = document.createElement('script');
                s.id = id;
                s.src = src;
                s.async = true;
                const timeout = setTimeout(() => rej(new Error('Timeout')), 15000);
                s.onload = () => {
                  clearTimeout(timeout);
                  res();
                };
                s.onerror = () => {
                  clearTimeout(timeout);
                  rej(new Error('Error'));
                };
                document.head.appendChild(s);
              });
              resolve();
              return;
            } catch (e) {
              const failed = document.getElementById(id);
              if (failed) failed.remove();
            }
          }
          resolve();
        });
      };

      if (!(window as any).Live2D) {
        await injectScript('l2d-c2', [
          getBaseUrl() + '/lib/live2d/live2d.min.js',
          'https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js',
          'https://cubism.live2d.com/sdk-web/bin/live2d.min.js'
        ]);
      }
      if (!(window as any).Live2DCubismCore && !(window as any).CubismCore) {
        await injectScript('l2d-c4', [
          getBaseUrl() + '/lib/live2d/live2dcubismcore.min.js',
          'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
          'https://cdn.jsdelivr.net/npm/live2dcubismcore@1.0.2/live2dcubismcore.min.js'
        ]);
      }

      await new Promise(r => setTimeout(r, 500));

      const isC2Ready = !!(window as any).Live2D;
      const isC4Ready = !!(window as any).Live2DCubismCore || !!(window as any).CubismCore;

      if (!isC2Ready || !isC4Ready) {
        if (retryCount < maxRetries && active) {
          retryCount++;
          setTimeout(() => { if (active) initPixi(); }, 1000);
          return;
        } else if (active) {
          onLoadError();
          onLoadingStateChange(false);
          return;
        }
      }

      try {
        if (!Live2DModel) {
          onLoadError();
          onLoadingStateChange(false);
          return;
        }

        const resolvedUrl = resolveModelUrl(modelUrl);
        if (!resolvedUrl || resolvedUrl.trim() === '') {
           onLoadError();
           onLoadingStateChange(false);
           return;
        }

        const app = new PIXI.Application({
          width: pixiContainerRef.current?.clientWidth || 800,
          height: pixiContainerRef.current?.clientHeight || 600,
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true
        });

        if (!active) {
           app.destroy(true);
           return;
        }

        if (!app.renderer.plugins.interaction) {
          (app.renderer.plugins as any).interaction = app.renderer.events;
        }

        if (pixiContainerRef.current && active) {
          if (!pixiContainerRef.current.contains(app.view as HTMLCanvasElement)) {
            pixiContainerRef.current.appendChild(app.view as HTMLCanvasElement);
          }
        }
        
        const lastMousePos = { x: app.screen.width / 2, y: app.screen.height / 2 };
        if (!disableMouseTracking) {
          app.stage.eventMode = 'static';
          app.stage.hitArea = app.screen;
          app.stage.on('pointermove', (e) => {
            lastMousePos.x = e.global.x;
            lastMousePos.y = e.global.y;
          });
        }

        const refitModel = () => {
          if (!active || !pixiContainerRef.current || !pixiApp.current || !modelRef.current || modelRef.current.destroyed || !modelRef.current.transform) return;
          const currentApp = pixiApp.current;
          const container = pixiContainerRef.current;
          const model = modelRef.current;

          const currentWidth = container.clientWidth || 0;
          const currentHeight = container.clientHeight || 0;

          if (currentWidth === 0 || currentHeight === 0) {
            requestAnimationFrame(refitModel);
            return;
          }

          if (currentApp.renderer) {
            currentApp.renderer.resize(currentWidth, currentHeight);
          }

          if (model && model.internalModel) {
            const mWidth = model.internalModel.width || 0;
            const mHeight = model.internalModel.height || 0;

            if (mWidth <= 10 || mHeight <= 10) {
              if (model.scale) {
                model.scale.set(0.18 * scale);
              }
              requestAnimationFrame(refitModel);
              return;
            }

            const margin = 0.9 * scale;
            const calculatedScale = Math.min(
              currentWidth / mWidth,
              currentHeight / mHeight
            ) * margin;

            if (model.scale) {
              model.scale.set(calculatedScale);
            }
            model.x = (currentWidth / 2) + xOffset;
            model.y = (currentHeight / 2) + yOffset;

            if (model.anchor) {
              model.anchor.set(0.5, 0.5);
            } else {
              model.pivot.set(mWidth / 2, mHeight / 2);
            }
          }
        };

        const lastDims = { width: 0, height: 0 };
        const resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect;
            if (Math.abs(width - lastDims.width) < 1 && Math.abs(height - lastDims.height) < 1) {
              continue;
            }
            lastDims.width = width;
            lastDims.height = height;
            window.requestAnimationFrame(() => refitModel());
          }
        });
        
        resizeObserverRef.current = resizeObserver;
        if (pixiContainerRef.current) {
          resizeObserver.observe(pixiContainerRef.current);
        }

        pixiApp.current = app;

        let model: any;
        try {
          model = await (Live2DModel as any).from(resolvedUrl, {
            autoHitTest: true,
            autoFocus: !disableMouseTracking && localStorage.getItem('yuihime_disable_autofocus') !== 'true',
            crossOrigin: 'anonymous'
          });
        } catch (mErr) {
          let secondaryUrl = resolvedUrl;
          if (resolvedUrl.includes('cdn.jsdelivr.net')) {
             secondaryUrl = resolvedUrl.replace('cdn.jsdelivr.net', 'fastly.jsdelivr.net');
          } else if (resolvedUrl.includes('raw.githubusercontent.com')) {
             secondaryUrl = resolvedUrl.replace('raw.githubusercontent.com', 'cdn.jsdelivr.net/gh').replace('/4-r.1/', '@4-r.1/');
          }

          try {
            model = await (Live2DModel as any).from(secondaryUrl, { 
              autoHitTest: true, 
              autoFocus: !disableMouseTracking && localStorage.getItem('yuihime_disable_autofocus') !== 'true', 
              crossOrigin: 'anonymous' 
            });
          } catch (m2Err) {
            if (modelUrl.toLowerCase().includes('hiyo') || modelUrl.toLowerCase().includes('hyo')) {
              for (const alt of HIYORI_ALTERNATIVES) {
                if (alt === resolvedUrl || alt === secondaryUrl) continue;
                try {
                   model = await (Live2DModel as any).from(alt, { 
                     autoHitTest: true, 
                     autoFocus: !disableMouseTracking && localStorage.getItem('yuihime_disable_autofocus') !== 'true',
                     crossOrigin: 'anonymous'
                    });
                   if (model) break;
                } catch (e) {
                   // Ignore alt model load failures
                }
              }
            }

            if (!model) {
              try {
                const stableUrl = getBaseUrl() + '/models/hiyori/hiyori_free_t08.model3.json';
                model = await (Live2DModel as any).from(stableUrl, { 
                  autoHitTest: true, 
                  autoFocus: !disableMouseTracking && localStorage.getItem('yuihime_disable_autofocus') !== 'true',
                  crossOrigin: 'anonymous'
                });
              } catch (fErr) {
                throw m2Err;
              }
            }
          }
        }

        if (!active || !pixiApp.current) {
          if (model) (model as any).destroy();
          return;
        }

        modelRef.current = model;
        app.stage.addChild(model as any);
        refitModel();

        [50, 150, 300, 600, 1200, 2000].forEach(delay => {
          setTimeout(() => { if (active) refitModel(); }, delay);
        });

        if (model && !model.internalModel) {
          model.x = (app.screen.width / 2) + xOffset;
          model.y = (app.screen.height / 2) + yOffset;
        }

        if (model) {
          if (model.anchor) {
            model.anchor.set(0.5, 0.5);
          } else if (model.internalModel) {
            model.pivot.set(model.internalModel.width / 2, model.internalModel.height / 2);
          }
        }

        if (typeof model.on === 'function') {
          model.on('hit', (hitAreas: string[]) => {
            if (hitAreas.includes('Head') || hitAreas.includes('Face')) {
              lastHeadPatTime.current = Date.now();
              performProceduralNod();
              performProceduralWink();
              if (typeof model.motion === 'function') {
                const headMotions = ['Surprise', 'Blush', 'Think', 'Malu', 'Nod'];
                for (const m of headMotions) {
                   if (model.motion(m, 0, 2)) break;
                }
              }
            } else if (hitAreas.includes('Body')) {
              if (typeof model.motion === 'function') {
                model.motion('TapBody', 0, 2) || model.motion('Wave', 0, 2);
              }
            } else {
              performProceduralBlink();
            }
          });

          model.interactive = true;
          model.on('pointertap', (e: any) => {
            const ripple = new PIXI.Graphics();
            ripple.lineStyle(2, 0xFBBF24, 0.8);
            ripple.drawCircle(0, 0, 10);
            ripple.position.set(e.global.x, e.global.y);
            app.stage.addChild(ripple);

            let rippleScale = 1;
            let rippleAlpha = 0.8;

            const animateRipple = () => {
              rippleScale += 0.15;
              rippleAlpha -= 0.04;
              ripple.scale.set(rippleScale);
              ripple.alpha = rippleAlpha;

              if (rippleAlpha <= 0) {
                app.stage.removeChild(ripple);
                ripple.destroy();
                app.ticker.remove(animateRipple);
              }
            };
            app.ticker.add(animateRipple);

            if (e.global.y < (app.screen.height * 0.48)) {
               lastHeadPatTime.current = Date.now();
               performProceduralNod();
               if (Math.random() < 0.3) {
                  performProceduralWink();
               } else {
                  performProceduralBlink();
               }
            }
          });

          model.on('pointerover', () => {
             if (pixiContainerRef.current) pixiContainerRef.current.style.cursor = 'pointer';
          });
          model.on('pointerout', () => {
             if (pixiContainerRef.current) pixiContainerRef.current.style.cursor = 'default';
          });
        }

        let lastIdleMotionTime = 0;
        let wasSpeaking = false;

        app.ticker.add(() => {
          if (modelRef.current) {
            const time = Date.now() / 1000;
            const nowMs = Date.now();
            
            // mass-spring dampers
            const springK = 0.05;
            const springD = 0.14;
            
            const forceX = -springK * headTrackingOffset.current.x - springD * headTrackingVelocity.current.x;
            const forceY = -springK * headTrackingOffset.current.y - springD * headTrackingVelocity.current.y;
            const forceZ = -springK * headTrackingOffset.current.z - springD * headTrackingVelocity.current.z;
            
            headTrackingVelocity.current.x += forceX;
            headTrackingVelocity.current.y += forceY;
            headTrackingVelocity.current.z += forceZ;
            
            headTrackingOffset.current.x += headTrackingVelocity.current.x;
            headTrackingOffset.current.y += headTrackingVelocity.current.y;
            headTrackingOffset.current.z += headTrackingVelocity.current.z;

            const currentText = typedSubtitleRef.current || '';
            if (currentText.length > lastTextLength.current) {
               const lastChar = currentText[currentText.length - 1];
               if (lastChar === '?') {
                  headTrackingVelocity.current.y = -2.8;
                  headTrackingVelocity.current.z = -3.8;
               } else if (lastChar === '!') {
                  headTrackingVelocity.current.y = 3.8;
                  headTrackingVelocity.current.x = Math.random() < 0.5 ? -2.2 : 2.2;
               } else if (lastChar === '.' || lastChar === '…') {
                  headTrackingVelocity.current.y = 2.4;
               } else if (lastChar === ',') {
                  headTrackingVelocity.current.z = 2.8;
               } else if (lastChar !== ' ') {
                  headTrackingVelocity.current.y += (Math.random() - 0.5) * 0.18;
                  headTrackingVelocity.current.x += (Math.random() - 0.5) * 0.18;
               }

               // Real-time keyword mappings to trigger visual reactions
               const lowerText = currentText.toLowerCase();
               const rtKeywords = [
                 { keys: ['wkwk', 'haha', 'hihi', 'hehe', 'kocak', 'gokil', 'tertawa', 'tawa'], action: 'laugh' },
                 { keys: ['senang', 'gembira', 'bahagia', 'suka', 'lucu', 'imut', 'cantik', 'gemas', 'bagus', 'keren', 'terima kasih', 'makasih'], action: 'smile' },
                 { keys: ['ya', 'iya', 'betul', 'benar', 'setuju', 'paham', 'mengerti', 'siap', 'oke', 'okey', 'pastinya', 'pasti'], action: 'nod' },
                 { keys: ['tidak', 'bukan', 'nggak', 'jangan', 'salah', 'tidak tahu', 'bingung', 'enggan'], action: 'shake' },
                 { keys: ['hah', 'apa', 'eh', 'wah', 'kaget', 'terkejut', 'serius', 'wow', 'astaga', 'waduh', 'lah'], action: 'surprise' },
                 { keys: ['hm', 'hmm', 'em', 'pikir', 'mikir', 'mungkin', 'entahlah', 'sepertinya', 'kenapa', 'mengapa'], action: 'think' },
                 { keys: ['sedih', 'nangis', 'hiks', 'maaf', 'lemas', 'kecewa', 'sepi', 'kesepian', 'sakit'], action: 'sad' },
                 { keys: ['marah', 'kesal', 'benci', 'sebal', 'tidak suka', 'bodoh', 'berisik', 'menyebalkan'], action: 'angry' },
                 { keys: ['malu', 'salting', 'salah tingkah', 'uwu', 'deg-deg', 'terharu', 'sayang', 'cinta'], action: 'blush' }
               ];

               for (const item of rtKeywords) {
                 for (const key of item.keys) {
                   if (lowerText.includes(key) && !triggeredWordsRef.current.has(key)) {
                     triggeredWordsRef.current.add(key);
                     console.log(`[REAL-TIME-L2D] Triggered real-time visual reaction for word: "${key}" (Action: ${item.action})`);
                     
                     if (item.action === 'nod') {
                       performProceduralNod();
                     } else if (item.action === 'shake') {
                       performProceduralShake();
                     } else if (item.action === 'laugh') {
                       performProceduralBlink();
                       tempExpressionOverride.current = { name: 'happy', weight: 1.0, endTime: Date.now() + 2500 };
                     } else if (item.action === 'smile') {
                       tempExpressionOverride.current = { name: 'happy', weight: 0.85, endTime: Date.now() + 2000 };
                     } else if (item.action === 'surprise') {
                       performProceduralBlink();
                       tempExpressionOverride.current = { name: 'relaxed', weight: 0.0, endTime: Date.now() + 2000 };
                     } else if (item.action === 'think') {
                       performProceduralNod();
                     } else if (item.action === 'sad') {
                       tempExpressionOverride.current = { name: 'sad', weight: 0.8, endTime: Date.now() + 4000 };
                     } else if (item.action === 'angry') {
                       tempExpressionOverride.current = { name: 'angry', weight: 0.8, endTime: Date.now() + 3500 };
                     } else if (item.action === 'blush') {
                       gazeOverrideRef.current = { x: Math.random() < 0.5 ? -0.6 : 0.6, y: 0.4 };
                       if (gazeTimeoutRef.current) clearTimeout(gazeTimeoutRef.current);
                       gazeTimeoutRef.current = setTimeout(() => { gazeOverrideRef.current = null; }, 2500);
                       tempExpressionOverride.current = { name: 'relaxed', weight: 0.2, endTime: Date.now() + 3000 };
                       tempBlushOverride.current = { weight: 0.9, endTime: Date.now() + 3000 };
                     }
                     break;
                   }
                 }
               }
               lastTextLength.current = currentText.length;
            } else if (currentText.length === 0) {
               lastTextLength.current = 0;
               triggeredWordsRef.current.clear();
            }

            const motionManager = modelRef.current.internalModel?.motionManager;
            const isPlayingAnyMotion = motionManager ? !motionManager.isFinished() : false;

            if (isSpeakingRef.current && !wasSpeaking) {
               if (motionManager && typeof motionManager.stopAllMotions === 'function') {
                  motionManager.stopAllMotions();
               }
            }
            wasSpeaking = isSpeakingRef.current;

            const timeSinceLastInstruction = nowMs - lastInstructionTimeRef.current;
            if (time - lastIdleMotionTime > 8 && !isPlayingAnyMotion && !isSpeakingRef.current && timeSinceLastInstruction > 6000) {
               const idleMotions = ['Idle', 'LookAt', 'Breath', 'Shake'];
               const randomMotion = idleMotions[Math.floor(Math.random() * idleMotions.length)];
               if (typeof modelRef.current.motion === 'function') {
                  modelRef.current.motion(randomMotion, 0, 1);
               }
               lastIdleMotionTime = time;
            }

            const { gazeX: finalGazeX, gazeY: finalGazeY } = updateGaze(
              time,
              lastMousePos.x,
              lastMousePos.y,
              app.screen.width,
              app.screen.height,
              0.12
            );
            
            const joyVal = mood?.joy || 0;
            const sadnessVal = mood?.sadness || 0;
            const angerVal = mood?.anger || 0;
            const excitementVal = mood?.excitement || 0;
            const embarrassmentVal = mood?.embarrassment || 0;
            const stressVal = mood?.stress || 0;
            const irritationVal = mood?.irritation || 0;

            let breathFreq = 1.2;
            let stepBounce = 0;
            const isAdventureStatus = status?.toLowerCase() === 'ekspedisi' || status?.toLowerCase() === 'expedition' || status?.toLowerCase() === 'adventure';
            const isSleepingStatus = status?.toLowerCase() === 'sleeping';

            if (isAdventureStatus) {
               breathFreq = 2.5;
               stepBounce = Math.abs(Math.sin(time * 5.5)) * 4.5;
            } else if (isSleepingStatus) {
               breathFreq = 0.45;
            } else if (angerVal > 30 || irritationVal > 30) {
               breathFreq = 1.2 + (Math.max(angerVal, irritationVal) / 100) * 1.2;
            } else if (excitementVal > 30 || joyVal > 40) {
               breathFreq = 1.2 + (Math.max(excitementVal, joyVal) / 100) * 0.6;
            } else if (sadnessVal > 30) {
               breathFreq = Math.max(0.55, 1.2 - (sadnessVal / 100) * 0.5);
            } else if (stressVal > 30) {
               breathFreq = 1.2 + (stressVal / 100) * 0.35;
            }

            const breath = (Math.sin(time * breathFreq) + 1) / 2;

            let emotionalSwayScale = 1.0;
            if (sadnessVal > 30) {
              emotionalSwayScale = Math.max(0.6, 1.0 - (sadnessVal / 100) * 0.4);
            } else if (excitementVal > 30 || joyVal > 40) {
              emotionalSwayScale = 1.0 + (Math.max(excitementVal, joyVal) / 100) * 0.4;
            }

            const headSwayZ = Math.sin(time * (isAdventureStatus ? 1.0 : 0.6 * emotionalSwayScale)) * (isAdventureStatus ? 3.5 : 2.0 * emotionalSwayScale);
            const bodySwayX = Math.sin(time * (isAdventureStatus ? 0.8 : 0.4 * emotionalSwayScale)) * (isAdventureStatus ? 2.5 : 1.5 * emotionalSwayScale);

            let eyeOpen = 1.0;
            if (nowMs > nextBlinkTime.current) {
              const blinkDuration = 120;
              blinkEndTime.current = nowMs + blinkDuration;
              if (Math.random() < 0.15 && !isDoubleBlinking.current) {
                isDoubleBlinking.current = true;
                doubleBlinkTime.current = nowMs + blinkDuration + 140;
              } else {
                isDoubleBlinking.current = false;
              }
              nextBlinkTime.current = nowMs + 2500 + Math.random() * 4300;
            }
            
            if (nowMs < blinkEndTime.current) {
              const elapsed = blinkEndTime.current - nowMs;
              eyeOpen = elapsed > 60 ? (elapsed - 60) / 60 : (60 - elapsed) / 60;
            } else if (isDoubleBlinking.current && nowMs > doubleBlinkTime.current) {
              const dDuration = 100;
              const dEndTime = doubleBlinkTime.current + dDuration;
              if (nowMs < dEndTime) {
                const elapsed = dEndTime - nowMs;
                eyeOpen = elapsed > 50 ? (elapsed - 50) / 50 : (50 - elapsed) / 50;
              } else {
                 isDoubleBlinking.current = false;
              }
            }
            
            const finalEyeL = isSleepingStatus ? 0 : (procEyeOverride.current.left !== null ? procEyeOverride.current.left : eyeOpen);
            const finalEyeR = isSleepingStatus ? 0 : (procEyeOverride.current.right !== null ? procEyeOverride.current.right : eyeOpen);

            if (modelRef.current?.internalModel?.coreModel?.setParameterValueById) {
                 const setParam = (id: string, value: number) => {
                   const core = modelRef.current?.internalModel?.coreModel;
                   if (!core) return;

                   let translatedId = id;
                   if (id === 'ParamAngleX') translatedId = 'PARAM_ANGLE_X';
                   else if (id === 'ParamAngleY') translatedId = 'PARAM_ANGLE_Y';
                   else if (id === 'ParamAngleZ') translatedId = 'PARAM_ANGLE_Z';
                   else if (id === 'ParamEyeBallX') translatedId = 'PARAM_EYE_BALL_X';
                   else if (id === 'ParamEyeBallY') translatedId = 'PARAM_EYE_BALL_Y';
                   else if (id === 'ParamEyeLOpen') translatedId = 'PARAM_EYE_L_OPEN';
                   else if (id === 'ParamEyeROpen') translatedId = 'PARAM_EYE_R_OPEN';
                   else if (id === 'ParamEyeOpen') translatedId = 'PARAM_EYE_OPEN';
                   else if (id === 'ParamBreath') translatedId = 'PARAM_BREATH';
                   else if (id === 'ParamBodyAngleX') translatedId = 'PARAM_BODY_ANGLE_X';
                   else if (id === 'ParamBodyAngleY') translatedId = 'PARAM_BODY_ANGLE_Y';
                   else if (id === 'ParamEyeSmile') translatedId = 'PARAM_EYE_SMILE';
                   else if (id === 'ParamMouthForm') translatedId = 'PARAM_MOUTH_FORM';
                   else if (id === 'ParamCheek') translatedId = 'PARAM_CHEEK';
                   else if (id === 'ParamBrowInnerY') translatedId = 'PARAM_BROW_INNER_Y';
                   else if (id === 'ParamMouthOpenY') translatedId = 'PARAM_MOUTH_OPEN_Y';

                   if (core.setParameterValueById) {
                     core.setParameterValueById(id, value);
                     if (translatedId !== id) {
                       core.setParameterValueById(translatedId, value);
                     }
                   }
                   if ((core as any).setParamFloat) {
                     (core as any).setParamFloat(id, value);
                     (core as any).setParamFloat(translatedId, value);
                   }
                 };

                 const activeMouth = isSpeakingRef.current || isTypingRef.current;
                 const text = typedSubtitleRef.current || '';
                 
                 let targetMouthValue = 0;
                 let targetMouthForm = 0.0;
                 let vowel: 'a'|'i'|'u'|'e'|'o'|'consonant'|'pause' = 'pause';

                 if (activeMouth) {
                   if (currentVowel.current === 'pause' || !isSpeakingRef.current) {
                      vowel = getActiveVowel(text);
                      currentVowel.current = vowel;
                    } else {
                      vowel = currentVowel.current;
                    }
                   currentVowel.current = vowel;
                   
                   let volumeScale = 1.0;
                   if (isSpeakingRef.current) {
                     const normalizedVol = Math.max(0, (volumeRef.current - 0.005) * 12);
                     volumeScale = Math.pow(Math.min(1.2, normalizedVol), 0.5);
                   } else {
                     const elapsed = nowMs;
                     volumeScale = 0.3 + (Math.sin(elapsed / 18) * 0.25 + Math.cos(elapsed / 32) * 0.15 + 0.15);
                     volumeScale = Math.max(0.15, Math.min(0.85, volumeScale));
                   }

                   if (vowel === 'a') {
                     targetMouthValue = 0.95 * volumeScale;
                     targetMouthForm = 0.25;
                   } else if (vowel === 'i') {
                     targetMouthValue = 0.25 * volumeScale;
                     targetMouthForm = 0.95;
                   } else if (vowel === 'u') {
                     targetMouthValue = 0.45 * volumeScale;
                     targetMouthForm = -0.90;
                   } else if (vowel === 'e') {
                     targetMouthValue = 0.52 * volumeScale;
                     targetMouthForm = 0.40;
                   } else if (vowel === 'o') {
                     targetMouthValue = 0.85 * volumeScale;
                     targetMouthForm = -0.60;
                   } else if (vowel === 'consonant') {
                     targetMouthValue = 0.18 * volumeScale;
                     targetMouthForm = 0.0;
                   } else {
                     targetMouthValue = 0.0;
                     targetMouthForm = 0.0;
                   }
                 } else {
                   currentVowel.current = 'pause';
                   targetMouthValue = 0.0;
                   targetMouthForm = 0.0;
                 }

                 const smoothingParam = 0.35;
                 lastMouthOpen.current = lastMouthOpen.current + (targetMouthValue - lastMouthOpen.current) * smoothingParam;
                 currentMouthForm.current = currentMouthForm.current + (targetMouthForm - currentMouthForm.current) * smoothingParam;

                 setParam('ParamMouthOpenY', lastMouthOpen.current);

                 const movementScale = (isSpeakingRef.current || isPlayingAnyMotion || gazeOverrideRef.current) ? 0.4 : 1.0;
                 setParam('ParamAngleX', (finalGazeX * 30 + bodySwayX) * movementScale + procOffset.current.x + headTrackingOffset.current.x * 1.5);
                 setParam('ParamAngleY', (-finalGazeY * 30) * movementScale + procOffset.current.y + stepBounce * -0.5 - headTrackingOffset.current.y * 1.5);
                 setParam('ParamAngleZ', headSwayZ * movementScale + procOffset.current.z + headTrackingOffset.current.z * 1.2);
                 setParam('ParamEyeBallX', finalGazeX);
                 setParam('ParamEyeBallY', -finalGazeY);
                 setParam('ParamEyeLOpen', finalEyeL);
                 setParam('ParamEyeROpen', finalEyeR);
                 setParam('ParamEyeOpen', (finalEyeL + finalEyeR) / 2);
                 setParam('ParamBreath', breath);
                 setParam('ParamBodyAngleX', (finalGazeX * 10 + bodySwayX) * movementScale);
                 setParam('ParamBodyAngleY', stepBounce * 0.8);

                 if (!isPlayingAnyMotion) {
                   let joyVal = mood.joy || 0;
                   let sadnessVal = mood.sadness || 0;
                   let angerVal = mood.anger || 0;
                   let embarrassmentVal = mood.embarrassment || 0;
                   let excitementVal = mood.excitement || 0;

                   if (tempExpressionOverride.current && nowMs < tempExpressionOverride.current.endTime) {
                     const name = tempExpressionOverride.current.name;
                     const weight = tempExpressionOverride.current.weight * 100;
                     if (name === 'happy') {
                       joyVal = Math.max(joyVal, weight);
                       sadnessVal = 0;
                       angerVal = 0;
                     } else if (name === 'sad') {
                       sadnessVal = Math.max(sadnessVal, weight);
                       joyVal = 0;
                       angerVal = 0;
                     } else if (name === 'angry') {
                       angerVal = Math.max(angerVal, weight);
                       joyVal = 0;
                       sadnessVal = 0;
                     } else if (name === 'relaxed') {
                       joyVal = 0;
                       sadnessVal = 0;
                       angerVal = 0;
                     }
                   }

                   if (tempBlushOverride.current && nowMs < tempBlushOverride.current.endTime) {
                     embarrassmentVal = Math.max(embarrassmentVal, tempBlushOverride.current.weight * 100);
                   }

                   const microMoodSway = Math.sin(time * 1.6) * 0.025 + Math.cos(time * 0.73) * 0.012;
                   const cheekBlushSway = Math.sin(time * 0.35) * 0.015;

                   const isPatted = nowMs - lastHeadPatTime.current < 6000;
                   const pattedRatio = isPatted ? Math.max(0, 1.0 - (nowMs - lastHeadPatTime.current) / 6000) : 0;
                   const pattedBlush = pattedRatio * 0.55;

                   let baseMouthForm = 0.0;
                   if (joyVal > 30) {
                      baseMouthForm = Math.min(1.0, 0.4 + (joyVal / 100) * 0.6);
                   } else if (sadnessVal > 30) {
                      baseMouthForm = Math.max(-1.0, -0.4 - (sadnessVal / 100) * 0.6);
                   } else if (angerVal > 30) {
                      baseMouthForm = Math.max(-0.6, -0.2 - (angerVal / 150));
                   }

                   if (isPatted) {
                      baseMouthForm = Math.max(-1.0, Math.min(1.0, baseMouthForm + 0.35 * pattedRatio));
                   }

                   if (isAdventureStatus) {
                      baseMouthForm += 0.15;
                   }

                   const mouthOpenAmount = lastMouthOpen.current;
                   if (mouthOpenAmount > 0.08) {
                      const talkRatio = Math.min(1.0, mouthOpenAmount * 4.0);
                      baseMouthForm = baseMouthForm + (currentMouthForm.current - baseMouthForm) * talkRatio;
                   }

                   let baseEyeSmile = Math.min(1.0, (joyVal + excitementVal) / 90);
                   if (isAdventureStatus) baseEyeSmile = Math.max(0.12, baseEyeSmile);
                   if (isPatted) {
                      baseEyeSmile = Math.min(1.0, baseEyeSmile + 0.45 * pattedRatio);
                   }

                   const eyeSmile = Math.max(0, Math.min(1.0, baseEyeSmile + microMoodSway));
                   const mouthForm = Math.max(-1.0, Math.min(1.0, baseMouthForm + microMoodSway));
                   
                   const baseBlush = Math.min(1.0, ((embarrassmentVal + excitementVal / 2.5) / 100));
                   const finalBlushBias = isAdventureStatus ? Math.max(0.25, baseBlush) : baseBlush;
                   const cheekBlush = Math.max(0, Math.min(1.0, finalBlushBias + pattedBlush + cheekBlushSway));
                   
                   const baseBrowY = (sadnessVal - angerVal) / 60;
                   const browY = Math.max(-1.0, Math.min(1.0, baseBrowY + microMoodSway * 0.4));

                   let finalEyeSmile = eyeSmile;
                   let finalMouthForm = mouthForm;
                   let finalCheek = cheekBlush;
                   let finalBrowInnerY = browY;

                   const activeCustomExpr = customExpressionsRef.current?.find(e => 
                     activeAnimationsRef.current?.some(anim => anim.toLowerCase() === e.key)
                   );

                   if (activeCustomExpr && activeCustomExpr.overrides) {
                     const ov = activeCustomExpr.overrides;
                     if (ov.ParamEyeSmile?.enabled) finalEyeSmile = Number(ov.ParamEyeSmile.value);
                     if (ov.ParamMouthForm?.enabled) finalMouthForm = Number(ov.ParamMouthForm.value);
                     if (ov.ParamCheek?.enabled) finalCheek = Number(ov.ParamCheek.value);
                     if (ov.ParamBrowInnerY?.enabled) finalBrowInnerY = Number(ov.ParamBrowInnerY.value);
                   }

                   // Smooth out changes to parameters using a pleasant exponential easing
                  const expressionSmoothing = 0.15;
                  smoothEyeSmile.current += (finalEyeSmile - smoothEyeSmile.current) * expressionSmoothing;
                  setParam('ParamEyeSmile', smoothEyeSmile.current);
                  smoothMouthForm.current += (finalMouthForm - smoothMouthForm.current) * expressionSmoothing;
                  setParam('ParamMouthForm', smoothMouthForm.current);
                  smoothCheek.current += (finalCheek - smoothCheek.current) * expressionSmoothing;
                  setParam('ParamCheek', smoothCheek.current);
                  smoothBrowInnerY.current += (finalBrowInnerY - smoothBrowInnerY.current) * expressionSmoothing;
                  setParam('ParamBrowInnerY', smoothBrowInnerY.current);
                 }
            }
          }
        });

        onLoadingStateChange(false);
      } catch (err) {
        console.error('CRITICAL: Live2D Model Initialization Failed:', err);
        onLoadError();
        onLoadingStateChange(false);
      }
    }

    initPixi().catch(err => {
      console.error('FAILED: Live2DAvatar Init sequence aborted:', err);
      onLoadError();
      onLoadingStateChange(false);
    });

    return () => {
      active = false;
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (pixiApp.current) {
        try {
          pixiApp.current.destroy(false, { children: true, texture: true, baseTexture: true });
        } catch (e) {
          console.warn("Live2DAvatar: Cleanup destroy error:", e);
        }
        pixiApp.current = null;
      }
      modelRef.current = null;
    };
  }, [modelUrl]);

  // Handle manual start/stop toggling if needed
  useEffect(() => {
    if (pixiApp.current) {
      if (isActive) {
        pixiApp.current.start();
      } else {
        pixiApp.current.stop();
      }
    }
  }, [isActive]);

  return (
    <div ref={pixiContainerRef} className={`absolute inset-0 w-full h-full ${isActive ? 'pointer-events-auto' : 'pointer-events-none'}`} />
  );
};
