const { NodeSSH } = require('node-ssh');
const fs = require('fs');
const axios = require('axios');

const ssh = new NodeSSH();
const privateKey = fs.readFileSync('/root/.ssh/id_rsa', 'utf8');

const LLAMACPP_HOST = 'http://172.17.0.1:8080';

// Default llama.cpp paths (adjust as needed)
const LLAMACPP_PATHS = {
  binary: '/home/aiserver/llama.cpp/main-server', // or llama-server
  modelsDir: '/home/aiserver/models',
  defaultModel: '/home/aiserver/models/llama-2-7b-chat.Q4_K_M.gguf'
};

/**
 * Execute SSH command and return result
 */
async function executeSSHCommand(command) {
  try {
    await ssh.connect({
      host: '172.17.0.1',
      username: 'aiserver',
      privateKey,
    });

    const result = await ssh.execCommand(command);
    return result;
  } catch (err) {
    console.error('SSH command failed:', err);
    throw err;
  } finally {
    ssh.dispose();
  }
}

/**
 * Start llama.cpp server
 * @param {Object} options - Server options
 * @param {string} options.model - Path to model file
 * @param {number} options.port - Port to listen on (default: 8080)
 * @param {number} options.ctxSize - Context size (default: 2048)
 * @param {number} options.nGpuLayers - GPU layers (default: 35)
 */
async function startLlamaCppServer(options = {}) {
  const {
    model = LLAMACPP_PATHS.defaultModel,
    port = 8080,
    ctxSize = 110000,
    nGpuLayers = 35
  } = options;

  try {
    // Build the llama.cpp server command
    const command = `bash -lc "nohup ${LLAMACPP_PATHS.binary} --model ${model} --host 0.0.0.0 --port ${port} --ctx-size ${ctxSize} --n-gpu-layers ${nGpuLayers} > llamacpp.log 2>&1 &"`;
    
    console.log('Starting llama.cpp server...');
    const result = await executeSSHCommand(command);

    if (result.stderr && !result.stderr.includes('background')) {
      console.error('Error starting llama.cpp:', result.stderr);
      return { success: false, error: result.stderr };
    }

    console.log('llama.cpp server started');
    return { success: true, message: 'llama.cpp server started', port };
  } catch (err) {
    console.error('Failed to start llama.cpp:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Stop llama.cpp server
 */
async function stopLlamaCppServer() {
  try {
    const command = 'pkill -f "llama.*--port"';
    
    console.log('Stopping llama.cpp server...');
    const result = await executeSSHCommand(command);

    if (result.stderr) {
      console.error('Error stopping llama.cpp:', result.stderr);
    }

    console.log('llama.cpp server stopped');
    return { success: true, message: 'llama.cpp server stopped' };
  } catch (err) {
    console.error('Failed to stop llama.cpp:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Check llama.cpp server status
 */
async function statusLlamaCppServer() {
  try {
    const response = await axios.get(`${LLAMACPP_HOST}/health`, { timeout: 2000 });
    return { status: 'running', responseTime: response.headers['x-response-time'] };
  } catch (err) {
    // Try alternative endpoint
    try {
      const response = await axios.get(`${LLAMACPP_HOST}/`, { timeout: 2000 });
      return { status: 'running' };
    } catch (err2) {
      return { status: 'not-running', error: err.message };
    }
  }
}

/**
 * List available models
 */
async function listModels() {
  try {
    const command = `ls -la ${LLAMACPP_PATHS.modelsDir}/*.gguf 2>/dev/null | awk '{print $NF}'`;
    const result = await executeSSHCommand(command);
    
    if (result.stdout) {
      const models = result.stdout.trim().split('\n').filter(m => m);
      return { success: true, models };
    }
    
    return { success: true, models: [] };
  } catch (err) {
    console.error('Failed to list models:', err);
    return { success: false, error: err.message, models: [] };
  }
}

/**
 * Get available configuration options
 */
function getConfig() {
  return {
    paths: LLAMACPP_PATHS,
    defaults: {
      port: 8080,
      ctxSize: 2048,
      nGpuLayers: 35
    }
  };
}

module.exports = {
  startLlamaCppServer,
  stopLlamaCppServer,
  statusLlamaCppServer,
  listModels,
  getConfig
};
