// services/costService.js
const { NodeSSH } = require('node-ssh');
const fs = require('fs');
const { readJson, writeJson } = require('../utils/jsonStore');

const ssh = new NodeSSH();
const privateKey = fs.readFileSync('/root/.ssh/id_rsa', 'utf8');

// Cache to avoid hammering SSH
let cachedData = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 60 seconds (1 minute)

const SESSION_FILE = '/home/aiserver/power_tools.txt';
const MONTHLY_FILE = '/var/log/monthly_power_usage.log';
// Month boundaries follow the user's calendar, not the container's UTC clock
const TIMEZONE = 'America/Argentina/Buenos_Aires';
const STATE_FILE = 'power-monthly-state.json';
const ACCUMULATE_INTERVAL_MS = 60000; // sample session energy every minute

function currentMonth() {
  return new Date().toLocaleString('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit' });
}

/**
 * Run a command over SSH as aiserver and return stdout (trimmed)
 */
async function sshExec(command) {
  await ssh.connect({ host: '172.17.0.1', username: 'aiserver', privateKey });
  try {
    const result = await ssh.execCommand(command);
    return result.stdout.trim();
  } finally {
    ssh.dispose();
  }
}

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
    // Read accumulated energy from power_tools.txt
    const accumulatedEnergyKwh = parseFloat(await sshExec(`cat ${SESSION_FILE}`)) || 0;

    // Read monthly power usage
    const monthlyEnergyKwh = parseFloat(await sshExec(`cat ${MONTHLY_FILE}`)) || 0;

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
  }
}

/**
 * Reset session energy counter
 */
async function resetSessionEnergy() {
  try {
    await sshExec(`echo 0 | sudo tee ${SESSION_FILE} > /dev/null`);
    // The accumulator samples the session every minute; adopt the reset so the
    // next sample doesn't bank the pre-reset reading as a "lost" session.
    const state = readJson(STATE_FILE, null);
    if (state) writeJson(STATE_FILE, { ...state, lastSessionKwh: 0 });

    // Clear cache to force refresh
    cachedData = null;
    cacheTime = 0;

    return { success: true, message: 'Session energy counter reset' };

  } catch (err) {
    console.error('Error resetting session energy:', err.message);
    throw err;
  }
}

/**
 * Reset monthly energy counter
 */
async function resetMonthlyEnergy() {
  try {
    await sshExec(`echo 0 | sudo tee ${MONTHLY_FILE} > /dev/null`);
    writeJson(STATE_FILE, { month: currentMonth(), monthlyKwh: 0, lastSessionKwh: readJson(STATE_FILE, {})?.lastSessionKwh ?? null });

    // Clear cache to force refresh
    cachedData = null;
    cacheTime = 0;

    return { success: true, message: 'Monthly energy counter reset' };

  } catch (err) {
    console.error('Error resetting monthly energy:', err.message);
    throw err;
  }
}

// --- Monthly accumulation ----------------------------------------------------
// The monthly file used to be written only by a host-side cron. Nothing in the
// repo transferred session energy into it, so "This Month" stuck at $0 until
// that cron appeared. This poller is the in-repo replacement (same semantics):
// every minute, sample the session counter and accumulate the delta into the
// monthly total, clamping across session resets (anything that zeroes
// power_tools.txt banks the whole previous reading), rolling over at month
// boundaries (Argentina timezone). State survives redeploys via jsonStore.

/**
 * Pure accumulation step: fold one session sample into the monthly state.
 * - session >= last  -> accumulate the delta
 * - session <  last  -> session was reset (reboot/tool/reset endpoint): bank
 *   the entire previous reading (growth between the last sample and the reset
 *   is unobservable; bounded by one sampling interval)
 * - month changed    -> rollover, new month starts at zero
 * Returns { state, changed }.
 */
function applySample(prev, sessionKwh, month) {
  if (!prev) {
    // First sample ever: baseline, nothing accumulates
    return { state: { month, monthlyKwh: 0, lastSessionKwh: sessionKwh }, changed: false };
  }
  let { month: prevMonth, monthlyKwh } = prev;
  let changed = false;

  if (prevMonth !== month) {
    prevMonth = month;
    monthlyKwh = 0;
    changed = true;
  }

  const last = typeof prev.lastSessionKwh === 'number' ? prev.lastSessionKwh : sessionKwh;
  if (sessionKwh >= last) {
    const delta = sessionKwh - last;
    if (delta > 0) { monthlyKwh += delta; changed = true; }
  } else {
    monthlyKwh += last;
    changed = true;
  }

  return { state: { month: prevMonth, monthlyKwh, lastSessionKwh: sessionKwh }, changed };
}

async function accumulateOnce() {
  const sessionKwh = parseFloat(await sshExec(`cat ${SESSION_FILE}`)) || 0;

  let state = readJson(STATE_FILE, null);
  if (!state) {
    // First run: adopt the file's current monthly total as baseline (whatever
    // the host cron accumulated so far) and start sampling from now.
    const monthlyKwh = parseFloat(await sshExec(`cat ${MONTHLY_FILE}`)) || 0;
    writeJson(STATE_FILE, { month: currentMonth(), monthlyKwh, lastSessionKwh: sessionKwh });
    return;
  }

  const { state: next, changed } = applySample(state, sessionKwh, currentMonth());
  writeJson(STATE_FILE, next);
  if (changed) {
    await sshExec(`echo ${next.monthlyKwh.toFixed(6)} | sudo tee ${MONTHLY_FILE} > /dev/null`);
  }
}

let accumulateTimer = null;
function startMonthlyAccumulation() {
  if (accumulateTimer) return;
  accumulateOnce().catch((err) => console.error('Power accumulation failed:', err.message));
  accumulateTimer = setInterval(() => {
    accumulateOnce().catch((err) => console.error('Power accumulation failed:', err.message));
  }, ACCUMULATE_INTERVAL_MS);
  console.log('Power monthly accumulation started (every 60s)');
}

module.exports = { getCostData, resetSessionEnergy, resetMonthlyEnergy, startMonthlyAccumulation, applySample };
