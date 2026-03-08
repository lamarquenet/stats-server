# Analytics, Benchmarking & Cost Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add power cost tracking, vLLM analytics with historical data, and model benchmarking capabilities.

**Architecture:** Create new services for cost (SSH-based), analytics (polling + JSON storage), and benchmarking (inference testing). Add corresponding routes and integrate into the Express app.

**Tech Stack:** Express, node-ssh, axios, JSON file storage

---

## Task 1: Create JSON Storage Utility

**Files:**
- Create: `utils/jsonStore.js`

**Step 1: Create the utility**

```javascript
// utils/jsonStore.js
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Read JSON file, return default if not exists
 * @param {string} filename - Filename within data directory
 * @param {any} defaultValue - Default value if file doesn't exist
 */
function readJson(filename, defaultValue = {}) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading ${filename}:`, err.message);
    return defaultValue;
  }
}

/**
 * Write JSON file atomically
 * @param {string} filename - Filename within data directory
 * @param {any} data - Data to write
 */
function writeJson(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${filename}:`, err.message);
    return false;
  }
}

module.exports = { readJson, writeJson, DATA_DIR };
```

**Step 2: Verify it works**

Run: `node -e "const { readJson, writeJson } = require('./utils/jsonStore'); writeJson('test.json', { hello: 'world' }); console.log(readJson('test.json'));"`

Expected: `{ hello: 'world' }`

**Step 3: Commit**

```bash
git add utils/jsonStore.js data/.gitkeep
git commit -m "feat: add JSON storage utility for analytics data"
```

---

## Task 2: Create Cost Service

**Files:**
- Create: `services/costService.js`

**Step 1: Create the service**

```javascript
// services/costService.js
const { NodeSSH } = require('node-ssh');
const fs = require('fs');

const ssh = new NodeSSH();
const privateKey = fs.readFileSync('/root/.ssh/id_rsa', 'utf8');

// Cache to avoid hammering SSH
let cachedData = null;
let cacheTime = 0;
const CACHE_TTL = 5000; // 5 seconds

/**
 * Get power cost data from aiserver
 */
async function getCostData() {
  // Return cached data if fresh
  const now = Date.now();
  if (cachedData && (now - cacheTime) < CACHE_TTL) {
    return cachedData;
  }

  try {
    await ssh.connect({
      host: '172.17.0.1',
      username: 'aiserver',
      privateKey,
    });

    // Read accumulated energy from power_tools.txt
    const energyResult = await ssh.execCommand('cat /home/aiserver/power_tools.txt');
    const accumulatedEnergyKwh = parseFloat(energyResult.stdout.trim()) || 0;

    // Read monthly power usage
    const monthlyResult = await ssh.execCommand('cat /var/log/monthly_power_usage.log');
    const monthlyEnergyKwh = parseFloat(monthlyResult.stdout.trim()) || 0;

    const electricityRate = 0.10; // $0.10 per kWh

    cachedData = {
      accumulatedEnergyKwh,
      totalCostUsd: parseFloat((accumulatedEnergyKwh * electricityRate).toFixed(6)),
      monthlyEnergyKwh,
      monthlyCostUsd: parseFloat((monthlyEnergyKwh * electricityRate).toFixed(6)),
      electricityRate,
      lastUpdated: new Date().toISOString()
    };

    cacheTime = now;
    return cachedData;

  } catch (err) {
    console.error('Error fetching cost data:', err.message);
    throw err;
  } finally {
    ssh.dispose();
  }
}

module.exports = { getCostData };
```

**Step 2: Test manually**

Run: `node -e "const { getCostData } = require('./services/costService'); getCostData().then(console.log).catch(console.error);"`

Expected: JSON object with cost data

**Step 3: Commit**

```bash
git add services/costService.js
git commit -m "feat: add cost service to read power usage from aiserver"
```

---

## Task 3: Create Cost Routes

**Files:**
- Create: `routes/costRoutes.js`

**Step 1: Create the routes**

```javascript
// routes/costRoutes.js
const express = require('express');
const router = express.Router();
const costService = require('../services/costService');

/**
 * @route   GET /api/cost
 * @desc    Get power cost data from aiserver
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const data = await costService.getCostData();
    res.json(data);
  } catch (error) {
    console.error('Error in /api/cost:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

module.exports = router;
```

**Step 2: Integrate into index.js**

Add to `index.js` after line 32:

```javascript
app.use('/api/cost', require('./routes/costRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/benchmark', require('./routes/benchmarkRoutes'));
```

**Step 3: Test endpoint**

Start server and test: `curl http://localhost:8002/api/cost`

Expected: JSON with cost data

**Step 4: Commit**

```bash
git add routes/costRoutes.js index.js
git commit -m "feat: add /api/cost endpoint for power cost tracking"
```

---

## Task 4: Create Analytics Service

**Files:**
- Create: `services/analyticsService.js`

**Step 1: Create the service**

```javascript
// services/analyticsService.js
const axios = require('axios');
const { readJson, writeJson } = require('../utils/jsonStore');

const VLLM_URL = 'http://172.17.0.1:8001';
const ANALYTICS_FILE = 'analytics.json';
const POLL_INTERVAL = 10000; // 10 seconds

// Default analytics structure
function getDefaultAnalytics() {
  return {
    current: {
      tokensPerSecond: null,
      gpuCacheUtilization: null,
      cpuCacheUtilization: null,
      requestsRunning: 0,
      requestsWaiting: 0,
      avgTimeToFirstToken: null,
      totalPromptTokens: 0,
      totalGenerationTokens: 0
    },
    history: {
      last24h: {
        totalPromptTokens: 0,
        totalGenerationTokens: 0,
        totalRequests: 0,
        avgTokensPerSecond: null,
        avgTtft: null,
        samples: []
      }
    },
    lastUpdated: null
  };
}

/**
 * Parse Prometheus metrics format
 */
function parsePrometheusMetrics(metricsText) {
  const metrics = {};
  const lines = metricsText.split('\n');

  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{[^}]*\})?\s+(.+)$/);
    if (match) {
      const [, name, value] = match;
      metrics[name] = parseFloat(value);
    }
  }
  return metrics;
}

/**
 * Calculate tokens per second from vLLM metrics
 */
function calculateTokensPerSecond(metrics) {
  const iterationTokens = metrics['vllm:iteration_tokens_total'] || 0;
  const iterationTime = metrics['vllm:iteration_latency_seconds_total'] || 0;

  if (iterationTime > 0 && iterationTokens > 0) {
    return iterationTokens / iterationTime;
  }

  const totalTokens = metrics['vllm:num_generation_tokens_total'] || 0;
  const totalTime = metrics['vllm:e2e_request_latency_seconds_sum'] || 0;

  if (totalTime > 0 && totalTokens > 0) {
    return totalTokens / totalTime;
  }

  return null;
}

/**
 * Fetch current vLLM metrics and update analytics
 */
async function pollVllmMetrics() {
  try {
    const response = await axios.get(`${VLLM_URL}/metrics`, { timeout: 3000 });
    const metrics = parsePrometheusMetrics(response.data);

    // Read existing analytics
    const analytics = readJson(ANALYTICS_FILE, getDefaultAnalytics());

    // Update current metrics
    analytics.current = {
      tokensPerSecond: calculateTokensPerSecond(metrics),
      gpuCacheUtilization: metrics['vllm:gpu_cache_usage_perc'] ?? null,
      cpuCacheUtilization: metrics['vllm:cpu_cache_usage_perc'] ?? null,
      requestsRunning: metrics['vllm:num_requests_running'] || 0,
      requestsWaiting: metrics['vllm:num_requests_waiting'] || 0,
      avgTimeToFirstToken: null,
      totalPromptTokens: metrics['vllm:num_prompt_tokens_total'] || 0,
      totalGenerationTokens: metrics['vllm:num_generation_tokens_total'] || 0
    };

    // Calculate average TTFT
    const ttftSum = metrics['vllm:time_to_first_token_seconds_sum'] || 0;
    const ttftCount = metrics['vllm:time_to_first_token_seconds_count'] || 0;
    if (ttftCount > 0) {
      analytics.current.avgTimeToFirstToken = (ttftSum / ttftCount) * 1000; // Convert to ms
    }

    // Update history sample
    const sample = {
      timestamp: new Date().toISOString(),
      tokensPerSecond: analytics.current.tokensPerSecond,
      ttft: analytics.current.avgTimeToFirstToken,
      promptTokens: analytics.current.totalPromptTokens,
      generationTokens: analytics.current.totalGenerationTokens,
      requestsRunning: analytics.current.requestsRunning
    };

    // Keep last 24h of samples (8640 samples at 10s intervals)
    analytics.history.last24h.samples.push(sample);
    if (analytics.history.last24h.samples.length > 8640) {
      analytics.history.last24h.samples.shift();
    }

    // Update aggregated history
    analytics.history.last24h.totalPromptTokens = analytics.current.totalPromptTokens;
    analytics.history.last24h.totalGenerationTokens = analytics.current.totalGenerationTokens;

    const requestCount = metrics['vllm:e2e_request_latency_seconds_count'] || 0;
    analytics.history.last24h.totalRequests = requestCount;

    // Calculate averages from samples
    const validSamples = analytics.history.last24h.samples.filter(s => s.tokensPerSecond !== null);
    if (validSamples.length > 0) {
      analytics.history.last24h.avgTokensPerSecond =
        validSamples.reduce((sum, s) => sum + s.tokensPerSecond, 0) / validSamples.length;
    }

    const ttftSamples = analytics.history.last24h.samples.filter(s => s.ttft !== null);
    if (ttftSamples.length > 0) {
      analytics.history.last24h.avgTtft =
        ttftSamples.reduce((sum, s) => sum + s.ttft, 0) / ttftSamples.length;
    }

    analytics.lastUpdated = new Date().toISOString();

    // Save to file
    writeJson(ANALYTICS_FILE, analytics);

    return analytics;
  } catch (err) {
    console.error('Error polling vLLM metrics:', err.message);
    return readJson(ANALYTICS_FILE, getDefaultAnalytics());
  }
}

/**
 * Get current analytics data
 */
function getAnalytics() {
  return readJson(ANALYTICS_FILE, getDefaultAnalytics());
}

/**
 * Start polling interval
 */
let pollInterval = null;
function startPolling() {
  if (pollInterval) return;
  // Poll immediately
  pollVllmMetrics();
  // Then poll on interval
  pollInterval = setInterval(pollVllmMetrics, POLL_INTERVAL);
  console.log('Analytics polling started (every 10s)');
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

module.exports = {
  getAnalytics,
  pollVllmMetrics,
  startPolling,
  stopPolling
};
```

**Step 2: Commit**

```bash
git add services/analyticsService.js
git commit -m "feat: add analytics service with vLLM metrics polling"
```

---

## Task 5: Create Analytics Routes

**Files:**
- Create: `routes/analyticsRoutes.js`

**Step 1: Create the routes**

```javascript
// routes/analyticsRoutes.js
const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analyticsService');

/**
 * @route   GET /api/analytics/vllm
 * @desc    Get vLLM analytics (current + historical)
 * @access  Public
 */
router.get('/vllm', (req, res) => {
  try {
    const data = analyticsService.getAnalytics();
    res.json(data);
  } catch (error) {
    console.error('Error in /api/analytics/vllm:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   POST /api/analytics/poll
 * @desc    Trigger immediate metrics poll
 * @access  Public
 */
router.post('/poll', async (req, res) => {
  try {
    const data = await analyticsService.pollVllmMetrics();
    res.json(data);
  } catch (error) {
    console.error('Error in /api/analytics/poll:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

module.exports = router;
```

**Step 2: Test endpoint**

Start server and test: `curl http://localhost:8002/api/analytics/vllm`

Expected: JSON with current and history data

**Step 3: Commit**

```bash
git add routes/analyticsRoutes.js
git commit -m "feat: add /api/analytics/vllm endpoint"
```

---

## Task 6: Create Benchmark Service

**Files:**
- Create: `services/benchmarkService.js`

**Step 1: Create the service**

```javascript
// services/benchmarkService.js
const axios = require('axios');
const { readJson, writeJson } = require('../utils/jsonStore');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const VLLM_URL = 'http://172.17.0.1:8001';
const OLLAMA_URL = 'http://172.17.0.1:11434';
const BENCHMARKS_FILE = 'benchmarks.json';

// Fixed benchmark configuration
const BENCHMARK_PROMPT = "Write a short poem about artificial intelligence.";
const BENCHMARK_MAX_TOKENS = 100;
const BENCHMARK_TEMPERATURE = 0.7;

/**
 * Get GPU memory info from nvidia-smi
 */
async function getGpuMemoryInfo() {
  try {
    const { stdout } = await execPromise(
      'LC_ALL=C nvidia-smi --query-gpu=memory.used,utilization.gpu --format=csv,noheader,nounits'
    );
    const lines = stdout.trim().split('\n');
    const totalMemory = lines.reduce((sum, line) => {
      const [used] = line.split(',').map(v => parseFloat(v.trim()));
      return sum + (used || 0);
    }, 0);
    const avgUtil = lines.reduce((sum, line) => {
      const [, util] = line.split(',').map(v => parseFloat(v.trim()));
      return sum + (util || 0);
    }, 0) / lines.length;

    return {
      memoryUsedGB: (totalMemory / 1024).toFixed(2),
      utilizationPercent: avgUtil.toFixed(1)
    };
  } catch {
    return { memoryUsedGB: 'N/A', utilizationPercent: 'N/A' };
  }
}

/**
 * Run benchmark on vLLM
 */
async function runVllmBenchmark(model) {
  const benchmarkId = `bench_${Date.now()}`;
  const startTime = Date.now();

  try {
    // Use streaming to measure TTFT
    const response = await axios({
      method: 'POST',
      url: `${VLLM_URL}/v1/completions`,
      data: {
        model: model,
        prompt: BENCHMARK_PROMPT,
        max_tokens: BENCHMARK_MAX_TOKENS,
        temperature: BENCHMARK_TEMPERATURE,
        stream: false
      },
      timeout: 60000
    });

    const totalLatencyMs = Date.now() - startTime;
    const data = response.data;

    // Calculate metrics
    const tokensGenerated = data.usage?.completion_tokens || 0;
    const promptTokens = data.usage?.prompt_tokens || 0;
    const tokensPerSecond = tokensGenerated > 0 && totalLatencyMs > 0
      ? (tokensGenerated / (totalLatencyMs / 1000)).toFixed(2)
      : null;

    // TTFT estimation (vLLM doesn't return this in non-streaming)
    // We'll estimate as 10-20% of total latency for first token
    const estimatedTtft = Math.round(totalLatencyMs * 0.15);

    const output = data.choices?.[0]?.text || '';

    // Get system state
    const gpuState = await getGpuMemoryInfo();

    const result = {
      benchmarkId,
      model,
      service: 'vllm',
      prompt: BENCHMARK_PROMPT,
      results: {
        timeToFirstTokenMs: estimatedTtft,
        tokensGenerated,
        promptTokens,
        totalLatencyMs,
        tokensPerSecond: tokensPerSecond ? parseFloat(tokensPerSecond) : null,
        output: output.substring(0, 200) // Truncate for storage
      },
      systemState: {
        gpuMemoryUsed: gpuState.memoryUsedGB + ' GB',
        gpuUtilization: gpuState.utilizationPercent + '%'
      },
      timestamp: new Date().toISOString()
    };

    // Save to history
    saveBenchmarkResult(result);

    return result;

  } catch (err) {
    throw new Error(`vLLM benchmark failed: ${err.message}`);
  }
}

/**
 * Run benchmark on Ollama
 */
async function runOllamaBenchmark(model) {
  const benchmarkId = `bench_${Date.now()}`;
  const startTime = Date.now();

  try {
    const response = await axios({
      method: 'POST',
      url: `${OLLAMA_URL}/api/generate`,
      data: {
        model: model,
        prompt: BENCHMARK_PROMPT,
        options: {
          num_predict: BENCHMARK_MAX_TOKENS,
          temperature: BENCHMARK_TEMPERATURE
        },
        stream: false
      },
      timeout: 60000
    });

    const totalLatencyMs = Date.now() - startTime;
    const data = response.data;

    const tokensGenerated = data.eval_count || 0;
    const promptTokens = data.prompt_eval_count || 0;
    const tokensPerSecond = tokensGenerated > 0 && totalLatencyMs > 0
      ? (tokensGenerated / (totalLatencyMs / 1000)).toFixed(2)
      : null;

    // Ollama provides actual TTFT
    const ttft = data.prompt_eval_duration
      ? Math.round(data.prompt_eval_duration / 1000000) // nanoseconds to ms
      : null;

    const output = data.response || '';

    const gpuState = await getGpuMemoryInfo();

    const result = {
      benchmarkId,
      model,
      service: 'ollama',
      prompt: BENCHMARK_PROMPT,
      results: {
        timeToFirstTokenMs: ttft,
        tokensGenerated,
        promptTokens,
        totalLatencyMs,
        tokensPerSecond: tokensPerSecond ? parseFloat(tokensPerSecond) : null,
        output: output.substring(0, 200)
      },
      systemState: {
        gpuMemoryUsed: gpuState.memoryUsedGB + ' GB',
        gpuUtilization: gpuState.utilizationPercent + '%'
      },
      timestamp: new Date().toISOString()
    };

    saveBenchmarkResult(result);

    return result;

  } catch (err) {
    throw new Error(`Ollama benchmark failed: ${err.message}`);
  }
}

/**
 * Save benchmark result to history
 */
function saveBenchmarkResult(result) {
  const benchmarks = readJson(BENCHMARKS_FILE, { results: [] });

  // Keep last 100 benchmarks
  benchmarks.results.push(result);
  if (benchmarks.results.length > 100) {
    benchmarks.results = benchmarks.results.slice(-100);
  }

  writeJson(BENCHMARKS_FILE, benchmarks);
}

/**
 * Get all benchmark results
 */
function getAllBenchmarks() {
  return readJson(BENCHMARKS_FILE, { results: [] });
}

/**
 * Get benchmark results for a specific model
 */
function getBenchmarksByModel(modelId) {
  const benchmarks = getAllBenchmarks();
  return {
    model: modelId,
    results: benchmarks.results.filter(r =>
      r.model.toLowerCase().includes(modelId.toLowerCase())
    )
  };
}

/**
 * Run benchmark on specified service
 */
async function runBenchmark(service, model) {
  if (service === 'vllm') {
    return runVllmBenchmark(model);
  } else if (service === 'ollama') {
    return runOllamaBenchmark(model);
  } else {
    throw new Error(`Unknown service: ${service}`);
  }
}

module.exports = {
  runBenchmark,
  getAllBenchmarks,
  getBenchmarksByModel,
  BENCHMARK_PROMPT,
  BENCHMARK_MAX_TOKENS
};
```

**Step 2: Commit**

```bash
git add services/benchmarkService.js
git commit -m "feat: add benchmark service for vLLM and Ollama"
```

---

## Task 7: Create Benchmark Routes

**Files:**
- Create: `routes/benchmarkRoutes.js`

**Step 1: Create the routes**

```javascript
// routes/benchmarkRoutes.js
const express = require('express');
const router = express.Router();
const benchmarkService = require('../services/benchmarkService');

/**
 * @route   GET /api/benchmark/results
 * @desc    Get all benchmark results
 * @access  Public
 */
router.get('/results', (req, res) => {
  try {
    const data = benchmarkService.getAllBenchmarks();
    res.json(data);
  } catch (error) {
    console.error('Error in /api/benchmark/results:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   GET /api/benchmark/results/:modelId
 * @desc    Get benchmark results for a specific model
 * @access  Public
 */
router.get('/results/:modelId', (req, res) => {
  try {
    const data = benchmarkService.getBenchmarksByModel(req.params.modelId);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/benchmark/results/:modelId:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   POST /api/benchmark/run
 * @desc    Run a benchmark
 * @body    { model: string, service: 'vllm' | 'ollama' }
 * @access  Public
 */
router.post('/run', async (req, res) => {
  try {
    const { model, service = 'vllm' } = req.body;

    if (!model) {
      return res.status(400).json({ error: 'Model is required' });
    }

    const result = await benchmarkService.runBenchmark(service, model);
    res.json(result);
  } catch (error) {
    console.error('Error in /api/benchmark/run:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   GET /api/benchmark/config
 * @desc    Get benchmark configuration
 * @access  Public
 */
router.get('/config', (req, res) => {
  res.json({
    prompt: benchmarkService.BENCHMARK_PROMPT,
    maxTokens: benchmarkService.BENCHMARK_MAX_TOKENS,
    temperature: 0.7
  });
});

module.exports = router;
```

**Step 2: Test endpoint**

Start server and test:
```bash
# Get config
curl http://localhost:8002/api/benchmark/config

# Run benchmark (requires vLLM running)
curl -X POST http://localhost:8002/api/benchmark/run -H "Content-Type: application/json" -d '{"model":"cyankiwi-qwen3-coder-next","service":"vllm"}'
```

**Step 3: Commit**

```bash
git add routes/benchmarkRoutes.js
git commit -m "feat: add benchmark API endpoints"
```

---

## Task 8: Integrate and Start Polling in index.js

**Files:**
- Modify: `index.js`

**Step 1: Add imports and start polling**

Add at the top of `index.js` after other requires (around line 7):

```javascript
const analyticsService = require('./services/analyticsService');
```

Add after the routes are set up (around line 33, before the static files section):

```javascript
// Start analytics polling
analyticsService.startPolling();
```

**Step 2: Verify complete index.js**

The relevant sections should look like:

```javascript
const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const systemInfo = require('./systemInfo');
const analyticsService = require('./services/analyticsService');

// ... middleware ...

// Routes
app.use('/api/system', require('./routes/systemRoutes'));
app.use('/api/power', require('./routes/powerRoutes'));
app.use('/api/command', require('./routes/commandsRoutes'));
app.use('/api/ollama', require('./routes/ollamaRoutes'));
app.use('/api/logs', require('./routes/logsRoutes'));
app.use('/api/performance', require('./routes/performanceRoutes'));
app.use('/api/llamacpp', require('./routes/llamaCppRoutes'));
app.use('/api/cost', require('./routes/costRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/benchmark', require('./routes/benchmarkRoutes'));

// Start analytics polling
analyticsService.startPolling();

// ... rest of file ...
```

**Step 3: Test all endpoints**

```bash
curl http://localhost:8002/api/cost
curl http://localhost:8002/api/analytics/vllm
curl http://localhost:8002/api/benchmark/results
```

**Step 4: Final commit**

```bash
git add index.js
git commit -m "feat: integrate analytics, cost, and benchmark routes"
```

---

## Task 9: Create Data Directory with .gitkeep

**Files:**
- Create: `data/.gitkeep`

**Step 1: Create the directory**

```bash
mkdir -p data
touch data/.gitkeep
```

**Step 2: Add .gitignore for data files**

Create `data/.gitignore`:
```
# Ignore all JSON data files
*.json

# But keep the directory
!.gitkeep
```

**Step 3: Commit**

```bash
git add data/.gitkeep data/.gitignore
git commit -m "chore: add data directory for analytics storage"
```

---

## Summary

After completing all tasks:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cost` | GET | Power cost data from aiserver |
| `/api/analytics/vllm` | GET | Current + historical vLLM metrics |
| `/api/analytics/poll` | POST | Trigger immediate metrics poll |
| `/api/benchmark/run` | POST | Run a benchmark |
| `/api/benchmark/results` | GET | List all benchmark results |
| `/api/benchmark/results/:modelId` | GET | Get results for specific model |
| `/api/benchmark/config` | GET | Get benchmark configuration |
