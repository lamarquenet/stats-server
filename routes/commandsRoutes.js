const express = require('express');
const router = express.Router();
const commandsExecution = require('../commandsExecution');
const { getAllModels, getDefaultModelKey } = require('../config/models');

/**
 * @route   GET /api/command/vllm-models
 * @desc    Get available vLLM models
 * @access  Public
 */
router.get('/vllm-models', (req, res) => {
  try {
    const models = getAllModels();
    const defaultModel = getDefaultModelKey();
    res.json({ 
      models,
      defaultModel 
    });
  } catch (error) {
    console.error('Error in /api/command/vllm-models:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @route   POST /api/command/start-vllm
 * @desc    Start the VLLM server
 * @body    { model?: string, overrides?: object } - Optional model key and launch overrides
 * @access  Public
 */
router.post('/start-vllm', async (req, res) => {
  try {
    const { model, overrides } = req.body || {};
    const resolvedConfig = await commandsExecution.startVLLMServer(model || null, overrides || null);
    res.json({
      success: true,
      message: 'VLLM server started successfully',
      model: model || getDefaultModelKey(),
      resolvedConfig,
    });
  } catch (error) {
    console.error('Error in /api/command/start-vllm:', error);
    if (error.name === 'ValidationError') {
      res.status(400).json({ error: 'Invalid overrides', message: error.message });
    } else {
      res.status(500).json({ error: 'Server error', message: error.message });
    }
  }
});

/**
 * @route   POST /api/command/stop-vllm
 * @desc    Stop the VLLM server
 * @access  Public
 */
router.post('/stop-vllm', async (req, res) => {
  try {
    commandsExecution.stopVLLMServer();
    res.json({ success: true, message: 'VLLM server stopped successfully' });
  } catch (error) {
    console.error('Error in /api/command/stop-vllm:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @route   GET /api/command/vllm-status
 * @desc    get status from the VLLM server
 * @access  Public
 */
router.get('/vllm-status', async (req, res) => {
  try {
    const response = await commandsExecution.statusVLLMServer();
    
    if (response.status == 200) {
      res.json({ status: 'running' });
    } else {
      res.json({ status: 'not-ready' });
    }
  } catch (err) {
    res.json({ status: 'not-running', error: err.message });
  }
});

module.exports = router;
