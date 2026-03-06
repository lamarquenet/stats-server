const express = require('express');
const router = express.Router();
const ollamaService = require('../services/ollamaService');

/**
 * @route   GET /api/ollama/status
 * @desc    Get Ollama service status
 * @access  Public
 */
router.get('/status', async (req, res) => {
  try {
    const status = await ollamaService.statusOllamaService();
    res.json(status);
  } catch (error) {
    console.error('Error in /api/ollama/status:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   POST /api/ollama/start
 * @desc    Start the Ollama service
 * @access  Public
 */
router.post('/start', async (req, res) => {
  try {
    const result = await ollamaService.startOllamaService();
    res.json(result);
  } catch (error) {
    console.error('Error in /api/ollama/start:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   POST /api/ollama/stop
 * @desc    Stop the Ollama service
 * @access  Public
 */
router.post('/stop', async (req, res) => {
  try {
    const result = await ollamaService.stopOllamaService();
    res.json(result);
  } catch (error) {
    console.error('Error in /api/ollama/stop:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   GET /api/ollama/models
 * @desc    List all available Ollama models
 * @access  Public
 */
router.get('/models', async (req, res) => {
  try {
    const result = await ollamaService.listModels();
    res.json(result);
  } catch (error) {
    console.error('Error in /api/ollama/models:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   GET /api/ollama/running
 * @desc    Get currently running models
 * @access  Public
 */
router.get('/running', async (req, res) => {
  try {
    const result = await ollamaService.getRunningModels();
    res.json(result);
  } catch (error) {
    console.error('Error in /api/ollama/running:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   POST /api/ollama/pull
 * @desc    Pull/download a model
 * @body    { model: string } - Model name to pull
 * @access  Public
 */
router.post('/pull', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) {
      return res.status(400).json({ error: 'Model name is required' });
    }
    const result = await ollamaService.pullModel(model);
    res.json(result);
  } catch (error) {
    console.error('Error in /api/ollama/pull:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   DELETE /api/ollama/model/:modelName
 * @desc    Delete a model from Ollama
 * @access  Public
 */
router.delete('/model/:modelName', async (req, res) => {
  try {
    const { modelName } = req.params;
    const result = await ollamaService.deleteModel(modelName);
    res.json(result);
  } catch (error) {
    console.error('Error in /api/ollama/model/delete:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

module.exports = router;
