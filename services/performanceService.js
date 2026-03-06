const axios = require('axios');

// Service URLs (from Docker's perspective)
const VLLM_URL = 'http://172.17.0.1:8001';
const OLLAMA_URL = 'http://172.17.0.1:11434';
const STATS_SERVER_URL = 'http://localhost:8002';

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
  
  let gpuUtilization = null;
  let memoryUsed = null;
  let requests = null;
  
  if (healthCheck.status === 'healthy') {
    try {
      // Try to get vLLM metrics (if available)
      const metricsResponse = await axios.get(`${VLLM_URL}/metrics`, { timeout: 3000 });
      // Parse Prometheus metrics if available
      // For now, just return basic health info
    } catch (err) {
      // Metrics endpoint not available
    }
  }
  
  return {
    name: 'vLLM',
    url: VLLM_URL,
    ...healthCheck,
    details: {
      gpuUtilization,
      memoryUsed,
      requests
    }
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
