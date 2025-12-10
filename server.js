// ============================================
// SERVER CON AUTENTICAZIONE (server.js)
// ============================================

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');

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

// Database persistente su file
const DB_FILE = path.join(__dirname, 'database.json');

// Carica database
function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Errore caricamento database:', error);
  }
  return {
    users: [],
    privateMessages: [],
    groupChats: []
  };
}

// Salva database
function saveDatabase(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    console.log('💾 Database salvato');
  } catch (error) {
    console.error('❌ Errore salvataggio database:', error);
  }
}

let db = loadDatabase();
let onlineUsers = new Map(); // userId -> socketId
let socketToUser = new Map(); // socketId -> userId

// API REST per Registrazione
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Validazione
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Tutti i campi sono obbligatori' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password minimo 6 caratteri' });
    }
    
    // Email già registrata?
    if (db.users.find(u => u.email === email)) {
      return res.status(400).json({ error: 'Email già registrata' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Crea utente
    const user = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      email,
      password: hashedPassword,
      name,
      avatar: name.charAt(0).toUpperCase(),
      createdAt: Date.now(),
      lastSeen: Date.now()
    };
    
    db.users.push(user);
    saveDatabase(db);
    
    console.log(`✅ Nuovo utente registrato: ${email}`);
    
    // Ritorna utente senza password
    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });
    
  } catch (error) {
    console.error('Errore registrazione:', error);
    res.status(500).json({ error: 'Errore server' });
  }
});

// API REST per Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password obbligatori' });
    }
    
    // Trova utente
    const user = db.users.find(u => u.email === email);
    
    if (!user) {
      return res.status(401).json({ error: 'Email o password errati' });
    }
    
    // Verifica password
    const passwordMatch = await bcrypt.compare(password, user.password);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Email o password errati' });
    }
    
    // Aggiorna ultimo accesso
    user.lastSeen = Date.now();
    saveDatabase(db);
    
    console.log(`✅ Login: ${email}`);
    
    // Ritorna utente senza password
    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });
    
  } catch (error) {
    console.error('Errore login:', error);
    res.status(500).json({ error: 'Errore server' });
  }
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('🔌 Nuova connessione:', socket.id);

  // Connessione utente autenticato
  socket.on('user-connected', (userId) => {
    const user = db.users.find(u => u.id === userId);
    if (!user) return;
    
    onlineUsers.set(userId, socket.id);
    socketToUser.set(socket.id, userId);
    
    // Broadcast utenti online
    const onlineUsersList = Array.from(onlineUsers.keys()).map(id => {
      const u = db.users.find(user => user.id === id);
      if (u) {
        const { password, ...userWithoutPassword } = u;
        return { ...userWithoutPassword, online: true };
      }
      return null;
    }).filter(Boolean);
    
    io.emit('users-update', onlineUsersList);
    
    console.log(`👤 ${user.name} connesso`);
  });

  // Invia messaggio privato
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
    saveDatabase(db);
    
    // Invia al mittente
    socket.emit('message-sent', message);
    
    // Invia al destinatario se online
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('new-private-message', message);
    }
    
    console.log(`💬 Messaggio da ${senderId} a ${receiverId}`);
  });

  // Crea gruppo
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
    saveDatabase(db);
    
    // Notifica tutti i membri
    group.members.forEach(memberId => {
      const socketId = onlineUsers.get(memberId);
      if (socketId) {
        io.to(socketId).emit('group-created', group);
      }
    });
    
    console.log(`👥 Gruppo creato: ${groupName}`);
  });

  // Messaggio gruppo
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
    saveDatabase(db);
    
    // Invia a tutti i membri
    group.members.forEach(memberId => {
      const socketId = onlineUsers.get(memberId);
      if (socketId) {
        io.to(socketId).emit('new-group-message', message);
      }
    });
  });

  // Ottieni messaggi privati
  socket.on('get-private-messages', (data) => {
    const { userId, otherUserId } = data;
    
    const messages = db.privateMessages.filter(m =>
      (m.senderId === userId && m.receiverId === otherUserId) ||
      (m.senderId === otherUserId && m.receiverId === userId)
    );
    
    socket.emit('private-messages-loaded', { messages });
  });

  // Ottieni gruppi utente
  socket.on('get-my-groups', (data) => {
    const { userId } = data;
    const userGroups = db.groupChats.filter(g => g.members.includes(userId));
    socket.emit('my-groups-loaded', userGroups);
  });

  // Ottieni messaggi gruppo
  socket.on('get-group-messages', (data) => {
    const { groupId } = data;
    const group = db.groupChats.find(g => g.id === groupId);
    if (group) {
      socket.emit('group-messages-loaded', { groupId, messages: group.messages });
    }
  });

  // Segna come letto
  socket.on('mark-read', (data) => {
    const { userId, otherUserId } = data;
    
    db.privateMessages.forEach(msg => {
      if (msg.receiverId === userId && msg.senderId === otherUserId) {
        msg.read = true;
      }
    });
    
    saveDatabase(db);
    
    const otherSocketId = onlineUsers.get(otherUserId);
    if (otherSocketId) {
      io.to(otherSocketId).emit('messages-read', { userId });
    }
  });

  // Disconnessione
  socket.on('disconnect', () => {
    const userId = socketToUser.get(socket.id);
    
    if (userId) {
      onlineUsers.delete(userId);
      socketToUser.delete(socket.id);
      
      const user = db.users.find(u => u.id === userId);
      if (user) {
        user.lastSeen = Date.now();
        saveDatabase(db);
        console.log(`👋 ${user.name} disconnesso`);
      }
      
      // Aggiorna lista utenti online
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
║   🔐 CHAT CON AUTENTICAZIONE AVVIATA! ✅  ║
╚═══════════════════════════════════════════╝

🚀 Server: http://localhost:${PORT}
📧 Login con Email e Password
💾 Dati salvati persistentemente
🔒 Password crittografate con bcrypt

Database: ${DB_FILE}

Premi Ctrl+C per fermare
  `);
});
