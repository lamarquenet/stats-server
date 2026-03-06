const { NodeSSH } = require('node-ssh');
const fs = require('fs');

const ssh = new NodeSSH();
const privateKey = fs.readFileSync('/root/.ssh/id_rsa', 'utf8');

// Log file paths on the host
const LOG_PATHS = {
  vllm: '/home/aiserver/vllm.log',
  ollama: '/home/aiserver/ollama.log',
  stats: '/var/log/stats-server.log',
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
 * Get logs for a specific service
 * @param {string} service - Service name (vllm, ollama, stats)
 * @param {number} lines - Number of lines to retrieve (default: 100)
 */
async function getServiceLogs(service, lines = 100) {
  const logPath = LOG_PATHS[service];
  
  if (!logPath) {
    throw new Error(`Unknown service: ${service}`);
  }

  try {
    const command = `tail -n ${lines} ${logPath} 2>/dev/null || echo "Log file not found or empty"`;
    const result = await executeSSHCommand(command);
    
    if (result.stderr && !result.stdout) {
      return {
        success: false,
        error: result.stderr,
        logs: []
      };
    }

    // Parse logs into lines
    const logLines = result.stdout
      .split('\n')
      .filter(line => line.trim())
      .map(line => ({
        timestamp: extractTimestamp(line),
        message: line,
        level: detectLogLevel(line)
      }));

    return {
      success: true,
      service,
      logPath,
      totalLines: logLines.length,
      logs: logLines
    };
  } catch (err) {
    console.error(`Error getting ${service} logs:`, err);
    return {
      success: false,
      service,
      error: err.message,
      logs: []
    };
  }
}

/**
 * Get live logs using tail -f (returns stream)
 * Note: This is for future WebSocket implementation
 */
async function streamServiceLogs(service, callback) {
  const logPath = LOG_PATHS[service];
  
  if (!logPath) {
    throw new Error(`Unknown service: ${service}`);
  }

  // For now, just return recent logs
  // WebSocket streaming can be added later
  return getServiceLogs(service, 50);
}

/**
 * Clear logs for a service
 */
async function clearServiceLogs(service) {
  const logPath = LOG_PATHS[service];
  
  if (!logPath) {
    throw new Error(`Unknown service: ${service}`);
  }

  try {
    const command = `echo "" > ${logPath} 2>/dev/null || echo "Could not clear log"`;
    const result = await executeSSHCommand(command);
    
    return {
      success: true,
      message: `${service} logs cleared`
    };
  } catch (err) {
    console.error(`Error clearing ${service} logs:`, err);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Get available log services
 */
function getAvailableServices() {
  return Object.keys(LOG_PATHS).map(key => ({
    id: key,
    name: key.toUpperCase(),
    path: LOG_PATHS[key]
  }));
}

/**
 * Extract timestamp from log line
 */
function extractTimestamp(line) {
  // Try to extract common timestamp formats
  const isoMatch = line.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/);
  if (isoMatch) return isoMatch[0];
  
  const syslogMatch = line.match(/\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/);
  if (syslogMatch) return syslogMatch[0];
  
  return null;
}

/**
 * Detect log level from line content
 */
function detectLogLevel(line) {
  const lowerLine = line.toLowerCase();
  if (lowerLine.includes('error') || lowerLine.includes('fatal')) return 'error';
  if (lowerLine.includes('warn') || lowerLine.includes('warning')) return 'warn';
  if (lowerLine.includes('info')) return 'info';
  if (lowerLine.includes('debug')) return 'debug';
  return 'info';
}

module.exports = {
  getServiceLogs,
  streamServiceLogs,
  clearServiceLogs,
  getAvailableServices,
};
