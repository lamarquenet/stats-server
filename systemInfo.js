const si = require('systeminformation');
const nvidiaSmi = require('node-nvidia-smi');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

/**
 * Get CPU information
 */
async function getCpuInfo() {
  try {
    const [load, temp, speed] = await Promise.all([
      si.currentLoad(),
      si.cpuTemperature(),
      si.cpuCurrentSpeed()
    ]);
    
    return {
      usage: load.currentLoad.toFixed(2),
      temperature: temp.main || temp.cores[0] || 'N/A',
      speed: speed.avg || 'N/A',
      cores: load.cpus.map(core => ({
        load: core.load.toFixed(2)
      }))
    };
  } catch (error) {
    console.error('Error getting CPU info:', error);
    return {
      usage: 'N/A',
      temperature: 'N/A',
      speed: 'N/A',
      cores: []
    };
  }
}

/**
 * Get memory (RAM) information
 */
async function getMemoryInfo() {
  try {
    const mem = await si.mem();
    
    return {
      total: formatBytes(mem.total),
      used: formatBytes(mem.used),
      free: formatBytes(mem.free),
      usagePercentage: ((mem.used / mem.total) * 100).toFixed(2)
    };
  } catch (error) {
    console.error('Error getting memory info:', error);
    return {
      total: 'N/A',
      used: 'N/A',
      free: 'N/A',
      usagePercentage: 'N/A'
    };
  }
}

/**
 * Get GPU information using nvidia-smi
 */
async function getGpuInfo() {
  try {
    // Try using node-nvidia-smi first
    return new Promise((resolve, reject) => {
      nvidiaSmi((err, data) => {
        if (err) {
          // Fall back to command line nvidia-smi
          fallbackNvidiaSmi()
            .then(resolve)
            .catch(reject);
        } else {
          const gpus = data.nvidia_smi_log.gpu || [];
          const formattedGpus = Array.isArray(gpus) ? gpus : [gpus];
          
          resolve(formattedGpus.map(gpu => ({
            name: gpu.product_name || 'Unknown GPU',
            temperature: gpu.temperature?.gpu_temp?.split(' ')[0] || 'N/A',
            fanSpeed: gpu.fan_speed?.split(' ')[0] || 'N/A',
            powerDraw: gpu.power_readings?.power_draw?.split(' ')[0] || 'N/A',
            powerLimit: gpu.power_readings?.power_limit?.split(' ')[0] || 'N/A',
            memoryTotal: gpu.fb_memory_usage?.total?.split(' ')[0] || 'N/A',
            memoryUsed: gpu.fb_memory_usage?.used?.split(' ')[0] || 'N/A',
            memoryFree: gpu.fb_memory_usage?.free?.split(' ')[0] || 'N/A',
            utilization: gpu.utilization?.gpu_util?.split(' ')[0] || 'N/A'
          })));
        }
      });
    });
  } catch (error) {
    console.error('Error getting GPU info:', error);
    return fallbackNvidiaSmi().catch(() => []);
  }
}

/**
 * Fallback method to get GPU info using command line nvidia-smi
 */
async function fallbackNvidiaSmi() {
  try {
    const { stdout } = await execPromise('nvidia-smi --query-gpu=name,temperature.gpu,fan.speed,power.draw,power.limit,memory.total,memory.used,memory.free,utilization.gpu --format=csv,noheader,nounits');
    
    const lines = stdout.trim().split('\n');
    return lines.map(line => {
      const [name, temperature, fanSpeed, powerDraw, powerLimit, memoryTotal, memoryUsed, memoryFree, utilization] = line.split(', ').map(item => item.trim());
      
      return {
        name: name || 'Unknown GPU',
        temperature: temperature || 'N/A',
        fanSpeed: fanSpeed || 'N/A',
        powerDraw: powerDraw || 'N/A',
        powerLimit: powerLimit || 'N/A',
        memoryTotal: memoryTotal || 'N/A',
        memoryUsed: memoryUsed || 'N/A',
        memoryFree: memoryFree || 'N/A',
        utilization: utilization || 'N/A'
      };
    });
  } catch (error) {
    console.error('Error in fallback nvidia-smi:', error);
    return [];
  }
}

/**
 * Get all system information
 */
async function getAll() {
  try {
    const [cpu, memory, gpus] = await Promise.all([
      getCpuInfo(),
      getMemoryInfo(),
      getGpuInfo()
    ]);
    
    return {
      timestamp: new Date().toISOString(),
      cpu,
      memory,
      gpus
    };
  } catch (error) {
    console.error('Error getting all system info:', error);
    return {
      timestamp: new Date().toISOString(),
      cpu: { usage: 'N/A', temperature: 'N/A', speed: 'N/A', cores: [] },
      memory: { total: 'N/A', used: 'N/A', free: 'N/A', usagePercentage: 'N/A' },
      gpus: []
    };
  }
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

module.exports = {
  getCpuInfo,
  getMemoryInfo,
  getGpuInfo,
  getAll
};