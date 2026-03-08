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
