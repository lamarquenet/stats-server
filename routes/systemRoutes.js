const express = require('express');
const router = express.Router();
const systemInfo = require('../systemInfo');

/**
 * @route   GET /api/system
 * @desc    Get all system information
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const data = await systemInfo.getAll();
    res.json(data);
  } catch (error) {
    console.error('Error in /api/system:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @route   GET /api/system/cpu
 * @desc    Get CPU information
 * @access  Public
 */
router.get('/cpu', async (req, res) => {
  try {
    const data = await systemInfo.getCpuInfo();
    res.json(data);
  } catch (error) {
    console.error('Error in /api/system/cpu:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @route   GET /api/system/memory
 * @desc    Get memory information
 * @access  Public
 */
router.get('/memory', async (req, res) => {
  try {
    const data = await systemInfo.getMemoryInfo();
    res.json(data);
  } catch (error) {
    console.error('Error in /api/system/memory:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @route   GET /api/system/gpu
 * @desc    Get GPU information
 * @access  Public
 */
router.get('/gpu', async (req, res) => {
  try {
    const data = await systemInfo.getGpuInfo();
    res.json(data);
  } catch (error) {
    console.error('Error in /api/system/gpu:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;