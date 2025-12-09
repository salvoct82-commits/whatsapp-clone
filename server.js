// ============================================
// SERVER CON CHAT PRIVATE (server.js)
// ============================================

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

// Database in memoria
let users = new Map();
let privateMessages = new Map(); // Messaggi privati 1-a-1
let groupChats = new Map(); // Chat di gruppo
let onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('✅ Nuovo utente connesso:', socket.id);

  // Login
  socket.on('login', (userData) => {
    const user = {
      id: userData.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: userData.name,
      socketId: socket.id,
      online: true,
      lastSeen: Date.now()
    };
    
    users.set(user.id, user);
    onlineUsers.set(socket.id, user.id);
    
    socket.emit('login-success', user);
    io.emit('users-update', Array.from(users.values()));
    
    console.log(`👤 ${user.name} è entrato (ID: ${user.id})`);
  });

  // Invia messaggio PRIVATO (1-a-1)
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
    
    // Crea ID univoco per la chat tra i due utenti
    const chatId = [senderId, receiverId].sort().join('_');
    
    if (!privateMessages.has(chatId)) {
      privateMessages.set(chatId, []);
    }
    privateMessages.get(chatId).push(message);
    
    // Invia al mittente
    socket.emit('message-sent', message);
    
    // Invia SOLO al destinatario (PRIVATO)
    const receiver = users.get(receiverId);
    if (receiver && receiver.online) {
      io.to(receiver.socketId).emit('new-private-message', message);
    }
    
    console.log(`🔒 Messaggio PRIVATO da ${senderId} a ${receiverId}`);
  });

  // Crea chat di GRUPPO
  socket.on('create-group', (data) => {
    const { creatorId, groupName, memberIds } = data;
    
    const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const group = {
      id: groupId,
      name: groupName,
      creatorId,
      members: [creatorId, ...memberIds],
      createdAt: Date.now(),
      messages: []
    };
    
    groupChats.set(groupId, group);
    
    // Notifica tutti i membri del gruppo
    group.members.forEach(memberId => {
      const member = users.get(memberId);
      if (member && member.online) {
        io.to(member.socketId).emit('group-created', group);
      }
    });
    
    console.log(`👥 Gruppo creato: ${groupName} (${group.members.length} membri)`);
  });

  // Invia messaggio al GRUPPO
  socket.on('send-group-message', (data) => {
    const { senderId, groupId, text } = data;
    
    const group = groupChats.get(groupId);
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
    
    // Invia a TUTTI i membri del gruppo
    group.members.forEach(memberId => {
      const member = users.get(memberId);
      if (member && member.online) {
        io.to(member.socketId).emit('new-group-message', message);
      }
    });
    
    console.log(`👥 Messaggio gruppo ${group.name}: ${text.substring(0, 30)}...`);
  });

  // Ottieni messaggi PRIVATI
  socket.on('get-private-messages', (data) => {
    const { userId, otherUserId } = data;
    const chatId = [userId, otherUserId].sort().join('_');
    const messages = privateMessages.get(chatId) || [];
    socket.emit('private-messages-loaded', { chatId, messages });
  });

  // Ottieni messaggi GRUPPO
  socket.on('get-group-messages', (data) => {
    const { groupId } = data;
    const group = groupChats.get(groupId);
    if (group) {
      socket.emit('group-messages-loaded', { groupId, messages: group.messages });
    }
  });

  // Ottieni tutti i gruppi dell'utente
  socket.on('get-my-groups', (data) => {
    const { userId } = data;
    const userGroups = Array.from(groupChats.values())
      .filter(group => group.members.includes(userId));
    socket.emit('my-groups-loaded', userGroups);
  });

  // Segna messaggi come letti
  socket.on('mark-read', (data) => {
    const { userId, otherUserId } = data;
    const chatId = [userId, otherUserId].sort().join('_');
    const messages = privateMessages.get(chatId) || [];
    
    messages.forEach(msg => {
      if (msg.receiverId === userId) {
        msg.read = true;
      }
    });
    
    const otherUser = users.get(otherUserId);
    if (otherUser && otherUser.online) {
      io.to(otherUser.socketId).emit('messages-read', { userId });
    }
  });

  // Disconnessione
  socket.on('disconnect', () => {
    const userId = onlineUsers.get(socket.id);
    if (userId) {
      const user = users.get(userId);
      if (user) {
        user.online = false;
        user.lastSeen = Date.now();
        io.emit('users-update', Array.from(users.values()));
        console.log(`👋 ${user.name} si è disconnesso`);
      }
      onlineUsers.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`


${PORT}

  `);
});


// ============================================
// CLIENT CON CHAT PRIVATE (public/app.js)
// ============================================
/*
const socket = io();

let currentUser = null;
let selectedChat = null;
let users = [];
let groups = [];
let privateMessagesCache = {};
let groupMessagesCache = {};
let chatType = 'private'; // 'private' o 'group'

// ===== EVENTI SOCKET =====

socket.on('login-success', (user) => {
    currentUser = user;
    socket.emit('get-my-groups', { userId: user.id });
    renderApp();
});

socket.on('users-update', (updatedUsers) => {
    users = updatedUsers.filter(u => u.id !== currentUser?.id);
    renderUserList();
});

socket.on('my-groups-loaded', (userGroups) => {
    groups = userGroups;
    renderGroupList();
});

socket.on('group-created', (group) => {
    if (!groups.find(g => g.id === group.id)) {
        groups.push(group);
        renderGroupList();
    }
});

socket.on('new-private-message', (message) => {
    const chatId = [currentUser.id, message.senderId].sort().join('_');
    if (!privateMessagesCache[chatId]) privateMessagesCache[chatId] = [];
    privateMessagesCache[chatId].push(message);
    
    if (selectedChat && chatType === 'private' && message.senderId === selectedChat.id) {
        renderMessages();
        socket.emit('mark-read', { userId: currentUser.id, otherUserId: message.senderId });
    }
    renderUserList();
});

socket.on('new-group-message', (message) => {
    if (!groupMessagesCache[message.groupId]) groupMessagesCache[message.groupId] = [];
    groupMessagesCache[message.groupId].push(message);
    
    if (selectedChat && chatType === 'group' && message.groupId === selectedChat.id) {
        renderMessages();
    }
    renderGroupList();
});

socket.on('message-sent', (message) => {
    if (message.type === 'private') {
        const chatId = [currentUser.id, message.receiverId].sort().join('_');
        if (!privateMessagesCache[chatId]) privateMessagesCache[chatId] = [];
        privateMessagesCache[chatId].push(message);
    }
    renderMessages();
});

socket.on('private-messages-loaded', (data) => {
    privateMessagesCache[data.chatId] = data.messages;
    renderMessages();
});

socket.on('group-messages-loaded', (data) => {
    groupMessagesCache[data.groupId] = data.messages;
    renderMessages();
});

// ===== FUNZIONI PRINCIPALI =====

function login() {
    const username = document.getElementById('username').value.trim();
    if (username) {
        socket.emit('login', { name: username });
    }
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (text && selectedChat) {
        if (chatType === 'private') {
            socket.emit('send-private-message', {
                senderId: currentUser.id,
                receiverId: selectedChat.id,
                text: text
            });
        } else if (chatType === 'group') {
            socket.emit('send-group-message', {
                senderId: currentUser.id,
                groupId: selectedChat.id,
                text: text
            });
        }
        input.value = '';
    }
}

function selectPrivateChat(userId) {
    chatType = 'private';
    selectedChat = users.find(u => u.id === userId);
    socket.emit('get-private-messages', {
        userId: currentUser.id,
        otherUserId: userId
    });
    renderChatHeader();
    renderInputArea();
}

function selectGroupChat(groupId) {
    chatType = 'group';
    selectedChat = groups.find(g => g.id === groupId);
    socket.emit('get-group-messages', { groupId });
    renderChatHeader();
    renderInputArea();
}

function showCreateGroup() {
    const modal = document.getElementById('createGroupModal');
    modal.classList.remove('hidden');
    renderAvailableUsers();
}

function hideCreateGroup() {
    document.getElementById('createGroupModal').classList.add('hidden');
}

function createGroup() {
    const groupName = document.getElementById('groupName').value.trim();
    const checkboxes = document.querySelectorAll('input[name="groupMember"]:checked');
    const memberIds = Array.from(checkboxes).map(cb => cb.value);
    
    if (groupName && memberIds.length > 0) {
        socket.emit('create-group', {
            creatorId: currentUser.id,
            groupName: groupName,
            memberIds: memberIds
        });
        hideCreateGroup();
        document.getElementById('groupName').value = '';
    } else {
        alert('Inserisci un nome e seleziona almeno un membro!');
    }
}

function logout() {
    if (confirm('Sei sicuro di voler uscire?')) {
        socket.disconnect();
        window.location.reload();
    }
}

// ===== RENDERING =====

function renderApp() {
    const app = document.getElementById('app');
    
    if (!currentUser) {
        app.innerHTML = `
            <div class="flex items-center justify-center min-h-screen bg-gradient-to-br from-green-400 via-blue-500 to-purple-600">
                <div class="bg-white rounded-2xl shadow-2xl p-10 w-96">
                    <div class="text-center mb-8">
                        <div class="inline-block bg-green-500 rounded-full p-4 mb-4">
                            <svg class="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                            </svg>
                        </div>
                        <h1 class="text-4xl font-bold text-gray-800 mb-2">🔒 Chat Privata</h1>
                        <p class="text-gray-600">Chat private sicure</p>
                    </div>
                    <input 
                        id="username" 
                        type="text" 
                        placeholder="Il tuo nome..."
                        class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-green-500 mb-4 text-lg"
                        onkeypress="if(event.key==='Enter') login()"
                        autofocus
                    />
                    <button 
                        onclick="login()" 
                        class="w-full bg-green-500 text-white py-3 rounded-lg font-semibold text-lg hover:bg-green-600 transition-colors"
                    >
                        Accedi
                    </button>
                </div>
            </div>
        `;
    } else {
        app.innerHTML = `
            <div class="flex h-screen">
                <!-- Sidebar -->
                <div class="w-1/3 bg-white border-r border-gray-300 flex flex-col">
                    <!-- Header -->
                    <div class="bg-gradient-to-r from-green-500 to-green-600 p-6 flex items-center justify-between text-white">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-full bg-white bg-opacity-30 flex items-center justify-center font-bold text-xl">
                                ${currentUser.name.charAt(0).toUpperCase()}
                            </div>
                            <h2 class="text-xl font-semibold">${currentUser.name}</h2>
                        </div>
                        <button onclick="logout()" class="bg-white bg-opacity-20 hover:bg-opacity-30 px-4 py-2 rounded-lg transition-colors text-sm">
                            Esci
                        </button>
                    </div>
                    
                    <!-- Tabs -->
                    <div class="flex border-b border-gray-300">
                        <button onclick="showTab('private')" id="tabPrivate" class="flex-1 py-3 font-semibold text-green-600 border-b-2 border-green-600">
                            🔒 Chat Private
                        </button>
                        <button onclick="showTab('group')" id="tabGroup" class="flex-1 py-3 font-semibold text-gray-500">
                            👥 Gruppi
                        </button>
                    </div>
                    
                    <!-- Private Chats List -->
                    <div id="privateChatsContainer" class="flex-1 overflow-y-auto"></div>
                    
                    <!-- Groups List -->
                    <div id="groupChatsContainer" class="flex-1 overflow-y-auto hidden"></div>
                    
                    <!-- Create Group Button -->
                    <div class="p-4 border-t border-gray-300">
                        <button onclick="showCreateGroup()" class="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition-colors">
                            ➕ Crea Gruppo
                        </button>
                    </div>
                </div>
                
                <!-- Chat Area -->
                <div class="flex-1 flex flex-col bg-gray-50">
                    <div id="chatHeader" class="bg-white border-b border-gray-300 p-6 shadow-sm">
                        <p class="text-gray-500 text-center text-lg">👈 Seleziona una chat</p>
                    </div>
                    <div id="messagesArea" class="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-gray-50 to-gray-100"></div>
                    <div id="inputArea" class="bg-white border-t border-gray-300 p-4"></div>
                </div>
            </div>
            
            <!-- Modal Crea Gruppo -->
            <div id="createGroupModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div class="bg-white rounded-2xl p-8 w-96 max-h-[80vh] overflow-y-auto">
                    <h2 class="text-2xl font-bold mb-4">Crea Nuovo Gruppo</h2>
                    <input 
                        id="groupName" 
                        type="text" 
                        placeholder="Nome del gruppo..."
                        class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 mb-4"
                    />
                    <p class="font-semibold mb-2">Seleziona membri:</p>
                    <div id="availableUsers" class="mb-4"></div>
                    <div class="flex gap-2">
                        <button onclick="createGroup()" class="flex-1 bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600">
                            Crea
                        </button>
                        <button onclick="hideCreateGroup()" class="flex-1 bg-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-400">
                            Annulla
                        </button>
                    </div>
                </div>
            </div>
        `;
        renderUserList();
        renderGroupList();
    }
}

function showTab(tab) {
    const privateContainer = document.getElementById('privateChatsContainer');
    const groupContainer = document.getElementById('groupChatsContainer');
    const tabPrivate = document.getElementById('tabPrivate');
    const tabGroup = document.getElementById('tabGroup');
    
    if (tab === 'private') {
        privateContainer.classList.remove('hidden');
        groupContainer.classList.add('hidden');
        tabPrivate.classList.add('text-green-600', 'border-b-2', 'border-green-600');
        tabPrivate.classList.remove('text-gray-500');
        tabGroup.classList.remove('text-green-600', 'border-b-2', 'border-green-600');
        tabGroup.classList.add('text-gray-500');
    } else {
        privateContainer.classList.add('hidden');
        groupContainer.classList.remove('hidden');
        tabGroup.classList.add('text-green-600', 'border-b-2', 'border-green-600');
        tabGroup.classList.remove('text-gray-500');
        tabPrivate.classList.remove('text-green-600', 'border-b-2', 'border-green-600');
        tabPrivate.classList.add('text-gray-500');
    }
}

function renderUserList() {
    const container = document.getElementById('privateChatsContainer');
    if (!container) return;
    
    if (users.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-gray-500">
                <p class="text-lg mb-2">Nessun utente online</p>
                <p class="text-sm">Aspetta che qualcuno si connetta!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = users.map(user => {
        const chatId = [currentUser.id, user.id].sort().join('_');
        const messages = privateMessagesCache[chatId] || [];
        const lastMessage = messages[messages.length - 1];
        const unread = messages.filter(m => m.receiverId === currentUser.id && !m.read).length;
        
        return `
            <div 
                onclick="selectPrivateChat('${user.id}')" 
                class="p-5 border-b border-gray-200 hover:bg-green-50 cursor-pointer transition-colors ${selectedChat?.id === user.id && chatType === 'private' ? 'bg-green-100' : ''}"
            >
                <div class="flex items-center gap-4">
                    <div class="w-14 h-14 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white font-bold text-xl relative">
                        ${user.name.charAt(0).toUpperCase()}
                        ${user.online ? '<div class="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>' : ''}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-center">
                            <p class="font-semibold text-lg text-gray-800 truncate">${user.name}</p>
                            ${unread > 0 ? `<span class="bg-green-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">${unread}</span>` : ''}
                        </div>
                        <p class="text-sm ${user.online ? 'text-green-600 font-medium' : 'text-gray-500'}">
                            ${lastMessage ? lastMessage.text.substring(0, 30) + '...' : (user.online ? '🟢 Online' : 'Offline')}
                        </p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderGroupList() {
    const container = document.getElementById('groupChatsContainer');
    if (!container) return;
    
    if (groups.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-gray-500">
                <p class="text-lg mb-2">Nessun gruppo</p>
                <p class="text-sm">Crea il tuo primo gruppo!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = groups.map(group => {
        const lastMessage = group.messages[group.messages.length - 1];
        
        return `
            <div 
                onclick="selectGroupChat('${group.id}')" 
                class="p-5 border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors ${selectedChat?.id === group.id && chatType === 'group' ? 'bg-blue-100' : ''}"
            >
                <div class="flex items-center gap-4">
                    <div class="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-xl">
                        👥
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-semibold text-lg text-gray-800 truncate">${group.name}</p>
                        <p class="text-sm text-gray-500">
                            ${lastMessage ? lastMessage.text.substring(0, 30) + '...' : `${group.members.length} membri`}
                        </p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderAvailableUsers() {
    const container = document.getElementById('availableUsers');
    if (!container) return;
    
    container.innerHTML = users.map(user => `
        <label class="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
            <input type="checkbox" name="groupMember" value="${user.id}" class="w-5 h-5">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white font-bold">
                ${user.name.charAt(0).toUpperCase()}
            </div>
            <span class="font-medium">${user.name}</span>
        </label>
    `).join('');
}

function renderChatHeader() {
    const header = document.getElementById('chatHeader');
    if (!header || !selectedChat) return;
    
    if (chatType === 'private') {
        header.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white font-bold text-xl">
                    ${selectedChat.name.charAt(0).toUpperCase()}
                </div>
                <div>
                    <p class="font-semibold text-xl text-gray-800">🔒 ${selectedChat.name}</p>
                    <p class="text-sm ${selectedChat.online ? 'text-green-600' : 'text-gray-500'}">
                        ${selectedChat.online ? '🟢 Online' : 'Offline'}
                    </p>
                </div>
            </div>
        `;
    } else {
        header.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-xl">
                    👥
                </div>
                <div>
                    <p class="font-semibold text-xl text-gray-800">${selectedChat.name}</p>
                    <p class="text-sm text-gray-500">${selectedChat.members.length} membri</p>
                </div>
            </div>
        `;
    }
}

function renderInputArea() {
    const inputArea = document.getElementById('inputArea');
    if (!inputArea) return;
    
    inputArea.innerHTML = `
        <div class="flex gap-2">
            <input 
                id="messageInput" 
                type="text" 
                placeholder="Scrivi un messaggio..."
                class="flex-1 px-4 py-3 border-2 border-gray-300 rounded-full focus:outline-none focus:border-green-500 text-lg"
                onkeypress="if(event.key==='Enter') sendMessage()"
                autofocus
            />
            <button 
                onclick="sendMessage()" 
                class="bg-green-500 text-white px-8 py-3 rounded-full hover:bg-green-600 font-semibold transition-colors"
            >
                Invia
            </button>
        </div>
    `;
}

function renderMessages() {
    const messagesArea = document.getElementById('messagesArea');
    if (!messagesArea || !selectedChat) return;
    
    let messages = [];
    
    if (chatType === 'private') {
        const chatId = [currentUser.id, selectedChat.id].sort().join('_');
        messages = privateMessagesCache[chatId] || [];
    } else if (chatType === 'group') {
        messages = groupMessagesCache[selectedChat.id] || [];
    }
    
    if (messages.length === 0) {
        messagesArea.innerHTML = `
            <div class="flex items-center justify-center h-full">
                <div class="text-center text-gray-500">
                    <p class="text-lg mb-2">💬 Nessun messaggio</p>
                    <p class="text-sm">Inizia la conversazione!</p>
                </div>
            </div>
        `;
        return;
    }
    
    messagesArea.innerHTML = messages.map(msg => {
        const isMine = msg.senderId === currentUser.id;
        const sender = users.find(u => u.id === msg.senderId) || { name: 'Utente' };
        
        return `
            <div class="flex ${isMine ? 'justify-end' : 'justify-start'} mb-4">
                <div class="${isMine ? 'bg-green-500 text-white' : 'bg-white text-gray-800'} rounded-2xl p-4 max-w-md shadow-md">
                    ${chatType === 'group' && !isMine ? `<p class="font-semibold text-sm mb-1">${sender.name}</p>` : ''}
                    <p class="text-base break-words">${msg.text}</p>
                    <p class="text-xs ${isMine ? '