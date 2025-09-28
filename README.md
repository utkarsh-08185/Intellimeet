# Intellimeet — Real-Time Video Meeting App with Agora

Intellimeet is a web-based video conferencing / meeting application built using the **Agora SDK**, allowing real-time audio/video communication directly in the browser. It includes both frontend code and a minimal backend for static file serving and test utilities.

---

## 🏗️ Architecture & Tech Stack

### Frontend (Client-side)
- Framework / Tools: React / React Native (with web target)  
- Build output: `Builds/web/` — contains static HTML, JS, WebAssembly, and asset files  
- Uses **Agora Web SDK** (via `react-native-agora` web build) to join, publish, and subscribe to media streams  
- Connects to an Agora channel using `APP_ID` (and optionally a token from backend)  
- Implements UI for joining meetings, handling streams, and cleaning up on leave  

### Backend / Server
- **Node.js / Express** server (in `server.js` and `serve-test-download.js`)  
- Purpose: static file serving, simple APIs, logging, and test download endpoints  
- Not currently a full token server — it does *not* generate server-side Agora tokens  
- Configuration stored in `config.json` (contains `APP_ID`, certificate field left blank)  
- Serve endpoints listen on a port (currently hardcoded; must adapt to `process.env.PORT` for cloud deployment)  

### Configuration & Secrets
- `config.json` holds:
  ```json
  {
    "APP_ID": "your_agora_app_id_here",
    "APP_CERTIFICATE": ""
  }
