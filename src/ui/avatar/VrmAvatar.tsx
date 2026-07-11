import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { MoodState } from '../../include/types';
import { getActiveVowel } from './vowelExtractor';
import { resolveModelUrl } from './avatarUtils';
import { SpeechService } from '../../core/speech';
import { useSpeechSync } from './useSpeechSync';
import { useGazeTracking } from './useGazeTracking';

interface VrmAvatarProps {
  mood: MoodState;
  status: string;
  modelUrl: string;
  isTyping?: boolean;
  isSpeaking?: boolean;
  volume: number;
  typedSubtitle?: string;
  activeSubtitle?: string;
  animations?: string[];
  disableMouseTracking?: boolean;
  onLoadingStateChange: (isLoading: boolean) => void;
  onLoadError: () => void;
  webcamTrackingActive?: boolean;
  webcamVideoElement?: HTMLVideoElement | null;
  onFaceDetected?: (detected: boolean) => void;
  onTrackerLoading?: (loading: boolean) => void;
}

export const VrmAvatar: React.FC<VrmAvatarProps> = ({
  mood,
  status,
  modelUrl,
  isTyping,
  isSpeaking,
  volume,
  typedSubtitle = '',
  activeSubtitle = '',
  animations = [],
  disableMouseTracking = false,
  onLoadingStateChange,
  onLoadError,
  webcamTrackingActive = false,
  webcamVideoElement = null,
  onFaceDetected,
  onTrackerLoading
}) => {
  const threeContainerRef = useRef<HTMLDivElement>(null);
  const vrmModelRef = useRef<any>(null);
  const threeRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const threeSceneRef = useRef<THREE.Scene | null>(null);
  const threeCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const clockTimeRef = useRef<number>(0);
  const clockLastTimeRef = useRef<number>(0);

  // Organic Double-Blinking state
  const nextBlinkTime = useRef(0);
  const blinkEndTime = useRef(0);
  const isDoubleBlinking = useRef(false);
  const doubleBlinkTime = useRef(0);
  const lastHeadPatTime = useRef(0);

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

  const isTypingRef = useRef(false);
  useEffect(() => { isTypingRef.current = !!isTyping; }, [isTyping]);

  // Procedural perturbation offsets
  const procOffset = useRef({ x: 0, y: 0, z: 0 });
  const procEyeOverride = useRef<{ left: number | null; right: number | null }>({ left: null, right: null });

  // Spring mass damper trackers
  const headTrackingOffset = useRef({ x: 0, y: 0, z: 0 });
  const headTrackingVelocity = useRef({ x: 0, y: 0, z: 0 });

  const lastMouthOpen = useRef(0);
  const lastTextLength = useRef(0);

  // VRM smoothed vowel channels
  const vrmA = useRef(0);
  const vrmI = useRef(0);
  const vrmU = useRef(0);
  const vrmE = useRef(0);
  const vrmO = useRef(0);

  // Gesture tracking refs
  const vrmWaving = useRef(false);
  const vrmWavingStartTime = useRef(0);
  const vrmThinking = useRef(false);
  const vrmThinkingStartTime = useRef(0);
  const vrmAngry = useRef(false);
  const vrmAngryStartTime = useRef(0);
  const vrmSad = useRef(false);
  const vrmSadStartTime = useRef(0);
  const vrmSurprised = useRef(false);
  const vrmSurprisedStartTime = useRef(0);

  const triggeredWordsRef = useRef<Set<string>>(new Set());
  const tempExpressionOverride = useRef<{ name: string; weight: number; endTime: number } | null>(null);
  const tempBlushOverride = useRef<{ weight: number; endTime: number } | null>(null);

  // --- WEBCAM AND FACELANDMARK TRACKING SYSTEM REF CLUSTERS ---
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  
  // Real-time tracking offsets
  const cameraTrackingRef = useRef({
    detected: false,
    yaw: 0,
    pitch: 0,
    roll: 0,
    blinkLeft: 0,
    blinkRight: 0,
    jawOpen: 0,
    happy: 0,
    mouthPucker: 0,
    mouthFunnel: 0,
    eyeLookX: 0,
    eyeLookY: 0
  });

  // Smoothed tracking angles using EMA filtering
  const smoothedYaw = useRef(0);
  const smoothedPitch = useRef(0);
  const smoothedRoll = useRef(0);
  const smoothedBlinkL = useRef(0);
  const smoothedBlinkR = useRef(0);
  const smoothedJawOpen = useRef(0);
  const smoothedHappy = useRef(0);

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
      else if (frame < 20) procEyeOverride.current = { left: 0, right: 1 };
      else if (frame < 25) procEyeOverride.current = { left: 0.4, right: 1 };
      else if (frame < 30) procEyeOverride.current = { left: 0.8, right: 1 };
      else {
        clearInterval(interval);
        procEyeOverride.current = { left: null, right: null };
      }
    }, 50);
  };

  const performProceduralNod = () => {
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      procOffset.current.y = Math.sin(frame * 0.2) * 22;
      procOffset.current.z = Math.sin(frame * 0.1) * 5;
      if (frame > 40) {
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
      procOffset.current.x = Math.sin(frame * 0.25) * 28;
      if (frame > 45) {
        clearInterval(interval);
        procOffset.current.x = 0;
      }
    }, 40);
  };

  const performProceduralShiver = () => {
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      procOffset.current.x = Math.sin(frame * 1.5) * 4.5;
      procOffset.current.y = Math.cos(frame * 1.7) * 3.0;
      if (frame > 50) {
        clearInterval(interval);
        procOffset.current.x = 0;
        procOffset.current.y = 0;
      }
    }, 25);
  };

  // Process incoming sequential or triggerable animations
  useEffect(() => {
    if (vrmModelRef.current && animations.length > 0) {
      console.log('[VRM] Handling animation instructions:', animations);
      animations.forEach((anim) => {
        const lowerAnim = anim.toLowerCase();
        
        if (lowerAnim === 'nod' || lowerAnim === 'angguk') {
          performProceduralNod();
        } else if (lowerAnim === 'shake' || lowerAnim === 'geleng') {
          performProceduralShake();
        } else if (lowerAnim === 'shiver' || lowerAnim === 'gemetar') {
          performProceduralShiver();
        }
        
        if (lowerAnim === 'blink' || lowerAnim === 'kedip') {
          performProceduralBlink();
        } else if (lowerAnim === 'wink') {
          performProceduralWink();
        }

        // Arm motion overrides with timers
        if (lowerAnim === 'wave' || lowerAnim === 'melambai' || lowerAnim === 'lambai') {
          vrmWaving.current = true;
          vrmWavingStartTime.current = Date.now();
          setTimeout(() => { vrmWaving.current = false; }, 4000);
        } else if (lowerAnim === 'think' || lowerAnim === 'pikir' || lowerAnim === 'mikir') {
          vrmThinking.current = true;
          vrmThinkingStartTime.current = Date.now();
          setTimeout(() => { vrmThinking.current = false; }, 5000);
        } else if (lowerAnim === 'angry' || lowerAnim === 'marah' || lowerAnim === 'kesal') {
          vrmAngry.current = true;
          vrmAngryStartTime.current = Date.now();
          setTimeout(() => { vrmAngry.current = false; }, 4000);
        } else if (lowerAnim === 'sad' || lowerAnim === 'sedih' || lowerAnim === 'hiks' || lowerAnim === 'shiver' || lowerAnim === 'gemetar') {
          vrmSad.current = true;
          vrmSadStartTime.current = Date.now();
          setTimeout(() => { vrmSad.current = false; }, 5000);
        } else if (lowerAnim === 'surprise' || lowerAnim === 'kaget' || lowerAnim === 'terkejut') {
          vrmSurprised.current = true;
          vrmSurprisedStartTime.current = Date.now();
          setTimeout(() => { vrmSurprised.current = false; }, 2500);
        }

        // Eyegazes support inside VRM system
        if (lowerAnim.includes('left') || lowerAnim.includes('kiri')) gazeOverrideRef.current = { x: -0.85, y: 0.1 };
        else if (lowerAnim.includes('right') || lowerAnim.includes('kanan')) gazeOverrideRef.current = { x: 0.85, y: 0.1 };
        else if (lowerAnim.includes('up') || lowerAnim.includes('atas')) gazeOverrideRef.current = { x: 0, y: -0.7 };
        else if (lowerAnim.includes('down') || lowerAnim.includes('bawah')) gazeOverrideRef.current = { x: 0, y: 0.7 };
        else if (lowerAnim.includes('center') || lowerAnim.includes('pusat')) gazeOverrideRef.current = { x: 0, y: 0 };

        if (lowerAnim.includes('look') || lowerAnim.includes('lirik') || lowerAnim.includes('tengok')) {
           if (gazeTimeoutRef.current) clearTimeout(gazeTimeoutRef.current);
           gazeTimeoutRef.current = setTimeout(() => { gazeOverrideRef.current = null; }, 3500);
        }
      });
    }
  }, [animations]);

  // Synchronizing webcam tracking and face parsing loop
  useEffect(() => {
    let active = true;
    let localStream: MediaStream | null = null;
    let detectionLoopId: number | null = null;

    const startTrackingService = async () => {
      if (!webcamTrackingActive) {
        onTrackerLoading?.(false);
        onFaceDetected?.(false);
        cameraTrackingRef.current.detected = false;
        return;
      }

      onTrackerLoading?.(true);
      console.log('[TRACKER] Commencing initialization of Face Tracker (MediaPipe FaceLandmarker)...');

      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
        );

        if (!active) return;

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU'
          },
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          runningMode: 'VIDEO'
        });

        if (!active) {
          landmarker.close();
          return;
        }

        faceLandmarkerRef.current = landmarker;
        console.log('[TRACKER] MediaPipe FaceLandmarker fully compiled and loaded successfully.');

        console.log('[TRACKER] Fetching local video stream from navigator...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false
        });

        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          landmarker.close();
          return;
        }

        localStream = stream;
        localStreamRef.current = stream;

        if (webcamVideoElement) {
          webcamVideoElement.srcObject = stream;
          webcamVideoElement.onloadedmetadata = () => {
            webcamVideoElement.play().catch(e => console.warn('[TRACKER] Video auto-play intercepted:', e));
          };
        }

        onTrackerLoading?.(false);

        let lastVideoTime = -1;
        const tickTracker = () => {
          if (!active) return;
          
          if (webcamVideoElement && webcamVideoElement.readyState >= 2) {
            const videoTime = webcamVideoElement.currentTime;
            
            if (videoTime !== lastVideoTime) {
              lastVideoTime = videoTime;
              
              try {
                const results = landmarker.detectForVideo(webcamVideoElement, performance.now());
                
                if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                  cameraTrackingRef.current.detected = true;
                  onFaceDetected?.(true);
                  
                  const landmarks = results.faceLandmarks[0];
                  
                  const nose = landmarks[4];
                  const forehead = landmarks[151];
                  const chin = landmarks[152];
                  const leftEye = landmarks[33];
                  const rightEye = landmarks[263];
                  
                  if (nose && leftEye && rightEye && forehead && chin) {
                    const leftDist = Math.abs(nose.x - leftEye.x);
                    const rightDist = Math.abs(nose.x - rightEye.x);
                    const yawRatio = leftDist / (leftDist + rightDist || 1);
                    cameraTrackingRef.current.yaw = (yawRatio - 0.5) * -1.8;
                    
                    const upperDist = Math.abs(nose.y - forehead.y);
                    const lowerDist = Math.abs(nose.y - chin.y);
                    const pitchRatio = upperDist / (upperDist + lowerDist || 1);
                    cameraTrackingRef.current.pitch = (pitchRatio - 0.38) * 2.0;
                    
                    const dy = rightEye.y - leftEye.y;
                    const dx = rightEye.x - leftEye.x;
                    cameraTrackingRef.current.roll = Math.atan2(dy, dx);
                  }
                  
                  if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
                    const shapes = results.faceBlendshapes[0].categories;
                    
                    for (const shape of shapes) {
                      switch (shape.categoryName) {
                        case 'eyeBlinkLeft':
                          cameraTrackingRef.current.blinkLeft = shape.score;
                          break;
                        case 'eyeBlinkRight':
                          cameraTrackingRef.current.blinkRight = shape.score;
                          break;
                        case 'jawOpen':
                          cameraTrackingRef.current.jawOpen = shape.score;
                          break;
                        case 'mouthSmileLeft':
                        case 'mouthSmileRight':
                          cameraTrackingRef.current.happy = (cameraTrackingRef.current.happy * 0.5) + (shape.score * 0.5);
                          break;
                        case 'mouthPucker':
                          cameraTrackingRef.current.mouthPucker = shape.score;
                          break;
                        case 'mouthFunnel':
                          cameraTrackingRef.current.mouthFunnel = shape.score;
                          break;
                        case 'eyeLookInLeft':
                        case 'eyeLookOutRight':
                          cameraTrackingRef.current.eyeLookX = (cameraTrackingRef.current.eyeLookX * 0.5) + (shape.score * 0.5);
                          break;
                        case 'eyeLookOutLeft':
                        case 'eyeLookInRight':
                          cameraTrackingRef.current.eyeLookX = (cameraTrackingRef.current.eyeLookX * 0.5) - (shape.score * 0.5);
                          break;
                        case 'eyeLookUpLeft':
                        case 'eyeLookUpRight':
                          cameraTrackingRef.current.eyeLookY = (cameraTrackingRef.current.eyeLookY * 0.5) - (shape.score * 0.5);
                          break;
                        case 'eyeLookDownLeft':
                        case 'eyeLookDownRight':
                          cameraTrackingRef.current.eyeLookY = (cameraTrackingRef.current.eyeLookY * 0.5) + (shape.score * 0.5);
                          break;
                      }
                    }
                  }
                } else {
                  cameraTrackingRef.current.detected = false;
                  onFaceDetected?.(false);
                }
              } catch (detectErr) {
                console.warn('[TRACKER] Frame prediction failed:', detectErr);
              }
            }
          }
          
          detectionLoopId = requestAnimationFrame(tickTracker);
        };
        
        detectionLoopId = requestAnimationFrame(tickTracker);

      } catch (err) {
        console.error('[TRACKER] Local camera tracking engine crash:', err);
        onTrackerLoading?.(false);
        onFaceDetected?.(false);
      }
    };

    startTrackingService();

    return () => {
      active = false;
      onTrackerLoading?.(false);
      onFaceDetected?.(false);
      
      if (detectionLoopId !== null) {
        cancelAnimationFrame(detectionLoopId);
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (faceLandmarkerRef.current) {
        try {
          faceLandmarkerRef.current.close();
        } catch (e) {}
        faceLandmarkerRef.current = null;
      }
      localStreamRef.current = null;
    };
  }, [webcamTrackingActive, webcamVideoElement]);

  // Three JS Canvas Setup and Game Loop Tickers
  useEffect(() => {
    let active = true;
    const container = threeContainerRef.current;
    if (!container) return;

    // Clear existing children
    try {
      container.replaceChildren();
    } catch (e) {
      container.innerHTML = '';
    }

    onLoadingStateChange(true);
    onLoadError(); // Clear older load errors safely

    const scene = new THREE.Scene();
    threeSceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      32,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 1.4, 0.9);
    threeCameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    threeRendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.25);
    mainLight.position.set(0.3, 1.6, 1.5);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
    rimLight.position.set(-0.5, 1.0, -1.0);
    scene.add(rimLight);

    const triggerRefit = () => {
      if (!active || !threeContainerRef.current || !threeRendererRef.current || !threeCameraRef.current) return;
      const w = threeContainerRef.current.clientWidth;
      const h = threeContainerRef.current.clientHeight;
      if (w === 0 || h === 0) return;
      
      threeCameraRef.current.aspect = w / h;
      threeCameraRef.current.updateProjectionMatrix();
      threeRendererRef.current.setSize(w, h);
    };

    const vrmResizeObserver = new ResizeObserver(() => {
      triggerRefit();
    });
    vrmResizeObserver.observe(container);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const resolvedUrl = resolveModelUrl(modelUrl);
    console.log(`[VRM] Commencing loading sequence: ${resolvedUrl}`);

    // Self-healing, multi-mirror cascading VRM loader pipeline
    const parseUrlFallbacks = (initialUrl: string): string[] => {
      const urls: string[] = [];
      let cleaned = initialUrl;
      // Strip outdated '/vrm/' directory that Pixiv removed in recent updates
      if (initialUrl.includes('/models/vrm/three-vrm-girl.vrm')) {
        cleaned = initialUrl.replace('/models/vrm/three-vrm-girl.vrm', '/models/three-vrm-girl.vrm');
      }
      urls.push(cleaned);

      // Generate dynamic failover mirrors
      if (cleaned.includes('cdn.jsdelivr.net')) {
        urls.push(cleaned.replace('cdn.jsdelivr.net', 'fastly.jsdelivr.net'));
        urls.push(cleaned.replace('cdn.jsdelivr.net', 'gcore.jsdelivr.net'));
      } else if (cleaned.includes('fastly.jsdelivr.net')) {
        urls.push(cleaned.replace('fastly.jsdelivr.net', 'cdn.jsdelivr.net'));
      } else if (cleaned.includes('pixiv.github.io')) {
        urls.push('https://cdn.jsdelivr.net/gh/pixiv/three-vrm@master/packages/three-vrm/examples/models/three-vrm-girl.vrm');
        urls.push('https://fastly.jsdelivr.net/gh/pixiv/three-vrm@master/packages/three-vrm/examples/models/three-vrm-girl.vrm');
      } else {
        urls.push('https://pixiv.github.io/three-vrm/packages/three-vrm/examples/models/three-vrm-girl.vrm');
      }

      // Add original fallback links without outdated directories
      urls.push('https://pixiv.github.io/three-vrm/packages/three-vrm/examples/models/three-vrm-girl.vrm');
      urls.push('https://cdn.jsdelivr.net/gh/pixiv/three-vrm@master/packages/three-vrm/examples/models/three-vrm-girl.vrm');

      // Deduplicate mirror stack
      return Array.from(new Set(urls));
    };

    const fallbacks = parseUrlFallbacks(resolvedUrl);
    let fallbackIdx = 0;

    const attemptLoad = (targetUrl: string) => {
      loader.load(
        targetUrl,
        (gltf) => {
          if (!active) return;
          const vrm = gltf.userData.vrm;
          if (!vrm) {
            console.error('[VRM] Loaded GLTF is missing correct VRMs data extensions.');
            loadNext();
            return;
          }

          vrmModelRef.current = vrm;
          scene.add(vrm.scene);
          vrm.scene.rotation.y = Math.PI;

          // Align viewport based on head tracker joint properties if humanoid bone maps are valid
          try {
            if (vrm.humanoid) {
              const headJoint = vrm.humanoid.getNormalizedBoneNode('head');
              if (headJoint) {
                const headWorldPos = new THREE.Vector3();
                headJoint.getWorldPosition(headWorldPos);
                camera.position.set(0, headWorldPos.y - 0.05, headWorldPos.z + 0.85);
                camera.lookAt(new THREE.Vector3(0, headWorldPos.y - 0.08, 0));
              }
            }
          } catch (camErr) {
            console.warn('[VRM] Head position camera placement failed, using standard fallback layout.', camErr);
            camera.position.set(0, 1.42, 0.82);
            camera.lookAt(0, 1.38, 0);
          }

          vrm.scene.traverse((node: any) => {
            if (node.isMesh) {
              node.frustumCulled = false;
              node.castShadow = true;
              node.receiveShadow = true;
            }
          });

          onLoadingStateChange(false);
          console.log('[VRM] Component successfully painted!');
        },
        () => {},
        (err) => {
          console.warn(`[VRM] Load error tracked for ${targetUrl}:`, err);
          loadNext();
        }
      );
    };

    const loadNext = () => {
      fallbackIdx++;
      if (fallbackIdx < fallbacks.length) {
        console.log(`[VRM] Trying fallback URL (${fallbackIdx + 1}/${fallbacks.length}): ${fallbacks[fallbackIdx]}`);
        attemptLoad(fallbacks[fallbackIdx]);
      } else {
        console.error('[VRM] Secondary VRM mirror loader failed.');
        onLoadError();
        onLoadingStateChange(false);
      }
    };

    attemptLoad(fallbacks[0]);

    clockTimeRef.current = 0;
    clockLastTimeRef.current = performance.now();
    const lastMousePos = { x: container.clientWidth / 2, y: container.clientHeight / 2 };

    const updateMouse = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      lastMousePos.x = e.clientX - rect.left;
      lastMousePos.y = e.clientY - rect.top;
    };
    if (!disableMouseTracking) {
      container.addEventListener('pointermove', updateMouse);
    }

    const handleTap = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const isUpper = clickY < rect.height * 0.48;
      if (isUpper) {
        lastHeadPatTime.current = Date.now();
        performProceduralNod();
        if (Math.random() < 0.4) {
          performProceduralWink();
        } else {
          performProceduralBlink();
        }
      }
    };
    container.addEventListener('click', handleTap);

    // Animators render loop ticks
    const renderTick = () => {
      if (!active) return;
      animationFrameIdRef.current = requestAnimationFrame(renderTick);

      const now = performance.now();
      const delta = Math.min((now - clockLastTimeRef.current) / 1000, 0.1);
      clockLastTimeRef.current = now;
      clockTimeRef.current += delta;
      const time = clockTimeRef.current;

      const vrm = vrmModelRef.current;
      if (vrm) {
        vrm.update(delta);
        const nowMs = Date.now();

        // Update tracking filters
        const trackingActive = webcamTrackingActive && cameraTrackingRef.current.detected;
        const filterSpeed = 0.22; // Natural smoothing factor
        const track = cameraTrackingRef.current;
        
        if (trackingActive) {
          smoothedYaw.current += (track.yaw - smoothedYaw.current) * filterSpeed;
          smoothedPitch.current += (track.pitch - smoothedPitch.current) * filterSpeed;
          smoothedRoll.current += (track.roll - smoothedRoll.current) * filterSpeed;
          smoothedBlinkL.current += (track.blinkLeft - smoothedBlinkL.current) * filterSpeed;
          smoothedBlinkR.current += (track.blinkRight - smoothedBlinkR.current) * filterSpeed;
          smoothedJawOpen.current += (track.jawOpen - smoothedJawOpen.current) * filterSpeed;
          smoothedHappy.current += (track.happy - smoothedHappy.current) * filterSpeed;
        } else {
          smoothedYaw.current += (0 - smoothedYaw.current) * 0.15;
          smoothedPitch.current += (0 - smoothedPitch.current) * 0.15;
          smoothedRoll.current += (0 - smoothedRoll.current) * 0.15;
          smoothedBlinkL.current += (0 - smoothedBlinkL.current) * 0.15;
          smoothedBlinkR.current += (0 - smoothedBlinkR.current) * 0.15;
          smoothedJawOpen.current += (0 - smoothedJawOpen.current) * 0.15;
          smoothedHappy.current += (0 - smoothedHappy.current) * 0.15;
        }

        // spring mass dampers update
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
                 console.log(`[REAL-TIME-VRM] Triggered real-time visual reaction for word: "${key}" (Action: ${item.action})`);
                 
                 if (item.action === 'nod') {
                   performProceduralNod();
                 } else if (item.action === 'shake') {
                   performProceduralShake();
                 } else if (item.action === 'laugh') {
                   performProceduralBlink();
                   vrmWaving.current = false;
                   vrmThinking.current = false;
                   vrmAngry.current = false;
                   vrmSad.current = false;
                   vrmSurprised.current = false;
                   tempExpressionOverride.current = { name: 'happy', weight: 1.0, endTime: Date.now() + 2500 };
                 } else if (item.action === 'smile') {
                   tempExpressionOverride.current = { name: 'happy', weight: 0.85, endTime: Date.now() + 2000 };
                 } else if (item.action === 'surprise') {
                   performProceduralBlink();
                   vrmSurprised.current = true;
                   vrmSurprisedStartTime.current = Date.now();
                   setTimeout(() => { vrmSurprised.current = false; }, 2000);
                   tempExpressionOverride.current = { name: 'relaxed', weight: 0.0, endTime: Date.now() + 2000 };
                 } else if (item.action === 'think') {
                   vrmThinking.current = true;
                   vrmThinkingStartTime.current = Date.now();
                   setTimeout(() => { vrmThinking.current = false; }, 3000);
                 } else if (item.action === 'sad') {
                   vrmSad.current = true;
                   vrmSadStartTime.current = Date.now();
                   setTimeout(() => { vrmSad.current = false; }, 4000);
                   tempExpressionOverride.current = { name: 'sad', weight: 0.8, endTime: Date.now() + 4000 };
                 } else if (item.action === 'angry') {
                   vrmAngry.current = true;
                   vrmAngryStartTime.current = Date.now();
                   setTimeout(() => { vrmAngry.current = false; }, 3500);
                   tempExpressionOverride.current = { name: 'angry', weight: 0.8, endTime: Date.now() + 3500 };
                 } else if (item.action === 'blush') {
                   gazeOverrideRef.current = { x: Math.random() < 0.5 ? -0.55 : 0.55, y: 0.45 };
                   if (gazeTimeoutRef.current) clearTimeout(gazeTimeoutRef.current);
                   gazeTimeoutRef.current = setTimeout(() => { gazeOverrideRef.current = null; }, 2500);
                   tempExpressionOverride.current = { name: 'relaxed', weight: 0.1, endTime: Date.now() + 3000 };
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

        // Extract mood variables outer scope for both expressionManager and humanoid bone setup
        let joyVal = mood.joy || 0;
        let sadnessVal = mood.sadness || 0;
        let angerVal = mood.anger || 0;
        let excitementVal = mood.excitement || 0;
        const stressVal = mood.stress || 0;
        const irritationVal = mood.irritation || 0;
        let embarrassmentVal = mood.embarrassment || 0;

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

        // Double blinking
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
          nextBlinkTime.current = nowMs + 2600 + Math.random() * 4000;
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

        const finalEyeL = trackingActive
          ? (1.0 - smoothedBlinkL.current)
          : (procEyeOverride.current.left !== null ? procEyeOverride.current.left : eyeOpen);
          
        const finalEyeR = trackingActive
          ? (1.0 - smoothedBlinkR.current)
          : (procEyeOverride.current.right !== null ? procEyeOverride.current.right : eyeOpen);

        if (vrm.expressionManager) {
          vrm.expressionManager.setValue('blink', 1.0 - ((finalEyeL + finalEyeR) / 2));
          vrm.expressionManager.setValue('blinkLeft', 1.0 - finalEyeL);
          vrm.expressionManager.setValue('blinkRight', 1.0 - finalEyeR);

          const talking = isSpeakingRef.current || isTypingRef.current;
          let mouthValue = 0;
          if (talking) {
            if (isSpeakingRef.current) {
              const scaledVol = Math.max(0, (volumeRef.current - 0.005) * 12);
              mouthValue = Math.pow(Math.min(1.0, scaledVol), 0.5);
            } else {
              mouthValue = 0.15 + (Math.sin(nowMs / 30) * 0.15 + Math.cos(nowMs / 45) * 0.10 + 0.12);
              mouthValue = Math.max(0, Math.min(0.65, mouthValue));
            }
          }

          const smoothing = 0.4;
          lastMouthOpen.current = lastMouthOpen.current + (mouthValue - lastMouthOpen.current) * smoothing;

          const textVal = typedSubtitleRef.current || '';
          if (talking) {
            if (currentVowel.current === 'pause' || !isSpeakingRef.current) {
              currentVowel.current = getActiveVowel(textVal);
            }
          } else {
            currentVowel.current = 'pause';
          }
          const activeVowel = currentVowel.current;
          let targetA = 0;
          let targetI = 0;
          let targetU = 0;
          let targetE = 0;
          let targetO = 0;

          if (trackingActive) {
            const trackJaw = smoothedJawOpen.current * 1.5;
            const trackPucker = cameraTrackingRef.current.mouthPucker;
            const trackFunnel = cameraTrackingRef.current.mouthFunnel;
            
            targetA = Math.max(0, Math.min(1.0, trackJaw - trackFunnel * 0.4));
            targetU = Math.max(0, Math.min(1.0, trackPucker * 1.1));
            targetO = Math.max(0, Math.min(1.0, trackFunnel * 1.1));
          } else if (talking) {
            if (activeVowel === 'a') targetA = lastMouthOpen.current;
            else if (activeVowel === 'i') targetI = lastMouthOpen.current;
            else if (activeVowel === 'u') targetU = lastMouthOpen.current;
            else if (activeVowel === 'e') targetE = lastMouthOpen.current;
            else if (activeVowel === 'o') targetO = lastMouthOpen.current;
            else {
              targetA = lastMouthOpen.current * 0.4;
            }
          }

          const lerpS = 0.25;
          vrmA.current += (targetA - vrmA.current) * lerpS;
          vrmI.current += (targetI - vrmI.current) * lerpS;
          vrmU.current += (targetU - vrmU.current) * lerpS;
          vrmE.current += (targetE - vrmE.current) * lerpS;
          vrmO.current += (targetO - vrmO.current) * lerpS;

          vrm.expressionManager.setValue('aa', vrmA.current);
          vrm.expressionManager.setValue('ih', vrmI.current);
          vrm.expressionManager.setValue('ou', vrmU.current);
          vrm.expressionManager.setValue('ee', vrmE.current);
          vrm.expressionManager.setValue('oh', vrmO.current);

          const isPatted = nowMs - lastHeadPatTime.current < 6000;
          const pattedRatio = isPatted ? Math.max(0, 1.0 - (nowMs - lastHeadPatTime.current) / 6000) : 0;

          if (joyVal > 40 || excitementVal > 40 || isPatted || (trackingActive && smoothedHappy.current > 0.15)) {
            const happyWeight = isPatted 
              ? Math.min(1.0, 0.4 + pattedRatio * 0.6) 
              : (trackingActive ? Math.max(smoothedHappy.current, Math.max(joyVal, excitementVal) / 100) : Math.max(joyVal, excitementVal) / 100);
            vrm.expressionManager.setValue('happy', happyWeight);
            vrm.expressionManager.setValue('relaxed', 0);
            vrm.expressionManager.setValue('sad', 0);
            vrm.expressionManager.setValue('angry', 0);
          } else if (sadnessVal > 40) {
            vrm.expressionManager.setValue('sad', sadnessVal / 100);
            vrm.expressionManager.setValue('happy', 0);
            vrm.expressionManager.setValue('relaxed', 0);
            vrm.expressionManager.setValue('angry', 0);
          } else if (angerVal > 40) {
            vrm.expressionManager.setValue('angry', angerVal / 100);
            vrm.expressionManager.setValue('happy', 0);
            vrm.expressionManager.setValue('relaxed', 0);
            vrm.expressionManager.setValue('sad', 0);
          } else {
            vrm.expressionManager.setValue('relaxed', 0.45);
            vrm.expressionManager.setValue('happy', 0);
          }
        }

        // Neck and Head visual gazes
        updateGaze(
          time,
          lastMousePos.x,
          lastMousePos.y,
          container.clientWidth,
          container.clientHeight,
          0.11
        );

        if (vrm.humanoid) {
          const headNode = vrm.humanoid.getNormalizedBoneNode('head');
          const neckNode = vrm.humanoid.getNormalizedBoneNode('neck');
          const spineNode = vrm.humanoid.getNormalizedBoneNode('spine');
          const chestNode = vrm.humanoid.getNormalizedBoneNode('chest');

          if (headNode) headNode.rotation.set(0, 0, 0);
          if (neckNode) neckNode.rotation.set(0, 0, 0);
          if (spineNode) spineNode.rotation.set(0, 0, 0);

          // Compute dynamic breathing based on moodState
          let emotionalBreathFreq = 1.55;
          let emotionalBreathAmp = 1.0;
          
          if (angerVal > 30 || irritationVal > 30) {
            emotionalBreathFreq = 1.55 + (Math.max(angerVal, irritationVal) / 100) * 1.55;
            emotionalBreathAmp = 1.0 + (Math.max(angerVal, irritationVal) / 100) * 0.85;
          } else if (excitementVal > 30 || joyVal > 40) {
            emotionalBreathFreq = 1.55 + (Math.max(excitementVal, joyVal) / 100) * 0.75;
            emotionalBreathAmp = 1.0 + (Math.max(excitementVal, joyVal) / 100) * 0.55;
          } else if (sadnessVal > 30) {
            emotionalBreathFreq = Math.max(0.70, 1.55 - (sadnessVal / 100) * 0.75);
            emotionalBreathAmp = Math.max(0.40, 1.0 - (sadnessVal / 100) * 0.60);
          } else if (stressVal > 30) {
            emotionalBreathFreq = 1.55 + (stressVal / 100) * 0.50;
            emotionalBreathAmp = Math.max(0.60, 1.0 - (stressVal / 100) * 0.40);
          }

          const breathVal = Math.sin(time * emotionalBreathFreq);
          if (spineNode) {
            spineNode.rotation.x = breathVal * 0.015 * emotionalBreathAmp;
            spineNode.rotation.z = Math.cos(time * (emotionalBreathFreq * 0.5)) * 0.008 * emotionalBreathAmp;
          }
          if (chestNode) {
            chestNode.rotation.x = breathVal * 0.012 * emotionalBreathAmp;
          }

          if (neckNode) {
            if (trackingActive) {
              neckNode.rotation.y = smoothedYaw.current * 0.45;
              neckNode.rotation.x = smoothedPitch.current * 0.35;
            } else {
              neckNode.rotation.y = currentGazeX.current * 0.42;
              neckNode.rotation.x = -currentGazeY.current * 0.2;
              
              // Tilt neck down when sad
              if (sadnessVal > 30) {
                neckNode.rotation.x -= (sadnessVal / 100) * 0.14;
              }
              // Lift neck slightly when excited
              else if (excitementVal > 30) {
                neckNode.rotation.x += (excitementVal / 100) * 0.08;
              }
            }
          }
          if (headNode) {
            if (trackingActive) {
              headNode.rotation.y = smoothedYaw.current * 0.55;
              headNode.rotation.x = smoothedPitch.current * 0.65;
              headNode.rotation.z = -smoothedRoll.current * 0.85;
            } else {
              headNode.rotation.y = currentGazeX.current * 0.22;
              headNode.rotation.x = -currentGazeY.current * 0.12;

              headNode.rotation.x += procOffset.current.y * (Math.PI / 180) * 0.35 - (headTrackingOffset.current.y * (Math.PI / 180) * 1.5);
              headNode.rotation.y += procOffset.current.x * (Math.PI / 180) * 0.35 + (headTrackingOffset.current.x * (Math.PI / 180) * 1.5);
              headNode.rotation.z += (headTrackingOffset.current.z * (Math.PI / 180) * 1.2);

              // Cute shy tilting sways (Z-Axis wiggle) for embarrassment/giggle
              if (embarrassmentVal > 30) {
                const shyTilt = Math.sin(time * 2.2) * 0.06 * (embarrassmentVal / 100);
                headNode.rotation.z += shyTilt;
                headNode.rotation.y += Math.cos(time * 1.1) * 0.04 * (embarrassmentVal / 100);
              }
              
              // Joyful head bobbing
              if (excitementVal > 50 || joyVal > 60) {
                const happyBob = Math.sin(time * 3.5) * 0.02 * (Math.max(excitementVal, joyVal) / 100);
                headNode.rotation.x += Math.max(0, happyBob); // Nodding bob
              }
            }
          }

          const lShoulder = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
          const lElbow = vrm.humanoid.getNormalizedBoneNode('leftLowerArm');
          const rShoulder = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
          const rElbow = vrm.humanoid.getNormalizedBoneNode('rightLowerArm');

          if (lShoulder) lShoulder.rotation.set(0, 0, 1.25);
          if (lElbow) lElbow.rotation.set(0, 0, 0);
          if (rShoulder) rShoulder.rotation.set(0, 0, -1.25);
          if (rElbow) rElbow.rotation.set(0, 0, 0);

          // Shoulder hunches & posture sways based on emotions
          if (lShoulder && rShoulder) {
            if (sadnessVal > 45) {
              const sadScale = Math.min(1.0, (sadnessVal - 40) / 60);
              lShoulder.rotation.z += sadScale * 0.14; 
              rShoulder.rotation.z -= sadScale * 0.14;
              lShoulder.rotation.x -= sadScale * 0.12; 
              rShoulder.rotation.x -= sadScale * 0.12;
            } else if (angerVal > 45) {
              const angerScale = Math.min(1.0, (angerVal - 40) / 60);
              lShoulder.rotation.z -= angerScale * 0.10;
              rShoulder.rotation.z += angerScale * 0.10;
              lShoulder.rotation.x += angerScale * 0.10;
              rShoulder.rotation.x += angerScale * 0.10;
            } else if (embarrassmentVal > 45) {
              const shyScale = Math.min(1.0, (embarrassmentVal - 40) / 60);
              lShoulder.rotation.z += shyScale * 0.12;
              rShoulder.rotation.z -= shyScale * 0.12;
              lShoulder.rotation.x -= shyScale * 0.08;
              rShoulder.rotation.x -= shyScale * 0.08;
            }
          }

          if (vrmWaving.current && rShoulder && rElbow) {
            const elapsed = (Date.now() - vrmWavingStartTime.current) / 1000;
            rShoulder.rotation.z = -Math.PI / 2.6;
            rShoulder.rotation.x = -Math.PI / 3.5;
            rElbow.rotation.y = -Math.PI / 6;
            rElbow.rotation.z = Math.sin(elapsed * 12.5) * 0.45;
          }
          else if (vrmThinking.current && rShoulder && rElbow) {
            const elapsed = (Date.now() - vrmThinkingStartTime.current) / 1000;
            rShoulder.rotation.z = -Math.PI / 6.2;
            rShoulder.rotation.x = -Math.PI / 3.2;
            rElbow.rotation.y = -Math.PI / 2.0;
            rElbow.rotation.z = -Math.PI / 5.5 + Math.sin(elapsed * 1.6) * 0.04;

            if (lShoulder && lElbow) {
              lShoulder.rotation.z = Math.PI / 5.5;
              lShoulder.rotation.x = -Math.PI / 4.5;
              lElbow.rotation.y = Math.PI / 2.6;
            }
          }
          else if (vrmAngry.current && rShoulder && rElbow && lShoulder && lElbow) {
            rShoulder.rotation.z = -Math.PI / 4.2;
            rShoulder.rotation.x = Math.PI / 9;
            rElbow.rotation.y = -Math.PI / 2.4;

            lShoulder.rotation.z = Math.PI / 4.2;
            lShoulder.rotation.x = Math.PI / 9;
            lElbow.rotation.y = Math.PI / 2.4;
          }
          else if (vrmSad.current && rShoulder && lShoulder) {
            rShoulder.rotation.z = -1.42;
            lShoulder.rotation.z = 1.42;
            if (neckNode) {
              neckNode.rotation.x = -Math.PI / 12;
            }
          }
          else if (vrmSurprised.current && rShoulder && lShoulder && rElbow && lElbow) {
            const elapsed = (Date.now() - vrmSurprisedStartTime.current) / 1000;
            const shock = Math.max(0, 1.0 - elapsed * 0.6);
            rShoulder.rotation.z = -Math.PI / 2.8 * shock + (-1.25 * (1.0 - shock));
            lShoulder.rotation.z = Math.PI / 2.8 * shock + (1.25 * (1.0 - shock));
            rElbow.rotation.y = -Math.PI / 4.5 * shock;
            lElbow.rotation.y = Math.PI / 4.5 * shock;
          }
        }
      }

      renderer.render(scene, camera);
    };

    renderTick();

    return () => {
      active = false;
      container.removeEventListener('pointermove', updateMouse);
      container.removeEventListener('click', handleTap);
      vrmResizeObserver.disconnect();
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      if (threeRendererRef.current) {
        threeRendererRef.current.dispose();
      }
      if (vrmModelRef.current) {
        vrmModelRef.current.scene.traverse((node: any) => {
          if (node.geometry) node.geometry.dispose();
          if (node.material) {
            if (Array.isArray(node.material)) {
              node.material.forEach((mat: any) => mat.dispose());
            } else {
              node.material.dispose();
            }
          }
        });
      }
      vrmModelRef.current = null;
      threeRendererRef.current = null;
      threeSceneRef.current = null;
      threeCameraRef.current = null;
    };
  }, [modelUrl]);

  return (
    <div ref={threeContainerRef} className="absolute inset-0 w-full h-full pointer-events-auto" />
  );
};
