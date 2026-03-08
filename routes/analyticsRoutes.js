// routes/analyticsRoutes.js
const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analyticsService');

/**
 * @route   GET /api/analytics/vllm
 * @desc    Get vLLM analytics (current + historical)
 * @access  Public
 */
router.get('/vllm', (req, res) => {
  try {
    const data = analyticsService.getAnalytics();
    res.json(data);
  } catch (error) {
    console.error('Error in /api/analytics/vllm:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   POST /api/analytics/poll
 * @desc    Trigger immediate metrics poll
 * @access  Public
 */
router.post('/poll', async (req, res) => {
  try {
    const data = await analyticsService.pollVllmMetrics();
    res.json(data);
  } catch (error) {
    console.error('Error in /api/analytics/poll:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

module.exports = router;
