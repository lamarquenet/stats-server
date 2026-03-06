const express = require('express');
const router = express.Router();
const logsService = require('../services/logsService');

/**
 * @route   GET /api/logs/services
 * @desc    Get available log services
 * @access  Public
 */
router.get('/services', (req, res) => {
  try {
    const services = logsService.getAvailableServices();
    res.json({ services });
  } catch (error) {
    console.error('Error in /api/logs/services:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   GET /api/logs/:service
 * @desc    Get logs for a specific service
 * @query   lines - Number of lines to retrieve (default: 100)
 * @access  Public
 */
router.get('/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const lines = parseInt(req.query.lines) || 100;
    
    const result = await logsService.getServiceLogs(service, lines);
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error in /api/logs/:service:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * @route   DELETE /api/logs/:service
 * @desc    Clear logs for a specific service
 * @access  Public
 */
router.delete('/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const result = await logsService.clearServiceLogs(service);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error in DELETE /api/logs/:service:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

module.exports = router;
