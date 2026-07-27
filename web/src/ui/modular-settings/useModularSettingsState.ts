import { useState, useEffect } from 'react';
import { ModuleType } from '@shared/include/types';

export const useModularSettingsState = () => {
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [unlockedSliders, setUnlockedSliders] = useState<Record<string, boolean>>({});
  const [activeCategory, setActiveCategory] = useState<'all' | 'persona' | 'ai' | 'sandbox' | 'system'>('all');
  const [activeSettingsTab, setActiveSettingsTab] = useState<
    | ModuleType
    | 'ADDON'
    | 'VISUAL'
    | 'GENERAL'
    | 'SYSTEM'
    | 'CRON'
    | 'NEURAL_CIRCUIT'
    | 'SOUL'
  >('GENERAL');
  const [activeSoulTab, setActiveSoulTab] = useState<
    'identities' | 'heuristics' | 'reflect' | 'persistence' | 'archive' | 'dreams' | 'train'
  >('heuristics');

  const [uploadedScenes, setUploadedScenes] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('yuihime_uploaded_scenes_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const defaultGalleryScenes = [
    { id: 'cute_streaming_room', title: 'Cute streaming room', url: 'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?auto=format&fit=crop&w=600&q=80' },
    { id: 'cozy_tea_corner', title: 'Cozy tea corner in garden', url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80' },
    { id: 'cyberpunk_neon_deck', title: 'Cyberpunk neon deck', url: 'https://images.unsplash.com/photo-1507608869274-d3177c8bb4c7?auto=format&fit=crop&w=600&q=80' },
    { id: 'zen_tatami_layout', title: 'Zen tatami layout', url: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=600&q=80' },
    { id: 'lofi_cozy_cafe', title: 'Lo-fi cozy cafe', url: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=600&q=80' },
  ];

  const galleryScenes = [...defaultGalleryScenes, ...uploadedScenes];

  // Toast timer effect
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Persist developer settings effect
  useEffect(() => {
    if (settings && settings.developer) {
      const disableAutofocus = settings.developer.disableUiAutoFocus === true;
      localStorage.setItem('yuihime_disable_autofocus', JSON.stringify(disableAutofocus));
    }
  }, [settings]);

  return {
    settings,
    setSettings,
    loading,
    setLoading,
    toast,
    setToast,
    unlockedSliders,
    setUnlockedSliders,
    activeCategory,
    setActiveCategory,
    activeSettingsTab,
    setActiveSettingsTab,
    activeSoulTab,
    setActiveSoulTab,
    uploadedScenes,
    setUploadedScenes,
    galleryScenes,
    defaultGalleryScenes,
  };
};
