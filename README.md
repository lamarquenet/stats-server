# Stats Server

A Node.js server that provides system statistics and power management functionality through a REST API and real-time updates via WebSockets.

## Features

- **System Information**: Get real-time data about CPU, memory, and GPU usage
- **Power Management**: Control server power state (shutdown, wake-on-LAN)
- **Real-time Updates**: WebSocket support for live system monitoring
- **Docker Support**: Easy deployment with Docker and docker-compose

## API Endpoints

### System Information

- `GET /api/system`: Get all system information
- `GET /api/system/cpu`: Get CPU information
- `GET /api/system/memory`: Get memory information
- `GET /api/system/gpu`: Get GPU information

### Power Management

- `GET /api/power/status`: Get server power status
- `POST /api/power/shutdown`: Shutdown the server

## WebSocket Events

- `systemInfo`: Emitted periodically with updated system information

## Installation

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

2. Modify the `docker-compose.yml` file to enable GPU access by uncommenting the NVIDIA-specific sections:
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
   ```

3. Restart the container:
   ```
   docker-compose down
   docker-compose up -d
   ```

If you don't have NVIDIA GPUs or don't need GPU monitoring, the server will still work without these modifications, displaying "No GPU Detected" in the GPU information.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 8002 |
| REFRESH_INTERVAL | Interval for system info updates (ms) | 1000 |
| SERVER_MAC | MAC address for Wake-on-LAN | - |
| SERVER_IP | IP address to check server status | - |
| WOL_SERVICE_PORT | Port for Wake-on-LAN service | 8002 |
| WOL_BROADCAST_ADDR | Broadcast address for Wake-on-LAN | - |

## Setting up credentials to allow app running commands on host server when running on a docker via ssh, simpler if you just run this server on the host pc without docker

If you don't have openssh server do:
sudo apt update
sudo apt install openssh-server
sudo systemctl enable --now ssh

# 1- Generate a 4096‑bit RSA key in PEM format, no passphrase
ssh-keygen -t rsa -b 4096 -m PEM -f ~/.ssh/host-trigger-rsa -N ""


# 2- After add the key on authorized keys:
cat ~/.ssh/host-trigger-rsa.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 400 ~/.ssh/host-trigger-rsa

# 3- Mount the SSH private key into the container:
services:
  stats-server:
    # … your existing config …
    volumes:
      # mount the new RSA private key read‑only
      - /home/aiserver/.ssh/host-trigger-rsa:/root/.ssh/id_rsa:ro
      # known_hosts as before
      - /home/aiserver/.ssh/known_hosts:/root/.ssh/known_hosts:ro

