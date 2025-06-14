const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const systemInfo = require('./systemInfo');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/system', require('./routes/systemRoutes'));
app.use('/api/power', require('./routes/powerRoutes'));
app.use('/api/command', require('./routes/commandsRoutes'));

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('../client/build'));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../client/build', 'index.html'));
  });
}

// WebSocket connection
io.on('connection', (socket) => {
  console.log('Client connected');
  
  // Send initial system information
  systemInfo.getAll().then(data => {
    socket.emit('systemInfo', data);
  });
  
  // Set up interval to send system information updates
  const interval = setInterval(async () => {
    try {
      const data = await systemInfo.getAll();
      socket.emit('systemInfo', data);
    } catch (error) {
      console.error('Error getting system info:', error);
    }
  }, process.env.REFRESH_INTERVAL || 1000);
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected');
    clearInterval(interval);
  });
});

// Start server
const PORT = process.env.PORT || 8002;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});