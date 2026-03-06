const express = require('express');
const router = express.Router();
const llamaCppService = require('../services/llamaCppService');

/**
 * @route   GET /api/llamacpp/status
 * @desc    Get llama.cpp server status
 * @access  Public
 */
router.get('/status', async (req, res) => {
  try {
    const status = await llamaCppService.statusLlamaCppServer();
    res.json(status);
  } catch (error) {
    console.error('Error in /api/llamacpp/status:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   POST /api/llamacpp/start
 * @desc    Start llama.cpp server
 * @body    { model?: string, port?: number, ctxSize?: number, nGpuLayers?: number }
 * @access  Public
 */
router.post('/start', async (req, res) => {
  try {
    const options = req.body;
    const result = await llamaCppService.startLlamaCppServer(options);
    res.json(result);
  } catch (error) {
    console.error('Error in /api/llamacpp/start:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   POST /api/llamacpp/stop
 * @desc    Stop llama.cpp server
 * @access  Public
 */
router.post('/stop', async (req, res) => {
  try {
    const result = await llamaCppService.stopLlamaCppServer();
    res.json(result);
  } catch (error) {
    console.error('Error in /api/llamacpp/stop:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   GET /api/llamacpp/models
 * @desc    List available GGUF models
 * @access  Public
 */
router.get('/models', async (req, res) => {
  try {
    const result = await llamaCppService.listModels();
    res.json(result);
  } catch (error) {
    console.error('Error in /api/llamacpp/models:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   GET /api/llamacpp/config
 * @desc    Get llama.cpp configuration
 * @access  Public
 */
router.get('/config', (req, res) => {
  try {
    const config = llamaCppService.getConfig();
    res.json(config);
  } catch (error) {
    console.error('Error in /api/llamacpp/config:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

module.exports = router;
