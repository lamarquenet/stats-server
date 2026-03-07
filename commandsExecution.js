const { NodeSSH } = require('node-ssh');
const fs = require('fs');
const axios = require('axios');
const { getModelConfig, getDefaultModelKey } = require('./config/models');

const ssh = new NodeSSH();
const privateKey = fs.readFileSync('/root/.ssh/id_rsa', 'utf8');

/**
 * Build environment variables prefix for the command
 * @param {Object} modelConfig - Model configuration object
 * @returns {string} Environment variables string
 */
function buildEnvPrefix(modelConfig) {
  const envParts = [];

  // Add CUDA_VISIBLE_DEVICES if specified
  if (modelConfig.cudaDevices) {
    envParts.push(`CUDA_VISIBLE_DEVICES=${modelConfig.cudaDevices}`);
  }

  // Add custom environment variables
  if (modelConfig.envVars) {
    for (const [key, value] of Object.entries(modelConfig.envVars)) {
      envParts.push(`${key}=${value}`);
    }
  }

  return envParts.length > 0 ? envParts.join(' ') + ' ' : '';
}

/**
 * Build vLLM command string based on model configuration
 * @param {Object} modelConfig - Model configuration object
 * @returns {string} Command string to execute
 */
function buildVllmCommand(modelConfig) {
  const parts = [
    'vllm serve',
    modelConfig.id,
    `--host 0.0.0.0`,
    `--gpu-memory-utilization ${modelConfig.gpuMemoryUtilization}`,
    `--max-model-len ${modelConfig.maxModelLen}`,
    `--port ${modelConfig.port}`,
    `--enable-prefix-caching`,  // Always enabled for all models
  ];

  // Add optional parameters
  if (modelConfig.tokenizerMode) {
    parts.push(`--tokenizer_mode ${modelConfig.tokenizerMode}`);
  }
  if (modelConfig.configFormat) {
    parts.push(`--config_format ${modelConfig.configFormat}`);
  }
  if (modelConfig.loadFormat) {
    parts.push(`--load_format ${modelConfig.loadFormat}`);
  }
  if (modelConfig.toolCallParser) {
    parts.push(`--tool-call-parser ${modelConfig.toolCallParser}`);
  }
  if (modelConfig.enableAutoToolChoice) {
    parts.push(`--enable-auto-tool-choice`);
  }
  if (modelConfig.tensorParallelSize) {
    parts.push(`--tensor-parallel-size ${modelConfig.tensorParallelSize}`);
  }

  // Quantization options
  if (modelConfig.quantization) {
    parts.push(`--quantization ${modelConfig.quantization}`);
  }
  if (modelConfig.kvCacheDtype) {
    parts.push(`--kv-cache-dtype ${modelConfig.kvCacheDtype}`);
  }

  return parts.join(' ');
}

/**
 * Start the vLLM server with specified model
 * @param {string} modelKey - Optional model key to use (defaults to devstral-standard)
 */
async function startVLLMServer(modelKey = null) {
  // Get model configuration
  const selectedModelKey = modelKey || getDefaultModelKey();
  const modelConfig = getModelConfig(selectedModelKey);
  
  if (!modelConfig) {
    throw new Error(`Unknown model: ${selectedModelKey}`);
  }

  try {
    await ssh.connect({
      host: '172.17.0.1',
      username: 'aiserver',
      privateKey,
    });

    const envPrefix = buildEnvPrefix(modelConfig);
    const vllmCommand = buildVllmCommand(modelConfig);
    const command = `bash -lc "source ~/miniconda3/etc/profile.d/conda.sh && conda activate vllm-conda-env && nohup ${envPrefix}${vllmCommand} > /home/aiserver/vllm.log 2>&1 &"`;

    console.log(`Starting vLLM server with model: ${selectedModelKey}`);
    console.log(`Command: ${command}`);
    const result = await ssh.execCommand(command);

    if (result.stderr) {
      console.error('Error running vLLM:', result.stderr);
    } else {
      console.log('vLLM server started successfully');
    }

  } catch (err) {
    console.error('SSH connection or command failed:', err);
    throw err;
  } finally {
    ssh.dispose();
  }
}

/**
 * Stop the vLLM server on specified port
 * @param {number} port - Port number to stop (default: 8001)
 */
async function stopVLLMServer(port = 8001) {
  try {
    await ssh.connect({
      host: '172.17.0.1',
      username: 'aiserver',
      privateKey,
    });

    // This finds the PID of the vllm serve command and kills it
    const stopCommand = `pkill -f "vllm serve.*--port ${port}"`;

    console.log('Stopping vLLM server remotely...');
    const result = await ssh.execCommand(stopCommand);

    if (result.stderr) {
      console.error('Error stopping vLLM:', result.stderr);
    } else {
      console.log('vLLM stopped successfully:', result.stdout);
    }

  } catch (err) {
    console.error('SSH connection or command failed:', err);
    throw err;
  } finally {
    ssh.dispose();
  }
}

const VLLM_URL = 'http://172.17.0.1:8001';
async function statusVLLMServer() {
  try {
    const response = await axios.get(`${VLLM_URL}/health`, { timeout: 2000 });
    return response;
  } catch (err) {
    return err;
  }
}

module.exports = {
  startVLLMServer,
  stopVLLMServer,
  statusVLLMServer,
};
