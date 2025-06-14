const { exec } = require('child_process');
const { NodeSSH } = require('node-ssh');
const util = require('util');
const fs = require('fs');

const ssh = new NodeSSH();
const privateKey = fs.readFileSync('/root/.ssh/id_rsa', 'utf8');
const execPromise = util.promisify(exec);

async function startVLLMServer() {
  try {
    await ssh.connect({
      host: '172.17.0.1',
      username: 'aiserver',
      privateKey,
      // We’ve mounted a valid known_hosts file at /root/.ssh/known_hosts,
      // so no need to disable verification here.
    });

    const command = `nohup vllm serve mistralai/Devstral-Small-2505 --host 0.0.0.0 --gpu-memory-utilization 0.90 --max-model-len 85536 --port 8001 --tokenizer_mode mistral --config_format mistral --load_format mistral --tool-call-parser mistral --enable-auto-tool-choice --tensor-parallel-size 4 > vllm.log 2>&1 &`;

    console.log('Starting vLLM server remotely...');
    const result = await ssh.execCommand(command);

    if (result.stderr) {
      console.error('Error running vLLM:', result.stderr);
    } else {
      console.log('vLLM started successfully:', result.stdout);
    }

  } catch (err) {
    console.error('SSH connection or command failed:', err);
  } finally {
    ssh.dispose();
  }
}

module.exports = {
  startVLLMServer,
};