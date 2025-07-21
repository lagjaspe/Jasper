// Global state
let isApiConfigured = false;
let chatHistory = [];

// DOM Elements
const configModal = document.getElementById('configModal');
const apiKeyInput = document.getElementById('apiKeyInput');
const configureBtn = document.getElementById('configureBtn');
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const languageSelect = document.getElementById('languageSelect');
const projectTypeSelect = document.getElementById('projectTypeSelect');
const codePromptInput = document.getElementById('codePromptInput');
const generateCodeBtn = document.getElementById('generateCodeBtn');
const filesContainer = document.getElementById('filesContainer');
const refreshFilesBtn = document.getElementById('refreshFilesBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const toastContainer = document.getElementById('toastContainer');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Show config modal on startup
    showConfigModal();
    
    // Event listeners
    configureBtn.addEventListener('click', configureApi);
    sendBtn.addEventListener('click', sendMessage);
    clearChatBtn.addEventListener('click', clearChat);
    generateCodeBtn.addEventListener('click', generateCode);
    refreshFilesBtn.addEventListener('click', loadFiles);
    
    // Enter key handlers
    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    apiKeyInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            configureApi();
        }
    });
    
    codePromptInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            generateCode();
        }
    });
    
    // Load files on startup
    loadFiles();
});

// API Configuration
function showConfigModal() {
    configModal.style.display = 'flex';
}

function hideConfigModal() {
    configModal.style.display = 'none';
}

async function configureApi() {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
        showToast('Please enter your API key', 'error');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch('/api/configure', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ api_key: apiKey })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            isApiConfigured = true;
            hideConfigModal();
            showToast('API configured successfully!', 'success');
            updateWelcomeMessage();
        } else {
            showToast(data.error || 'Failed to configure API', 'error');
        }
    } catch (error) {
        showToast('Network error: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Chat functionality
function updateWelcomeMessage() {
    if (isApiConfigured) {
        chatContainer.innerHTML = `
            <div class="welcome-message">
                <i class="fas fa-check-circle"></i>
                <h3>API Configured Successfully!</h3>
                <p>You can now chat with Gemini or generate code files.</p>
            </div>
        `;
    }
}

async function sendMessage() {
    const message = messageInput.value.trim();
    
    if (!message) {
        showToast('Please enter a message', 'error');
        return;
    }
    
    if (!isApiConfigured) {
        showToast('Please configure your API key first', 'error');
        showConfigModal();
        return;
    }
    
    // Add user message to chat
    addMessageToChat(message, 'user');
    messageInput.value = '';
    
    showLoading();
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: message })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            addMessageToChat(data.response, 'assistant');
        } else {
            showToast(data.error || 'Failed to send message', 'error');
        }
    } catch (error) {
        showToast('Network error: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function addMessageToChat(message, sender) {
    // Remove welcome message if it exists
    const welcomeMessage = chatContainer.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;
    
    const timestamp = new Date().toLocaleTimeString();
    
    messageDiv.innerHTML = `
        <div class="message-content">${formatMessage(message)}</div>
        <div class="timestamp">${timestamp}</div>
    `;
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // Store in history
    chatHistory.push({ message, sender, timestamp });
}

function formatMessage(message) {
    // Basic formatting for code blocks
    return message
        .replace(/```([\\s\\S]*?)```/g, '<pre><code>$1</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\\n/g, '<br>');
}

function clearChat() {
    chatContainer.innerHTML = `
        <div class="welcome-message">
            <i class="fas fa-comments"></i>
            <h3>Chat Cleared</h3>
            <p>Start a new conversation with Gemini!</p>
        </div>
    `;
    chatHistory = [];
}

// Code generation
async function generateCode() {
    const prompt = codePromptInput.value.trim();
    const language = languageSelect.value;
    const projectType = projectTypeSelect.value;
    
    if (!prompt) {
        showToast('Please enter a code request', 'error');
        return;
    }
    
    if (!isApiConfigured) {
        showToast('Please configure your API key first', 'error');
        showConfigModal();
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch('/api/generate-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: prompt,
                language: language,
                project_type: projectType
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Code generated successfully!', 'success');
            codePromptInput.value = '';
            
            // Add to chat
            addMessageToChat(`Generated ${language} code for: ${prompt}`, 'assistant');
            
            // Refresh files list
            loadFiles();
        } else {
            showToast(data.error || 'Failed to generate code', 'error');
        }
    } catch (error) {
        showToast('Network error: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// File management
async function loadFiles() {
    try {
        const response = await fetch('/api/files');
        const data = await response.json();
        
        if (response.ok) {
            displayFiles(data.files);
        } else {
            showToast(data.error || 'Failed to load files', 'error');
        }
    } catch (error) {
        showToast('Network error: ' + error.message, 'error');
    }
}

function displayFiles(files) {
    if (files.length === 0) {
        filesContainer.innerHTML = `
            <div class="no-files-message">
                <i class="fas fa-file-code"></i>
                <p>No files generated yet. Start by generating some code!</p>
            </div>
        `;
        return;
    }
    
    filesContainer.innerHTML = files.map(file => `
        <div class="file-card">
            <div class="file-header">
                <div class="file-name">
                    <i class="fas fa-file-${getFileIcon(file.filename)}"></i>
                    ${file.filename}
                </div>
                <div class="file-type">${file.type}</div>
            </div>
            <div class="file-info">
                <p><i class="fas fa-clock"></i> ${formatDate(file.created_at)}</p>
            </div>
            <div class="file-actions">
                <button class="btn" onclick="downloadFile('${file.id}', '${file.filename}')">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
        </div>
    `).join('');
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        'py': 'code',
        'js': 'code',
        'html': 'code',
        'css': 'code',
        'java': 'code',
        'cpp': 'code',
        'zip': 'archive',
        'txt': 'alt'
    };
    return iconMap[ext] || 'code';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString();
}

async function downloadFile(fileId, filename) {
    try {
        showLoading();
        
        const response = await fetch(`/api/download/${fileId}`);
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showToast('File downloaded successfully!', 'success');
        } else {
            const data = await response.json();
            showToast(data.error || 'Failed to download file', 'error');
        }
    } catch (error) {
        showToast('Network error: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Utility functions
function showLoading() {
    loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    loadingOverlay.style.display = 'none';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const iconMap = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'info': 'info-circle'
    };
    
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas fa-${iconMap[type]}"></i>
            <span>${message}</span>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 5000);
    
    // Click to dismiss
    toast.addEventListener('click', () => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    });
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + Enter to send message
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (document.activeElement === messageInput) {
            sendMessage();
        } else if (document.activeElement === codePromptInput) {
            generateCode();
        }
    }
    
    // Escape to close modal
    if (e.key === 'Escape') {
        if (configModal.style.display === 'flex') {
            // Don't close if API not configured
            if (isApiConfigured) {
                hideConfigModal();
            }
        }
    }
});

// Handle window resize for responsive design
window.addEventListener('resize', function() {
    // Adjust chat container height on mobile
    if (window.innerWidth <= 768) {
        chatContainer.style.height = '300px';
    } else {
        chatContainer.style.height = '400px';
    }
});

