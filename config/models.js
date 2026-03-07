/**
 * vLLM Model Configurations
 * 
 * Contains model definitions with their specific parameters
 * for optimal performance on the AI server.
 */

const VLLM_MODELS = {
  'cyankiwi-qwen3-coder-next': {
    id: 'cyankiwi/Qwen3-Coder-Next-AWQ-4bit',
    name: 'Qwen3 Coder Next (AWQ 4bit)',
    description: 'FP8 KV cache + AWQ 4bit, 80% GPU memory, 128K context',
    gpuMemoryUtilization: 0.80,
    maxModelLen: 128000,
    port: 8001,
    tensorParallelSize: 4,
    kvCacheDtype: 'fp8',
    toolCallParser: 'qwen3_coder',
    enableAutoToolChoice: true,
    envVars: {
      VLLM_ALLOW_LONG_MAX_MODEL_LEN: '1',
    },
    cudaDevices: '0,1,2,3',
  },
  'devstral-standard': {
    id: 'mistralai/Devstral-Small-2505',
    name: 'Devstral Small',
    description: 'Standard config - 85K context, 90% GPU memory',
    gpuMemoryUtilization: 0.90,
    maxModelLen: 85536,
    port: 8001,
    tokenizerMode: 'mistral',
    configFormat: 'mistral',
    loadFormat: 'mistral',
    toolCallParser: 'mistral',
    enableAutoToolChoice: true,
    tensorParallelSize: 4,
  },
  'devstral-max-context': {
    id: 'mistralai/Devstral-Small-2505',
    name: 'Devstral Small Max Context',
    description: 'Maximum context (131K tokens), - 90% GPU memory',
    gpuMemoryUtilization: 0.90,
    maxModelLen: 131072,
    port: 8001,
    tokenizerMode: 'mistral',
    configFormat: 'mistral',
    loadFormat: 'mistral',
    toolCallParser: 'mistral',
    enableAutoToolChoice: true,
    tensorParallelSize: 4,
  },
  'devstral-fp8': {
    id: 'mistralai/Devstral-Small-2505',
    name: 'Devstral Small (FP8)',
    description: 'FP8 KV cache - 50% GPU memory for cache, better efficiency',
    gpuMemoryUtilization: 0.90,
    maxModelLen: 131072,
    port: 8001,
    tokenizerMode: 'mistral',
    configFormat: 'mistral',
    loadFormat: 'mistral',
    toolCallParser: 'mistral',
    enableAutoToolChoice: true,
    tensorParallelSize: 4,
    kvCacheDtype: 'fp8',
  },
  'devstral-fp8-max': {
    id: 'mistralai/Devstral-Small-2505',
    name: 'Devstral Small (FP8 + Max)',
    description: 'FP8 KV cache + 135K context',
    gpuMemoryUtilization: 0.90,
    maxModelLen: 131072,
    port: 8001,
    tokenizerMode: 'mistral',
    configFormat: 'mistral',
    loadFormat: 'mistral',
    toolCallParser: 'mistral',
    enableAutoToolChoice: true,
    tensorParallelSize: 4,
    kvCacheDtype: 'fp8',
  },
  'devstral-awq': {
    id: 'mistralai/Devstral-Small-2505-AWQ',
    name: 'Devstral Small (AWQ)',
    description: 'AWQ quantization - 80% GPU memory, faster inference',
    gpuMemoryUtilization: 0.90,
    maxModelLen: 131072,
    port: 8001,
    tokenizerMode: 'mistral',
    configFormat: 'mistral',
    loadFormat: 'auto',
    toolCallParser: 'mistral',
    enableAutoToolChoice: true,
    tensorParallelSize: 4,
    quantization: 'awq',
  },
  'devstral-gptq': {
    id: 'mistralai/Devstral-Small-2505-GPTQ-4bit',
    name: 'Devstral Small (GPTQ)',
    description: 'GPTQ 4-bit - lowest memory usage',
    gpuMemoryUtilization: 0.90,
    maxModelLen: 128000,
    port: 8001,
    tokenizerMode: 'mistral',
    configFormat: 'mistral',
    loadFormat: 'auto',
    toolCallParser: 'mistral',
    enableAutoToolChoice: true,
    tensorParallelSize: 4,
    quantization: 'gptq',
  },
  'devstral-fp8-awq': {
    id: 'mistralai/Devstral-Small-2505-AWQ',
    name: 'Devstral Small (FP8 + AWQ)',
    description: 'FP8 KV cache + AWQ, max efficiency',
    gpuMemoryUtilization: 0.90,
    maxModelLen: 131072,
    port: 8001,
    tokenizerMode: 'mistral',
    configFormat: 'mistral',
    loadFormat: 'auto',
    toolCallParser: 'mistral',
    enableAutoToolChoice: true,
    tensorParallelSize: 2,
    quantization: 'awq',
    kvCacheDtype: 'fp8',
  },
};

/**
 * Get model configuration by key
 * @param {string} modelKey - The model key (e.g., 'devstral-standard')
 * @returns {Object|null} Model configuration or null if not found
 */
function getModelConfig(modelKey) {
  return VLLM_MODELS[modelKey] || null;
}

/**
 * Get all available models
 * @returns {Array} Array of model configurations
 */
function getAllModels() {
  return Object.entries(VLLM_MODELS).map(([key, model]) => ({
    key,
    id: model.id,
    name: model.name,
    description: model.description,
  }));
}

/**
 * Get default model key
 * @returns {string} Default model key
 */
function getDefaultModelKey() {
  return 'devstral-standard';
}

module.exports = {
  VLLM_MODELS,
  getModelConfig,
  getAllModels,
  getDefaultModelKey,
};
