const express = require('express');
const router = express.Router();
const axios = require('axios');
const commandsExecution = require('../commandsExecution');
const { getAllModels, getDefaultModelKey } = require('../config/models');
const { readJson } = require('../utils/jsonStore');

const VLLM_URL = 'http://172.17.0.1:8001';
const LOADED_MODEL_FILE = 'loaded-model.json';

/**
 * @route   GET /api/command/vllm-models
 * @desc    Get available vLLM models plus which one is actually loaded
 * @access  Public
 */
router.get('/vllm-models', async (req, res) => {
  try {
    const models = getAllModels();
    const defaultModel = getDefaultModelKey();
    const lastLaunched = readJson(LOADED_MODEL_FILE, null);

    // Report the model vLLM is actually serving, not the catalog default:
    // cross-check the live /v1/models id against the catalog, falling back
    // to the persisted last-launch record when vLLM is unreachable.
    let currentModel = lastLaunched?.modelKey || null;
    let runningModelId = null;
    try {
      const response = await axios.get(`${VLLM_URL}/v1/models`, { timeout: 2000 });
      runningModelId = response.data?.data?.[0]?.id || null;
      if (runningModelId) {
        const liveEntry = models.find((m) => m.id === runningModelId);
        currentModel = liveEntry ? liveEntry.key : (lastLaunched?.modelKey || null);
      }
    } catch (err) {
      // vLLM down / not ready: keep the persisted last-launched model
    }

    res.json({
      models,
      defaultModel,
      currentModel,
      runningModelId,
      vllmRunning: runningModelId !== null,
      lastLaunched,
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
