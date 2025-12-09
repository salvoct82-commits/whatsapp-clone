const socket = io();

let currentUser = null;
let selectedChat = null;
let users = [];
let messagesCache = {};

socket.on('login-success', (user) => {
    currentUser = user;
    renderApp();
});

socket.on('users-update', (updatedUsers) => {
    users = updatedUsers.filter(u => u.id !== currentUser?.id);
    renderUserList();
});

socket.on('new-message', (message) => {
    const chatId = [currentUser.id, message.senderId].sort().join('_');
    if (!messagesCache[chatId]) messagesCache[chatId] = [];
    messagesCache[chatId].push(message);
    
    if (selectedChat && message.senderId === selectedChat.id) {
        renderMessages();
    }
    renderUserList();
});

socket.on('message-sent', (message) => {
    const chatId = [currentUser.id, message.receiverId].sort().join('_');
    if (!messagesCache[chatId]) messagesCache[chatId] = [];
    messagesCache[chatId].push(message);
    renderMessages();
});

socket.on('messages-loaded', (messages) => {
    const chatId = [currentUser.id, selectedChat.id].sort().join('_');
    messagesCache[chatId] = messages;
    renderMessages();
});

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
        socket.emit('send-message', {
            senderId: currentUser.id,
            receiverId: selectedChat.id,
            text: text
        });
        input.value = '';
    }
}

function selectChat(userId) {
    selectedChat = users.find(u => u.id === userId);
    socket.emit('get-messages', {
        userId: currentUser.id,
        otherUserId: userId
    });
    
    document.getElementById('chatHeader').innerHTML = `
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white font-bold text-lg">
                ${selectedChat.name.charAt(0).toUpperCase()}
            </div>
            <div>
                <p class="font-semibold text-lg">${selectedChat.name}</p>
                <p class="text-sm ${selectedChat.online ? 'text-green-600' : 'text-gray-500'}">
                    ${selectedChat.online ? '🟢 Online' : 'Offline'}
                </p>
            </div>
        </div>
    `;
    
    document.getElementById('inputArea').innerHTML = `
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
    
    renderMessages();
}

function renderApp() {
    const app = document.getElementById('app');
    
    if (!currentUser) {
        app.innerHTML = `
            <div class="flex items-center justify-center min-h-screen bg-gradient-to-br from-green-400 via-blue-500 to-purple-600">
                <div class="bg-white rounded-2xl shadow-2xl p-10 w-96">
                    <div class="text-center mb-8">
                        <div class="inline-block bg-green-500 rounded-full p-4 mb-4">
                            <svg class="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                            </svg>
                        </div>
                        <h1 class="text-4xl font-bold text-gray-800 mb-2">WhatsApp Clone</h1>
                        <p class="text-gray-600">Chat in tempo reale</p>
                    </div>
                    <input 
                        id="username" 
                        type="text" 
                        placeholder="Inserisci il tuo nome..."
                        class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-green-500 mb-4 text-lg"
                        onkeypress="if(event.key==='Enter') login()"
                        autofocus
                    />
                    <button 
                        onclick="login()" 
                        class="w-full bg-green-500 text-white py-3 rounded-lg font-semibold text-lg hover:bg-green-600 transition-colors"
                    >
                        Accedi alla Chat
                    </button>
                </div>
            </div>
        `;
    } else {
        app.innerHTML = `
            <div class="flex h-screen">
                <div class="w-1/3 bg-white border-r border-gray-300 flex flex-col">
                    <div class="bg-gradient-to-r from-green-500 to-green-600 p-6 flex items-center justify-between text-white">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-full bg-white bg-opacity-30 flex items-center justify-center font-bold text-xl">
                                ${currentUser.name.charAt(0).toUpperCase()}
                            </div>
                            <h2 class="text-xl font-semibold">${currentUser.name}</h2>
                        </div>
                        <button onclick="logout()" class="bg-white bg-opacity-20 hover:bg-opacity-30 px-4 py-2 rounded-lg transition-colors">
                            Esci
                        </button>
                    </div>
                    <div id="userList" class="flex-1 overflow-y-auto"></div>
                </div>
                
                <div class="flex-1 flex flex-col bg-gray-50">
                    <div id="chatHeader" class="bg-white border-b border-gray-300 p-6 shadow-sm">
                        <p class="text-gray-500 text-center text-lg">👈 Seleziona una chat per iniziare</p>
                    </div>
                    <div id="messagesArea" class="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-gray-50 to-gray-100"></div>
                    <div id="inputArea" class="bg-white border-t border-gray-300 p-4"></div>
                </div>
            </div>
        `;
        renderUserList();
    }
}

function renderUserList() {
    const userList = document.getElementById('userList');
    if (!userList) return;
    
    if (users.length === 0) {
        userList.innerHTML = `
            <div class="p-8 text-center text-gray-500">
                <p class="text-lg mb-2">Nessun utente online</p>
                <p class="text-sm">Apri un'altra finestra per chattare!</p>
            </div>
        `;
        return;
    }
    
    userList.innerHTML = users.map(user => `
        <div 
            onclick="selectChat('${user.id}')" 
            class="p-5 border-b border-gray-200 hover:bg-green-50 cursor-pointer transition-colors ${selectedChat?.id === user.id ? 'bg-green-100' : ''}"
        >
            <div class="flex items-center gap-4">
                <div class="w-14 h-14 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white font-bold text-xl relative">
                    ${user.name.charAt(0).toUpperCase()}
                    ${user.online ? '<div class="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>' : ''}
                </div>
                <div class="flex-1">
                    <p class="font-semibold text-lg text-gray-800">${user.name}</p>
                    <p class="text-sm ${user.online ? 'text-green-600 font-medium' : 'text-gray-500'}">
                        ${user.online ? '🟢 Online' : 'Offline'}
                    </p>
                </div>
            </div>
        </div>
    `).join('');
}

function renderMessages() {
    const messagesArea = document.getElementById('messagesArea');
    if (!messagesArea || !selectedChat) return;
    
    const chatId = [currentUser.id, selectedChat.id].sort().join('_');
    const messages = messagesCache[chatId] || [];
    
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
        return `
            <div class="flex ${isMine ? 'justify-end' : 'justify-start'} mb-4 animate-fade-in">
                <div class="${isMine ? 'bg-green-500 text-white' : 'bg-white text-gray-800'} rounded-2xl p-4 max-w-md shadow-md">
                    <p class="text-base">${msg.text}</p>
                    <p class="text-xs ${isMine ? 'text-green-100' : 'text-gray-500'} mt-2 text-right">
                        ${new Date(msg.timestamp).toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}
                    </p>
                </div>
            </div>
        `;
    }).join('');
    
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function logout() {
    if (confirm('Sei sicuro di voler uscire?')) {
        socket.disconnect();
        window.location.reload();
    }
}

renderApp();
