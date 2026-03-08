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
 * Check if vLLM is running
 */
async function isVllmRunning() {
  try {
    await axios.get(`${VLLM_URL}/health`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch current vLLM metrics and update analytics
 */
async function pollVllmMetrics() {
  // Only poll if vLLM is running
  const running = await isVllmRunning();
  if (!running) {
    return readJson(ANALYTICS_FILE, getDefaultAnalytics());
  }

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
    // Only log unexpected errors (not connection issues since we already checked health)
    if (!err.code || err.code !== 'ECONNREFUSED') {
      console.error('Error polling vLLM metrics:', err.message);
    }
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
