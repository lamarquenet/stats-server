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
    console.error('Error in /api/command/start-vllm:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @route   POST /api/command/stop-vllm
 * @desc    Stop the VLLM server
 * @access  Public
 */
router.post('/stop-vllm', async (req, res) => {
  try {
    await commandsExecution.stopVLLMServer();
    res.json({ success: true, message: 'VLLM server stoped successfully' });
  } catch (error) {
    console.error('Error in /api/command/stop-vllm:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;