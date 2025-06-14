const express = require('express');
const router = express.Router();
const commandsExecution = require('../commandsExecution');

/**
 * @route   POST /api/command/start-vllm
 * @desc    Start the VLLM server
 * @access  Public
 */
router.post('/start-vllm', async (req, res) => {
  try {
    await commandsExecution.startVLLMServer();
    res.json({ success: true, message: 'VLLM server started successfully' });
  } catch (error) {
    console.error('Error in /api/power/start-vllm:', error);
    res.status(500).json({ error: 'Server error' });
  }
});