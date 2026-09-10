# 🤖 Hermes AI Agent & Local LLM Studio for Android

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

### 2. ⚡ Real On-Device WebGPU Inference & Model Downloader
- Runs pre-quantized (`q4f16_1`) weights directly inside the smartphone's CacheStorage / IndexedDB via `@mlc-ai/web-llm`.
- In-app **Model Hub** downloads real model shards directly from HuggingFace MLC with live percentage and speed meters.
- Includes one-tap local weight deletion to free device storage.
- Top-bar model picker filters to **Ready Models**, with automatic download confirmation prompts for unready models.

### 3. 📊 Two-Row Top Bar with Real-Time Hardware Usage
- **Row 1**: Model selector, Mode Switcher (Chat vs. Agent), `+ New Session`, Speech TTS toggle, and Clear history.
- **Row 2**:
  - 🧠 **RAM Usage**: Real-time active memory usage vs. total device physical RAM (e.g., `1.84 GB / 8 GB`).
  - ⚡ **CPU Load**: Live concurrency load and core count (e.g., `68% (8C)` during inference).
  - 🚀 **GPU & Token Speed**: Active acceleration backend (`WebGPU` / `WebGL2`) and live inference speed in **tokens per second (`t/s`)**.

### 4. 🎙️ Voice Input (Speech-to-Text) & Spoken Output (Text-to-Speech)
- Tap the **Microphone** icon in the chatbox for hands-free voice dictation with a pulsing recording indicator.
- Tap the header **Audio Toggle** (`Volume2` / `VolumeX`) to listen to synthesized vocal responses upon reply completion.

### 5. 📸 Multimodal Input & Smart Auto-Switching
- 📷 **In-App Camera**: Capture instant camera snapshots through live viewfinder.
- 🖼️ **Gallery Photos**: Attach photos, charts, whiteboards, or screenshots.
- 📁 **Files & Documents**: Ingest code files (`.py`, `.ts`, `.json`, `.csv`, `.md`).
- **Auto-Switching**: When you attach an image, the app automatically switches to the multimodal vision model (`Phi-3.5 Vision`).

### 6. 🎨 On-Device Image AI Synthesis
- Built-in mobile diffusion canvas generator (`SD-Turbo Diffusion` & `FLUX.1 Schnell Nano`).
- Hermes Agent can autonomously generate digital art and render image previews directly into chat bubbles.

### 7. 📱 Portrait Locked & Clean Window Mode
- No aggressive auto-fullscreen; standard Android system navigation and status bar remain visible.
- Rigid portrait orientation (`sensorPortrait`) with non-overlapping bottom navigation.

---

## 📦 Supported On-Device Models

| Model Name | Parameters | Quantization | Size | Capabilities | Inputs | Outputs |
| :--- | :---: | :---: | :---: | :--- | :--- | :--- |
| **Hermes 3 (Llama 3.2 3B)** | 3.21B | `q4f16_1` | 2.26 GB | Agent, Tools, Code, Reasoning | Text, File, Voice | Text, Code |
| **Hermes 2 Pro (Mistral 7B)** | 7.24B | `q4f16_1` | 4.03 GB | Frontier Agent, XML CoT | Text, File, Voice | Text, Code |
| **Phi-3.5 Vision (Microsoft)** | 4.2B | `q4f16_1` | 3.95 GB | Vision VLM, Photo OCR | Text, Camera, Image, File | Text, Code |
| **Qwen 2.5 (0.5B Instant)** | 0.5B | `q4f16_1` | 944 MB | Ultra-Fast, Low RAM | Text, File, Voice | Text, Code |
| **SmolLM2 (360M Micro)** | 360M | `q4f16_1` | 376 MB | Featherweight Mobile | Text, Voice | Text |
| **Qwen 2.5 (1.5B Instruct)** | 1.54B | `q4f16_1` | 1.62 GB | Multilingual Coding | Text, File, Voice | Text, Code |
| **DeepSeek-R1 Distill (7B)** | 7.6B | `q4f16_1` | 5.10 GB | Chain-of-Thought `<think>` | Text, File, Voice | Text, Code |
| **Google Gemma 2 (2B IT)** | 2.61B | `q4f16_1` | 1.89 GB | High Factual Accuracy | Text, File, Voice | Text, Code |
| **SD-Turbo Diffusion** | 1.2B | `fp16` | 1.98 GB | Single-Step Image Gen | Text, Voice | Image Render |
| **FLUX.1 Schnell Nano** | 2.4B | `q4` | 3.10 GB | Photorealistic Art | Text, Voice | Image Render |

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

