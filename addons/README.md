# @yui/addons - Plugin Ecosystem

Folder ini adalah tempat tinggal bagi plugin atau kemampuan tambahan yang bersifat dinamis. Plugin di sini bisa dibuat oleh developer atau diproduksi secara otomatis oleh agen itu sendiri.

## 📂 Struktur Plugin

Setiap folder di dalam `/addons/` harus memiliki struktur minimal:

```text
/addons/nama-plugin/
  ├── config.toml    # Metadata dan konfigurasi alat
  └── main.js        # Entry point (bisa .py atau .sh juga)
```

### Format `config.toml`
Konfigurasi ini mendikte bagaimana LLM melihat dan memanggil plugin ini.

```toml
[tool]
id = "my-crypto-checker"
name = "Crypto Checker"
description = "Mengecek harga cryptocurrency terbaru."
version = "1.0.0"

[tool.parameters]
type = "object"
required = ["symbol"]

[tool.parameters.properties.symbol]
type = "string"
description = "Simbol koin (contoh: BTC, ETH)"
```

## 🚀 Cara Kerja Pemuatan Dinamis

1.  **Discovery**: Saat startup (atau dipicu manual), `DynamicLoader` memanggil API server `/api/addons`.
2.  **Parsing**: Server membaca semua sub-folder di `/addons` dan memparsing `config.toml`.
3.  **Registration**: `DynamicLoader` membungkus setiap plugin menjadi `ToolModule` dan mendaftarkannya ke `SystemRegistry`.
4.  **Available**: Plugin kini tersedia untuk dipilih oleh AI di siklus berpikir berikutnya.

## 📝 Tips bagi Pemula
Plugin addons sangat cocok untuk:
- Integrasi API baru tanpa menyentuh kode utama React.
- Script otomasi sistem lokal.
- Menambah logika khusus yang unik bagi persona agen Anda.
