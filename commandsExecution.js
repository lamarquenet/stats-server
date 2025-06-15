const { NodeSSH } = require('node-ssh');
const fs = require('fs');

const ssh = new NodeSSH();
const privateKey = fs.readFileSync('/root/.ssh/id_rsa', 'utf8');

async function startVLLMServer() {
  try {
    await ssh.connect({
      host: '172.17.0.1',
      username: 'aiserver',
      privateKey,
    });

    const command = `bash -lc "source ~/miniconda3/etc/profile.d/conda.sh && conda activate vllm-conda-env && nohup vllm serve mistralai/Devstral-Small-2505 --host 0.0.0.0 --gpu-memory-utilization 0.90 --max-model-len 85536 --port 8001 --tokenizer_mode mistral --config_format mistral --load_format mistral --tool-call-parser mistral --enable-auto-tool-choice --tensor-parallel-size 4 > vllm.log 2>&1 &"`;

    console.log('Starting vLLM server remotely...');
    const result = await ssh.execCommand(command);

    if (result.stderr) {
      console.error('Error running vLLM:', result.stderr);
    } else {
      // This ssh connection stays open until vllm is stopped to prevent the server from auto turning off
      // We simulate here a user been connected to the server to prevent the auto shutdown script from turning it off
      console.log('ssh connection disposed');
    }

  } catch (err) {
    console.error('SSH connection or command failed:', err);
  } finally {
    ssh.dispose();
  }
}

async function stopVLLMServer() {
  try {
    await ssh.connect({
      host: '172.17.0.1',
      username: 'aiserver',
      privateKey,
    });

    // This finds the PID of the vllm serve command and kills it
    const stopCommand = `pkill -f "vllm serve.*--port 8001"`;

    console.log('Stopping vLLM server remotely...');
    const result = await ssh.execCommand(stopCommand);

    if (result.stderr) {
      console.error('Error stopping vLLM:', result.stderr);
    } else {
      console.log('vLLM stopped successfully:', result.stdout);
    }

  } catch (err) {
    console.error('SSH connection or command failed:', err);
  } finally {
    ssh.dispose();
  }
}

const VLLM_URL = 'http://172.17.0.1:8001';
async function statusVLLMServer() {
  try {
    const response = await axios.get(`${VLLM_URL}/health`, { timeout: 2000 });
    return response;
  } catch (err) {
    return err;
  }
}

module.exports = {
  startVLLMServer,
  stopVLLMServer,
  statusVLLMServer,
};
