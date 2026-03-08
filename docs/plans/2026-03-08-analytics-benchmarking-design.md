# Analytics, Benchmarking & Cost Tracking Design

**Date:** 2026-03-08
**Status:** Approved

## Overview

Add request analytics, model benchmarking, and power cost tracking to stats-server.

## Features

### 1. Power/Cost Tracking

Read power consumption data from aiserver via SSH and calculate costs.

**Data Sources:**
- `/home/aiserver/power_tools.txt` - Accumulated energy (kWh)
- `/var/log/monthly_power_usage.log` - Monthly energy total

**Endpoint:**
```
GET /api/cost
```

**Response:**
```json
{
  "accumulatedEnergyKwh": 4.407540,
  "totalCostUsd": 0.44,
  "monthlyEnergyKwh": 12.5,
  "monthlyCostUsd": 1.25,
  "electricityRate": 0.10,
  "lastUpdated": "2026-03-08T12:00:00Z"
}
```

**Implementation Notes:**
- Reuse existing SSH connection helper
- Cache results for 5 seconds to avoid SSH hammering

---

### 2. vLLM Metrics Analytics

Poll vLLM `/metrics` endpoint every 10 seconds, fix parsing issues, and store aggregated data.

**Endpoint:**
```
GET /api/analytics/vllm
```

**Response:**
```json
{
  "current": {
    "tokensPerSecond": 45.2,
    "gpuCacheUtilization": 0.85,
    "cpuCacheUtilization": 0.12,
    "requestsRunning": 1,
    "requestsWaiting": 0,
    "avgTimeToFirstToken": 4506
  },
  "history": {
    "last24h": {
      "totalPromptTokens": 125000,
      "totalGenerationTokens": 89000,
      "totalRequests": 342,
      "avgTokensPerSecond": 42.5,
      "avgTtft": 3800
    }
  },
  "lastUpdated": "2026-03-08T12:00:00Z"
}
```

**Fixes Needed:**
- Parse correct Prometheus metric names:
  - `vllm:num_requests_running`
  - `vllm:num_requests_waiting`
  - `vllm:time_to_first_token`
  - `vllm:generation_tokens`
  - `vllm:prompt_tokens`

**Storage:** `data/analytics.json`

---

### 3. Model Benchmarking

Run a fixed standard prompt through vLLM API and measure performance.

**Endpoints:**
```
POST /api/benchmark/run
GET /api/benchmark/results
GET /api/benchmark/results/:modelId
```

**Fixed Benchmark Configuration:**
```javascript
{
  prompt: "Write a short poem about artificial intelligence.",
  maxTokens: 100,
  temperature: 0.7
}
```

**Run Request:**
```json
{
  "model": "cyankiwi-qwen3-coder-next",
  "service": "vllm"
}
```

**Run Response:**
```json
{
  "benchmarkId": "bench_20260308_120000",
  "model": "cyankiwi-qwen3-coder-next",
  "service": "vllm",
  "prompt": "Write a short poem about artificial intelligence.",
  "results": {
    "timeToFirstTokenMs": 450,
    "tokensGenerated": 87,
    "totalLatencyMs": 3200,
    "tokensPerSecond": 27.2,
    "output": "Silicon dreams in circuits deep..."
  },
  "systemState": {
    "gpuMemoryUsed": "45.2 GB",
    "gpuUtilization": "85%"
  },
  "timestamp": "2026-03-08T12:00:00Z"
}
```

**Storage:** `data/benchmarks.json`

---

## File Structure

```
stats-server/
├── routes/
│   ├── cost.js           # Cost tracking routes
│   ├── analytics.js      # Analytics routes + polling
│   └── benchmark.js      # Benchmarking routes
├── services/
│   ├── costService.js    # SSH to read power files
│   ├── analyticsService.js # vLLM metrics polling + storage
│   └── benchmarkService.js # Run inference benchmarks
├── data/
│   ├── analytics.json    # Stored metrics history
│   └── benchmarks.json   # Stored benchmark results
└── utils/
    └── jsonStore.js      # Helper for reading/writing JSON files
```

## API Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cost` | Power cost data from aiserver |
| GET | `/api/analytics/vllm` | Current + historical vLLM metrics |
| POST | `/api/benchmark/run` | Run a benchmark |
| GET | `/api/benchmark/results` | List all benchmark results |
| GET | `/api/benchmark/results/:modelId` | Get results for specific model |

## Integration

- Import new routes in `server.js`
- Reuse existing SSH helper from `services/vllmService.js`
- Reuse axios instance for vLLM API calls
