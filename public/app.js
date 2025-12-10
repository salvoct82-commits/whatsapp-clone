
const socket = io();

let currentUser = null;
let selectedChat = null;
let users = [];
let groups = [];
let privateMessagesCache = [];
let groupMessagesCache = {};
let chatType = 'private';



async function showRegister() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
}

async function showLogin() {
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
}

async function register() {
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const name = document.getElementById('regName').value.trim();
    const errorDiv = document.getElementById('registerError');
    
    errorDiv.textContent = '';
    
    if (!email || !password || !name) {
        errorDiv.textContent = 'Tutti i campi sono obbligatori';
        return;
    }
    
    if (password.length < 6) {
        errorDiv.textContent = 'Password minimo 6 caratteri';
        return;
    }
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('✅ Registrazione completata! Ora puoi accedere.');
            showLogin();
        } else {
            errorDiv.textContent = data.error || 'Errore registrazione';
        }
    } catch (error) {
        errorDiv.textContent = 'Errore di connessione';
        console.error(error);
    }
}

async function login() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    errorDiv.textContent = '';
    
    if (!email || !password) {
        errorDiv.textContent = 'Email e password obbligatori';
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            localStorage.setItem('userId', currentUser.id);
            socket.emit('user-connected', currentUser.id);
            socket.emit('get-my-groups', { userId: currentUser.id });
            renderApp();
        } else {
            errorDiv.textContent = data.error || 'Login fallito';
        }
    } catch (error) {
        errorDiv.textContent = 'Errore di connessione';
        console.error(error);
    }
}

function logout() {
    if (confirm('Sei sicuro di voler uscire?')) {
        localStorage.removeItem('userId');
        socket.disconnect();
        window.location.reload();
    }
}



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
    privateMessagesCache.push(message);
    
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
        privateMessagesCache.push(message);
    }
    renderMessages();
});

socket.on('private-messages-loaded', (data) => {
    privateMessagesCache = data.messages;
    renderMessages();
});

socket.on('group-messages-loaded', (data) => {
    groupMessagesCache[data.groupId] = data.messages;
    renderMessages();
});



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
    document.getElementById('createGroupModal').classList.remove('hidden');
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



function renderApp() {
    const app = document.getElementById('app');
    
    if (!currentUser) {
        app.innerHTML = `
            <div class="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500">
                <!-- Login Form -->
                <div id="loginForm" class="bg-white rounded-2xl shadow-2xl p-10 w-96">
                    <div class="text-center mb-8">
                        <div class="inline-block bg-blue-500 rounded-full p-4 mb-4">
                            <svg class="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                            </svg>
                        </div>
                        <h1 class="text-4xl font-bold text-gray-800 mb-2">Chat Sicura</h1>
                        <p class="text-gray-600">Accedi al tuo account</p>
                    </div>
                    
                    <div id="loginError" class="text-red-500 text-sm mb-4 min-h-[20px]"></div>
                    
                    <input 
                        id="loginEmail" 
                        type="email" 
                        placeholder="Email"
                        class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 mb-4"
                    />
                    <input 
                        id="loginPassword" 
                        type="password" 
                        placeholder="Password"
                        class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 mb-4"
                        onkeypress="if(event.key==='Enter') login()"
                    />
                    <button 
                        onclick="login()" 
                        class="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold text-lg hover:bg-blue-600 transition-colors mb-4"
                    >
                        Accedi
                    </button>
                    <p class="text-center text-gray-600">
                        Non hai un account? 
                        <button onclick="showRegister()" class="text-blue-500 font-semibold hover:underline">
                            Registrati
                        </button>
                    </p>
                </div>
                
                <!-- Register Form -->
                <div id="registerForm" class="hidden bg-white rounded-2xl shadow-2xl p-10 w-96">
                    <div class="text-center mb-8">
                        <div class="inline-block bg-green-500 rounded-full p-4 mb-4">
                            <svg class="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path>
                            </svg>
                        </div>
                        <h1 class="text-4xl font-bold text-gray-800 mb-2">Registrati</h1>
                        <p class="text-gray-600">Crea il tuo account</p>
                    </div>
                    
                    <div id="registerError" class="text-red-500 text-sm mb-4 min-h-[20px]"></div>
                    
                    <input 
                        id="regName" 
                        type="text" 
                        placeholder="Nome completo"
                        class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-green-500 mb-4"
                    />
                    <input 
                        id="regEmail" 
                        type="email" 
                        placeholder="Email"
                        class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-green-500 mb-4"
                    />
                    <input 
                        id="regPassword" 
                        type="password" 
                        placeholder="Password (minimo 6 caratteri)"
                        class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-green-500 mb-4"
                        onkeypress="if(event.key==='Enter') register()"
                    />
                    <button 
                        onclick="register()" 
                        class="w-full bg-green-500 text-white py-3 rounded-lg font-semibold text-lg hover:bg-green-600 transition-colors mb-4"
                    >
                        Registrati
                    </button>
                    <p class="text-center text-gray-600">
                        Hai già un account? 
                        <button onclick="showLogin()" class="text-blue-500 font-semibold hover:underline">
                            Accedi
                        </button>
                    </p>
                </div>
            </div>
        `;
    } else {
        app.innerHTML = `
            <div class="flex h-screen">
                <div class="w-1/3 bg-white border-r border-gray-300 flex flex-col">
                    <div class="bg-gradient-to-r from-blue-500 to-purple-600 p-6 flex items-center justify-between text-white">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-full bg-white bg-opacity-30 flex items-center justify-center font-bold text-xl">
                                ${currentUser.avatar}
                            </div>
                            <div>
                                <h2 class="text-lg font-semibold">${currentUser.name}</h2>
                                <p class="text-xs opacity-80">${currentUser.email}</p>
                            </div>
                        </div>
                        <button onclick="logout()" class="bg-white bg-opacity-20 hover:bg-opacity-30 px-3 py-1 rounded text-sm">
                            Esci
                        </button>
                    </div>
                    
                    <div class="flex border-b border-gray-300">
                        <button onclick="showTab('private')" id="tabPrivate" class="flex-1 py-3 font-semibold text-blue-600 border-b-2 border-blue-600">
                            🔒 Chat
                        </button>
                        <button onclick="showTab('group')" id="tabGroup" class="flex-1 py-3 font-semibold text-gray-500">
                            👥 Gruppi
                        </button>
                    </div>
                    
                    <div id="privateChatsContainer" class="flex-1 overflow-y-auto"></div>
                    <div id="groupChatsContainer" class="flex-1 overflow-y-auto hidden"></div>
                    
                    <div class="p-4 border-t border-gray-300">
                        <button onclick="showCreateGroup()" class="w-full bg-purple-500 text-white py-3 rounded-lg font-semibold hover:bg-purple-600">
                            ➕ Nuovo Gruppo
                        </button>
                    </div>
                </div>
                
                <div class="flex-1 flex flex-col bg-gray-50">
                    <div id="chatHeader" class="bg-white border-b border-gray-300 p-6 shadow-sm">
                        <p class="text-gray-500 text-center">👈 Seleziona una chat</p>
                    </div>
                    <div id="messagesArea" class="flex-1 overflow-y-auto p-6"></div>
                    <div id="inputArea" class="bg-white border-t border-gray-300 p-4"></div>
                </div>
            </div>
            
            <div id="createGroupModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div class="bg-white rounded-2xl p-8 w-96 max-h-[80vh] overflow-y-auto">
                    <h2 class="text-2xl font-bold mb-4">Crea Gruppo</h2>
                    <input 
                        id="groupName" 
                        type="text" 
                        placeholder="Nome gruppo..."
                        class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-purple-500 mb-4"
                    />
                    <p class="font-semibold mb-2">Membri:</p>
                    <div id="availableUsers" class="mb-4"></div>
                    <div class="flex gap-2">
                        <button onclick="createGroup()" class="flex-1 bg-purple-500 text-white py-3 rounded-lg font-semibold hover:bg-purple-600">
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
        tabPrivate.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
        tabPrivate.classList.remove('text-gray-500');
        tabGroup.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
        tabGroup.classList.add('text-gray-500');
    } else {
        privateContainer.classList.add('hidden');
        groupContainer.classList.remove('hidden');
        tabGroup.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
        tabGroup.classList.remove('text-gray-500');
        tabPrivate.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
        tabPrivate.classList.add('text-gray-500');
    }
}


