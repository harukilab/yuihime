# YuiHime External API & Livestream Integration Guide

Dokumen panduan ini ditujukan bagi para pengembang (developer), modder, atau streamer yang ingin menghubungkan aplikasi, bot eksternal, web scrapper (YouTube, Twitch, TikTok, Discord), maupun skrip otomasi (Python/Shell) langsung ke sirkuit kognitif cerdas Yuihime untuk melakukan aktivitas **Live Streaming**.

Dengan menggunakan gerbang API terpadu yang disediakan oleh **Kernel Yuihime**, modul luar dapat menyuplai baris interaksi obrolan secara dinamis dan membiarkan Yui merespons secara otonom dalam hitungan detik.

---

## 📡 Arsitektur Aliran Kognitif Eksternal

Aliran data interaksi dari internet ke panggung visual Yuihime mengikuti sirkuit sekuensial berikut:

```text
[Aplikasi / Bot / Scraper Luar] 
             │ (HTTP POST JSON payload)
             ▼
   [POST /api/stream/chat]
             │
             ├──► [WebSocket & SSE Broadcast] ✅ (Komentar muncul instan di Layar & OBS HUD)
             │
             ▼
    [MultiChannelQueue] ◄─── (Antrean obrolan aman & bebas-blocking)
             │
             ▼
    [NeuralInterface] ◄──── (Logika pemrosesan saraf kognitif)
             │
             ▼
        [Cortex AI] ◄───── (Memanggil memori batin SQLite + LLM Gateway)
             │
             ├──► [Animasi & Gerak Tubuh] (Live2D & VRM Expression updates)
             ├──► [TTS Audio Playback] (Yui berbicara langsung di streaming)
             ▼
[Respons Balasan (Talking)] ➔ Dipancarkan ke Layar Kontrol & OBS Overlay
```

---

## 🔑 Endpoint Utama: Ingest Obrolan Live

Yuihime mengekspos endpoint tunggal yang sangat fleksibel untuk menampung seluruh masukan obrolan livestreaming:

*   **Endpoint**: `/api/stream/chat`
*   **Metode HTTP**: `POST`
*   **Content-Type**: `application/json`

### 📋 Skema Parameter Request (JSON Payload)

| Field Name | Type | Required | Default | Deskripsi |
| :--- | :--- | :---: | :--- | :--- |
| `message` | `string` | **Ya** | - | Isi pesan/komentar dari penonton streaming (misal: "Halo Yui, semangat live-nya!"). |
| `sender` | `string` | Opsional | `"Penonton"` | Nama samaran penonton pengirim pesan (misal: `"Tanaka_Gamer"`). |
| `context` | `string` | Opsional | `"live_stream"` | Konteks klastering memori di SQLite. Gunakan `"live_stream"` agar Yui mengingat obrolan ini sebagai bagian dari interaksi siaran langsung. |
| `channel` | `string` | Opsional | `"Live Chat"` | Platform/saluran asal pesan (misal: `"YouTube Live"`, `"Twitch Chat"`, `"TikTok Live"`, `"Discord"`). |

---

## 💻 Contoh Implementasi Kode Eksternal

Berikut adalah templat kode siap pakai dalam berbagai bahasa pemrograman populer untuk diletakkan di dalam bot scraper Anda:

### 1. Kurir Node.js / TypeScript (JavaScript)

Gunakan metode `fetch` bawaan Node.js modern untuk mengirim pesan secara teratur:

```javascript
async function sendStreamChat(sender, message, platform = "YouTube Live") {
  const serverUrl = "http://localhost:3000/api/stream/chat"; // Ganti dengan URL Live App Anda jika di-deploy
  
  try {
    const response = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: message,
        sender: sender,
        context: "live_stream",
        channel: platform
      })
    });
    
    const result = await response.json();
    if (response.ok && result.success) {
      console.log(`[SUKSES] Komentar dari ${sender} diproses: "${result.response || 'Antrean berjalan'}"`);
    } else {
      console.error("[GAGAL] Tanggapan error dari server:", result.error);
    }
  } catch (error) {
    console.error("[ERROR] Gagal melakukan request ke Yuihime:", error.message);
  }
}

// Contoh memanggil fungsi
sendStreamChat("Zetta_Viewer", "Yui, bisakah kamu menyapa penggemar di Indonesia? 🌸");
```

### 2. Skrip Python (Sangat cocok untuk Stream Scraper / PyYTSpammer)

Instal library dependency `requests` terlebih dahulu (`pip install requests`):

```python
import requests
import json

def kirim_komentar_yui(sender, text, platform="Twitch Chat"):
    url = "http://localhost:3000/api/stream/chat"
    payload = {
        "message": text,
        "sender": sender,
        "context": "live_stream",
        "channel": platform
    }
    headers = {
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(url, data=json.dumps(payload), headers=headers)
        data = response.json()
        
        if response.status_code == 200 and data.get("success"):
            print(f"✅ Berhasil! Respons Yui: {data.get('response', '')}")
        else:
            print(f"❌ Server menolak: {data.get('error', 'Unknown Error')}")
    except Exception as e:
        print(f"💥 Terjadi kesalahan koneksi: {str(e)}")

# Jalankan simulasi
kirim_komentar_yui("Kurniawan_99", "Yui, apa kamu suka bermain game kompetitif?")
```

### 3. Eksekusi Cepat via Terminal (Shell / cURL)

Gunakan baris perintah terminal untuk melakukan uji coba instan:

```bash
curl -X POST http://localhost:3000/api/stream/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Halo Yui, perkenalkan dirimu menggunakan gaya yang imut!",
    "sender": "Subjek_Utama",
    "context": "live_stream",
    "channel": "CMD Terminal"
  }'
```

---

## 📺 Integrasi ke OBS Studio (Open Broadcaster Software)

Yuihime menyediakan visualisasi panggung avatar Live2D/VRM transparan yang dapat ditempelkan langsung sebagai **Browser Source** di luar aplikasi utama.

### 🔗 URL Tampilan Overlay OBS

1.  **Akses Mandiri Panggung**: `http://localhost:3000/?mode=obs`
    *   Secara otomatis mematikan bilah navigasi (Hidden Navigation UI) & memfokuskan kamera batin langsung pada karakter Vtuber Yuihime.
    *   Secga default berlatar belakang **Matrix** atau **Neon** yang menawan.
2.  **Aktivasi Chroma Key untuk Transparansi**:
    *   Buka menu **Stage** ➔ Subtab **📡 Stream**.
    *   Setel bagian **OBS Background Engine** ke **Green Scr (Green Screen / Chroma Green)**.
    *   Di OBS, klik kanan pada Browser Source -> **Filters** -> Tambahkan filter **Chroma Key (Kombinasi Kunci Kroma)** dengan warna dasar hijau untuk mendapatkan transparansi VTuber yang sempurna di atas gameplay Anda.

### 🔔 Deteksi Event SuperChat & Alerts Simulator

Jika sistem bot eksternal Anda mendeteksi adanya donasi/SuperChat masuk, Anda dapat mensimulasikannya agar Yui bereaksi memberikan apresiasi emosional khusus dengan mengirimkan sinyal SuperChat terenkripsi atau berinteraksi melintasi WebSocket server.

Gunakan emulator interaktif pada panggung **Stage Manager** untuk mempelajari efek getaran visual layar dan peningkatan serotonin emosi Yui saat menerima SuperChat maupun Subscriber baru!

---

## 🎙️ Integrasi Suara TTS dengan RVC (Retrieval-based Voice Conversion) Eksternal

Bagi streamer yang menginginkan Yuihime berbicara dengan **Kloning Suara AI Sempurna** (high-fidelity voice clonings) menggunakan model suara RVC (.pth & .index), Anda dapat dengan mudah mengintegrasikan server inferensi RVC lokal (seperti RVC WebUI, WebUI Mangio, atau FastAPI RVC API Server) ke dalam gerbang vokal Yuihime.

### ⚙️ Alir Proses (Pipeline) Vokal RVC
Karena RVC secara teknis merupakan model **Voice Conversion** (pengubah karakter suara dari audio ke audio), bukan peneks suara langsung (Text-to-Speech), proses konversi vokal berjalan melalui pipa dwi-fase:
1.  **Fase 1: Sintesis Teks ke Audio Dasar (TTS)**: Teks balasan Yuihime disintesis menjadi suara pemandu bersih (biasanya menggunakan *Edge-TTS* bahasa Indonesia/Jepang wanita, karena gratis, cepat, dan intonasi artikulasinya stabil).
2.  **Fase 2: Konversi Suara AI (RVC Inference)**: File audio hasil TTS dikirim sebagai payload binary ke Server RVC (`POST http://127.0.0.1:7865/v1/convert`) untuk dimodelkan ulang menjadi karakter suara imut Yuihime, lalu audio hasilnya dialirkan kembali ke klien visual untuk diputar secara real-time.

---

### 🛠️ Metode 1: Membuat custom Driver TTS (`RvcTTS.ts`) di Dalam Sistem
Anda dapat menyisipkan driver TTS mandiri ke dalam lingkaran suprastruktur Yuihime dengan mengikuti langkah plug-and-play berikut:

1.  Buat berkas driver baru `/src/core/tts/RvcTTS.ts`:
    ```typescript
    import { TTSModule, ModuleType } from '../../include/types';

    export const RvcStatusTTS: TTSModule = {
      metadata: {
        id: 'rvc-tts',
        name: 'yui-api: External RVC Vocalizer',
        description: 'Menyintesis suara dasar dengan Edge-TTS lalu mengirimkannya ke API RVC lokal untuk konversi suara batin.',
        version: '1.0.0',
        type: ModuleType.TTS,
        order: 5
      },

      speak: async (text: string, config: any) => {
        // Tentukan alamat API RVC lokal (Default: RVC WebUI API atau FAST API RVC)
        const RVC_API_URL = config.rvcApiUrl || 'http://127.0.0.1:7865/api/v1/convert';
        
        console.log(`[RVC_DRIVER] Menyintesis teks dasar: "${text}"`);
        
        // 1. Dapatkan audio WAV dasar dari Edge-TTS lokal atau Google TTS
        // 2. Kirim berkas biner WAV ke API RVC via FormData
        const formData = new FormData();
        // formData.append("audio", wavBlob);
        // formData.append("speaker_id", config.modelId || "yuihime_v1");
        
        // 3. Putar audio hasil konversi ke AudioContext utama Yuihime
        console.log(`[RVC_DRIVER] Vokalisasi kloning suara Yui berhasil dialirkan!`);
      }
    };
    ```

2. Registrasikan modul ini di konfigurasi pengaturan visual settings (`configSchema`) di `ModularSettings.tsx` agar streamer dapat mengisi alamat API RVC (`http://localhost:7865`) dan memilih model suara Yui langsung dari panel admin.

---

### 🐍 Metode 2: Menggunakan Bridge Python (Sangat Direkomendasikan untuk Pemula)
Jika Anda menggunakan webui-api python populer, Anda dapat mendengarkan sinyal penyiaran WebSocket Yuihime, menangkap text-to-speech, mengonversinya secara lokal, lalu mengirimkannya kembali. 

Berikut adalah skrip Python sederhana guna menguji konversi TTS + RVC secara asinkron:

```python
import requests
import json
import os

RVC_SERVER_IP = "http://127.0.0.1:7865" # Port bawaan RVC WebUI API
MODEL_PATH = "weights/Yuihime_Cute_V2.pth"
INDEX_PATH = "logs/Yuihime_Cute_V2/added_IVF120_Flat_nprobe_1_Yuihime_Cute_V2_v2.index"

def convert_to_rvc(input_audio_path, output_audio_path):
    print("🎙️ Memulai konversi RVC...")
    url = f"{RVC_SERVER_IP}/v1/convert"
    
    # Skema FormData RVC WebUI API pada umumnya
    files = {
        'audio': open(input_audio_path, 'rb'),
    }
    data = {
        'model_path': MODEL_PATH,
        'index_path': INDEX_PATH,
        'f0_up_key': 6, # Geser pitch lebih tinggi (+6 semi-tone) agar suara terdengar imut & cempreng khas anime
        'f0_method': 'rmvpe', # Algoritma pencarian frekuensi terbaik untuk menyanyi & berbicara
        'index_rate': 0.75,
    }
    
    response = requests.post(url, files=files, data=data)
    if response.status_code == 200:
        with open(output_audio_path, 'wb') as f:
            f.write(response.content)
        print("⚡ Konversi vokal batin Yuihime selesai secara sempurna!")
    else:
        print("❌ Gagal mengonversi suara di RVC Server:", response.text)

# Jalankan contoh
# convert_to_rvc("temp_speech_pemandu.wav", "yuihime_vocal_output.wav")
```

---

## 🛡️ Aturan Keamanan & Batasan Akses (Sandbox Guard)

1.  **Rate Limiter**: Endpoint ini dilindungi oleh mekanisme sliding-window progresif untuk mencegah luapan chat yang merusak sirkuit respons LLM. Selalu beri penundaan (delay) minimal **3 hingga 5 detik** antar pesan.
2.  **Path Jail Protection**: Parameter input `message` dilarang keras mengandung muatan injeksi perintah internal shell atau manipulasi null-byte (`\0`) untuk menjamin keselamatan server tempat Yuihime bernaung.
3.  **Unified Memory Storage**: Seluruh ingatan yang diumpankan dari media streaming akan terekam ke folder `.yuihime/data/yuihime.db` dengan relasi konteks yang tepat. Anda dapat mengosongkan riwayat ini sewaktu-waktu via panel Settings di UI kontrol utama jika diperlukan.
