const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

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
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Database in memoria (si resetta al riavvio)
let db = {
  users: [],
  privateMessages: [],
  groupChats: []
};

let onlineUsers = new Map();
let socketToUser = new Map();

// Registrazione (password in chiaro - solo per demo)
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Tutti i campi obbligatori' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password minimo 6 caratteri' });
    }
    
    if (db.users.find(u => u.email === email)) {
      return res.status(400).json({ error: 'Email già registrata' });
    }
    
    const user = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      email,
      password, // ⚠️ Password in chiaro (solo per demo!)
      name,
      avatar: name.charAt(0).toUpperCase(),
      createdAt: Date.now()
    };
    
    db.users.push(user);
    console.log(`✅ Registrato: ${email}`);
    
    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });
    
  } catch (error) {
    console.error('Errore registrazione:', error);
    res.status(500).json({ error: 'Errore server' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password obbligatori' });
    }
    
    const user = db.users.find(u => u.email === email && u.password === password);
    
    if (!user) {
      return res.status(401).json({ error: 'Email o password errati' });
    }
    
    console.log(`✅ Login: ${email}`);
    
    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });
    
  } catch (error) {
    console.error('Errore login:', error);
    res.status(500).json({ error: 'Errore server' });
  }
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('🔌 Connessione:', socket.id);

  socket.on('user-connected', (userId) => {
    const user = db.users.find(u => u.id === userId);
    if (!user) return;
    
    onlineUsers.set(userId, socket.id);
    socketToUser.set(socket.id, userId);
    
    const onlineUsersList = Array.from(onlineUsers.keys()).map(id => {
      const u = db.users.find(user => user.id === id);
      if (u) {
        const { password, ...userWithoutPassword } = u;
        return { ...userWithoutPassword, online: true };
      }
      return null;
    }).filter(Boolean);
    
    io.emit('users-update', onlineUsersList);
  });

  socket.on('send-private-message', (data) => {
    const { senderId, receiverId, text } = data;
    
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      senderId,
      receiverId,
      text,
      timestamp: Date.now(),
      read: false,
      type: 'private'
    };
    
    db.privateMessages.push(message);
    
    socket.emit('message-sent', message);
    
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('new-private-message', message);
    }
  });

  socket.on('create-group', (data) => {
    const { creatorId, groupName, memberIds } = data;
    
    const group = {
      id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: groupName,
      creatorId,
      members: [creatorId, ...memberIds],
      createdAt: Date.now(),
      messages: []
    };
    
    db.groupChats.push(group);
    
    group.members.forEach(memberId => {
      const socketId = onlineUsers.get(memberId);
      if (socketId) {
        io.to(socketId).emit('group-created', group);
      }
    });
  });

  socket.on('send-group-message', (data) => {
    const { senderId, groupId, text } = data;
    
    const group = db.groupChats.find(g => g.id === groupId);
    if (!group) return;
    
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      senderId,
      groupId,
      text,
      timestamp: Date.now(),
      type: 'group'
    };
    
    group.messages.push(message);
    
    group.members.forEach(memberId => {
      const socketId = onlineUsers.get(memberId);
      if (socketId) {
        io.to(socketId).emit('new-group-message', message);
      }
    });
  });

  socket.on('get-private-messages', (data) => {
    const { userId, otherUserId } = data;
    
    const messages = db.privateMessages.filter(m =>
      (m.senderId === userId && m.receiverId === otherUserId) ||
      (m.senderId === otherUserId && m.receiverId === userId)
    );
    
    socket.emit('private-messages-loaded', { messages });
  });

  socket.on('get-my-groups', (data) => {
    const { userId } = data;
    const userGroups = db.groupChats.filter(g => g.members.includes(userId));
    socket.emit('my-groups-loaded', userGroups);
  });

  socket.on('get-group-messages', (data) => {
    const { groupId } = data;
    const group = db.groupChats.find(g => g.id === groupId);
    if (group) {
      socket.emit('group-messages-loaded', { groupId, messages: group.messages });
    }
  });

  socket.on('mark-read', (data) => {
    const { userId, otherUserId } = data;
    
    db.privateMessages.forEach(msg => {
      if (msg.receiverId === userId && msg.senderId === otherUserId) {
        msg.read = true;
      }
    });
    
    const otherSocketId = onlineUsers.get(otherUserId);
    if (otherSocketId) {
      io.to(otherSocketId).emit('messages-read', { userId });
    }
  });

  socket.on('disconnect', () => {
    const userId = socketToUser.get(socket.id);
    
    if (userId) {
      onlineUsers.delete(userId);
      socketToUser.delete(socket.id);
      
      const onlineUsersList = Array.from(onlineUsers.keys()).map(id => {
        const u = db.users.find(user => user.id === id);
        if (u) {
          const { password, ...userWithoutPassword } = u;
          return { ...userWithoutPassword, online: true };
        }
        return null;
      }).filter(Boolean);
      
      io.emit('users-update', onlineUsersList);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║         🚀 SERVER RENDER AVVIATO! ✅      ║
╚═══════════════════════════════════════════╝

🌐 Porta: ${PORT}
💾 Database in memoria
⚠️  I dati si resettano al riavvio

Pronto per connessioni!
  `);
});