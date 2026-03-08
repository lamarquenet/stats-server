// routes/costRoutes.js
const express = require('express');
const router = express.Router();
const costService = require('../services/costService');

/**
 * @route   GET /api/cost
 * @desc    Get power cost data from aiserver
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const data = await costService.getCostData();
    res.json(data);
  } catch (error) {
    console.error('Error in /api/cost:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   POST /api/cost/reset-session
 * @desc    Reset session energy counter
 * @access  Public
 */
router.post('/reset-session', async (req, res) => {
  try {
    const result = await costService.resetSessionEnergy();
    res.json(result);
  } catch (error) {
    console.error('Error in /api/cost/reset-session:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   POST /api/cost/reset-monthly
 * @desc    Reset monthly energy counter
 * @access  Public
 */
router.post('/reset-monthly', async (req, res) => {
  try {
    const result = await costService.resetMonthlyEnergy();
    res.json(result);
  } catch (error) {
    console.error('Error in /api/cost/reset-monthly:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

module.exports = router;
