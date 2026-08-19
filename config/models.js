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
    thinkingSupported: false,  // Non-thinking model
    mtpSupported: false,       // No MTP head in checkpoint
    minTensorParallelSize: 4,  // AWQ weights are ~45GB: 2x24GB cards cannot hold them
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
    thinkingSupported: true,
    mtpSupported: true,
    prefixCaching: true,  // Hybrid-attention APC (vLLM 0.27): agent/judge workload is ~92% prefill;
                          // watch prompt_tokens_cached_total + KV evictions after enabling
    envVars: {
      PYTORCH_CUDA_ALLOC_CONF: 'expandable_segments:True',
      VLLM_USE_FLASHINFER_SAMPLER: '0',  // FlashInfer sampling kernels fail to JIT on CUDA13/Ampere
    },
  },
  'qwen38-27b-int8': {
    id: 'lued/Qwen3.8-27B-INT8-W8A16-MTP',
    name: 'Qwen3.8-27B (INT8 W8A16)',
    description: 'Near-native fidelity INT8, MTP speculative decoding, TP=2 on GPUs 0-1 (2 GPUs left free). 131K ctx at 0.93 mem (262K requires TP=4 override)',
    gpuMemoryUtilization: 0.93,
    maxModelLen: 131072,
    maxModelLenNative: 262144,  // native cap for overrides (262K only fits with TP=4)
    port: 8001,
    tensorParallelSize: 2,
    cudaDevices: '0,1',
    kvCacheDtype: 'fp8',
    toolCallParser: 'qwen3_coder',
    enableAutoToolChoice: true,
    reasoningParser: 'qwen3',
    speculativeConfig: '{"method":"mtp","num_speculative_tokens":3}',
    thinkingSupported: true,
    mtpSupported: true,
    envVars: {
      PYTORCH_CUDA_ALLOC_CONF: 'expandable_segments:True',
      VLLM_USE_FLASHINFER_SAMPLER: '0',  // FlashInfer sampling kernels fail to JIT on CUDA13/Ampere
    },
  },
};

/**
 * Official Qwen3.8 sampling parameter sets, applied at launch via
 * --override-generation-config (server-side defaults for requests
 * that omit sampling params).
 */
const SAMPLING = {
  thinking: { temperature: 1.0, top_p: 0.95, top_k: 20, min_p: 0.0, presence_penalty: 0.0, repetition_penalty: 1.0 },
  instruct: { temperature: 0.7, top_p: 0.80, top_k: 20, min_p: 0.0, presence_penalty: 1.5, repetition_penalty: 1.0 },
};

// Override allowlist and ranges (4x GPU host)
const OVERRIDE_TP_VALUES = [1, 2, 4];
const OVERRIDE_KV_DTYPES = ['auto', 'fp8'];
const OVERRIDE_SPEC_TOKENS = [1, 2, 3, 4];
const OVERRIDE_GPU_MEM_RANGE = { min: 0.50, max: 0.95 };
const CUDA_DEVICES_BY_TP = { 1: '0', 2: '0,1', 4: '0,1,2,3' };
const OVERRIDE_KEYS = [
  'tensorParallelSize', 'gpuMemoryUtilization', 'maxModelLen', 'kvCacheDtype',
  'speculativeEnabled', 'speculativeTokens', 'reasoningParser', 'thinkingMode',
  'prefixCaching',
];

/**
 * Validate launch overrides against a model config and merge them in.
 *
 * @param {Object} modelConfig - Base model configuration
 * @param {Object|null} overrides - Launch overrides from the API request
 * @returns {{merged: Object, errors: string[]}}
 */
function validateOverrides(modelConfig, overrides) {
  const errors = [];
  const merged = { ...modelConfig };

  if (!overrides || typeof overrides !== 'object') {
    return { merged, errors };
  }

  for (const key of Object.keys(overrides)) {
    if (!OVERRIDE_KEYS.includes(key)) {
      errors.push(`unknown override '${key}' (allowed: ${OVERRIDE_KEYS.join(', ')})`);
    }
  }

  const o = overrides;

  if (o.tensorParallelSize !== undefined) {
    const minTp = modelConfig.minTensorParallelSize || 1;
    if (!OVERRIDE_TP_VALUES.includes(o.tensorParallelSize)) {
      errors.push(`tensorParallelSize must be one of ${OVERRIDE_TP_VALUES.join('/')}`);
    } else if (o.tensorParallelSize < minTp) {
      errors.push(`tensorParallelSize ${o.tensorParallelSize} is too low for this model: its weights need at least ${minTp} GPUs`);
    } else {
      merged.tensorParallelSize = o.tensorParallelSize;
      merged.cudaDevices = CUDA_DEVICES_BY_TP[o.tensorParallelSize];
    }
  }

  if (o.gpuMemoryUtilization !== undefined) {
    const v = Number(o.gpuMemoryUtilization);
    if (Number.isNaN(v) || v < OVERRIDE_GPU_MEM_RANGE.min || v > OVERRIDE_GPU_MEM_RANGE.max) {
      errors.push(`gpuMemoryUtilization must be between ${OVERRIDE_GPU_MEM_RANGE.min} and ${OVERRIDE_GPU_MEM_RANGE.max}`);
    } else {
      merged.gpuMemoryUtilization = v;
    }
  }

  if (o.maxModelLen !== undefined) {
    if (o.maxModelLen === 'auto') {
      delete merged.maxModelLen;  // omit flag: vLLM uses the model's native max
    } else {
      const nativeCap = modelConfig.maxModelLenNative || modelConfig.maxModelLen;
      const v = Number(o.maxModelLen);
      if (!Number.isInteger(v) || v < 4096 || v > nativeCap) {
        errors.push(`maxModelLen must be 'auto' or an integer between 4096 and ${nativeCap} (model native cap)`);
      } else {
        merged.maxModelLen = v;
      }
    }
  }

  if (o.kvCacheDtype !== undefined) {
    if (!OVERRIDE_KV_DTYPES.includes(o.kvCacheDtype)) {
      errors.push(`kvCacheDtype must be one of ${OVERRIDE_KV_DTYPES.join('/')}`);
    } else if (o.kvCacheDtype === 'auto') {
      delete merged.kvCacheDtype;  // omit flag entirely
    } else {
      merged.kvCacheDtype = o.kvCacheDtype;
    }
  }

  if (o.speculativeEnabled !== undefined) {
    if (o.speculativeEnabled && !modelConfig.mtpSupported) {
      errors.push('speculative decoding not supported by this model (no MTP head)');
    } else if (!o.speculativeEnabled) {
      delete merged.speculativeConfig;
    }
  }

  if (o.speculativeTokens !== undefined) {
    if (!OVERRIDE_SPEC_TOKENS.includes(o.speculativeTokens)) {
      errors.push(`speculativeTokens must be one of ${OVERRIDE_SPEC_TOKENS.join('/')}`);
    } else if (!modelConfig.mtpSupported) {
      errors.push('speculativeTokens not supported by this model (no MTP head)');
    } else {
      merged.speculativeConfig = JSON.stringify({ method: 'mtp', num_speculative_tokens: o.speculativeTokens });
    }
  }

  if (o.reasoningParser !== undefined) {
    if (o.reasoningParser === false) {
      delete merged.reasoningParser;
    } else if (o.reasoningParser === true) {
      merged.reasoningParser = merged.reasoningParser || 'qwen3';
    } else {
      errors.push('reasoningParser must be true or false');
    }
  }

  if (o.thinkingMode !== undefined) {
    if (!['thinking', 'instruct'].includes(o.thinkingMode)) {
      errors.push("thinkingMode must be 'thinking' or 'instruct'");
    } else if (!modelConfig.thinkingSupported) {
      errors.push('thinkingMode not supported by this model (non-thinking model)');
    } else {
      const set = SAMPLING[o.thinkingMode];
      // vLLM >= 0.2x parses --override-generation-config as JSON (json.loads)
      merged.generationConfigOverride = JSON.stringify(set);
    }
  }

  if (o.prefixCaching !== undefined) {
    if (typeof o.prefixCaching === 'boolean') {
      merged.prefixCaching = o.prefixCaching;
    } else {
      errors.push('prefixCaching must be true or false');
    }
  }

  return { merged, errors };
}

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
    maxModelLenNative: model.maxModelLenNative || model.maxModelLen,
    kvCacheDtype: model.kvCacheDtype || null,
    gpuMemoryUtilization: model.gpuMemoryUtilization,
    tensorParallelSize: model.tensorParallelSize || 1,
    port: model.port || 8001,
    // Launch-options metadata for the dashboard panel
    thinkingSupported: !!model.thinkingSupported,
    mtpSupported: !!model.mtpSupported,
    minTensorParallelSize: model.minTensorParallelSize || 1,
    prefixCaching: !!model.prefixCaching,
    reasoningParser: model.reasoningParser || null,
    speculativeTokens: model.speculativeConfig
      ? JSON.parse(model.speculativeConfig).num_speculative_tokens
      : null,
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
  SAMPLING,
  getModelConfig,
  getAllModels,
  getDefaultModelKey,
  validateOverrides,
};
