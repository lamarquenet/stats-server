# Stats Server

Backend API server for the AI Server Control Dashboard. Runs on **aiserver (192.168.8.209)** and provides system monitoring, power management, and AI service control (vLLM, Ollama, llama.cpp).

## Deployment Location

```
┌─────────────────────────────────────────────────────────────────┐
│                    aiserver (192.168.8.209)                     │
│                                                                 │
│  Docker:                                                        │
│  └── stats-server:8002 ─── SSH ───► 172.17.0.1 (host)          │
│                                       │                         │
│  Host Services:                      ├──► vLLM:8001            │
│  ├── vLLM (conda env)                ├──► Ollama:11434         │
│  ├── Ollama                         └──► SSH server            │
│  └── SSH server (aiserver user)                                 │
└─────────────────────────────────────────────────────────────────┘
```

The piserver dashboard (192.168.8.170) calls this API.

## Available vLLM Model Configurations

| Key | Name | Context | KV Cache | Quantization | GPU % | TP |
|-----|------|---------|----------|--------------|-------|-----|
| `devstral-standard` | Devstral Small | 85K | - | - | 90% | 4 |
| `devstral-max-context` | Devstral Small Max | 131K | - | - | 90% | 4 |
| `devstral-fp8` | Devstral Small (FP8) | 85K | FP8 | - | 80% | 4 |
| `devstral-fp8-max` | Devstral Small (FP8 + Max) | 110K | FP8 | - | 80% | 4 |
| `devstral-awq` | Devstral Small (AWQ) | 85K | - | AWQ | 80% | 4 |
| `devstral-gptq` | Devstral Small (GPTQ) | 85K | - | GPTQ | 80% | 4 |
| `devstral-fp8-awq` | Devstral Small (FP8 + AWQ) | 110K | FP8 | AWQ | 80% | 2 |

### Configuration Options

| Option | Description |
|--------|-------------|
| `gpuMemoryUtilization` | Fraction of GPU memory to use (0.0-1.0) |
| `maxModelLen` | Maximum context length in tokens |
| `kvCacheDtype` | KV cache data type (`fp8` for memory efficiency) |
| `quantization` | Weight quantization (`awq`, `gptq`) |
| `tensorParallelSize` | Number of GPUs for tensor parallelism |

### Notes on Quantization

- **FP8 KV Cache**: Reduces memory for KV cache, best for long contexts
- **AWQ**: Requires pre-quantized model from HuggingFace (e.g., `model-AWQ`)
- **GPTQ**: Requires pre-quantized model from HuggingFace (e.g., `model-GPTQ-4bit`)

## API Endpoints

### System Information
- `GET /api/system` - Get all system information
- `GET /api/system/cpu` - Get CPU information
- `GET /api/system/memory` - Get memory information
- `GET /api/system/gpu` - Get GPU information

### Power Management
- `GET /api/power/status` - Get server power status
- `POST /api/power/shutdown` - Shutdown the server

### vLLM
- `GET /api/command/vllm-models` - Get available models
- `GET /api/command/vllm-status` - Get vLLM server status
- `POST /api/command/start-vllm` - Start vLLM: `{"model": "model-key"}`
- `POST /api/command/stop-vllm` - Stop vLLM server

### Ollama
- `GET /api/ollama/status` - Get Ollama status
- `GET /api/ollama/models` - List installed models
- `POST /api/ollama/start` - Start Ollama service
- `POST /api/ollama/stop` - Stop Ollama service
- `POST /api/ollama/pull` - Pull model: `{"model": "name"}`
- `DELETE /api/ollama/model/:name` - Delete model

### Logs
- `GET /api/logs/services` - Get available log services
- `GET /api/logs/:service` - Get logs for a service
- `DELETE /api/logs/:service` - Clear logs

### Performance
- `GET /api/performance/all` - Get all service metrics
- `GET /api/performance/health` - Quick health check

### llama.cpp
- `GET /api/llamacpp/status` - Get llama.cpp status
- `POST /api/llamacpp/start` - Start llama.cpp
- `POST /api/llamacpp/stop` - Stop llama.cpp
- `GET /api/llamacpp/models` - List available models

## WebSocket Events

- `systemInfo` - Emitted periodically (every 1 second by default) with updated system information including CPU, memory, and GPU data

## Configuration

### Prerequisites

- Node.js 14+
- npm or yarn
- For GPU monitoring: NVIDIA GPU with nvidia-smi installed (optional)

### Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file based on `.env.example`
4. Start the server:
   ```
   npm start
   ```

## Docker Deployment

1. Build the Docker image:
   ```
   docker build -t stats-server .
   ```

2. Or use docker-compose:
   ```
   docker-compose up -d
   ```

### NVIDIA GPU Support in Docker

By default, the Docker container doesn't have access to NVIDIA GPUs. If you have NVIDIA GPUs and want to monitor them:

1. Install the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) on your host system.

2. Modify the `docker-compose.yml` file to enable GPU access:
   ```yaml
   deploy:
     resources:
       reservations:
         devices:
           - driver: nvidia
             count: all
             capabilities: [gpu]
   environment:
     - NVIDIA_VISIBLE_DEVICES=all
   runtime: nvidia
   ```

3. Restart the container:
   ```
   docker-compose down
   docker-compose up -d
   ```

If you don't have NVIDIA GPUs or don't need GPU monitoring, the server will still work without these modifications, displaying "No GPU Detected" in the GPU information.

## GPU Troubleshooting

If you encounter issues with GPU monitoring, such as "Failed to initialize NVML" errors, try the following:

1. **Ensure NVIDIA drivers are properly installed** on the host system.
2. **Verify GPU access in Docker**:
   - Make sure the NVIDIA Container Toolkit is installed.
   - Check that the container has the necessary GPU capabilities.
3. **Check GPU availability**:
   - The GPU might be temporarily unavailable if it's being used by another process (e.g., loading a large model).
   - The server has a fallback mechanism that will continue to function even if GPU information cannot be retrieved.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8002 | Server port |
| `RUNNING_IN_DOCKER` | false | Set to true in Docker |
| `REFRESH_INTERVAL` | 1000 | WebSocket update interval (ms) |

### SSH Setup (Required)

The container needs SSH access to the host to control vLLM/Ollama:

```bash
# On aiserver (as aiserver user)
ssh-keygen -t rsa -b 4096 -m PEM -f ~/.ssh/host-trigger-rsa -N ""
cat ~/.ssh/host-trigger-rsa.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### Docker Compose (aiserver)

```yaml
version: '0.1'

services:
  stats-server:
    image: ghcr.io/lamarquenet/stats-server:latest
    container_name: stats-server
    restart: unless-stopped
    ports:
      - "8002:8002"
    volumes:
      - /home/aiserver/.ssh/host-trigger-rsa:/root/.ssh/id_rsa:ro
      - /home/aiserver/.ssh/known_hosts:/root/.ssh/known_hosts:ro
    environment:
      - PORT=8002
      - RUNNING_IN_DOCKER=true
      - NVIDIA_VISIBLE_DEVICES=all
    runtime: nvidia
```

## Adding New vLLM Models

Edit `config/models.js`:

```javascript
'model-key': {
  id: 'huggingface/model-id',     // Model ID on HuggingFace
  name: 'Display Name',            // Shown in dropdown
  description: 'Description',       // Shown below dropdown
  gpuMemoryUtilization: 0.90,      // GPU memory fraction (0.0-1.0)
  maxModelLen: 32768,              // Maximum context length
  port: 8001,                      // Server port
  tensorParallelSize: 4,           // Number of GPUs
  kvCacheDtype: 'fp8',             // Optional: FP8 KV cache
  quantization: 'awq',             // Optional: awq, gptq
  // Mistral-specific options:
  tokenizerMode: 'mistral',
  configFormat: 'mistral',
  loadFormat: 'mistral',
  toolCallParser: 'mistral',
  enableAutoToolChoice: true,
}
```

## Related Repositories

| Repo | Location | IP | Purpose |
|------|----------|-----|---------|
| server-admin-dashboard | piserver | 192.168.8.170 | React frontend |
| wol-service | piserver | 192.168.8.170 | Wake-on-LAN service |
| stats-server | **aiserver** | 192.168.8.209 | This backend API |
