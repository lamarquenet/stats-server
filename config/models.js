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
    description: 'FP8 KV cache + AWQ 4bit, 80% GPU memory, 128K context (default)',
    gpuMemoryUtilization: 0.80,
    maxModelLen: 128000,
    port: 8001,
    tensorParallelSize: 4,
    kvCacheDtype: 'fp8',
    toolCallParser: 'qwen3_coder',
    enableAutoToolChoice: true,
    prefixCaching: false,  // Disabled - causes memory issues with large context
    envVars: {
      VLLM_ALLOW_LONG_MAX_MODEL_LEN: '1',
      PYTORCH_CUDA_ALLOC_CONF: 'expandable_segments:True',
      VLLM_USE_FLASHINFER_SAMPLER: '0',  // FlashInfer sampling kernels fail to JIT on CUDA13/Ampere
    },
    cudaDevices: '0,1,2,3',
  },
  'qwen38-27b-awq': {
    id: 'cyankiwi/Qwen3.8-27B-AWQ-INT4',
    name: 'Qwen3.8-27B (AWQ INT4)',
    description: 'Dense 27B hybrid attention, MTP speculative decoding, 262K ctx, TP=2 on GPUs 0-1 (2 GPUs left free)',
    gpuMemoryUtilization: 0.90,
    maxModelLen: 262144,
    port: 8001,
    tensorParallelSize: 2,
    cudaDevices: '0,1',
    kvCacheDtype: 'fp8',
    toolCallParser: 'qwen3_coder',
    enableAutoToolChoice: true,
    reasoningParser: 'qwen3',
    speculativeConfig: '{"method":"mtp","num_speculative_tokens":3}',
    envVars: {
      PYTORCH_CUDA_ALLOC_CONF: 'expandable_segments:True',
      VLLM_USE_FLASHINFER_SAMPLER: '0',  // FlashInfer sampling kernels fail to JIT on CUDA13/Ampere
    },
  },
  'qwen38-27b-int8': {
    id: 'lued/Qwen3.8-27B-INT8-W8A16-MTP',
    name: 'Qwen3.8-27B (INT8 W8A16)',
    description: 'Near-native fidelity INT8, MTP speculative decoding, 262K ctx, TP=2 on GPUs 0-1 (2 GPUs left free)',
    gpuMemoryUtilization: 0.90,
    maxModelLen: 262144,
    port: 8001,
    tensorParallelSize: 2,
    cudaDevices: '0,1',
    kvCacheDtype: 'fp8',
    toolCallParser: 'qwen3_coder',
    enableAutoToolChoice: true,
    reasoningParser: 'qwen3',
    speculativeConfig: '{"method":"mtp","num_speculative_tokens":3}',
    envVars: {
      PYTORCH_CUDA_ALLOC_CONF: 'expandable_segments:True',
      VLLM_USE_FLASHINFER_SAMPLER: '0',  // FlashInfer sampling kernels fail to JIT on CUDA13/Ampere
    },
  },
};

/**
 * Get model configuration by key
 * @param {string} modelKey - The model key (e.g., 'cyankiwi-qwen3-coder-next')
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
    // Include full config for UI display
    quantization: model.quantization || null,
    maxModelLen: model.maxModelLen,
    kvCacheDtype: model.kvCacheDtype || null,
    gpuMemoryUtilization: model.gpuMemoryUtilization,
    tensorParallelSize: model.tensorParallelSize || 1,
    port: model.port || 8001,
  }));
}

/**
 * Get default model key
 * @returns {string} Default model key
 */
function getDefaultModelKey() {
  return 'cyankiwi-qwen3-coder-next';
}

module.exports = {
  VLLM_MODELS,
  getModelConfig,
  getAllModels,
  getDefaultModelKey,
};
