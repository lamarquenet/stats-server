# AI Server Control Dashboard - Architecture

Complete system architecture for the AI server monitoring and control dashboard.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              LOCAL NETWORK (192.168.8.x)                        │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                     piserver (Raspberry Pi)                               │  │
│  │                      IP: 192.168.8.170                                    │  │
│  │                                                                           │  │
│  │  ┌─────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Docker Containers                                                   │  │  │
│  │  │                                                                     │  │  │
│  │  │  ┌──────────────────────────┐    ┌──────────────────────────┐      │  │  │
│  │  │  │ server-admin-dashboard   │    │ wol-service              │      │  │  │
│  │  │  │                          │    │                          │      │  │  │
│  │  │  │ React + Nginx            │    │ Node.js + WOL library    │      │  │  │
│  │  │  │ Port: 80                 │    │ Port: 8002 (host mode)   │      │  │  │
│  │  │  │                          │    │                          │      │  │  │
│  │  │  │ Calls aiserver:8002      │    │ Wakes aiserver via WOL   │      │  │  │
│  │  │  └────────────┬─────────────┘    └────────────┬─────────────┘      │  │  │
│  │  │               │                               │                     │  │  │
│  │  └───────────────│───────────────────────────────│─────────────────────┘  │  │
│  │                  │                               │                        │  │
│  └──────────────────│───────────────────────────────│────────────────────────┘  │
│                     │                               │                           │
│                     │ HTTP                          │ WOL Magic Packet          │
│                     │ (192.168.8.209:8002)          │ (Broadcast to MAC)        │
│                     ▼                               ▼                           │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                     aiserver                                              │  │
│  │                      IP: 192.168.8.209                                    │  │
│  │                                                                           │  │
│  │  ┌─────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Docker Container                                                    │  │  │
│  │  │                                                                     │  │  │
│  │  │  stats-server                                                       │  │  │
│  │  │  ├── Express.js API                                                 │  │  │
│  │  │  ├── Socket.io (real-time stats)                                    │  │  │
│  │  │  ├── node-ssh (control host services)                               │  │  │
│  │  │  └── Port: 8002                                                     │  │  │
│  │  │           │                                                         │  │  │
│  │  │           │ SSH to 172.17.0.1 (Docker host gateway)                │  │  │
│  │  │           ▼                                                         │  │  │
│  │  └───────────│─────────────────────────────────────────────────────────┘  │  │
│  │              │                                                            │  │
│  │  ┌───────────│─────────────────────────────────────────────────────────┐  │  │
│  │  │ Host Services (NOT in Docker)                                       │  │  │
│  │  │                                                                      │  │  │
│  │  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │  │  │
│  │  │  │ vLLM             │  │ Ollama           │  │ SSH Server       │  │  │  │
│  │  │  │                  │  │                  │  │                  │  │  │  │
│  │  │  │ Conda env:       │  │ Native install   │  │ User: aiserver   │  │  │  │
│  │  │  │ vllm-conda-env   │  │ Port: 11434      │  │ Key: host-trigger│  │  │  │
│  │  │  │ Port: 8001       │  │                  │  │       -rsa       │  │  │  │
│  │  │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │  │  │
│  │  │                                                                      │  │  │
│  │  │  ┌──────────────────┐                                                │  │  │
│  │  │  │ llama.cpp        │  (Not installed yet)                          │  │  │
│  │  │  └──────────────────┘                                                │  │  │
│  │  └──────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                           │  │
│  │  [Sleeps when idle - auto-shutdown script]                                │  │
│  │  [Wakes up via WOL from piserver]                                         │  │
│  │                                                                           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                     Other Devices on Network                              │  │
│  │                                                                           │  │
│  │  Browser ────► http://192.168.8.170 (piserver Dashboard)                 │  │
│  │                    │                                                      │  │
│  │                    └──► Calls http://192.168.8.209:8002 (aiserver API)   │  │
│  │                                                                           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Server Roles

| Server | Role | IP Address |
|--------|------|------------|
| **piserver** | Raspberry Pi - Always on, serves frontend and WOL | 192.168.8.170 |
| **aiserver** | AI Server - Sleeps when idle, runs AI workloads | 192.168.8.209 |

## Repositories & Deployment

| Repository | Deployed On | Description |
|------------|-------------|-------------|
| [server-admin-dashboard](https://github.com/lamarquenet/server-admin-dashboard) | piserver | React frontend (port 80) |
| [wol-service](https://github.com/lamarquenet/wol-service) | piserver | Wake-on-LAN service (port 8002) |
| [stats-server](https://github.com/lamarquenet/stats-server) | **aiserver** | Backend API (port 8002) |

## Data Flow

### User Accesses Dashboard

```
1. Browser → piserver:80 (React Dashboard)
2. Dashboard → aiserver:8002 (stats-server API)
3. stats-server collects system info from aiserver host
4. Dashboard displays real-time stats via WebSocket
```

### Waking Up aiserver

```
1. User clicks "Wake Up Server" in dashboard
2. Dashboard → piserver:8002/wakeup (wol-service)
3. wol-service sends magic packet to aiserver MAC
4. aiserver wakes up, stats-server auto-starts
5. Dashboard detects aiserver is online
```

### Starting vLLM

```
1. User clicks "Run Vllm" in dashboard
2. Dashboard → aiserver:8002/api/command/start-vllm
3. stats-server (Docker) SSHs to 172.17.0.1 (aiserver host)
4. Host activates conda env and runs vllm serve
5. vLLM starts on aiserver:8001
```

## Why 172.17.0.1?

The stats-server runs inside Docker on aiserver. To control services on the **host machine** (aiserver itself), it uses `172.17.0.1` - the Docker bridge gateway IP.

```
┌─────────────────────────────────────────────────────────┐
│ aiserver host                                           │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ stats-server Docker container                   │   │
│  │                                                 │   │
│  │  SSH connect to 172.17.0.1 ──────┐             │   │
│  │                                  │             │   │
│  └──────────────────────────────────│─────────────┘   │
│                                     │                  │
│                                     ▼                  │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Host (172.17.0.1 - Docker bridge gateway)      │   │
│  │                                                 │   │
│  │  - vLLM (conda env)                            │   │
│  │  - Ollama                                      │   │
│  │  - SSH server                                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## SSH Key Setup (on aiserver)

The stats-server container needs SSH access to the aiserver host:

```bash
# On aiserver (as aiserver user)
ssh-keygen -t rsa -b 4096 -m PEM -f ~/.ssh/host-trigger-rsa -N ""
cat ~/.ssh/host-trigger-rsa.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

The docker-compose on aiserver mounts:
- `/home/aiserver/.ssh/host-trigger-rsa` → `/root/.ssh/id_rsa`
- `/home/aiserver/.ssh/known_hosts` → `/root/.ssh/known_hosts`

## API Endpoints (aiserver:8002)

### System Monitoring
- `GET /api/system/*` - CPU, memory, GPU stats
- `WebSocket /` - Real-time system info updates

### Power Control
- `GET /api/power/status` - Server online status
- `POST /api/power/shutdown` - Shutdown aiserver

### vLLM Control
- `GET /api/command/vllm-models` - Available models
- `GET /api/command/vllm-status` - vLLM status
- `POST /api/command/start-vllm` - Start vLLM with model
- `POST /api/command/stop-vllm` - Stop vLLM

### Ollama Control
- `GET /api/ollama/status` - Ollama status
- `GET /api/ollama/models` - List models
- `POST /api/ollama/start` - Start Ollama
- `POST /api/ollama/stop` - Stop Ollama

## Deployment

### piserver docker-compose.yml

```yaml
version: "0.8"

services:
  wol-service:
    image: ghcr.io/lamarquenet/wol-service:latest
    container_name: wol-service
    platform: linux/arm64
    restart: unless-stopped
    network_mode: "host"
    environment:
      - WOL_SERVICE_PORT=8002
      - SERVER_MAC=10:7B:44:93:F0:CD
      - WOL_BROADCAST_ADDR=192.168.8.255

  dashboard:
    image: ghcr.io/lamarquenet/server-admin-dashboard:latest
    container_name: server-admin-dashboard
    platform: linux/arm64
    ports:
      - 80:80
    environment:
      - REACT_APP_API_URL=http://192.168.8.209:8002
      - REACT_APP_WOL_SERVICE_URL=http://192.168.8.170:8002
    restart: unless-stopped
```

### aiserver docker-compose.yml

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

## Auto-Deployment (GitHub Actions)

All repos auto-build on push to master:
- `ghcr.io/lamarquenet/stats-server:latest`
- `ghcr.io/lamarquenet/server-admin-dashboard:latest`
- `ghcr.io/lamarquenet/wol-service:latest`

---

## Quick Reference: IP Addresses

| Service | Address | Port | Location |
|---------|---------|------|----------|
| Dashboard (frontend) | 192.168.8.170 | 80 | piserver |
| WOL Service | 192.168.8.170 | 8002 | piserver |
| stats-server API | 192.168.8.209 | 8002 | aiserver |
| vLLM | 172.17.0.1 (from Docker) | 8001 | aiserver host |
| Ollama | 172.17.0.1 (from Docker) | 11434 | aiserver host |

## Separate Project

### dashboard-app

Located at `/c/Users/nico/sites/dashboard-app` - A **separate** Next.js application for managing AI service bookmarks. Not connected to this ecosystem.
