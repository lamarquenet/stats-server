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
- For GPU monitoring: NVIDIA GPU with nvidia-smi installed

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

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 8002 |
| REFRESH_INTERVAL | Interval for system info updates (ms) | 1000 |
| SERVER_MAC | MAC address for Wake-on-LAN | - |
| SERVER_IP | IP address to check server status | - |
| WOL_SERVICE_PORT | Port for Wake-on-LAN service | 8002 |
| WOL_BROADCAST_ADDR | Broadcast address for Wake-on-LAN | - |

## License

MIT