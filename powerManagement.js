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
async function isOnline(ip) {
  try {
    // Use IP address from environment variable if not provided
    const serverIp = ip || process.env.SERVER_IP;
    
    if (!serverIp) {
      throw new Error('Server IP not provided');
    }
    
    // Use ping to check if server is online
    const { stdout, stderr } = await execPromise(`ping -c 1 -W 1 ${serverIp}`);
    
    return { online: true, message: 'Server is online' };
  } catch (error) {
    console.log(`Server at ${ip || process.env.SERVER_IP} appears to be offline`);
    return { online: false, message: 'Server is offline' };
  }
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