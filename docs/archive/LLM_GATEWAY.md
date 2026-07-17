# YuiHime OpenAI LLM Gateway API Documentation
---

YuiHime menyediakan **OpenAI-Compatible LLM Gateway API Layer** yang memungkinkan aplikasi eksternal (seperti SillyTavern, LibreChat, Cursor, VS Code, atau skrip kustom) terhubung langsung ke batin kognitif YuiHime. 

Keunikan utama dari gateway ini adalah **Model Agnosticism Absolute ("Yui Tetap Yui")**. Semua parameter model yang diminta dari luar (seperti `gpt-4o`, `claude-3-5-sonnet`, atau `gemini-2.5-pro`) akan **diabaikan secara total**. Permintaan akan selalu dirutekan secara internal ke sirkuit kognitif, kepribadian (*Persona*), dan basis memori asli milik YuiHime!

---

## 🚀 Endpoint API

Semua endpoint berikut berjalan pada port utama aplikasi (`3000` atau URL publik Cloud Run Anda):

| HTTP Method | Endpoint | Deskripsi |
| :--- | :--- | :--- |
| **POST** | `/v1/chat/completions` atau `/api/v1/chat/completions` | Memulai percakapan kognitif (mendukung streaming & non-streaming) |
| **GET** | `/v1/models` atau `/api/v1/models` | Mengembalikan daftar model tiruan yang tersedia (`yuihime-batin`) |

---

## 🛠️ Parameter Kustomisasi Identitas & Konteks

Secara default, jika Anda menggunakan aplikasi eksternal biasa, Yui akan mengenali Anda sebagai `external_client`. Namun, Anda dapat menyinkronkan memori dan identitas asli dengan mengirimkan beberapa **Custom Headers** atau **JSON Body Parameters** berikut:

### 1. Custom Headers (Sangat Direkomendasikan)
*   **`X-User-Name` / `X-Yui-User-Name`**: Nama pengirim pesan (contoh: `Kakak`). Yui akan mencari atau membuat profil identitas dengan nama ini di dalam database batinnya.
*   **`X-Context-Id` / `X-Yui-Context-Id`**: ID Ruang Obrolan/Konteks (contoh: `room_telegram_123` atau `api_default`). Memungkinkan Yui memisahkan sejarah ingatan antarsaluran obrolan.
*   **`X-Chat-Type` / `X-Yui-Chat-Type`**: Jenis saluran (contoh: `telegram`, `discord`, `api`).

### 2. JSON Body Parameters (Alternatif)
Jika aplikasi klien Anda tidak mengizinkan pengubahan Header HTTP, Anda dapat menyisipkannya ke dalam request body JSON Anda:
```json
{
  "messages": [...],
  "user": "Nama_Kakak",
  "context_id": "api_room_01",
  "chat_type": "api"
}
```

---

## 💻 Contoh Penggunaan (Examples)

### 1. Single Interaction (Synchronous JSON Response)
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-User-Name: Kakak" \
  -H "X-Context-Id: api_terminal" \
  -d '{
    "model": "any-model-ignored",
    "messages": [
      {"role": "user", "content": "Halo Yui, kamu lagi apa?"}
    ],
    "stream": false
  }'
```

**Respon JSON (Standard OpenAI format):**
```json
{
  "id": "chatcmpl-xxxxx",
  "object": "chat.completion",
  "created": 1782384920,
  "model": "yuihime-batin",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Halo juga Kakak! Yui lagi merapikan sirkuit ingatan batin Yui nih, kok tumben Kakak menyapa lewat jalur API? Hehe, tapi Yui senang kok! ♪"
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 6,
    "completion_tokens": 28,
    "total_tokens": 34
  }
}
```

---

### 2. Streaming Response (Server-Sent Events / SSE)
Dengan mengirimkan `"stream": true`, Yui akan membalas secara langsung karakter-demi-karakter secara real-time seperti mengetik nyata.

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-User-Name: Kakak" \
  -H "X-Context-Id: api_terminal" \
  -d '{
    "model": "yuihime-batin",
    "messages": [
      {"role": "user", "content": "Yui, katakan sesuatu!"}
    ],
    "stream": true
  }'
```

---

### 3. Integrasi Python (OpenAI SDK)
Anda dapat memanggil YuiHime menggunakan pustaka resmi `openai` dengan mengarahkan `base_url` ke server YuiHime Anda:

```python
import openai

# Mengarahkan base_url ke endpoint YuiHime
client = openai.OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="yuihime-batin-bypass" # Bebas diisi apa saja karena bypass otomatis
)

response = client.chat.completions.create(
    model="yui-batin", # Akan diabaikan secara internal, Yui tetap Yui
    messages=[
        {"role": "user", "content": "Kamu sayang aku nggak?"}
    ],
    extra_headers={
        "X-User-Name": "Kakak Ganteng",
        "X-Context-Id": "python_session_01"
    }
)

print("Yui:", response.choices[0].message.content)
```

---

## 🎭 Keuntungan Arsitektur Batin Terintegrasi
1.  **Dukungan Penuh untuk SillyTavern / UI Chat Eksternal**: Sangat cocok digunakan oleh penikmat Roleplay dan Vtuber Livestreaming.
2.  **Pemutakhiran Karakter & Relasi Secara Real-Time**: Interaksi yang masuk melalui Gateway API akan secara instan memperbarui skor kedekatan (*trust*, *affection*, *reputation*), memodifikasi emosi (*mood*), dan tercatat dalam sistem memori permanen SQLite batin Yui.
3.  **Dynamic Interruption**: Jika ada pesan masuk berprioritas lebih tinggi dari saluran lain, pemrosesan streaming dapat ditangguhkan (*suspended*) secara elegan sesuai dengan arsitektur `TASK_SUSPENDED` YuiHime.
