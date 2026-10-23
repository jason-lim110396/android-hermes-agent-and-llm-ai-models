# 🤖 Hermes AI Agent & Local LLM Studio for Android （Beta - only LLM loaded now）

[![Android](https://img.shields.io/badge/Platform-Android%20%7C%20WebGPU-green.svg)](https://developer.android.com/)
[![WebLLM](https://img.shields.io/badge/Engine-%40mlc--ai%2Fweb--llm-blue.svg)](https://github.com/mlc-ai/web-llm)
[![Capacitor](https://img.shields.io/badge/Runtime-Capacitor%206-indigo.svg)](https://capacitorjs.com/)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-black.svg)](https://nextjs.org/)

A sovereign, **100% private, on-device mobile AI assistant and autonomous agent environment** for Android smartphones. Built with **NousResearch Hermes 3**, **WebLLM**, and **WebGPU tensor acceleration**, this app profiles your phone's chipset in real time, automatically recommends and downloads quantized AI models, and enables multi-step autonomous tool execution without sending data to the cloud.

---

## 🌟 Support Development — Download the Android App!
⭐ Enjoying these free tools and games? Support this open-source project by downloading our official Android app!  
📲 **[Download Mini App Hub: PDF & AI Tools on Google Play](https://play.google.com/store/apps/details?id=com.miniverse.hub)**

---

## ✨ Key Features

### 1. 🧠 Dual Operating Modes: Hermes Autonomous Agent vs. Direct LLM Chat
- **Hermes Agent Mode**:
  - Step-by-step reasoning cycle with collapsible chain-of-thought (CoT) and XML step cards.
  - Autonomous tool orchestration:
    - 🔍 `web_search`: Live search and factual knowledge grounding.
    - 🧮 `code_interpreter`: Isolated client-side JavaScript / math calculation sandbox.
    - 📱 `device_diagnostics`: Real-time phone battery, RAM allocation, and thread metrics.
    - 📄 `document_analyzer`: Document summarization, syntax audit, and code review.
    - 🎨 `create_image`: On-device generative neural diffusion synthesizer.
- **Direct LLM Chat Mode**: Fast, low-latency streaming chat with full markdown and code syntax rendering.
- **Isolated Multi-Session Memory**: Switching between Chat and Agent retains completely separated conversation logs, with a `+ New Session` button for creating fresh contexts anytime.

### 2. 🔍 On-Device Gemma Embedding 2 Mobile File Search & Filtering
- **EmbeddingGemma 2 (300M, 768-dim)** runs on pure CPU WebAssembly via Wllama with 0 GPU driver dependencies.
- **Find and Filter Mobile Files**:
  - 🎬 **Videos**: Filter by `.mp4`, `.mkv`, `.mov`, `.avi`, `.webm` (screen recordings, camera videos).
  - 📷 **Images & Photos**: Search photos, screenshots, and visual media with semantic matching.
  - 📄 **Documents & PDFs**: Search and audit `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.txt`, `.md`.
  - 💻 **Code**: Search project files (`.ts`, `.py`, `.json`, `.java`, etc.).
  - 🎙️ **Voice Notes**: Locate audio recordings and voice notes.
- **Dedicated Operating Mode**: Switch to `🔍 Embedding & File Search` from the burger menu (`☰`) to instantly query your phone's storage using natural language queries and cosine similarity scoring.

### 3. 👁️ SOTA Mobile Vision with MiniCPM-V 4.7 & Phi-3.5 Vision
- Integrated **OpenBMB MiniCPM-V 4.7 (Int4, 2.3 GB)** with Omni/Any-Resolution image understanding, camera snapshots, OCR, and document reading.
- Auto-switches to vision models when photos or camera frames are attached.

### 4. ⚡ Real On-Device WebGPU & CPU WebAssembly Inference
- Runs pre-quantized weights directly inside smartphone storage via `@mlc-ai/web-llm` (WebGPU) and `@wllama/wllama` (Universal CPU WebAssembly).
- In-app **Model Hub** with categorized filters: `All`, `★ Recommended`, `🔍 Embedding & Files`, `👁️ Vision`, `📝 Text`, `🎨 Image Gen`, and `🔊 Voice`.
- Automatic memory management releases previous model weights upon switching to prevent out-of-memory (OOM) errors.
- Top-bar model picker filters to **Ready Models**, with download confirmation prompts for unready models.

### 5. 📊 Real-Time Hardware Usage Bar
- 🧠 **RAM Usage**: Real-time active memory usage vs. total device physical RAM (e.g., `1.84 GB / 8 GB`).
- ⚡ **CPU Load**: Live concurrency load and core count (e.g., `68% (8C)` during inference).
- 🚀 **GPU & Token Speed**: Active backend (`WebGPU` / `CPU Universal`) and live speed in **tokens per second (`t/s`)**.

### 6. 🎙️ Voice Input (Speech-to-Text) & Spoken Output (Text-to-Speech)
- Tap the **Microphone** icon in the chatbox for hands-free voice dictation with a pulsing recording indicator.
- Tap the header **Audio Toggle** (`Volume2` / `VolumeX`) to listen to synthesized vocal responses upon reply completion.

### 7. 📸 Multimodal Input & Smart Auto-Switching
- 📷 **In-App Camera**: Capture instant camera snapshots through live viewfinder.
- 🖼️ **Gallery Photos**: Attach photos, charts, whiteboards, or screenshots.
- 📁 **Files & Documents**: Ingest code files (`.py`, `.ts`, `.json`, `.csv`, `.md`).

### 8. 🎨 On-Device Image AI Synthesis
- Built-in mobile diffusion synthesizer (`SD-Turbo Diffusion` & `FLUX.1 Schnell Nano`).
- Hermes Agent can autonomously generate digital art and render image previews directly into chat bubbles.

### 9. 📱 Portrait Locked & Clean Window Mode
- No aggressive auto-fullscreen; standard Android system navigation and status bar remain visible.
- Rigid portrait orientation (`sensorPortrait`) with non-overlapping bottom navigation.

---

## 📦 Supported On-Device Models

| Model Name | Parameters | Quantization | Size | Backend | Capabilities |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **EmbeddingGemma 2 (Google)** | 300M | `Q8_0` | 309 MB | CPU Wllama | 🔍 768-dim Semantic File & Media Search |
| **MiniCPM-V 4.7 (OpenBMB)** | 2.8B | `int4` | 2.30 GB | WebGPU | 👁️ Omni-Resolution Vision & OCR |
| **Hermes 3 (Llama 3.2 3B)** | 3.21B | `q4f16_1` | 2.26 GB | WebGPU | 🤖 Autonomous Agent, Tools, Code, CoT |
| **Hermes 2 Pro (Mistral 7B)** | 7.24B | `q4f16_1` | 4.03 GB | WebGPU | 🧠 Frontier Agent, Function Calling |
| **Phi-3.5 Vision (Microsoft)** | 4.2B | `q4f16_1` | 3.95 GB | WebGPU | 👁️ Multimodal Vision VLM |
| **Qwen 2.5 (0.5B Instant)** | 0.5B | `q4f16_1` | 944 MB | WebGPU | ⚡ Ultra-Fast, Low RAM Chat |
| **SmolLM2 (360M Micro)** | 360M | `q4f16_1` | 376 MB | WebGPU | 🪶 Featherweight Mobile Text |
| **Google Gemma 2 (2B IT)** | 2.61B | `q4f16_1` | 1.89 GB | WebGPU | 📖 Factual Reasoning & Summary |
| **DeepSeek-R1 Distill (7B)** | 7.6B | `q4f16_1` | 5.10 GB | WebGPU | 🧩 Deep `<think>` Chain-of-Thought |
| **SD-Turbo Diffusion** | 1.2B | `fp16` | 1.98 GB | WebGPU | 🎨 Real-time Single-Step Image Gen |
| **FLUX.1 Schnell Nano** | 2.4B | `q4` | 3.10 GB | WebGPU | 🎨 Photorealistic Image Synthesis |
| **Kokoro-82M TTS** | 82M | `fp32` | 320 MB | CPU Wasm | 🔊 Local Neural Voice & Speech |

---

## 🛠️ Architecture & Tech Stack

- **Framework**: [Next.js 16 (Turbopack)](https://nextjs.org/) + React 19 + TypeScript
- **Styling**: Tailwind CSS + Lucide Icons
- **Local Tensor Engine**: [@mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) (WebGPU / CacheStorage)
- **Mobile Container**: [Capacitor 6](https://capacitorjs.com/) (Android Gradle)
- **External Bridge**: Built-in support for Ollama (`http://localhost:11434/v1` or LAN IP) and OpenAI/OpenRouter APIs.

---

## 🚀 Building & Running

### Prerequisites
- Node.js 18+ or 20+
- Android Studio / Android SDK (with Java JDK 17 / 21)

### Setup & Build
```bash
# 1. Install dependencies
npm install

# 2. Build Next.js static production bundle
npm run build

# 3. Sync web assets into Android Capacitor container
npx cap sync android

# 4. Compile Debug APK
cd android
./gradlew assembleDebug
```

The compiled APK will be located at:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 📄 License
MIT License. Free and open-source for the developer and AI community.

