const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

/**
 * Shutdown the server
 */
async function shutdown() {
  try {
    // Check if running on Linux
    const { stdout: osInfo } = await execPromise('uname -s');
    const isLinux = osInfo.trim().toLowerCase() === 'linux';
    
    if (isLinux) {
      console.log('Shutting down server...');
      await execPromise('sudo shutdown -h now');
      return { success: true, message: 'Shutdown command sent successfully' };
    } else {
      console.error('Shutdown only supported on Linux');
      return { success: false, message: 'Shutdown only supported on Linux' };
    }
  } catch (error) {
    console.error('Error shutting down server:', error);
    return { success: false, message: `Error shutting down: ${error.message}` };
  }
}

/**
 * Check if the server is online
 */
async function isOnline() {
  // always return true since if we get the call, we are online
  return { online: true, message: 'Server is online' };
}

/**
 * Get server power status
 */
async function getPowerStatus() {
  const status = await isOnline();
  return {
    status: status.online ? 'online' : 'offline',
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  shutdown,
  isOnline,
  getPowerStatus
};