# ZHI Windows Local Brain Bridge

ZHI agent chat now uses:

ZHI HTTPS frontend -> 127.0.0.1:11435 Brain Bridge -> Ollama 127.0.0.1:11434

The bridge binds only to loopback and provides CORS plus health/model checks.

## Windows startup

1. Install Node.js LTS.
2. Confirm Ollama works with `ollama list`.
3. Double-click `start-zhi-brain.bat`.
4. Keep the Brain Bridge window running while using ZHI.

The frontend automatically checks:
- Bridge health: `/health`
- Ollama/model health: `/api/tags`
- Brain requests: `/api/chat`

The chat status bar will show the actual bridge/Ollama state and installed models.
