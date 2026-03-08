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

module.exports = router;
