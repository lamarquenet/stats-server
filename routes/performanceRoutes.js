const express = require('express');
const router = express.Router();
const performanceService = require('../services/performanceService');

/**
 * @route   GET /api/performance/all
 * @desc    Get performance metrics for all services
 * @access  Public
 */
router.get('/all', async (req, res) => {
  try {
    const metrics = await performanceService.getAllMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error in /api/performance/all:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   GET /api/performance/vllm
 * @desc    Get vLLM performance metrics
 * @access  Public
 */
router.get('/vllm', async (req, res) => {
  try {
    const metrics = await performanceService.getVllmMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error in /api/performance/vllm:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   GET /api/performance/ollama
 * @desc    Get Ollama performance metrics
 * @access  Public
 */
router.get('/ollama', async (req, res) => {
  try {
    const metrics = await performanceService.getOllamaMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error in /api/performance/ollama:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   GET /api/performance/health
 * @desc    Get quick health status of all services
 * @access  Public
 */
router.get('/health', async (req, res) => {
  try {
    const health = await performanceService.getQuickHealth();
    res.json(health);
  } catch (error) {
    console.error('Error in /api/performance/health:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

module.exports = router;
