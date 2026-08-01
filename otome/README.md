# YuiHime Otome — Catatan Terakhir & Cara Pakai

Status: **v4.194** (commit `04cf383`) — lokal saja, belum di-push ke GitHub.

## Struktur

| File | Isi |
|---|---|
| `otome/character.ts` | Profil & persona Yui Airi |
| `otome/scenarios.ts` | Semua scene + ending (`love` / `good` / `bad`), termasuk jalur intimate consent-gated |
| `otome/engine.ts` | `OtomeGame`, state, afeksi, save/load per user, `endingFor()` |
| `otome/llm.ts` | Hybrid LLM: nebeng provider pool sistem (`ProviderGatewayModule`), fallback OpenRouter/Gemini; `yuiReaction`, `pickImageParams`, `sceneImageParams`, `sceneImageFallback` |
| `otome/cli.ts` | REPL terminal (`npm run otome`); queue serial untuk input piped; toggle `YUIHIME_OTOME_LLM=0` |
| `otome/tensorart.ts` | Standalone TensorArt/TusiArt: `listTools()`, `generateImages()` (curl download + retry background), `getAccessKey()`, `loadOtomeConfig()` |
| `otome/tg_bot.ts` | Bot Telegram terisolasi (Telegraf, long polling, IPv4 agent, graceful shutdown) |

## Setup (sekali)

```bash
# 1. Config bot — token & owner id
#    ~/.yuihime/otome_tg_config.json
{
  "botToken": "8714706143:...",
  "ownerId": 7275272883,
  "tensorartApiKey": "",
  "defaultModel": "anime_lab_wai_illustrious"
}

# 2. TensorArt key (bisa salah satu)
cp ~/.tensor_access_key ~/.yuihime/tensor_access_key
# atau isi "tensorartApiKey" di config, atau env TENSORART_API_KEY

# 3. LLM live opsional (provider pool dari config.toml sistem sudah otomatis dipakai)
```

## Cara jalan

```bash
npm run otome        # REPL terminal
npm run otome:tg     # bot Telegram (polling)
YUIHIME_OTOME_LLM=0 npm run otome:tg   # nonaktifkan LLM live (pakai skrip bawaan)
```

## Langkah terakhir otome (4.191 → 4.194)

1. **4.191** — Bot TG terisolasi: `/start /new /status /help /foto`, scene render + inline keyboard (`otome:<idx>`), save per user di `~/.yuihime/otome_saves`, akses dibatasi ownerId. `npm run otome:tg`.
2. **4.192** — Key & schema: `getAccessKey()` export (fallback `~/.yuihime/tensor_access_key` → `~/.tensor_access_key`); fix `listTools()` baca schema nested `data.data.tools` → 22 tools valid.
3. **4.193** — Download gambar pakai curl (`-sS -fL --retry 5 --retry-all-errors`) paralel (`Promise.all`), fallback fetch; PNG 1.5MB terverifikasi.
4. **4.194** — **Tombol "📸 Foto adegan ini"** (`otome_foto`) di tiap scene: prompt otomatis dari `scene.id` + narasi + petName + mood + flags. LLM pool (`sceneImageParams`) ubah narasi Indonesia → prompt Inggris; fallback template `sceneImageFallback`. Fix penting: quote `"` di prompt merusak render template TensorArt API → di-sanitasi global di `generateImages()`.

## Alur Telegram

```
/start ─► scene (📖 hari, ❤ afeksi, narasi) + keyboard pilihan
  ├─ pilih opsi  ─► scene berikutnya (reaksi Yui live bila LLM on)
  ├─ 📸 Foto adegan ini ─► generate prompt scene ─► kirim foto
  └─ ending (love/good/bad) ─► /new untuk hari baru
```

Ending `love` → `/new` membuka jalur couple: hari santai / malam romantis (lilin, dance) → consent scene → adegan intimate (foreplay → eksplisit).

## Lokasi data

- Save game: `~/.yuihime/otome_saves/tg_<userId>.json`
- Foto: `~/.yuihime/otome_images/otome_<jobId>_<n>.png`
- Log generate: `~/.yuihime/otome_images/tensorart_otome.log`

## Catatan

- Bot hanya melayani owner (`ownerId`).
- `/foto <deskripsi>` = prompt manual; tombol adegan = prompt otomatis.
- Model default: `anime_lab_wai_illustrious`; `list_tools` menampilkan 22 model termasuk text2video/image2video Wan.
- Jangan commit token/key (sudah di-`.gitignore`; token hanya di `~/.yuihime/`).
