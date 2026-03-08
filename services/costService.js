// services/costService.js
const { NodeSSH } = require('node-ssh');
const fs = require('fs');

const ssh = new NodeSSH();
const privateKey = fs.readFileSync('/root/.ssh/id_rsa', 'utf8');

// Cache to avoid hammering SSH
let cachedData = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 60 seconds (1 minute)

/**
 * Get power cost data from aiserver
 */
async function getCostData() {
  // Return cached data if fresh
  const now = Date.now();
  if (cachedData && (now - cacheTime) < CACHE_TTL) {
    return cachedData;
  }

  try {
    await ssh.connect({
      host: '172.17.0.1',
      username: 'aiserver',
      privateKey,
    });

    // Read accumulated energy from power_tools.txt
    const energyResult = await ssh.execCommand('cat /home/aiserver/power_tools.txt');
    const accumulatedEnergyKwh = parseFloat(energyResult.stdout.trim()) || 0;

    // Read monthly power usage
    const monthlyResult = await ssh.execCommand('cat /var/log/monthly_power_usage.log');
    const monthlyEnergyKwh = parseFloat(monthlyResult.stdout.trim()) || 0;

    const electricityRate = 0.10; // $0.10 per kWh

    cachedData = {
      accumulatedEnergyKwh,
      totalCostUsd: parseFloat((accumulatedEnergyKwh * electricityRate).toFixed(6)),
      monthlyEnergyKwh,
      monthlyCostUsd: parseFloat((monthlyEnergyKwh * electricityRate).toFixed(6)),
      electricityRate,
      lastUpdated: new Date().toISOString()
    };

    cacheTime = now;
    return cachedData;

  } catch (err) {
    console.error('Error fetching cost data:', err.message);
    throw err;
  } finally {
    ssh.dispose();
  }
}

/**
 * Reset session energy counter
 */
async function resetSessionEnergy() {
  try {
    await ssh.connect({
      host: '172.17.0.1',
      username: 'aiserver',
      privateKey,
    });

    // Reset power_tools.txt to 0
    await ssh.execCommand('echo 0 | sudo tee /home/aiserver/power_tools.txt > /dev/null');

    // Clear cache to force refresh
    cachedData = null;
    cacheTime = 0;

    return { success: true, message: 'Session energy counter reset' };

  } catch (err) {
    console.error('Error resetting session energy:', err.message);
    throw err;
  } finally {
    ssh.dispose();
  }
}

/**
 * Reset monthly energy counter
 */
async function resetMonthlyEnergy() {
  try {
    await ssh.connect({
      host: '172.17.0.1',
      username: 'aiserver',
      privateKey,
    });

    // Reset monthly log to 0
    await ssh.execCommand('echo 0 | sudo tee /var/log/monthly_power_usage.log > /dev/null');

    // Clear cache to force refresh
    cachedData = null;
    cacheTime = 0;

    return { success: true, message: 'Monthly energy counter reset' };

  } catch (err) {
    console.error('Error resetting monthly energy:', err.message);
    throw err;
  } finally {
    ssh.dispose();
  }
}

module.exports = { getCostData, resetSessionEnergy, resetMonthlyEnergy };
