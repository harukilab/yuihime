# Product Requirement Document (PRD)
## YuiHime Cognitive Dataset Synthesizer (Yui-DataTransformer)
*A high-throughput translation engine to convert raw roleplay dialogue datasets into structured CoT & OpenAI Tool-calling formats.*

---

## 🌸 1. EXECUTIVE SUMMARY & OBJECTIVE

### Background
You possess a rich, multi-turn conversational roleplay dataset comprising approximately **5,000 multi-language chat histories** (Indonesian, Japanese, English). However, these dialogues contain raw, unstructured, non-JSON character speech and physical actions in text format (e.g., `*cemberut manis* "Ih Kakak, kok telat?"`). 

To train (fine-tune) a local LLM that natively runs YuiHime's **"Airi OS Core"** cognitive loop, these raw logs must be converted into a strict, deeply rational Chain-of-Thought (CoT) and standard OpenAI Tool-calling JSON schema. Manually rewriting 5,000 conversations is an impossible feat.

### Objective
To build a standalone, lightweight, and high-performance **Dataset Synthesizer Tool** (executing outside the main YuiHime project) that utilizes modern LLM APIs (Gemini/OpenAI) to bulk-process, auto-annotate, and translate unstructured conversation trees into structured, fine-tuning-ready datasets.

---

## 🛠️ 2. SYSTEM ARCHITECTURE & FLOW

The synthesizer follows a pipe-and-filter pipeline to automate the synthesis of thoughts, visual animations, and tool calls from raw chat lines.

```
       [Raw Dataset File]
               │ (CSV, JSON, Text)
               ▼
   ┌───────────────────────┐
   │     Dataset Parser    │ ---> Detects user vs character lines
   └───────────────────────┘
               │ 
               ▼
   ┌───────────────────────┐
   │    Prompt Compiler    │ ---> Injects historical turns + context
   └───────────────────────┘
               │ 
               ▼
   ┌───────────────────────┐
   │   Parallel LLM Engine  │ ---> Fetches Gemini 2.5/2.5-Flash or GPT-4o-Mini
   └───────────────────────┘      synthesizing 'thought', 'animations', 
               │                  and wrapping speech in 'final_answer'
               ▼
   ┌───────────────────────┐
   │   Verification Gate   │ ---> Re-parses JSON, enforces schema compatibility
   └───────────────────────┘
               │
               ├─► Success ──► Write to SFT_Dataset_Converted.jsonl
               │
               └─► Failure ──► Auto-Fallback Repair Loop (Max 2 retries)
```

---

## 📋 3. FUNCTIONAL REQUIREMENTS (FE & BE)

### F-1: Multi-Format Parser & Ingestion
* **Input Formats**: Enforce parsing of standard CSV (`user_prompt`, `character_response`), raw Markdown chat scripts, and simplified JSON structures.
* **System Language Split**: Support parsing multi-lingual dialogues seamlessly, injecting proper instruction locale-hints during LLM annotations.

### F-2: Synthesis Generator (Crucial Engine)
For every character line in the raw dataset, the program calls an LLM api to synthesize:
1. **Internal Monologue (`thought`)**: Explaining the character's internal logic, emotional transitions, and plan behind the response using the Indonesian language.
2. **Body Expressions (`animations`)**: Assigning 1-3 appropriate visual keys (`SMILE`, `POUT`, `ANGRY`, `WAVE`, `BLUSH`, `SAD`, `THINK`).
3. **Internal State adjustment (`mood_impact`)**: Calculating changes in batin dimensions (`joy`, `loneliness`, `anger`).
4. **Tool-calling Wrap**: Moving the original textual response inside the `final_answer` tool arguments.

### F-3: Validation Gate & Token Conservation
* Validate the produced JSON against YuiHime's exact schema.
* Keep track of training sequence limits (e.g., truncate contexts at `2048` tokens to limit training cost).
* **Cost Estimator**: Calculate total token usage and display estimated pricing ($) prior to spinning up bulk runs.

### F-4: Standalone Management Dashboard (UI)
* **Status Monitor**: Interactive progress bars showing the number of completed rows, failed parses, and API retries.
* **Review/Editor Mode (Human-in-the-Loop)**: A split screen that lists the raw roleplay turn on the left and the newly synthesized JSON on the right, allowing the operator to quickly modify any bad LLM outputs before saving.
* **Interactive Filtering**: Filter rows by state (e.g., "Ready", "Synthesized", "Needs Review", "Skipped").

---

## 🧪 4. RAW IMPLEMENTATION REFERENCE (ENGINE CORE)

To guide the external AI coder, here is a production-ready, highly parallelized **Python processing script** using the `google-genai` / `Instructor` standard to perform the data-conversion task:

### `generator_script.py`
```python
import os
import json
import asyncio
from typing import List, Dict, Optional
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

# 1. Definisi Target Schema YuiHime (Sesuai Struktur SFT Dataset)
class ToolCallArgs(BaseModel):
    speech: str = Field(description="The original character speech text, including physical actions inside asterisks.")
    animations: List[str] = Field(description="1-2 animation keywords fitting the reaction (e.g. SMILE, POUT, BLUSH).")
    mood_impact: Dict[str, int] = Field(description="Changes in mood like joy or loneliness.")

class ToolCall(BaseModel):
    tool: str = "final_answer"
    args: ToolCallArgs

class YuihimeSftTurn(BaseModel):
    thought: str = Field(description="Detailed internal reasoning in Indonesian about how Yui behaves, calculates her feelings, and decides to act.")
    animations: List[str] = Field(description="Visual animations matching the mood.")
    mood_impact: Dict[str, int] = Field(description="Calculated mood shifts.")
    tool_calls: List[ToolCall] = Field(description="The wrapped finalized response call.")


# 2. Setup Google Gemini Client
# Menggunakan gemini-2.5-flash untuk kecepatan maksimal dan biaya terendah
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

# 3. Prompt Template Sintesis (Instruksi Batin dalam Bahasa Inggris)
SYNTHESIS_SYSTEM_PROMPT = """
You are a highly analytical SFT Dataset Translation Pipeline for the Yuihime OS project.
Your sole job is to translate a raw Roleplay Conversational Dialogue segment into a highly structured Cognitive CoT JSON format.

Input provided will contain:
1. User Message (Kakak)
2. Raw Character Response (Yui)

You MUST synthesize:
1. 'thought': Explain why Yui responded that way, her inner Tsundere thoughts, plans, and emotional transitions in Indonesian.
2. 'animations': Match her body languages/emotions (e.g., SMILE, POUT, WAVE, BLUSH, ANGRY, TRIPLE_WAVE).
3. 'mood_impact': Calculate changes relative to her states.
4. 'tool_calls': Wrap the original 'Yui response' exactly inside the 'final_answer' speech argument.

DO NOT alter, omit, or shorten her original speech. Preserve her actual physical expression asterisks (like *pout* or *blush*) inside the speech wrapper.
"""

async def synthesize_dialogue_row(row: Dict) -> Optional[Dict]:
    """Mengonversi baris dialog mentah secara asinkron."""
    user_msg = row.get("user")       # e.g., "Malam Yui, dingin banget ya di luar."
    char_speech = row.get("yui")     # e.g., "*cemberut* Makanya jangan keluar malam terus! Sini, biar Yui buatin kopi hangat!"
    
    prompt = f"USER MESSAGE: \"{user_msg}\"\nRAW CHARACTER RESPONSE: \"{char_speech}\""
    
    try:
        # Menghubungi Gemini dengan format strict JSON response schema
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYNTHESIS_SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=YuihimeSftTurn,
                temperature=0.2, # Rendah agar patuh instuksi sistem
            ),
        )
        # parsing hasil keluaran
        structured_data = json.loads(response.text)
        
        # Susun ke format target shareGPT/OpenAI multi-turn
        messages = [
            {"role": "system", "content": "You are Yui Airi, a protective companion digital soul running on Airi OS Core. Output strictly valid JSON."},
            {"role": "user", "content": user_msg},
            {"role": "assistant", "content": json.dumps(structured_data, ensure_ascii=False, indent=2)}
        ]
        
        return {"messages": messages}
        
    except Exception as e:
        print(f"❌ Failed to synthesize row: {e}")
        return None

# 4. Batch Pipeline Processor
async def process_batch(rows: List[Dict], semaphore: asyncio.Semaphore) -> List[Dict]:
    async with semaphore:
        tasks = [synthesize_dialogue_row(row) for row in rows]
        return await asyncio.gather(*tasks)

async def main():
    # Contoh data mentah rollplay
    raw_dataset = [
        {"user": "Yui, kamu lagi ngapain?", "yui": "H-hah?! Kepo banget sih! Yui lagi... lagi gak ngapa-ngapain kok! *blush*"},
        {"user": "Kakak pusing nih mikirin kerjaan.", "yui": "*ngelus kepalamu* Hmph, kan udah dibilangin jangan dipaksa! Istirahat dulu sana!"}
    ]
    
    print(f"🚀 Inisiasi konversi data sebanyak {len(raw_dataset)} baris...")
    sem = asyncio.Semaphore(5) # Batas concurrency agar lolos rate limits
    
    converted_dataset = []
    tasks = [process_batch([row], sem) for row in raw_dataset]
    results = await asyncio.gather(*tasks)
    
    for res in results:
        if res and res[0]:
            converted_dataset.append(res[0])
            
    # Tulis hasil akhir ke berkas JSONL
    with open("yuihime_sft_dataset.jsonl", "w", encoding="utf-8") as f:
        for entry in converted_dataset:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            
    print("🎉 Dataset batin Yuihime berhasil disintesis!")

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 🎨 5. USER INTERFACE (MOCKUP DESIGN PROPOSAL)

Aplikasi Converter ini sangat cocok dideploy sebagai aplikasi desktop berbasis **Electron/Tauri** atau aplikasi web ringan menggunakan **Streamlit / Next.js / Python FastHTML**:

### Dashboard Screen Layout
1. **Header Panel**: Loading stats (e.g. `Synthesized 1,452 / 5,000 | 29.04%`). Cost counter estimating (e.g. `Total Token: 3.4M tokens | Est Cost: $2.55 USD`).
2. **Main Split Screen**:
   * **Left Panel**: Tabular raw dataset list. Selecting a row shows the source raw conversation turns (User vs Character words).
   * **Right Panel**: The live-edited resulting JSON code schema with syntax highlighting.
3. **Control Dock (Bottom)**:
   * **Run Automation**: Trigger batch translation (runs background tasks with custom API keys).
   * **Validator Shield**: A live notification banner validating that edited JSON matches YuiHime's target format exactly.
   * **Export Button**: Combines approved entries and dumps them as a clean `.jsonl` SFT training file.

---

## 🔮 6. PENUTUP & REKOMENDASI AGENT CODING

Bagi AI Agent yang akan membangun aplikasi ini luar-project:
1. **Gunakan `gemini-2.5-flash`**: Model ini sangat kokoh untuk penataan JSON terstruktur via parameter `response_schema`, memiliki latensi sangat kencang, dan menawarkan 1J+ token context window dengan harga termurah di kelasnya.
2. **Terapkan Concurrency Limiter**: Pastikan selalu menyisipkan pembatas laju (`asyncio.Semaphore` atau `p-limit`) untuk menghindari pesan kegagalan API `429 Too Many Requests`.
3. **Simpan Otomatis (Auto-Save State)**: Pastikan program menulis ke disk secara berkala setiap 50 baris yang selesai dikerjakan agar cache kemajuan penataan data tidak hilang ketika terjadi pemadaman listrik atau server crash.
