# Dokumentasi SocketService & WebSocket Protocol (YuiHime AGI)

Documentasi teknis arsitektur komunikasi real-time WebSocket antara Web Client UI (`web/src/core/socket.ts`) dan Daemon Backend Server (`server.ts` & `src/core/server/apiRouter.ts`).

---

## 1. Ikhtisar Arsitektur (Overview)

`SocketService` diimplementasikan sebagai **Singleton Client-Side Service** berbasis TypeScript yang menjamin koneksi bidirectional berkecepatan tinggi antara antarmuka Web UI dan Daemon Yuihime.

### Fitur Utama
- **Offline Tolerance**: Jika daemon server belum berjalan atau terputus, Web UI tetap beroperasi normal tanpa crash (*graceful fallback*).
- **Auto Reconnect with Backoff**: Rekoneksi otomatis secara bertahap saat server kembali *online*.
- **Heartbeat (Ping/Pong)**: Menjaga koneksi tetap hidup (*keep-alive*) setiap 25 detik.
- **Dynamic Event Parsing**: Otomatis mendeteksi dan memproses event pemicu animasi avatar (Live2D & VRM) serta *stream audio TTS*.
- **Integrated EventBus**: Menyalurkan data masuk langsung ke `eventBus` global untuk dikonsumsi oleh komponen UI manapun.

---

## 2. Struktur Payload Pesan (`SocketMessagePayload`)

Setiap frame JSON yang dikirim atau diterima melalui WebSocket mengikuti standar struktur:

```json
{
  "type": "nama_event",
  "data": { ... },
  "timestamp": 1770000000000
}
```

---

## 3. Jenis Event Kunci & Payload Standard

### A. Triggers Animasi & Ekspresi Avatar (`AvatarAnimationTrigger`)

Mendukung tipe event: `avatar_animation`, `motion_trigger`, `expression_change`, `avatar_action`, `motion`, `expression`, `emote_trigger`, `pose_change`.

**Payload Client Interface:**
```typescript
interface AvatarAnimationTrigger {
  motionGroup?: string;  // Contoh: 'Idle', 'TapBody', 'Joy', 'Shy'
  motionIndex?: number;  // Urutan indeks gerak (default: 0)
  expression?: string;   // Contoh: 'blush', 'smile', 'angry', 'sad'
  emote?: string;        // Sebutan alternatif ekspresi
  duration?: number;     // Durasi animasi (ms)
  intensity?: number;    // Intensitas gerakan (0.0 - 1.0)
  raw?: any;
}
```

### B. Stream Audio TTS & Lip-Sync Chunk (`TTSAudioStreamPayload`)

Mendukung tipe event: `tts_audio_stream`, `audio_chunk`, `tts_audio`, `audio_stream`, `speech_stream`, `voice_chunk`.

**Payload Client Interface:**
```typescript
interface TTSAudioStreamPayload {
  audioUrl?: string;
  base64Audio?: string; // Data audio terenskripsi Base64 (MP3/WAV)
  chunk?: string;
  mimeType?: string;    // Contoh: 'audio/mp3', 'audio/wav'
  sampleRate?: number;  // Contoh: 24000 Hz
  isFinal?: boolean;    // Flag penanda chunk terakhir
  text?: string;        // Teks transkrip terkait
  speaker?: string;     // Nama identitas suara ('Yuihime')
  duration?: number;
}
```

---

## 4. Helper Server-Side (`src/core/server/apiRouter.ts`)

Server menyediakan fungsi penyiaran (*broadcasting*) terpusat yang mengirim pesan ke seluruh WebSocket active clients sekaligus SSE Stream:

```typescript
import { 
  broadcastToWS, 
  broadcastAvatarAnimation, 
  broadcastTTSAudioStream 
} from '@/core/server/apiRouter.js';

// 1. Broadcast Umum
broadcastToWS({ type: 'memory_update', data: { ... } });

// 2. Broadcast Pemicu Gerakan & Ekspresi Avatar
broadcastAvatarAnimation('Joy', 0, 'smile', 'blush');

// 3. Broadcast Stream Audio TTS
broadcastTTSAudioStream(base64Mp3String, "Halo Kak! Yuihime di sini!", true);
```

---

## 5. Cara Penggunaan pada Komponen Web UI

```typescript
import { socketService } from '../core/socket';
// Note: the client SocketService lives in web/src/core/socket.ts.
// In web code use a relative import ('../core/socket') or the '@web/core/socket' alias.
// Do NOT use '@/core/socket' — '@/' resolves to the daemon src/ tree.

// A. Mendaftarkan Listener Animasi Avatar
useEffect(() => {
  const unsubscribeAnim = socketService.onAnimationTrigger((anim) => {
    console.log('Trigger Animasi:', anim.motionGroup, anim.expression);
  });

  return () => unsubscribeAnim();
}, []);

// B. Mendaftarkan Listener Audio TTS Stream
useEffect(() => {
  const unsubscribeAudio = socketService.onAudioStream((audio) => {
    console.log('Menerima chunk audio TTS:', audio.text);
  });

  return () => unsubscribeAudio();
}, []);

// C. Mendaftarkan Listener Event Kustom
useEffect(() => {
  const unsubscribe = socketService.on('state_update', (data) => {
    console.log('Update State AGI:', data);
  });

  return () => unsubscribe();
}, []);

// D. Mengirim Pesan dari UI ke Server
socketService.send('user_presence', { status: 'active' });
```

---

## 6. Penanganan Mode Offline & Keamanan Runtime

1. Jika server mengalami kemacetan atau mati, `SocketService` beralih ke status `'offline'` tanpa memblokir pergerakan antarmuka pengguna (UI tetap 100% responsif).
2. Pemutaran audio otomatis (*auto-play*) dilindungi oleh *catch handling* sehingga batasan browser (*browser audio autoplay policy*) tidak akan menghentikan eksekusi kode.
