// services/metricsHistoryService.js
//
// Samples vLLM performance metrics (via performanceService, which computes the
// windowed rates) every 10s while vLLM is healthy, and persists one JSON file
// per launch session under data/metrics-history/<model>/<startedAt>.json.
// A "session" = one vLLM launch: it starts on the first healthy sample after
// downtime, a model switch, or a counter reset (vLLM restart), and lets you
// review how a model performed in past runs.
const fs = require('fs');
const path = require('path');
const { readJson, DATA_DIR } = require('../utils/jsonStore');
const performanceService = require('./performanceService');

const HISTORY_DIR = path.join(DATA_DIR, 'metrics-history');
const LOADED_MODEL_FILE = 'loaded-model.json';
const SAMPLE_INTERVAL_MS = 10000;
const MAX_SESSIONS_PER_MODEL = 10;
const MAX_SAMPLES_PER_SESSION = 8640; // 24h at 10s sampling

// Current (in-flight) session; null while vLLM is down
let currentSession = null; // { model, id, samples, lastGenTokens, lastPromptTokens }
let sampleTimer = null;

const sanitize = (key) => String(key).replace(/[^a-zA-Z0-9._-]/g, '_');
const modelDir = (model) => path.join(HISTORY_DIR, sanitize(model));
const sessionPath = (model, id) => path.join(modelDir(model), `${id}.json`);

/**
 * Summary stats for a session's samples (avoids shipping every sample just to
 * build the session list). Averages skip null/invalid samples; token totals
 * are last-first of the cumulative counters.
 */
function summarizeSamples(samples) {
  const avg = (vals) => {
    const v = vals.filter((x) => Number.isFinite(x));
    return v.length ? parseFloat((v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)) : null;
  };
  const first = samples[0] || {};
  const last = samples[samples.length - 1] || {};
  return {
    durationMs: samples.length > 1 ? last.t - first.t : 0,
    avgTps: avg(samples.map((s) => s.tps)),
    avgCacheHitPerc: avg(samples.map((s) => s.cacheHitPerc)),
    avgTtftMs: avg(samples.map((s) => s.ttftMs)),
    avgPrefillMs: avg(samples.map((s) => s.prefillMs)),
    avgDecodeMs: avg(samples.map((s) => s.decodeMs)),
    promptTokens: Math.max(0, (last.promptTotal || 0) - (first.promptTotal || 0)),
    genTokens: Math.max(0, (last.genTotal || 0) - (first.genTotal || 0)),
    preemptions: last.preemptions || 0,
  };
}

function writeSession(session) {
  const file = sessionPath(session.model, session.id);
  fs.writeFileSync(file, JSON.stringify({
    model: session.model,
    startedAt: session.id,
    endedAt: session.samples.length ? session.samples[session.samples.length - 1].t : session.id,
    sampleCount: session.samples.length,
    summary: summarizeSamples(session.samples),
    samples: session.samples,
  }), 'utf-8');
}

/**
 * Keep only the newest MAX_SESSIONS_PER_MODEL session files for a model.
 */
function pruneSessions(model) {
  try {
    const dir = modelDir(model);
    const files = fs.readdirSync(dir)
      .filter((f) => /^\d+\.json$/.test(f))
      .map((f) => parseInt(f, 10))
      .sort((a, b) => b - a);
    for (const id of files.slice(MAX_SESSIONS_PER_MODEL)) {
      fs.unlinkSync(path.join(dir, `${id}.json`));
    }
  } catch (err) {
    console.error('metricsHistory prune failed:', err.message);
  }
}

/**
 * One sampling tick. Reads the live metrics; on vLLM downtime the current
 * session ends (next healthy tick starts a new one).
 */
async function sampleOnce() {
  const metrics = await performanceService.getVllmMetrics();
  if (metrics.status !== 'healthy') {
    currentSession = null;
    return;
  }
  const d = metrics.details;
  const genTotal = d.totalGenerationTokens || 0;
  const promptTotal = d.totalPromptTokens || 0;

  // Model key comes from the launch record (written by startVLLMServer); falls
  // back to 'unknown' when vLLM was started outside the dashboard.
  const loaded = readJson(LOADED_MODEL_FILE, null);
  const model = (loaded && loaded.modelKey) || 'unknown';

  // New session when: none open yet, the model changed, or vLLM's cumulative
  // counters went down (restart). Counter resets also make performanceService
  // drop its windowed state, so rates start fresh alongside.
  const stale = currentSession && (
    currentSession.model !== model
    || genTotal < currentSession.lastGenTokens
    || promptTotal < currentSession.lastPromptTokens
  );
  let justCreated = false;
  if (!currentSession || stale) {
    currentSession = {
      model, id: Date.now(), samples: [],
      lastGenTokens: genTotal, lastPromptTokens: promptTotal,
    };
    fs.mkdirSync(modelDir(model), { recursive: true });
    justCreated = true;
  }

  currentSession.samples.push({
    t: Date.now(),
    tps: d.tokensPerSecond ?? null,
    cacheHitPerc: d.cacheHitPerc ?? null,
    ttftMs: d.timeToFirstToken != null ? d.timeToFirstToken * 1000 : null,
    prefillMs: d.avgPrefillTimeMs ?? null,
    decodeMs: d.avgDecodeTimeMs ?? null,
    kvPerc: d.kvCacheUsedPerc ?? null,
    running: d.requestsRunning ?? 0,
    waiting: d.requestsWaiting ?? 0,
    preemptions: d.numPreemptions ?? 0,
    genTotal,
    promptTotal,
  });
  if (currentSession.samples.length > MAX_SAMPLES_PER_SESSION) {
    currentSession.samples.shift();
  }
  currentSession.lastGenTokens = genTotal;
  currentSession.lastPromptTokens = promptTotal;
  writeSession(currentSession);
  if (justCreated) pruneSessions(model); // after write, so the new file counts
}

function startMetricsHistory() {
  if (sampleTimer) return;
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  sampleOnce().catch((err) => console.error('metricsHistory sample failed:', err.message));
  sampleTimer = setInterval(() => {
    sampleOnce().catch((err) => console.error('metricsHistory sample failed:', err.message));
  }, SAMPLE_INTERVAL_MS);
  console.log('Metrics history sampling started (every 10s)');
}

/**
 * History for the UI.
 *   getHistory()                  -> { models: [...] }
 *   getHistory({ model })         -> { model, sessions: [{ id, startedAt, sampleCount, summary }] }
 *   getHistory({ model, session }) -> full session including samples
 *   session: session id, or 'latest'
 */
function getHistory({ model, session } = {}) {
  if (!model) {
    let models = [];
    try {
      models = fs.readdirSync(HISTORY_DIR).filter((d) => {
        try { return fs.statSync(path.join(HISTORY_DIR, d)).isDirectory(); } catch { return false; }
      });
    } catch { /* no history yet */ }
    return { models };
  }

  let ids = [];
  try {
    ids = fs.readdirSync(modelDir(model))
      .filter((f) => /^\d+\.json$/.test(f))
      .map((f) => parseInt(f, 10))
      .sort((a, b) => b - a);
  } catch {
    return { model, sessions: [] };
  }

  const sessions = ids.map((id) => {
    try {
      const data = JSON.parse(fs.readFileSync(sessionPath(model, id), 'utf-8'));
      return {
        id,
        startedAt: data.startedAt || id,
        sampleCount: data.sampleCount || (data.samples || []).length,
        summary: data.summary || null,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);

  if (!session) return { model, sessions };

  const targetId = session === 'latest' ? ids[0] : parseInt(session, 10);
  const target = sessions.find((s) => s.id === targetId);
  if (!target) return { model, sessions, session: null };

  try {
    const data = JSON.parse(fs.readFileSync(sessionPath(model, targetId), 'utf-8'));
    return { model, sessions, session: { ...target, samples: data.samples || [] } };
  } catch {
    return { model, sessions, session: null };
  }
}

module.exports = { startMetricsHistory, getHistory };
