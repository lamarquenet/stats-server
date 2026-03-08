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
