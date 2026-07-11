import React, { useState, useEffect } from 'react';
import { REGISTERED_PROVIDERS_STATIC_DATA } from './settingsConstants';
import { SearchableSelect } from '../../components/SearchableSelect';
import { LockedSlider } from '../../components/LockedSlider';
import { 
  Play, 
  Sparkles, 
  Radio, 
  Send, 
  Image as ImageIcon, 
  Volume2, 
  Video, 
  Eye, 
  RefreshCw, 
  Clock, 
  AlertTriangle, 
  Info, 
  FileAudio, 
  Cpu, 
  Sliders, 
  Terminal,
  FileCode,
  Music,
  CheckCircle,
  HelpCircle,
  Upload
} from 'lucide-react';

interface ProviderPlaygroundProps {
  settings: any;
  setSettings: (settings: any) => void;
  onShowInfo?: (title: string, text: string) => void;
}

export const ProviderPlayground: React.FC<ProviderPlaygroundProps> = ({
  settings,
  setSettings,
  onShowInfo
}) => {
  // Test Hub general navigation
  const [activeSegment, setActiveSegment] = useState<'universal_llm' | 'tts_all'>('universal_llm');
  
  // Specific Puter operation sub-tabs
  const [puterOp, setPuterOp] = useState<'chat' | 'txt2img' | 'txt2speech' | 'txt2vid' | 'img2txt' | 'models_info'>('chat');

  // Universal logs & performance metrics
  const [testLogs, setTestLogs] = useState<Array<{ time: string; type: 'info' | 'success' | 'err'; text: string }>>([
    { time: new Date().toLocaleTimeString(), type: 'info', text: 'Diagnostic Suite Initialized. Select a provider below.' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  // States: Puter Models & Info Lists
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [availableProviders, setAvailableProviders] = useState<any[]>([]);
  const [puterProviderFilter, setPuterProviderFilter] = useState('all');
  const [fetchingInfo, setFetchingInfo] = useState(false);

  // States: Puter Chat playtest
  const [chatModel, setChatModel] = useState('openai:gpt-4o-mini');
  const [chatPrompt, setChatPrompt] = useState('Halo Yuihime! Ceritakan lelucon pendek yang menyenangkan untukku dalam Bahasa Indonesia.');
  const [chatResult, setChatResult] = useState('');

  // States: Puter Txt2Img
  const [imgPrompt, setImgPrompt] = useState('A cute cybernetic anime room with glowing neon blue screens and cozy tatami, high resolution digital art');
  const [imgResultUrl, setImgResultUrl] = useState('');

  // States: Puter Txt2Speech
  const [ttsText, setTtsText] = useState('Selamat pagi Kakak manis! Tetap ceria menjalani hari ini bersama Yuihime ya!');
  const [ttsVoice, setTtsVoice] = useState('id-ID-1');
  const [ttsResultUrl, setTtsResultUrl] = useState('');
  const [puterSpeechProviders, setPuterSpeechProviders] = useState<any[]>([]);
  const [puterSpeechVoices, setPuterSpeechVoices] = useState<any[]>([]);
  const [puterSpeechProviderFilter, setPuterSpeechProviderFilter] = useState('all');
  const [fetchingSpeechInfo, setFetchingSpeechInfo] = useState(false);

  // States: Puter Txt2Vid
  const [vidPrompt, setVidPrompt] = useState('Waterfall flowing in futuristic cyberpunk garden, dynamic lighting');
  const [vidResultUrl, setVidResultUrl] = useState('');

  // States: Puter Img2Txt (OCR / Vision)
  const [visionImgUrl, setVisionImgUrl] = useState('');
  const [visionResult, setVisionResult] = useState('');

  // States: Universal LLM diagnostics
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [providerModels, setProviderModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [universalPrompt, setUniversalPrompt] = useState('Halo Yuihime! Apakah sirkuit kognitifmu berfungsi dengan baik hari ini?');
  const [universalSystemPrompt, setUniversalSystemPrompt] = useState('You are Yuihime, a delightful stream assistant with a tsundere personality who cares deeply about their user. Speak in Indonesian.');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(65536);
  const [universalResponse, setUniversalResponse] = useState('');
  const [fetchingModels, setFetchingModels] = useState(false);
  const [apiKeyOverride, setApiKeyOverride] = useState('');
  const [baseUrlOverride, setBaseUrlOverride] = useState('');

  // States: General TTS test
  const [ttsEngineText, setTtsEngineText] = useState('Benchmarking sound systems.');
  const [ttsEngineSelected, setTtsEngineSelected] = useState('puter-tts');

  // Logs appending helper
  const addLog = (text: string, type: 'info' | 'success' | 'err' = 'info') => {
    setTestLogs(prev => [
      { time: new Date().toLocaleTimeString(), type, text },
      ...prev.slice(0, 49) // Keep last 50 logs
    ]);
  };

  // Helper 1: Fetch filtered models list based on selection
  const fetchPuterModelsFiltered = async (providerVal: string) => {
    setFetchingInfo(true);
    addLog(`Mengambil daftar model Puter [Filter Provider: ${providerVal}] dari server...`, 'info');
    try {
      const query = providerVal === 'all' ? '' : `?provider=${encodeURIComponent(providerVal)}`;
      const res = await fetch(`/api/puter/models${query}`);
      if (res.ok) {
        const data = await res.json();
        setAvailableModels(data || []);
        addLog(`Berhasil memuat ${data.length || 0} model dari Puter untuk provider "${providerVal}".`, 'success');
      } else {
        addLog(`Gagal mengambil model dari Puter untuk provider "${providerVal}".`, 'err');
      }
    } catch (err: any) {
      addLog(`Gagal memuat model terfilter: ${err.message || String(err)}`, 'err');
    } finally {
      setFetchingInfo(false);
    }
  };

  // Helper 2: Fetch Puter's active providers then models
  const fetchPuterMetadata = async () => {
    setFetchingInfo(true);
    addLog('Tahap 1: Mengambil daftar provider resmi Puter Hub via puter.ai.listModelProviders()...', 'info');
    try {
      const provsRes = await fetch('/api/puter/providers').then(r => r.ok ? r.json() : []);
      if (Array.isArray(provsRes) && provsRes.length > 0) {
        setAvailableProviders(provsRes);
        addLog(`Berhasil memat ${provsRes.length} provider batin dari Puter.`, 'success');
      } else {
        addLog('Format provider kosong atau gagal di-resolve.', 'err');
      }

      addLog(`Tahap 2: Mengambil daftar model puter.ai.listModels(provider = "${puterProviderFilter}")...`, 'info');
      await fetchPuterModelsFiltered(puterProviderFilter);
    } catch (err: any) {
      addLog(`Koneksi Puter Hub ditolak: ${err.message || String(err)}`, 'err');
    } finally {
      setFetchingInfo(false);
    }
  };

  useEffect(() => {
    fetchPuterMetadata();
  }, []);

  // Update models dynamically when provider filter changes
  useEffect(() => {
    if (availableProviders.length > 0) {
      fetchPuterModelsFiltered(puterProviderFilter);
    }
  }, [puterProviderFilter]);

  const fetchPuterSpeechVoicesFiltered = async (providerVal: string) => {
    setFetchingSpeechInfo(true);
    addLog(`Mengambil daftar suara Puter TTS [Filter Provider: ${providerVal}] dari server...`, 'info');
    try {
      const query = providerVal === 'all' ? '' : `?provider=${encodeURIComponent(providerVal)}`;
      const res = await fetch(`/api/puter/speech/voices${query}`);
      if (res.ok) {
        const data = await res.json();
        setPuterSpeechVoices(data || []);
        addLog(`Berhasil memuat ${data.length || 0} pola suara dari Puter TTS untuk provider "${providerVal}".`, 'success');
        if (data && data.length > 0) {
          const currentVoiceExists = data.some((v: any) => (v.id || v.name) === ttsVoice);
          if (!currentVoiceExists) {
            setTtsVoice(data[0].id || data[0].name || 'en-US-1');
          }
        }
      } else {
        addLog(`Gagal mengambil pola suara dari Puter untuk provider "${providerVal}".`, 'err');
      }
    } catch (err: any) {
      addLog(`Gagal memuat suara terfilter: ${err.message || String(err)}`, 'err');
    } finally {
      setFetchingSpeechInfo(false);
    }
  };

  const fetchPuterSpeechMetadata = async () => {
    setFetchingSpeechInfo(true);
    addLog('Mengambil daftar engine/provider resmi Puter TTS via /api/puter/speech/engines...', 'info');
    try {
      const engsRes = await fetch('/api/puter/speech/engines').then(r => r.ok ? r.json() : []);
      if (Array.isArray(engsRes) && engsRes.length > 0) {
        setPuterSpeechProviders(engsRes);
        addLog(`Berhasil memuat ${engsRes.length} engine suara dari Puter TTS.`, 'success');
      } else {
        addLog('Format engine Puter TTS kosong atau gagal di-resolve.', 'err');
      }

      await fetchPuterSpeechVoicesFiltered(puterSpeechProviderFilter);
    } catch (err: any) {
      addLog(`Koneksi Puter TTS Engines ditolak: ${err.message || String(err)}`, 'err');
    } finally {
      setFetchingSpeechInfo(false);
    }
  };

  useEffect(() => {
    if (puterOp === 'txt2speech' && puterSpeechProviders.length === 0) {
      fetchPuterSpeechMetadata();
    }
  }, [puterOp]);

  useEffect(() => {
    if (puterSpeechProviders.length > 0) {
      fetchPuterSpeechVoicesFiltered(puterSpeechProviderFilter);
    }
  }, [puterSpeechProviderFilter]);

  // Operation: Run Puter Chat playtest
  const runPuterChat = async () => {
    if (!chatPrompt.trim()) return;
    setIsLoading(true);
    setChatResult('');
    addLog(`Memulai chat playtest via Puter [Model: ${chatModel}]...`, 'info');
    const start = Date.now();

    try {
      const res = await fetch('/api/puter/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: chatPrompt,
          model: chatModel
        })
      });

      const elapsed = Date.now() - start;
      setLatency(elapsed);

      if (res.ok) {
        const data = await res.json();
        // The API returns either raw string or {message: "...", success: true}
        let text = "";
        if (typeof data === 'string') {
          text = data;
        } else {
          const rawVal = data?.message || data?.text;
          if (rawVal && typeof rawVal === 'object') {
            text = rawVal.content !== undefined ? rawVal.content : JSON.stringify(rawVal, null, 2);
          } else {
            text = rawVal || JSON.stringify(data, null, 2);
          }
        }
        setChatResult(text);
        addLog(`Chat sukses dalam ${elapsed}ms!`, 'success');
      } else {
        const errText = await res.text();
        addLog(`Gagal memproses Chat: ${errText || 'Internal Server Error'}`, 'err');
        setChatResult(`Error: ${errText || 'Ditolak oleh gateway server'}`);
      }
    } catch (e: any) {
      addLog(`Kesalahan jaringan: ${e.message || String(e)}`, 'err');
      setChatResult(`Fail: ${e.message || String(e)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Operation: Puter Txt2Img playtest
  const runPuterTxt2Img = async () => {
    if (!imgPrompt.trim()) return;
    setIsLoading(true);
    setImgResultUrl('');
    addLog(`Mengirimkan prompt gambar ke Puter... [Prompt: "${imgPrompt.slice(0, 35)}..."]`, 'info');
    const start = Date.now();

    try {
      const res = await fetch('/api/puter/txt2img', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imgPrompt })
      });

      const elapsed = Date.now() - start;
      setLatency(elapsed);

      if (res.ok) {
        const data = await res.json();
        // The endpoint may return {success: true, url: "..."} or raw binary blob wrapper
        if (data && data.url) {
          setImgResultUrl(data.url);
          addLog(`Gambar berhasil disintesis dalam ${elapsed}ms!`, 'success');
        } else if (data && data.image) {
          setImgResultUrl(data.image); 
          addLog(`Gambar dimuat langsung dalam ${elapsed}ms.`, 'success');
        } else {
          addLog('Puter mengembalikan respons kosong atau tidak tervalidasi.', 'err');
        }
      } else {
        const errVal = await res.text();
        addLog(`Gagal txt2img: ${errVal}`, 'err');
      }
    } catch (e: any) {
      addLog(`Gagal menghubungi server txt2img: ${e.message}`, 'err');
    } finally {
      setIsLoading(false);
    }
  };

  // Operation: Puter Txt2Speech playtest
  const runPuterTxt2Speech = async () => {
    if (!ttsText.trim()) return;
    setIsLoading(true);
    setTtsResultUrl('');
    addLog(`Menguji sintesis vokal Puter TTS [Voice: ${ttsVoice}]...`, 'info');
    const start = Date.now();

    try {
      const res = await fetch('/api/puter/txt2speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ttsText, voice: ttsVoice })
      });

      const elapsed = Date.now() - start;
      setLatency(elapsed);

      if (res.ok) {
        const data = await res.json();
        if (data && data.url) {
          setTtsResultUrl(data.url);
          addLog(`Sintesis suara selesai dalam ${elapsed}ms! URL Audio siap diputar.`, 'success');
          // Instantly play
          const audio = new Audio(data.url);
          audio.play().catch(ea => console.warn("Auto-play blocked:", ea));
        } else {
          addLog('Gagal mengurai binary URL keluaran Puter.', 'err');
        }
      } else {
        addLog('Format audio server mengalami penolakan.', 'err');
      }
    } catch (e: any) {
      addLog(`Sistem TTS gagal: ${e.message}`, 'err');
    } finally {
      setIsLoading(false);
    }
  };

  // Operation: Puter Txt2Vid playtest
  const runPuterTxt2Vid = async () => {
    if (!vidPrompt.trim()) return;
    setIsLoading(true);
    setVidResultUrl('');
    addLog(`Memohon klip video pendek dari AI Puter... [Prompt: "${vidPrompt.slice(0, 35)}..."]`, 'info');
    const start = Date.now();

    try {
      const res = await fetch('/api/puter/txt2vid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: vidPrompt })
      });

      const elapsed = Date.now() - start;
      setLatency(elapsed);

      if (res.ok) {
        const data = await res.json();
        if (data && data.url) {
          setVidResultUrl(data.url);
          addLog(`Video disintesis dengan sukses dalam ${elapsed}ms!`, 'success');
        } else {
          addLog('Puter mengembalikan respons format video kosong.', 'err');
        }
      } else {
        addLog('Kesalahan sintesis video pada server.', 'err');
      }
    } catch (e: any) {
      addLog(`Gagal memuat video: ${e.message}`, 'err');
    } finally {
      setIsLoading(false);
    }
  };

  // Operation: Puter Img2Txt playtest
  const runPuterImg2Txt = async () => {
    if (!visionImgUrl.trim()) return;
    setIsLoading(true);
    setVisionResult('');
    addLog('Mengirimkan URL gambar untuk dianalisis oleh Puter OCR Vision...', 'info');
    const start = Date.now();

    try {
      const res = await fetch('/api/puter/img2txt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: visionImgUrl })
      });

      const elapsed = Date.now() - start;
      setLatency(elapsed);

      if (res.ok) {
        const data = await res.json();
        // Parse result format
        const analysis = data.text || data.message || JSON.stringify(data, null, 2);
        setVisionResult(analysis);
        addLog(`Analisis penglihatan gambar berhasil dalam ${elapsed}ms!`, 'success');
      } else {
        addLog('Gagal menganalisis gambar: format ditolak.', 'err');
      }
    } catch (e: any) {
      addLog(`Kesalahan sirkuit vision: ${e.message}`, 'err');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch models for Selected Provider in Universal LLM Playtest
  const loadProviderModels = async (forceWithOverrides = false) => {
    setFetchingModels(true);
    setProviderModels([]);
    setSelectedModel('');
    addLog(`Mengambil daftar model dinamis untuk provider: ${selectedProvider}...`, 'info');
    try {
      const keyQuery = forceWithOverrides && apiKeyOverride ? `&apiKey=${encodeURIComponent(apiKeyOverride)}` : '';
      const urlQuery = forceWithOverrides && baseUrlOverride ? `&baseUrl=${encodeURIComponent(baseUrlOverride)}` : '';
      const res = await fetch(`/api/ai/models?provider=${selectedProvider}${keyQuery}${urlQuery}`);
      if (res.ok) {
        const data = await res.json();
        let rawList: any[] = [];
        if (Array.isArray(data)) {
          rawList = data;
        } else if (data && Array.isArray(data.models)) {
          rawList = data.models;
        } else if (data && Array.isArray(data.data)) {
          rawList = data.data;
        }

        if (rawList && rawList.length > 0) {
          const formatted = rawList.map((item: any) => {
            if (typeof item === 'string') return { label: item, value: item };
            const id = item.value || item.id || item.name || '';
            const cleanId = id.startsWith('models/') ? id.substring(7) : id;
            const name = item.label || item.displayName || item.name || id;
            return {
              label: name,
              value: cleanId
            };
          });
          setProviderModels(formatted);
          if (formatted.length > 0) {
            const defaultModelObj = formatted.find((m: any) => 
              m.value.includes('flash') || 
              m.value.includes('mini') || 
              m.value.includes('gpt-4o-mini') ||
              m.value.includes('gemini-2')
            ) || formatted[0];
            setSelectedModel(defaultModelObj.value);
          }
          addLog(`Sukses memuat ${formatted.length} model dinamis untuk ${selectedProvider}.`, 'success');
        } else {
          addLog(`Provider ${selectedProvider} mengembalikan respons model kosong atau non-array. Silakan masukkan model secara manual di bawah.`, 'info');
        }
      } else {
        addLog(`Gagal memuat model untuk ${selectedProvider}. Endpoint mengembalikan error.`, 'err');
      }
    } catch (err: any) {
      addLog(`Kesalahan saat memuat model dinamis: ${err.message || String(err)}`, 'err');
    } finally {
      setFetchingModels(false);
    }
  };

  useEffect(() => {
    if (activeSegment !== 'universal_llm') return;
    loadProviderModels(false);
  }, [selectedProvider, activeSegment]);

  // Operation: Run Universal AI Gateway playtest
  const runUniversalTest = async () => {
    if (!universalPrompt.trim()) return;
    setIsLoading(true);
    setUniversalResponse('');
    const targetModel = customModel.trim() || selectedModel;
    addLog(`Mengirim pengetesan nalar universal via [Provider: ${selectedProvider}] [Model: ${targetModel || 'Default'}]...`, 'info');
    const start = Date.now();

    try {
      const configOverride: any = {
        temperature: temperature,
        maxTokens: maxTokens,
        maxOutputTokens: maxTokens
      };
      if (apiKeyOverride.trim()) {
        configOverride.apiKey = apiKeyOverride.trim();
        configOverride.token = apiKeyOverride.trim();
      }
      if (baseUrlOverride.trim()) {
        configOverride.baseUrl = baseUrlOverride.trim();
        configOverride.endpoint = baseUrlOverride.trim();
      }

      const res = await fetch('/api/ai/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          model: targetModel,
          prompt: universalPrompt,
          systemInstruction: universalSystemPrompt,
          configOverride
        })
      });

      const elapsed = Date.now() - start;
      setLatency(elapsed);

      if (res.ok) {
        const data = await res.json();
        let textVal = "";
        if (data && data.text !== undefined) {
          if (typeof data.text === 'object') {
            textVal = data.text.content !== undefined ? data.text.content : JSON.stringify(data.text, null, 2);
          } else {
            textVal = String(data.text);
          }
        } else {
          textVal = JSON.stringify(data, null, 2);
        }
        setUniversalResponse(textVal);
        addLog(`Universal response [${selectedProvider}] loaded successfully in ${elapsed}ms!`, 'success');
      } else {
        const errText = await res.text();
        addLog(`Playtest failed (${res.status}): ${errText}`, 'err');
        setUniversalResponse(`Failed: ${errText}`);
      }
    } catch (e: any) {
      addLog(`Playtest connection disconnected: ${e.message}`, 'err');
      setUniversalResponse(`Error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Operation: Save playtest/diagnose as default provider and model
  const applyDiagnosedProviderAndModel = async () => {
    const targetModel = customModel.trim() || selectedModel;
    addLog(`Saving [Provider: ${selectedProvider}] and [Model: ${targetModel || 'Default'}] as primary core configuration...`, 'info');
    setIsLoading(true);
    try {
      const updatedSettings = {
        ...settings,
        provider: selectedProvider,
        [selectedProvider]: {
          ...(settings[selectedProvider] || {}),
          model: targetModel
        }
      };
      
      if (apiKeyOverride.trim()) {
        updatedSettings[selectedProvider] = {
          ...updatedSettings[selectedProvider],
          apiKey: apiKeyOverride.trim()
        };
      }
      if (baseUrlOverride.trim()) {
        updatedSettings[selectedProvider] = {
          ...updatedSettings[selectedProvider],
          baseUrl: baseUrlOverride.trim()
        };
      }

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings)
      });

      if (res.ok) {
        setSettings(updatedSettings);
        addLog(`Core system updated successfully! [${selectedProvider}] with model [${targetModel}] is now the primary processor.`, 'success');
      } else {
        const txt = await res.text();
        addLog(`Failed to save settings: ${txt}`, 'err');
      }
    } catch (e: any) {
      addLog(`Save connection disconnected: ${e.message}`, 'err');
    } finally {
      setIsLoading(false);
    }
  };

  // Operation: Test All Speech TTS playtest
  const runGeneralTtsTest = async () => {
    if (!ttsEngineText.trim()) return;
    setIsLoading(true);
    addLog(`Sending benchmarking vocal request via [TTS Engine: ${ttsEngineSelected}]...`, 'info');
    const start = Date.now();

    try {
      let res;
      if (ttsEngineSelected === 'puter-tts') {
        res = await fetch('/api/puter/txt2speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: ttsEngineText, voice: 'en-US-1' })
        });
      } else {
        // Fallback to active speech generator
        res = await fetch('/api/speech/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: ttsEngineText })
        });
      }

      const elapsed = Date.now() - start;
      setLatency(elapsed);

      if (res.ok) {
        const data = await res.json();
        const finalUrl = data.url || data.audioUrl;
        if (finalUrl) {
          addLog(`TTS request successful in ${elapsed}ms! Playing audio demo...`, 'success');
          const audio = new Audio(finalUrl);
          audio.play().catch(ea => console.warn("Sound playback blocked:", ea));
        } else {
          addLog('Received successful response but audio URL is empty.', 'err');
        }
      } else {
        addLog('TTS endpoint rejected the input parameters.', 'err');
      }
    } catch (e: any) {
      addLog(`Failed to benchmark sound: ${e.message}`, 'err');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* HEADER BANNER DIAGNOSTICS */}
      <div className="bg-[#0e0e14]/55 border border-white/5 p-6 rounded-3xl space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
          <div>
            <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#d4d4d8]/40 mb-1 font-bold">Neural Diagnostics & Integration</h4>
            <h3 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
              <Cpu size={18} className="text-amber-500 animate-pulse" /> Unified Provider Playground
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setActiveSegment('universal_llm'); setLatency(null); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${
                activeSegment === 'universal_llm' 
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-md' 
                  : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10'
              }`}
            >
              <Sparkles size={14} /> Universal AI Gateway
            </button>
            <button
              onClick={() => { setActiveSegment('tts_all'); setLatency(null); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${
                activeSegment === 'tts_all' 
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' 
                  : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10'
              }`}
            >
              <Volume2 size={14} /> Vocal Suite
            </button>
          </div>
        </div>
        
        <p className="text-xs text-zinc-400 leading-relaxed max-w-3xl">
          Interactive terminal for testing latency, reasoning circuits, and neural voice synthesis.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* INTERACTIVE CONTROLLER ZONE */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* TAB 2: UNIVERSAL COGNITIVE LLM DIRECT TEST */}
          {activeSegment === 'universal_llm' && (
            <div className="bg-[#0e0e14]/55 border border-white/5 rounded-2xl p-6 space-y-6">
              <div className="space-y-1.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h5 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Universal AI Gateway Test Controller</h5>
                  <p className="text-[11px] text-zinc-500">Test reasoning circuits of registered providers.</p>
                </div>
                {latency && (
                  <span className="text-[9px] font-mono bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2.5 py-1 rounded-xl">
                    LATENCY: {latency} ms
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-black/40 border border-white/5 p-5 rounded-2xl">
                {/* 1. Provider Selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono font-bold text-zinc-400">Select AI Provider</label>
                  <SearchableSelect
                    value={selectedProvider}
                    onChange={(val) => setSelectedProvider(val)}
                    options={REGISTERED_PROVIDERS_STATIC_DATA.filter(p => p.tab === 'chat').map((p) => ({
                      value: p.id,
                      label: `${p.name} (${p.deployment})`
                    }))}
                    placeholder="Search AI Provider..."
                    className="bg-zinc-950 border-white/10 text-xs focus:border-amber-500 font-mono py-2"
                  />
                </div>

                {/* 2. Model Selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono font-bold text-zinc-400 flex items-center justify-between">
                    <span>Target Model</span>
                    <div className="flex items-center space-x-1">
                      {fetchingModels && (
                        <span className="animate-pulse text-[9px] text-amber-500 font-mono">Syncing...</span>
                      )}
                      <button
                        type="button"
                        onClick={() => loadProviderModels(true)}
                        className="text-amber-500 hover:text-amber-400 transition flex items-center space-x-1"
                        title="Query dynamic models"
                        disabled={fetchingModels}
                      >
                        <RefreshCw className={`w-2.5 h-2.5 ${fetchingModels ? 'animate-spin' : ''}`} />
                        <span className="text-[9px]">Query Override</span>
                      </button>
                    </div>
                  </label>
                  <SearchableSelect
                    value={selectedModel}
                    onChange={(val) => setSelectedModel(val)}
                    options={
                      providerModels.length > 0
                        ? providerModels.map((m) => ({
                            value: m.value,
                            label: m.label
                          }))
                        : [{ value: '', label: '-- Type Model Name Below --' }]
                    }
                    disabled={fetchingModels}
                    placeholder="Search diagnostic model..."
                    className="bg-zinc-950 border-white/10 text-xs focus:border-amber-500 font-mono py-2"
                  />
                </div>

                {/* 3. API Key / Token Override */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono font-bold text-zinc-400">API Key Override (Optional)</label>
                  <input
                    type="password"
                    value={apiKeyOverride}
                    onChange={(e) => setApiKeyOverride(e.target.value)}
                    placeholder="Enter API Key to override setting"
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-base sm:text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                {/* 4. Base URL Override */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono font-bold text-zinc-400">Base URL Override (Optional)</label>
                  <input
                    type="text"
                    value={baseUrlOverride}
                    onChange={(e) => setBaseUrlOverride(e.target.value)}
                    placeholder="e.g. https://api.openai.com/v1"
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-base sm:text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                {/* 5. Custom Model Input (Fallback) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono font-bold text-zinc-400">Custom Model Override (Optional)</label>
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="e.g. gpt-4o, claude-3-5-sonnet, gemini-1.5-pro, deepseek-chat"
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-base sm:text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <p className="text-[9px] text-zinc-500">Overrides the dropdown selection above.</p>
                </div>

                {/* 6. Temperature Slider */}
                <LockedSlider
                  value={temperature}
                  onChange={(val) => setTemperature(val)}
                  min={0}
                  max={2}
                  step={0.1}
                  label="Temperature Control"
                  description="Control randomized creativity aspect (0 is cold/precise, 1+ is highly creative/creative)"
                  themeColor="amber"
                />

                {/* 7. Max Tokens Limit slider */}
                <LockedSlider
                  value={maxTokens}
                  onChange={(val) => setMaxTokens(val)}
                  min={2048}
                  max={131072}
                  step={2048}
                  label="Max Tokens Limit"
                  description="Adjust total tokens limit bounds per request context"
                  themeColor="cyan"
                />
              </div>

              {/* 5. System Instruction Box */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono font-bold text-zinc-400">System Instruction (System Prompt)</label>
                <textarea
                  value={universalSystemPrompt}
                  onChange={(e) => setUniversalSystemPrompt(e.target.value)}
                  rows={2}
                  className="w-full bg-[#111115] border border-white/10 rounded-xl p-3 text-base sm:text-xs text-white focus:outline-none focus:border-amber-500 font-sans"
                  placeholder="Personality shaping prompt or diagnostic directive..."
                />
              </div>

              {/* 6. Prompt Test Box */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono font-bold text-zinc-400">Test Query (Prompt)</label>
                <textarea
                  value={universalPrompt}
                  onChange={(e) => setUniversalPrompt(e.target.value)}
                  rows={2}
                  className="w-full bg-[#111115] border border-white/10 rounded-xl p-3 text-base sm:text-xs text-white focus:outline-none focus:border-amber-500 font-sans"
                  placeholder="Enter message to test..."
                />
              </div>

              {/* Action Button */}
              <button
                onClick={runUniversalTest}
                disabled={isLoading || fetchingModels}
                className="w-full md:w-auto bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold px-5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {isLoading ? <RefreshCw className="animate-spin" size={13} /> : <Play size={13} />}
                Run AI Diagnosis
              </button>

              {/* Result Viewer */}
              {universalResponse && (
                <div className="space-y-1.5 border-t border-white/5 pt-4">
                  <span className="text-[10px] uppercase font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle size={12} /> Diagnosis Result
                  </span>
                  <div className="bg-black border border-white/5 p-4 rounded-xl text-xs text-zinc-300 font-sans whitespace-pre-wrap leading-relaxed shadow-inner">
                    {universalResponse}
                  </div>
                  {!universalResponse.startsWith('Gagal:') && !universalResponse.startsWith('Error:') && (
                    <button
                      onClick={applyDiagnosedProviderAndModel}
                      disabled={isLoading}
                      className="mt-3 bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] sm:text-xs font-mono font-bold px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg disabled:opacity-50"
                    >
                      <Sparkles size={12} /> Set as Main Model & Provider
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: VOCAL SUITE ENGINES TEST */}
          {activeSegment === 'tts_all' && (
            <div className="bg-[#0e0e14]/55 border border-white/5 rounded-2xl p-6 space-y-6">
              <div className="space-y-1.5">
                <h5 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Universal Vocal Benchmark Suite</h5>
                <p className="text-[11px] text-zinc-500">Check synthesis wave output (TTS).</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono font-bold text-zinc-400">Vocal Synthesizer Engine</label>
                  <select
                    value={ttsEngineSelected}
                    onChange={(e) => setTtsEngineSelected(e.target.value)}
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-base sm:text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  >
                    <option value="puter-tts">Puter.js TTS Cloud (Default Free)</option>
                    <option value="official_speech">Airi Official TTS Router</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono font-bold text-zinc-400">Synthesis Input Text</label>
                <textarea
                  value={ttsEngineText}
                  onChange={(e) => setTtsEngineText(e.target.value)}
                  rows={2}
                  className="w-full bg-black/60 border border-white/10 rounded-xl p-3 text-base sm:text-xs text-white focus:outline-none focus:border-amber-500 font-sans"
                  placeholder="Enter test text to synthesize..."
                />
              </div>

              <button
                onClick={runGeneralTtsTest}
                disabled={isLoading}
                className="w-full md:w-auto bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {isLoading ? <RefreshCw className="animate-spin" size={13} /> : <Volume2 size={13} />}
                Synthesize Audio
              </button>
            </div>
          )}

        </div>

        {/* SIDE BAR: LIVE LOGS DIAGNOSTIC TERMINAL */}
        <div className="space-y-6">
          <div className="bg-black/50 border border-white/5 rounded-2xl p-5 space-y-4">
            <h5 className="text-[10px] uppercase font-mono tracking-widest text-[#d4d4d8]/40 font-bold flex items-center gap-1.5">
              <Terminal size={12} className="text-amber-500 animate-pulse" /> Live Diagnostics Trace
            </h5>

            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {testLogs.map((log, index) => (
                <div key={index} className="text-[10.5px] font-mono leading-relaxed border-b border-white/[0.02] pb-2">
                  <div className="flex justify-between items-center mb-0.5 text-[9px]">
                    <span className="text-zinc-600">{log.time}</span>
                    <span className={`px-1 rounded uppercase font-bold text-[8px] ${
                      log.type === 'success' 
                        ? 'bg-emerald-500/10 text-emerald-400' 
                        : log.type === 'err' 
                          ? 'bg-red-500/10 text-red-400' 
                          : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {log.type}
                    </span>
                  </div>
                  <p className="text-zinc-400 break-words">{log.text}</p>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-white/5">
              <button 
                onClick={() => setTestLogs([])}
                className="w-full py-1.5 bg-white/5 hover:bg-white/10 text-zinc-400 text-[10px] font-mono rounded-lg transition-all cursor-pointer border border-white/5"
              >
                Clear History
              </button>
            </div>
          </div>

          <div className="bg-[#0e0e14]/40 border border-[#b85b4f]/10 rounded-2xl p-4 space-y-3.5">
            <div className="flex items-center gap-2">
              <Info size={14} className="text-amber-500" />
              <h5 className="text-xs font-bold text-white tracking-wide">Puter Authorization</h5>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed font-normal">
              Puter API operations are proxied through server gateway. Provide a <strong>Puter Auth Token</strong> in the <strong>Providers</strong> tab for custom configurations.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
};
