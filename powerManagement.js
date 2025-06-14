const { exec } = require('child_process');
const { NodeSSH } = require('node-ssh');
const util = require('util');
const fs = require('fs');

const ssh = new NodeSSH();
const privateKey = fs.readFileSync('/root/.ssh/id_rsa', 'utf8');
const execPromise = util.promisify(exec);
async function shutdown() {
  try {
    // 1. Only on Linux
    const { stdout: osInfo } = await execPromise('uname -s');
    if (osInfo.trim().toLowerCase() !== 'linux') {
      return { success: false, message: 'Shutdown only supported on Linux' };
    }

    // 2. Detect Docker via env (set RUNNING_IN_DOCKER in your Dockerfile)
    const inDocker = process.env.RUNNING_IN_DOCKER === 'true';

    if (inDocker) {
      console.log('Shutting down host via SSH…');

      // 3. SSH to host
      await ssh.connect({
        host: '172.17.0.1',             // or host.docker.internal
        username: 'aiserver',
        privateKey,
        // We’ve mounted a valid known_hosts file at /root/.ssh/known_hosts,
        // so no need to disable verification here.
      });

      // 4. Invoke a passwordless sudo systemctl call
      const { stdout, stderr, code } = await ssh.execCommand(
        'sudo systemctl poweroff',    // use systemctl for a clean shutdown
        { cwd: '/home/aiserver' }      // optional: set working dir
      );

      // 5. Close the SSH connection
      ssh.dispose();

      if (code !== 0) {
        console.error('Host shutdown failed:', stderr);
        return { success: false, message: `Host shutdown error: ${stderr}` };
      }

      console.log('Shutdown command sent:', stdout);
      return { success: true, message: 'Shutdown command sent successfully via SSH' };
    } else {
      // 6. Not in Docker: shut down local machine
      console.log('Shutting down server locally…');
      await execPromise('sudo systemctl poweroff');
      return { success: true, message: 'Shutdown command sent successfully' };
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