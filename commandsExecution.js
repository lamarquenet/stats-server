const { NodeSSH } = require('node-ssh');
const fs = require('fs');
const axios = require('axios');
const { getModelConfig, getDefaultModelKey, validateOverrides } = require('./config/models');

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
    envParts.push(`export CUDA_VISIBLE_DEVICES=${modelConfig.cudaDevices}`);
  }

  // Add custom environment variables
  if (modelConfig.envVars) {
    for (const [key, value] of Object.entries(modelConfig.envVars)) {
      envParts.push(`export ${key}=${value}`);
    }
  }

  return envParts.length > 0 ? envParts.join(' && ') + ' && ' : '';
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
    `--port ${modelConfig.port}`,
  ];

  // Omitted when 'auto': vLLM then uses the model's native max context
  if (modelConfig.maxModelLen) {
    parts.push(`--max-model-len ${modelConfig.maxModelLen}`);
  }

  // Add prefix caching only if explicitly enabled (default: false)
  if (modelConfig.prefixCaching) {
    parts.push(`--enable-prefix-caching`);
  }

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
  if (modelConfig.reasoningParser) {
    parts.push(`--reasoning-parser ${modelConfig.reasoningParser}`);
  }
  // JSON value: single-quote it and escape inner double quotes so it survives the bash -lc "..." wrapper
  if (modelConfig.speculativeConfig) {
    parts.push(`--speculative-config '${modelConfig.speculativeConfig.replace(/"/g, '\\"')}'`);
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

  // Serve-time default sampling params (e.g. thinking vs instruct sets) — JSON value
  if (modelConfig.generationConfigOverride) {
    parts.push(`--override-generation-config '${modelConfig.generationConfigOverride.replace(/"/g, '\\"')}'`);
  }

  return parts.join(' ');
}

/**
 * Start the vLLM server with specified model
 * @param {string} modelKey - Optional model key to use (defaults to the default model key)
 * @param {Object|null} overrides - Optional launch overrides (validated & merged into the config)
 * @returns {Object} The resolved (merged) model configuration that was launched
 */
async function startVLLMServer(modelKey = null, overrides = null) {
  // Get model configuration
  const selectedModelKey = modelKey || getDefaultModelKey();
  const baseConfig = getModelConfig(selectedModelKey);

  if (!baseConfig) {
    throw new Error(`Unknown model: ${selectedModelKey}`);
  }

  // Validate and merge launch overrides (allowlist + ranges)
  const { merged: modelConfig, errors } = validateOverrides(baseConfig, overrides);
  if (errors.length) {
    const err = new Error(`Invalid overrides: ${errors.join('; ')}`);
    err.name = 'ValidationError';
    throw err;
  }

  try {
    await ssh.connect({
      host: '172.17.0.1',
      username: 'aiserver',
      privateKey,
    });

    const envPrefix = buildEnvPrefix(modelConfig);
    const vllmCommand = buildVllmCommand(modelConfig);
    const command = `bash -lc "source ~/miniconda3/etc/profile.d/conda.sh && conda activate vllm-conda-env && ${envPrefix}nohup ${vllmCommand} > /home/aiserver/vllm.log 2>&1 &"`;

    console.log(`Starting vLLM server with model: ${selectedModelKey}`);
    console.log(`Command: ${command}`);
    const result = await ssh.execCommand(command);

    if (result.stderr) {
      console.error('Error running vLLM:', result.stderr);
    } else {
      console.log('vLLM server started successfully');
    }

    return {
      key: selectedModelKey,
      id: modelConfig.id,
      tensorParallelSize: modelConfig.tensorParallelSize,
      cudaDevices: modelConfig.cudaDevices,
      gpuMemoryUtilization: modelConfig.gpuMemoryUtilization,
      maxModelLen: modelConfig.maxModelLen,
      kvCacheDtype: modelConfig.kvCacheDtype || 'auto',
      speculativeConfig: modelConfig.speculativeConfig || null,
      reasoningParser: modelConfig.reasoningParser || null,
      generationConfigOverride: modelConfig.generationConfigOverride || null,
    };

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
