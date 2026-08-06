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
   - addons dir runtime (default `~/.yuihime/addons/`, override `--addons` / `YUIHIME_ADDONS_PATH`) — tidak ada folder `/addons/` di root repo
2. Pastikan file mengekspor modul dengan properti `metadata`.
3. Sistem akan mendeteksi modul secara otomatis via `RegistryInitializer.ts`. **Dilarang mengedit file registrasi secara manual.**

## 4. Persistensi & Sinkronisasi
- Semua setting disimpan di server dalam file `config.toml`.
- UI Setting terhubung langsung ke backend via `/api/settings`.
- Setting bersifat permanen hingga diubah user.

## 5. Panduan Modul untuk Streaming & Real-Time Token Flow

Sistem Yuihime v4.296 mendukung penuh dua pilar arsitektur streaming:
1. **AI Token Stream (LLM Generation)**: Aliran chunk teks karakter demi karakter (real-time token generation) dari LLM Provider untuk meminimalkan latensi percakapan secara dramatis.
2. **Live Event Stream (SSE - Server-Sent Events)**: Aliran data subjudul, perubahan status visual, ekspresi emosional, dan animasi avatar dari backend langsung ke OBS/Live2D overlay secara non-blocking.

---

### A. AI Token Stream (LLM Generation)

Real-time token streaming ditangani di dalam cortex pipeline di `src/core/kernel/ai/generateSegment.ts` melalui callback `onChunk`. Provider **tidak** diwajibkan mengimplementasikan metode `generateStream` — tidak ada provider yang mendefinisikannya (grep `generateStream` = 0 hits). Alih-alih, setiap provider mengekspos satu metode `generate` (plus opsional `getModels` / `getDynamicOptions`); `ProviderGatewayModule` mengatur pemilihan model, dan `generateSegment.ts` mengalirkan chunk melalui `onChunk` sambil menyusun respons lengkap.

- **Input**: Menggunakan format `ChatCompletionMessage[]` (OpenAI-compatible).
- **Streaming**: Saat `stream: true`, chunk dialirkan melalui callback `onChunk` dan diteruskan ke klien via SSE (`/api/stream/events`) atau lapisan kompatibel OpenAI (`POST /v1/chat/completions` dengan `stream: true`).
- **Kontrak provider**: Sebuah provider cukup mengekspor `metadata` + `generate(prompt, config)`; token streaming adalah tanggung jawab pipeline (`generateSegment.ts`), bukan provider.

---

### B. Mengonsumsi Stream dalam Cortex Pipeline

Kognisi Yuihime beroperasi menggunakan alur berurutan (*Cortex Modules Pipeline*). `ParallelStreamerModule` bertindak sebagai dual-IO Hub kognitif di fase `optimize-output`. 

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
    phase: 'evaluation',
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
