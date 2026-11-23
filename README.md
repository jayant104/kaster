# 📱 Smart Gallery Mobile — 100% Offline AI Photo Gallery

Smart Gallery Mobile is a standalone offline Android app that combines **Cactus Mirage VLM** with a **Custom Fine-Tuned 82M LLM (`smart_gallery_llm`)** for perception-driven photo indexing and sub-millisecond bilingual search on mobile devices.

---

## 🚀 Key Features

- **100% On-Device & Offline**: Zero network calls. Your personal photos never leave your device.
- **Cactus Mirage VLM Perception**: Ultra-lightweight vision model extracting object bounding boxes, OCR text, and scene descriptions.
- **Custom 82M LLM (Quantized INT8 ONNX)**: Compressed to **115 MB** running on-device to silently bridge Hindi, Hinglish, and English synonyms into hidden search tags.
- **SQLite FTS5 Inverted Index**: Full-text inverted index with BM25 ranking executing local searches in **0.1ms – 0.65ms**.
- **Anti-AI Slop Design**: Deep Zinc-950 minimalist dark UI (`#08090c`), floating search bar, category pills, 120Hz smooth photo grid, and interactive slide-over visual inspector drawer with on-image bounding boxes and OCR hitboxes.

---

## 📦 Bundled On-Device Model Assets

The models are placed directly in `mobile/assets/models/`:
- `model_int8.onnx` (**115.45 MB**): Custom 82M LLM fine-tuned for Hindi/English tag expansion.
- `fastvit_mirage.cact` (**16.71 MB**): Cactus Mirage VLM perception engine.
- `tokenizer.json` (**3.55 MB**): Tokenizer vocabulary.

---

## 🛠️ How to Run & Build

### 1. Run Locally in Development Mode
```bash
cd mobile
npm install
npm start
```
Scan the QR code with **Expo Go** or press `a` to run in an Android emulator.

---

### 2. Build Standalone Android APK (`.apk`)

#### Option A: Cloud Build via EAS (Recommended — No Android Studio Setup Needed)
```bash
cd mobile
npm run build:android
# or: eas build -p android --profile preview
```
This builds a standalone `.apk` on EAS servers and returns a direct download link.

#### Option B: Local Native Build (Requires Android SDK & JDK 17)
```bash
cd mobile
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```
The generated APK will be located at:
`android/app/build/outputs/apk/release/app-release.apk`

---

### 3. Install on Android Device
Connect your phone with USB debugging enabled:
```bash
adb install android/app/build/outputs/apk/release/app-release.apk
```
Or transfer the `.apk` file directly to your phone via USB/WhatsApp/Drive and tap to install.

---

## 🔍 Verified Search Queries

| Query | Language | Top Match | Latency |
| :--- | :--- | :--- | :--- |
| `safed shirt` | Hindi / Hinglish | White Shirt / T-shirt | **0.65 ms** |
| `bijli ka bill` | Hindi / Hinglish | Electricity Bill Document | **0.20 ms** |
| `kagaz` | Hindi | Official Paper / Receipt | **0.15 ms** |
| `gadi` | Hindi / Hinglish | Car on Highway | **0.11 ms** |
| `aadmi` | Hindi | Person / Man | **0.10 ms** |
| `car` | English | Automobile / Vehicle | **0.12 ms** |
