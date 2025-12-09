const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let users = new Map();
let messages = new Map();
let onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('Nuovo utente connesso:', socket.id);

  socket.on('login', (userData) => {
    const user = {
      id: userData.id || `user_${Date.now()}`,
      name: userData.name,
      socketId: socket.id,
      online: true,
      lastSeen: Date.now()
    };
    
    users.set(user.id, user);
    onlineUsers.set(socket.id, user.id);
    
    socket.emit('login-success', user);
    io.emit('users-update', Array.from(users.values()));
  });

  socket.on('send-message', (data) => {
    const { senderId, receiverId, text } = data;
    
    const message = {
      id: `msg_${Date.now()}`,
      senderId,
      receiverId,
      text,
      timestamp: Date.now(),
      read: false
    };
    
    const chatId = [senderId, receiverId].sort().join('_');
    
    if (!messages.has(chatId)) {
      messages.set(chatId, []);
    }
    messages.get(chatId).push(message);
    
    socket.emit('message-sent', message);
    
    const receiver = users.get(receiverId);
    if (receiver && receiver.online) {
      io.to(receiver.socketId).emit('new-message', message);
    }
  });

  socket.on('get-messages', (data) => {
    const { userId, otherUserId } = data;
    const chatId = [userId, otherUserId].sort().join('_');
    const chatMessages = messages.get(chatId) || [];
    socket.emit('messages-loaded', chatMessages);
  });

  socket.on('disconnect', () => {
    const userId = onlineUsers.get(socket.id);
    if (userId) {
      const user = users.get(userId);
      if (user) {
        user.online = false;
        user.lastSeen = Date.now();
        io.emit('users-update', Array.from(users.values()));
      }
      onlineUsers.delete(socket.id);
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   SERVER WHATSAPP CLONE AVVIATO!      ║
╚════════════════════════════════════════╝

🚀 Server: http://localhost:${PORT}
📱 Apri il browser all'indirizzo sopra
  `);
});