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
    commandsExecution.startVLLMServer();
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
    commandsExecution.stopVLLMServer();
    res.json({ success: true, message: 'VLLM server stoped successfully' });
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
    console.log('VLLM status response:', response);
    
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