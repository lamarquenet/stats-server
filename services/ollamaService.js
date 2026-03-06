const { NodeSSH } = require('node-ssh');
const fs = require('fs');
const axios = require('axios');

const ssh = new NodeSSH();
const privateKey = fs.readFileSync('/root/.ssh/id_rsa', 'utf8');

const OLLAMA_HOST = 'http://172.17.0.1:11434';

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
 * Start the Ollama service
 */
async function startOllamaService() {
  try {
    const result = await executeSSHCommand('nohup ollama serve > ollama.log 2>&1 &');
    
    if (result.stderr && !result.stderr.includes('background')) {
      console.error('Error starting Ollama:', result.stderr);
      return { success: false, error: result.stderr };
    }
    
    console.log('Ollama service started');
    return { success: true, message: 'Ollama service started' };
  } catch (err) {
    console.error('Failed to start Ollama:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Stop the Ollama service
 */
async function stopOllamaService() {
  try {
    const result = await executeSSHCommand('pkill -f "ollama serve"');
    
    if (result.stderr) {
      console.error('Error stopping Ollama:', result.stderr);
    }
    
    console.log('Ollama service stopped');
    return { success: true, message: 'Ollama service stopped' };
  } catch (err) {
    console.error('Failed to stop Ollama:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Check Ollama service status via API
 */
async function statusOllamaService() {
  try {
    const response = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: 2000 });
    return { 
      status: 'running', 
      models: response.data.models || [] 
    };
  } catch (err) {
    return { status: 'not-running', error: err.message };
  }
}

/**
 * List all available models in Ollama
 */
async function listModels() {
  try {
    const response = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: 5000 });
    return { 
      success: true, 
      models: response.data.models || [] 
    };
  } catch (err) {
    console.error('Failed to list Ollama models:', err);
    return { success: false, error: err.message, models: [] };
  }
}

/**
 * Pull/download a model in Ollama
 */
async function pullModel(modelName) {
  try {
    const result = await executeSSHCommand(`ollama pull ${modelName}`);
    
    if (result.stderr && !result.stderr.includes('success')) {
      return { success: false, error: result.stderr };
    }
    
    return { success: true, message: `Model ${modelName} pulled successfully` };
  } catch (err) {
    console.error('Failed to pull model:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Delete a model from Ollama
 */
async function deleteModel(modelName) {
  try {
    const result = await executeSSHCommand(`ollama rm ${modelName}`);
    
    if (result.stderr && !result.stderr.includes('deleted')) {
      return { success: false, error: result.stderr };
    }
    
    return { success: true, message: `Model ${modelName} deleted successfully` };
  } catch (err) {
    console.error('Failed to delete model:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get running model information
 */
async function getRunningModels() {
  try {
    const response = await axios.get(`${OLLAMA_HOST}/api/ps`, { timeout: 2000 });
    return { 
      success: true, 
      models: response.data.models || response.data.running || [] 
    };
  } catch (err) {
    return { success: false, error: err.message, models: [] };
  }
}

module.exports = {
  startOllamaService,
  stopOllamaService,
  statusOllamaService,
  listModels,
  pullModel,
  deleteModel,
  getRunningModels,
};
