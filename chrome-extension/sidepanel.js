/**
 * Sidebar Script for Scholarships Plus Extension
 */

// Configuration
const CONFIG = {
  apiBaseUrl: 'http://localhost:3000',
};

// State
let currentScholarship = null;
let currentApplicationId = null;
let currentFieldName = null; // If opened for specific field
let currentFieldLabel = null;

// Initialize sidebar
document.addEventListener('DOMContentLoaded', () => {
  const userInput = document.getElementById('sp-user-input');
  const sendBtn = document.getElementById('sp-send');

  // Send button click
  sendBtn.addEventListener('click', sendMessage);

  // Enter key to send (Shift+Enter for new line)
  userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Notify background that sidebar is ready
  chrome.runtime.sendMessage({ action: 'sidebarReady' });
});

/**
 * Listen for messages from background service worker
 */
chrome.runtime.onMessage.addListener((message) => {
  console.log('Sidebar received message:', message.action);

  switch (message.action) {
    case 'loadScholarship':
      loadScholarshipContext(message.scholarship);
      break;

    case 'switchContext':
      loadScholarshipContext(message.scholarshipId);
      break;

    case 'loadFieldContext':
      loadFieldContext(message);
      break;

    case 'fieldMappingSynced':
      showSyncNotification('✓ Response saved');
      break;

    case 'knowledgeAdded':
      showSyncNotification('✓ Added to knowledge base');
      break;

    case 'agentResponse':
      handleAgentResponse(message);
      break;

    case 'agentError':
      showAgentError(message.error);
      break;

    case 'syncError':
      showSyncError(message.error);
      break;
  }
});

/**
 * Load scholarship context
 */
async function loadScholarshipContext(scholarship) {
  if (typeof scholarship === 'string') {
    // It's an ID, fetch the details
    try {
      const response = await fetch(`${CONFIG.apiBaseUrl}/api/extension/scholarship/${scholarship}`);
      if (!response.ok) throw new Error('Failed to load scholarship');
      currentScholarship = await response.json();
    } catch (error) {
      console.error('Error loading scholarship:', error);
      addChatMessage('system', 'Failed to load scholarship details. Please refresh the page.');
      return;
    }
  } else {
    currentScholarship = scholarship;
  }

  document.getElementById('sp-scholarship-name').textContent = currentScholarship.title;
  currentFieldName = null;
  currentFieldLabel = null;

  // Load chat history for this scholarship
  loadChatHistory(currentScholarship.id);
}

/**
 * Load context for a specific field
 */
async function loadFieldContext(message) {
  currentFieldName = message.fieldName;
  currentFieldLabel = message.fieldLabel;

  // Add system message indicating field context
  addChatMessage('system', `Working on: ${message.fieldLabel}`);

  // Prefill input with helpful prompt
  const userInput = document.getElementById('sp-user-input');
  userInput.placeholder = `Ask about "${message.fieldLabel}"...`;
  userInput.focus();
}

/**
 * Load chat history from server
 */
async function loadChatHistory(scholarshipId) {
  const container = document.getElementById('sp-chat-container');

  // TODO: Implement chat history loading from API
  // For now, show welcome message
  container.innerHTML = '<p class="sp-empty">Chat with the assistant to refine your responses or add details you may have forgotten about your experiences.</p>';
}

/**
 * Send message to agent
 */
async function sendMessage() {
  const input = document.getElementById('sp-user-input');
  const message = input.value.trim();

  if (!message) return;

  // Add user message to chat
  addChatMessage('user', message);

  // Clear input
  input.value = '';
  input.placeholder = "Ask about this application or refine responses...";

  // Show typing indicator
  showTypingIndicator();

  // Send to background service worker (will add context and call API)
  chrome.runtime.sendMessage({
    action: 'sendAgentMessage',
    content: message,
    fieldName: currentFieldName,
    fieldLabel: currentFieldLabel,
  });
}

/**
 * Handle agent response
 */
function handleAgentResponse(message) {
  hideTypingIndicator();

  // Add agent message to chat
  addChatMessage('agent', message.response);

  // Scroll to bottom
  scrollToBottom();
}

/**
 * Add chat message to container
 */
function addChatMessage(role, content) {
  const container = document.getElementById('sp-chat-container');

  // Remove empty message if present
  const emptyMsg = container.querySelector('.sp-empty');
  if (emptyMsg) {
    emptyMsg.remove();
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `sp-chat-message sp-chat-${role}`;
  messageDiv.textContent = content;
  container.appendChild(messageDiv);

  scrollToBottom();
}

/**
 * Show typing indicator
 */
function showTypingIndicator() {
  const container = document.getElementById('sp-chat-container');

  const typingDiv = document.createElement('div');
  typingDiv.id = 'sp-typing-indicator';
  typingDiv.className = 'sp-chat-message sp-chat-agent';
  typingDiv.innerHTML = '<span class="sp-typing">Assistant is typing...</span>';
  container.appendChild(typingDiv);

  scrollToBottom();
}

/**
 * Hide typing indicator
 */
function hideTypingIndicator() {
  const typingIndicator = document.getElementById('sp-typing-indicator');
  if (typingIndicator) {
    typingIndicator.remove();
  }
}

/**
 * Show sync notification
 */
function showSyncNotification(message) {
  const syncStatus = document.getElementById('sp-sync-status');
  syncStatus.textContent = message;

  setTimeout(() => {
    syncStatus.textContent = '';
  }, 2000);
}

/**
 * Show agent error
 */
function showAgentError(error) {
  hideTypingIndicator();
  addChatMessage('error', `Error: ${error}`);
  scrollToBottom();
}

/**
 * Show sync error
 */
function showSyncError(error) {
  showSyncNotification('⚠ Sync failed');
  addChatMessage('error', `Sync failed: ${error}`);
}

/**
 * Scroll chat to bottom
 */
function scrollToBottom() {
  const container = document.getElementById('sp-chat-container');
  container.scrollTop = container.scrollHeight;
}

console.log('Scholarships Plus sidebar initialized');
