const express = require('express');
const router = express.Router();
const powerManagement = require('../powerManagement');

/**
 * @route   GET /api/power/status
 * @desc    Get server power status
 * @access  Public
 */
router.get('/status', async (req, res) => {
  try {
    const status = await powerManagement.getPowerStatus();
    res.json(status);
  } catch (error) {
    console.error('Error in /api/power/status:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @route   POST /api/power/shutdown
 * @desc    Shutdown the server
 * @access  Public
 */
router.post('/shutdown', async (req, res) => {
  try {
    const result = await powerManagement.shutdown();
    res.json(result);
  } catch (error) {
    console.error('Error in /api/power/shutdown:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;