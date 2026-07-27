# Yuihime Modular Standarization (SOP)

Panduan ini mendefinisikan standar absolut untuk pembuatan Modul, Addon, dan Provider di ekosistem Yuihime.

## 1. Metadata Standarisasi
Setiap komponen **WAJIB** mengekspor objek dengan metadata yang mengikuti interface `BaseModuleMetadata`.

### Properti Metadata:
- `id`: Unique identifyer (kebab-case).
- `name`: Nama tampilan (Prefix kategori: `yui-addon:`, `yui-api:`, dll).
- `settingsTab`: Tab tempat setting muncul (`Providers`, `Addons`, `Neural`, `Vocal`, `System`).
- `configSchema`: Definisi UI setting otomatis.

### Tipe Field Config (Dukungan UI):
| Tipe | Deskripsi |
| :--- | :--- |
| `string` | Input teks standar. |
| `number` | Input angka (mengembalikan float). |
| `boolean` | Switch On/Off. |
| `password` | Input teks tersembunyi (API Keys). |
| `textarea` | Input teks multi-baris. |
| `select` | Dropdown menu. |
| `color` | Color picker (HEX). |
| `slider` | Slider angka (memerlukan `min`, `max`, `step`). |

### Fitur Opsi Dinamis:
Jika sebuah field `select` membutuhkan data dari API (misal: daftar model), gunakan properti `dynamicOptions: true`.
Modul harus mengimplementasikan fungsi `getDynamicOptions`:
```typescript
getDynamicOptions: async (fieldName, currentConfig) => {
  if (fieldName === 'my_field') {
    return [{ label: 'Option A', value: 'a' }];
  }
}
```

## 2. OpenAI Alignment (SOP Pemrosesan)
Setiap modul yang memproses teks atau fungsi LLM **WAJIB** mengikuti format OpenAI.

- **Input**: Menggunakan format `ChatCompletionMessage[]`.
- **Logic**: Jika melakukan tool calling, deklarasi parameter harus menggunakan **JSON Schema**.
- **Output**: Harus bisa memberikan `tool_calls` jika diperlukan.

## 3. SOP Registrasi (Plug-and-Play)
1. Tempatkan file di folder yang sesuai:
   - `/src/drivers/ai-providers/` (LLM Providers)
   - `/src/modules/` (Core Cortex Modules)
   - `/addons/` (External Addons)
2. Pastikan file mengekspor modul dengan properti `metadata`.
3. Sistem akan mendeteksi modul secara otomatis via `RegistryInitializer.ts`. **Dilarang mengedit file registrasi secara manual.**

## 4. Persistensi & Sinkronisasi
- Semua setting disimpan di server dalam file `config.toml`.
- UI Setting terhubung langsung ke backend via `/api/settings`.
- Setting bersifat permanen hingga diubah user.

## 5. Panduan Modul untuk Streaming & Real-Time Token Flow

Sistem Yuihime v4.5 mendukung penuh dua pilar arsitektur streaming:
1. **AI Token Stream (LLM Generation)**: Aliran chunk teks karakter demi karakter (real-time token generation) dari LLM Provider untuk meminimalkan latensi percakapan secara dramatis.
2. **Live Event Stream (SSE - Server-Sent Events)**: Aliran data subjudul, perubahan status visual, ekspresi emosional, dan animasi avatar dari backend langsung ke OBS/Live2D overlay secara non-blocking.

---

### A. Kompatibilitas AI Provider Streaming (`generateStream`)

Setiap LLM Provider di Yuihime didorong untuk mendukung kognisi streaming. Agar provider Anda mendukung streaming secara lancar, Anda wajib menambahkan metode `generateStream` pada objek modul provider Anda di folder `/src/drivers/ai-providers/`.

#### Interface Standar Provider Streaming:
```typescript
import { ProviderModule, ChatCompletionMessage } from '../../include/types';

export interface StreamableProviderModule extends ProviderModule {
  /**
   * Menghasilkan teks secara streaming melalui callback onChunk
   */
  generateStream?: (
    prompt: string | ChatCompletionMessage[],
    config: any,
    onChunk: (chunk: string) => void
  ) => Promise<string>;
}
```

#### Contoh Implementasi Modul Provider yang Mendukung Streaming:
Berikut adalah contoh struktur lengkap untuk provider OpenAI/Local (seperti Ollama) yang mengimplementasikan generate stream modular:

```typescript
// /src/drivers/ai-providers/MyCustomProvider.ts
import { ProviderModule, ModuleType } from '../../include/types';

export const MyCustomProvider: ProviderModule & {
  generateStream: (prompt: string, config: any, onChunk: (chunk: string) => void) => Promise<string>;
} = {
  metadata: {
    id: 'my-custom-provider',
    name: 'Custom Streaming Provider',
    description: 'AI Provider yang mendukung real-time token streaming.',
    version: '1.0.0',
    type: ModuleType.PROVIDER,
    order: 4,
    models: ['custom-gpt-4o', 'custom-gpt-4-mini'],
    configSchema: {
      fields: {
        baseUrl: { type: 'string', label: 'API Base URL', default: 'https://api.openai.com/v1' },
        apiKey: { type: 'password', label: 'API Key', default: '' },
        model: { type: 'string', label: 'Model ID', default: 'custom-gpt-4o' }
      }
    }
  },

  getModels: async (config: any) => {
    return [
      { label: 'GPT-4o Custom', value: 'custom-gpt-4o' },
      { label: 'GPT-4-mini Custom', value: 'custom-gpt-4-mini' }
    ];
  },

  // Fallback standar (non-stream)
  generate: async (prompt: string, context: any) => {
    const config = context.config?.['my-custom-provider'] || context.config || {};
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    const apiKey = config.apiKey || '';
    const model = config.model || 'custom-gpt-4o';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        stream: false
      })
    });

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  },

  // IMPLEMENTASI UTAMA: Real-time Streaming
  generateStream: async (prompt: string, context: any, onChunk: (chunk: string) => void) => {
    const config = context.config?.['my-custom-provider'] || context.config || {};
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    const apiKey = config.apiKey || '';
    const model = config.model || 'custom-gpt-4o';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        stream: true // Aktifkan flag stream dari API hulu
      })
    });

    if (!response.ok || !response.body) {
      throw new Error(`Gagal menginisiasi stream: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullResponse = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // simpan baris parsial yang belum lengkap ke buffer

      for (const line of lines) {
        const cleanedLine = line.trim();
        if (!cleanedLine || cleanedLine === 'data: [DONE]') continue;

        if (cleanedLine.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(cleanedLine.slice(6));
            const token = parsed.choices?.[0]?.delta?.content || '';
            if (token) {
              fullResponse += token;
              onChunk(token); // Picu callback onChunk untuk mendesiminasikan token secara instant
            }
          } catch (e) {
            // Abaikan kesalahan parsial JSON yang tidak valid dalam paket stream
          }
        }
      }
    }

    return fullResponse;
  }
};
```

---

### B. Mengonsumsi Stream dalam Cortex Pipeline

Kognisi Yuihime beroperasi menggunakan alur berurutan (*Cortex Modules Pipeline*). `ParallelStreamerModule` bertindak sebagai dual-IO Hub kognitif di fase `PHASE 4: OPTIMIZATION`. 

Jika Anda membuat modul kognitif kustom dan ingin menangkap output asinkron hasil konvergensi sinyal sebelum dialirkan ke live HUD, ikuti arsitektur berikut:

1. Modul Anda harus didaftarkan di kategori `Cortex` dengan prioritas urutan (`order`) setelah atau sebelum `parallel-streamer` (tergantung fase modul Anda).
2. Modul dapat mengirim pesan real-time ke overlay penonton live streaming secara manual menggunakan gateway internal `/api/stream/events`.

#### Contoh Skrip Pengiriman Event Kustom dari Modul:
```typescript
// /src/modules/LiveModeratorModule.ts
import { CortexModule, ModuleType } from '../include/types';

export const LiveModeratorModule: CortexModule = {
  metadata: {
    id: 'live-moderator',
    name: 'yui-cortex: Live Moderator',
    description: 'Memantau obrolan sensitif penonton dan mengirimkan signal peringatan ke visual overlay.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    phase: 'PHASE 3: EVALUATION',
    order: 1
  },
  run: async (input: string, state: any, context: any) => {
    console.log('[MODERATOR] Mengevaluasi konten obrolan penonton...');

    // Simulasi mendeteksi kata terlarang
    if (input.toLowerCase().includes('kasar')) {
      // Kirim sinyal visual instan ke overlay HUD via HTTP POST lokal (SSE Gateway)
      try {
        await fetch('http://localhost:3000/api/stream/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'moderation_alert',
            data: {
              title: "PERINGATAN MODERATOR",
              message: "Deteksi konten sensitif dalam obrolan live stream.",
              timestamp: Date.now()
            }
          })
        });
      } catch (e) {
        console.warn('[MODERATOR] Gagal mengirim pengumuman real-time ke overlay.');
      }
    }

    return context; // Lanjutkan pipa kognisi downstream
  }
};
```

---

### C. Aliran Sinkronisasi Visual & Audio OBS Overlay

Pada sisi client (Antarmuka Pengguna atau OBS Browser Source), endpoint SSE `/api/stream/events` dikonsumsi secara real-time untuk memperbarui status visual Live2D avatar Yuihime secara asinkron tanpa mematikan obrolan aktif.

#### Skema Aliran Pesan SSE pada Client:
```javascript
// Mengakses stream dari OBS Studio (Browser Source)
const eventSource = new EventSource('/api/stream/events');

eventSource.onmessage = (event) => {
  const payload = JSON.parse(event.data);
  
  switch(payload.type) {
    case 'state_update':
      // Membaca postur avatar kustom, ekspresi emosional, animasi, dan subtitle real-time
      const { state, activeSubtitle, animations } = payload.data;
      updateAvatarRenderer(state.mood, animations);
      renderSubtitles(activeSubtitle);
      break;
      
    case 'memory_update':
      // Membaca obrolan penonton baru yang menyertai livestream
      appendLiveChatList(payload.data);
      break;
      
    case 'moderation_alert':
      // Menampilkan notifikasi keamanan/moderasi pop-up pada livestream UI
      showSafetyBanner(payload.data.title, payload.data.message);
      break;
  }
};
```

Setiap modul kustom didorong untuk mengikuti pola asinkron ini agar kestabilan visual VTuber, sintesis suara, dan database tetap dalam status prima (Absolute Zero Blocking Vibe).
