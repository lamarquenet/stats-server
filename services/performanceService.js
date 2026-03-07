const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

// Service URLs (from Docker's perspective)
const VLLM_URL = 'http://172.17.0.1:8001';
const OLLAMA_URL = 'http://172.17.0.1:11434';
const STATS_SERVER_URL = 'http://localhost:8002';

/**
 * Get GPU memory info from nvidia-smi
 */
async function getGpuMemoryInfo() {
  try {
    const { stdout } = await execPromise(
      'LC_ALL=C nvidia-smi --query-gpu=memory.total,memory.used,memory.free --format=csv,noheader,nounits'
    );

    const lines = stdout.trim().split('\n');
    const gpus = lines.map(line => {
      const [total, used, free] = line.split(',').map(v => parseFloat(v.trim()));
      return { total, used, free };
    });

    // Sum all GPUs
    const totals = gpus.reduce((acc, gpu) => ({
      total: acc.total + (gpu.total || 0),
      used: acc.used + (gpu.used || 0),
      free: acc.free + (gpu.free || 0),
    }), { total: 0, used: 0, free: 0 });

    return {
      totalGB: (totals.total / 1024).toFixed(2),
      usedGB: (totals.used / 1024).toFixed(2),
      freeGB: (totals.free / 1024).toFixed(2),
      usagePercent: totals.total > 0 ? ((totals.used / totals.total) * 100).toFixed(1) : 0,
    };
  } catch (err) {
    // Try SSH fallback if local nvidia-smi fails
    return null;
  }
}

/**
 * Parse Prometheus metrics format
 * @param {string} metricsText - Raw Prometheus metrics text
 * @returns {Object} Parsed metrics as key-value pairs
 */
function parsePrometheusMetrics(metricsText) {
  const metrics = {};
  const lines = metricsText.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || !line.trim()) continue;

    // Parse metric line: metric_name{labels} value
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
  // Try to get tokens per second from iteration counter
  const iterationTokens = metrics['vllm:iteration_tokens_total'] || 0;
  const iterationTime = metrics['vllm:iteration_latency_seconds_total'] || 0;

  if (iterationTime > 0 && iterationTokens > 0) {
    return iterationTokens / iterationTime;
  }

  // Alternative: generation tokens / total time
  const totalTokens = metrics['vllm:num_generation_tokens_total'] || 0;
  const totalTime = metrics['vllm:e2e_request_latency_seconds_sum'] || 0;

  if (totalTime > 0 && totalTokens > 0) {
    return totalTokens / totalTime;
  }

  // Another alternative from sum/count
  const tokenSum = metrics['vllm:num_generation_tokens_sum'] || 0;
  const tokenCount = metrics['vllm:num_generation_tokens_count'] || 0;

  if (tokenCount > 0 && tokenSum > 0) {
    return tokenSum / tokenCount;
  }

  return null;
}

/**
 * Measure response time for a service
 */
async function measureResponseTime(url, endpoint = '/health') {
  const start = Date.now();
  try {
    await axios.get(`${url}${endpoint}`, { timeout: 5000 });
    return {
      url,
      endpoint,
      responseTime: Date.now() - start,
      status: 'healthy',
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      url,
      endpoint,
      responseTime: null,
      status: 'unhealthy',
      error: err.code || err.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get vLLM performance metrics
 */
async function getVllmMetrics() {
  const healthCheck = await measureResponseTime(VLLM_URL, '/health');

  let details = {
    gpuCacheUsage: null,        // % of GPU memory used for KV cache
    cpuCacheUsage: null,        // % of CPU memory used for KV cache (swap)
    requestsRunning: 0,
    requestsWaiting: 0,
    tokensPerSecond: null,
    totalPromptTokens: 0,
    totalGenerationTokens: 0,
    timeToFirstToken: null,     // Average TTFT in seconds
    avgTokensPerRequest: null,
    kvCacheUsedPerc: null,      // Overall KV cache usage
    // Memory info
    gpuMemory: null,            // GPU memory from nvidia-smi
  };

  if (healthCheck.status === 'healthy') {
    try {
      // Get vLLM Prometheus metrics and GPU memory in parallel
      const [metricsResponse, gpuMemory] = await Promise.all([
        axios.get(`${VLLM_URL}/metrics`, { timeout: 3000 }),
        getGpuMemoryInfo()
      ]);

      const metrics = parsePrometheusMetrics(metricsResponse.data);

      // KV Cache usage (GPU vs CPU/disk)
      details.gpuCacheUsage = metrics['vllm:gpu_cache_usage_perc'] ?? null;
      details.cpuCacheUsage = metrics['vllm:cpu_cache_usage_perc'] ?? null;
      details.kvCacheUsedPerc = metrics['vllm:kv_cache_usage_perc'] ?? null;

      // Request counts
      details.requestsRunning = metrics['vllm:num_requests_running'] || 0;
      details.requestsWaiting = metrics['vllm:num_requests_waiting'] || 0;

      // Token statistics
      details.totalPromptTokens = metrics['vllm:num_prompt_tokens_total'] ||
                                   metrics['vllm:num_prompt_tokens'] || 0;
      details.totalGenerationTokens = metrics['vllm:num_generation_tokens_total'] ||
                                       metrics['vllm:num_generation_tokens'] || 0;

      // Calculate tokens per second
      details.tokensPerSecond = calculateTokensPerSecond(metrics);

      // Time to first token
      const ttftSum = metrics['vllm:time_to_first_token_seconds_sum'] || 0;
      const ttftCount = metrics['vllm:time_to_first_token_seconds_count'] || 0;
      details.timeToFirstToken = ttftCount > 0 ? ttftSum / ttftCount : null;

      // Average tokens per request
      const requestCount = metrics['vllm:e2e_request_latency_seconds_count'] || 0;
      details.avgTokensPerRequest = requestCount > 0 ?
        details.totalGenerationTokens / requestCount : null;

      // GPU memory from nvidia-smi
      details.gpuMemory = gpuMemory || {
        totalGB: '0.00',
        usedGB: '0.00',
        freeGB: '0.00',
        usagePercent: '0.0'
      };

    } catch (err) {
      console.error('Error fetching vLLM metrics:', err.message);
    }
  }

  return {
    name: 'vLLM',
    url: VLLM_URL,
    ...healthCheck,
    details
  };
}

/**
 * Get Ollama performance metrics
 */
async function getOllamaMetrics() {
  const healthCheck = await measureResponseTime(OLLAMA_URL, '/api/tags');
  
  let modelCount = 0;
  let runningModels = [];
  
  if (healthCheck.status === 'healthy') {
    try {
      const modelsResponse = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
      modelCount = modelsResponse.data.models?.length || 0;
      
      const runningResponse = await axios.get(`${OLLAMA_URL}/api/ps`, { timeout: 3000 });
      runningModels = runningResponse.data.models || runningResponse.data.running || [];
    } catch (err) {
      // Could not get details
    }
  }
  
  return {
    name: 'Ollama',
    url: OLLAMA_URL,
    ...healthCheck,
    details: {
      modelCount,
      runningModels: runningModels.length,
      models: runningModels
    }
  };
}

/**
 * Get stats-server performance metrics
 */
async function getStatsServerMetrics() {
  const healthCheck = await measureResponseTime(STATS_SERVER_URL, '/api/power/status');
  
  return {
    name: 'Stats Server',
    url: STATS_SERVER_URL,
    ...healthCheck,
    details: {}
  };
}

/**
 * Get all service performance metrics
 */
async function getAllMetrics() {
  const [vllm, ollama, statsServer] = await Promise.all([
    getVllmMetrics(),
    getOllamaMetrics(),
    getStatsServerMetrics()
  ]);
  
  const healthyCount = [vllm, ollama, statsServer].filter(s => s.status === 'healthy').length;
  
  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalServices: 3,
      healthyServices: healthyCount,
      unhealthyServices: 3 - healthyCount,
      overallStatus: healthyCount === 3 ? 'healthy' : healthyCount > 0 ? 'degraded' : 'unhealthy'
    },
    services: {
      vllm,
      ollama,
      statsServer
    }
  };
}

/**
 * Get quick health status
 */
async function getQuickHealth() {
  const results = await Promise.allSettled([
    axios.get(`${VLLM_URL}/health`, { timeout: 2000 }),
    axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 2000 }),
  ]);
  
  return {
    vllm: results[0].status === 'fulfilled' ? 'healthy' : 'unhealthy',
    ollama: results[1].status === 'fulfilled' ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  getAllMetrics,
  getVllmMetrics,
  getOllamaMetrics,
  getStatsServerMetrics,
  getQuickHealth
};
