# Puter AI Provider and Model Selection Guide

Sistem kognitif YuiHime mengintegrasikan **Puter Hub Integration** untuk memproses nalar menggunakan ratusan model kognitif global dari OpenAI, Anthropic, Google, dll. 

Dokumen ini memetakan mekanisme pemilihan model dua tahap (2-Stage Selection) yang diimplementasikan di seluruh modul Puter AI YuiHime (Settings, Playground, dan Router Backend).

---

## 🚀 Alur Mekanisme Pemilihan Dua Tahap (2-Stage Model Selection)

Untuk mengoptimalkan efisiensi penelusuran model, mencegah kelelahan token, dan mereduksi latency pemuatan daftar model yang berisi ratusan entri, pemilihan model dirancang dalam 2 tahap sekuensial yang saling bergantung:

### 1. Tahap Pertama: Mengambil Seluruh Model Provider
Sebelum memuat daftar model, sistem memanggil fungsi untuk mengambil daftar nama-nama provider resmi yang tersedia di Puter Hub:
*   **Fungsi Driver**: `PuterService.listModelProviders()`
*   **API Route**: `GET /api/puter/providers`
*   **Deskripsi**: Fungsi ini mengembalikan daftar provider unik (seperti `openai`, `anthropic`, `google`, `meta`, dll) beserta label representatif visualnya.

### 2. Tahap Kedua: Mengambil Model Tersaring Berdasarkan Provider Pilihan
Setelah pengguna memilih salah satu provider tertentu (atau memilih seluruh provider), sistem akan mengisi daftar model batin dengan memanggil fungsi penyaringan model:
*   **Fungsi Driver**: `PuterService.listModels(provider)`
*   **API Route**: `GET /api/puter/models?provider=<provider_name>`
*   **Logika Parameter**:
    *   Jika parameter `provider` bernilai `null` atau `all`, sistem mengembalikan **seluruh model** yang didukung secara universal oleh Puter Hub (`puter.ai.listModels()`).
    *   Jika parameter `provider` memiliki nilai string spesifik (misalnya `openai`), sistem hanya akan menarik model yang dialokasikan oleh provider tersebut (`puter.ai.listModels('openai')`).

---

## 🛠️ Detail Implementasi Teknis

### 1. Core Kernel Service (`PuterService.ts`)
Metode `listModels` dan `listModelProviders` dimutakhirkan untuk mendukung penyaringan hulu:

```typescript
// Mengambil model dengan penyaringan opsional di tingkat SDK maupun fallback REST
public async listModels(provider: string | null = null): Promise<any[]> {
  const sdk = await this.initialize();
  if (sdk) {
    try {
      // SDK Native Puter listModels menerima provider filter secara fleksibel
      const models = await sdk.ai.listModels(provider || undefined);
      if (Array.isArray(models)) return models;
    } catch (err) { ... }
  }
  
  // Jika offline atau gagal, ditarik dari REST API details lalu difilter lokal
  const res = await this.requestREST('/puterai/chat/models/details', 'GET');
  const models = res.models || res || [];
  if (provider) {
    return models.filter((m: any) => m.provider === provider);
  }
  return models;
}
```

### 2. Provider Settings Schema (`PuterProvider.ts`)
Skema konfigurasi static penyedia mendefinisikan field `provider` dan `model` secara berurutan dengan opsi dinamis (`dynamicOptions: true`):

```typescript
export const PuterProviderMetadata = {
  id: 'puter-neural-provider',
  name: 'Puter Hub',
  configSchema: {
    provider: {
      type: 'select',
      label: 'AI Provider Filter (Puter)',
      default: 'all',
      dynamicOptions: true
    },
    model: {
      type: 'select',
      label: 'AI Model (Puter)',
      default: 'openai:gpt-4o-mini',
      dynamicOptions: true
    },
    token: { ... }
  }
};
```

### 3. Settings UI Renderer (`ModularSettings.tsx` & `ProvidersTab.tsx`)
*   Saat field `provider` pada menu Settings diubah oleh pengguna, fungsi `updateSetting` secara otomatis mendeteksi perubahan tersebut dan memicu pemanggilan `fetchDynamicOptions(moduleId, 'model', targetConfig)`.
*   Ini memicu pemuatan ulang opsi dropdown field `model` secara real-time berdasarkan provider terpilih tanpa perlu me-reload halaman atau memicu crash.

### 4. Interactive Playground (`ProviderPlayground.tsx`)
Pengetesan batin di playground juga sepenuhnya menggunakan model 2-tahap ini:
*   Dropdown **AI Provider** memanggil `GET /api/puter/providers` untuk memuat opsi provider.
*   Dropdown **Target Model** secara reaktif meluncurkan pengambilan data `/api/puter/models?provider=<selected>` setiap kali dropdown Provider berganti nilai.
*   **Puter Model Index Explorer** menyokong pencarian dengan filter provider hulu yang sama untuk menganalisis status operasional model dalam basis data batin.

---

## 📌 Pedoman Penambahan Model Baru
Puter Hub mendukung ratusan model secara dinamis. Untuk memaksimalisasi ketangguhan sistem luring/fallback:
1.  Daftar fallback luring disimpan di dalam variabel `allMock` di core service `PuterService.ts`.
2.  Setiap entri mock wajib dilengkapi properti nama (`name`), identitas id (`id`), dan pengidentifikasi provider (`provider`).
