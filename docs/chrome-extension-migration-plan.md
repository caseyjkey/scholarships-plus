# Chrome Extension Migration Plan

## Executive Summary

Migrating from browser-use automated scraping to a Chrome Extension-based approach for:
- **Faster indexing** (direct DOM access vs LLM navigation)
- **Better authentication** (user's actual browser session)
- **Interactive field mapping** (user approves responses during agent chat)

**Scope:** Keep browser-use for discovery, use extension for scraping/indexing.

---

## 1. Chrome Extension Architecture

### 1.1 Extension Components

#### Manifest (manifest.json)
```json
{
  "manifest_version": 3,
  "name": "Scholarships Plus Assistant",
  "version": "1.0.0",
  "description": "Index scholarship applications and auto-fill with AI-approved responses",
  "permissions": [
    "activeTab",
    "storage",
    "cookies",
    "sidepanel",
    "tabs"
  ],
  "host_permissions": [
    "https://app.smarterselect.com/*",
    "https://webportalapp.com/*",
    "https://www.nativeforward.org/*",
    "http://localhost:*/*"  // Development
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://app.smarterselect.com/*", "https://webportalapp.com/*"],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

#### Content Script (content.js)
**Purpose:** Inject sparkle icons and detect form fields on known application portals

```javascript
// Detect if we're on a known application portal
function detectPortal() {
  const url = window.location.href;
  if (url.includes('smarterselect.com')) return 'smarterselect';
  if (url.includes('webportalapp.com')) return 'oasis';
  return null;
}

// Find all form inputs
function findFormFields() {
  const inputs = document.querySelectorAll('input, textarea, select');
  return Array.from(inputs).map((input, index) => ({
    id: `field_${index}`,
    element: input,
    label: findLabel(input),
    name: input.name,
    type: input.type,
    required: input.required,
    value: input.value
  }));
}

// Add sparkle icon to each field
function addSparkleIcon(field) {
  const icon = document.createElement('span');
  icon.className = 'sparkle-icon';
  icon.innerHTML = '✨';
  icon.dataset.fieldId = field.id;
  icon.onclick = (e) => {
    e.preventDefault();
    openInWebApp(field);
  };

  // Position after the input
  field.element.parentNode.insertBefore(icon, field.element.nextSibling);
}

// Check if scholarship is known to our system
async function checkScholarshipKnown() {
  const response = await fetch('https://your-app.com/api/extension/check-scholarship', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: window.location.href,
      portal: detectPortal()
    })
  });
  return response.json();
}

// Send cookies to API for session validation
async function sendCookies() {
  const cookies = await chrome.cookies.getAll({ url: window.location.href });
  await fetch('https://your-app.com/api/extension/sync-cookies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: window.location.href,
      portal: detectPortal(),
      cookies: cookies
    })
  });
}

// Initialize on page load
async function init() {
  const portal = detectPortal();
  if (!portal) return;

  // Check if this scholarship is known
  const known = await checkScholarshipKnown();

  if (known.known) {
    // Add sparkle icons to all fields
    const fields = findFormFields();
    fields.forEach(addSparkleIcon);

    // Send cookies for status check
    await sendCookies();

    // Show dropdown indicator or open sidebar
    showStatusIndicator(known);
  }
}

// Status indicator in corner of page
function showStatusIndicator(scholarship) {
  const indicator = document.createElement('div');
  indicator.className = 'sp-status-indicator';
  indicator.innerHTML = `
    <span>✨ Scholarships Plus</span>
    <button id="sp-open">Open in App</button>
  `;
  document.body.appendChild(indicator);

  document.getElementById('sp-open').onclick = () => {
    chrome.runtime.sendMessage({
      action: 'openInApp',
      scholarshipId: scholarship.id
    });
  };
}

init();
```

#### Background Service Worker (background.js)
**Purpose:** Handle multi-tab scholarship context, real-time sync, knowledge base updates

```javascript
// Track scholarship context per tab
const tabContext = new Map(); // tabId -> { scholarshipId, applicationId, fieldMappings, lastSynced }

// Track which scholarship is currently displayed in sidebar
let currentSidebarTabId = null;

// Handle messages from content script and sidebar
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.action === 'registerScholarship') {
    // Content script detected a scholarship page
    registerScholarship(tabId, message.scholarship);
  }
  if (message.action === 'openInApp') {
    openScholarshipInApp(message.scholarshipId);
  }
  if (message.action === 'updateFieldMapping') {
    // Real-time sync: immediately save field mapping to database
    syncFieldMapping(message.mapping);
  }
  if (message.action === 'addToKnowledgeBase') {
    // User approved adding content to global knowledge
    addToKnowledgeBase(message.knowledge);
  }
  if (message.action === 'sidebarReady') {
    // Sidebar opened, load current tab's context
    loadSidebarContext(tabId);
  }
  if (message.action === 'sendAgentMessage') {
    // Send message to agent API
    sendAgentMessage(message);
  }
});

// Register scholarship for a tab
async function registerScholarship(tabId, scholarship) {
  tabContext.set(tabId, {
    scholarshipId: scholarship.id,
    applicationId: scholarship.applicationId,
    fieldMappings: [],
    lastSynced: null,
  });

  // If sidebar is open and showing this tab, update it
  if (currentSidebarTabId === tabId) {
    chrome.runtime.sendMessage({
      action: 'loadScholarship',
      scholarship: scholarship,
    });
  }

  // Send initial cookie sync
  await syncCookies(tabId);
}

// Handle tab activation - update sidebar context
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  currentSidebarTabId = activeInfo.tabId;

  const context = tabContext.get(currentSidebarTabId);
  if (context) {
    // Reload sidebar with this tab's scholarship context
    await chrome.sidePanel.setOptions({ tabId: currentSidebarTabId });
    chrome.runtime.sendMessage({
      action: 'switchContext',
      scholarshipId: context.scholarshipId,
    });
  }
});

// Handle tab removal - clean up context
chrome.tabs.onRemoved.addListener((tabId) => {
  tabContext.delete(tabId);
  if (currentSidebarTabId === tabId) {
    currentSidebarTabId = null;
  }
});

// Real-time sync: Save field mapping immediately
async function syncFieldMapping(mapping) {
  try {
    const response = await fetch('http://localhost:3000/api/extension/field-mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mapping),
    });

    if (response.ok) {
      const result = await response.json();

      // Update local context
      const context = tabContext.get(currentSidebarTabId);
      if (context) {
        const existingIndex = context.fieldMappings.findIndex(
          m => m.fieldName === mapping.fieldName
        );
        if (existingIndex >= 0) {
          context.fieldMappings[existingIndex] = result;
        } else {
          context.fieldMappings.push(result);
        }
        context.lastSynced = new Date().toISOString();
      }

      // Notify sidebar of successful sync
      chrome.runtime.sendMessage({
        action: 'fieldMappingSynced',
        mapping: result,
      });
    }
  } catch (error) {
    console.error('Failed to sync field mapping:', error);
    chrome.runtime.sendMessage({
      action: 'syncError',
      error: error.message,
    });
  }
}

// Add to global knowledge base
async function addToKnowledgeBase(knowledge) {
  try {
    const response = await fetch('http://localhost:3000/api/extension/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(knowledge),
    });

    if (response.ok) {
      const result = await response.json();

      // Notify sidebar of successful knowledge addition
      chrome.runtime.sendMessage({
        action: 'knowledgeAdded',
        knowledge: result,
      });
    }
  } catch (error) {
    console.error('Failed to add to knowledge base:', error);
  }
}

// Send agent message with full context
async function sendAgentMessage(message) {
  const context = tabContext.get(currentSidebarTabId);
  if (!context) return;

  try {
    const response = await fetch('http://localhost:3000/api/extension/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scholarshipId: context.scholarshipId,
        applicationId: context.applicationId,
        message: message.content,
        fieldMappings: context.fieldMappings,
        // Agent will use semantic search on GlobalKnowledge
        // and ApplicationContext for this specific application
      }),
    });

    const data = await response.json();

    // Send response back to sidebar
    chrome.runtime.sendMessage({
      action: 'agentResponse',
      response: data.response,
      fieldMappings: data.fieldMappings,
      suggestedKnowledge: data.suggestedKnowledge, // From semantic search
    });
  } catch (error) {
    console.error('Agent error:', error);
    chrome.runtime.sendMessage({
      action: 'agentError',
      error: error.message,
    });
  }
}

// Sync cookies for status tracking
async function syncCookies(tabId) {
  const context = tabContext.get(tabId);
  if (!context) return;

  try {
    const tab = await chrome.tabs.get(tabId);
    const cookies = await chrome.cookies.getAll({ url: tab.url });

    await fetch('http://localhost:3000/api/extension/sync-cookies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scholarshipId: context.scholarshipId,
        cookies: cookies,
      }),
    });
  } catch (error) {
    console.error('Failed to sync cookies:', error);
  }
}

// Periodic cookie sync (every 5 minutes) for status updates
chrome.alarms.create('syncCookies', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncCookies') {
    for (const [tabId, context] of tabContext.entries()) {
      await syncCookies(tabId);
    }
  }
});

// Open scholarship in web app
async function openScholarshipInApp(scholarshipId) {
  const url = `http://localhost:3000/applications/${scholarshipId}`;
  await chrome.tabs.create({ url });
}
```

#### Sidebar (sidepanel.html + sidepanel.js)
**Purpose:** Display agent chat with application context, knowledge suggestions, field mapping approval

```html
<!-- sidepanel.html -->
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="sidepanel.css">
</head>
<body>
  <div class="sp-container">
    <div class="sp-header">
      <h2>✨ Scholarship Assistant</h2>
      <div class="sp-scholarship-info">
        <span id="sp-scholarship-name">Loading...</span>
        <span id="sp-sync-status" class="sp-sync-status"></span>
      </div>
    </div>

    <!-- Field Mappings Section -->
    <div class="sp-section">
      <h3>Field Mappings</h3>
      <div id="sp-field-mappings" class="sp-field-mappings">
        <!-- Mapped fields appear here -->
      </div>
    </div>

    <!-- Knowledge Suggestions -->
    <div class="sp-section">
      <h3>Relevant Knowledge</h3>
      <div id="sp-knowledge-suggestions" class="sp-knowledge-suggestions">
        <!-- Suggested knowledge from semantic search appears here -->
      </div>
    </div>

    <!-- Chat Section -->
    <div class="sp-section sp-chat-section">
      <h3>Agent Chat</h3>
      <div id="sp-chat-container" class="sp-chat-container">
        <!-- Chat messages -->
      </div>
      <div class="sp-input-area">
        <textarea id="sp-user-input" placeholder="Ask about this application or refine responses..."></textarea>
        <button id="sp-send">Send</button>
      </div>
    </div>
  </div>

  <script src="sidepanel.js"></script>
</body>
</html>
```

```javascript
// sidepanel.js
let currentScholarship = null;
let currentApplicationId = null;
let fieldMappings = [];
let suggestedKnowledge = [];

// Initialize sidebar
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'loadScholarship') {
    loadScholarshipContext(message.scholarship);
  }
  if (message.action === 'switchContext') {
    // User switched to a different tab
    loadScholarshipContext(message.scholarshipId);
  }
  if (message.action === 'fieldMappingSynced') {
    // Real-time sync: field mapping was saved
    handleFieldMappingSynced(message.mapping);
  }
  if (message.action === 'knowledgeAdded') {
    // Knowledge was added to global base
    handleKnowledgeAdded(message.knowledge);
  }
  if (message.action === 'agentResponse') {
    // Agent responded with suggestions
    handleAgentResponse(message);
  }
  if (message.action === 'syncError') {
    showSyncError(message.error);
  }
});

// Load scholarship context when sidebar opens or switches tabs
async function loadScholarshipContext(scholarship) {
  if (typeof scholarship === 'string') {
    // It's an ID, fetch the details
    const response = await fetch(`http://localhost:3000/api/extension/scholarship/${scholarship}`);
    currentScholarship = await response.json();
  } else {
    currentScholarship = scholarship;
  }

  document.getElementById('sp-scholarship-name').textContent = currentScholarship.title;

  // Load field mappings for this scholarship
  const mappingsResponse = await fetch(`http://localhost:3000/api/extension/field-mappings/${currentScholarship.id}`);
  const data = await mappingsResponse.json();
  fieldMappings = data.mappings || [];
  currentApplicationId = data.applicationId;

  renderFieldMappings();

  // Load chat history for this scholarship
  loadChatHistory(currentScholarship.id);
}

// Render field mappings with approve/edit controls
function renderFieldMappings() {
  const container = document.getElementById('sp-field-mappings');

  if (fieldMappings.length === 0) {
    container.innerHTML = '<p class="sp-empty">No fields mapped yet. Ask the agent to help!</p>';
    return;
  }

  container.innerHTML = fieldMappings.map(mapping => `
    <div class="sp-field-mapping" data-field-id="${mapping.id}">
      <div class="sp-field-label">${mapping.fieldLabel}</div>
      <div class="sp-field-value">
        <span class="sp-value-text">${mapping.approvedValue || 'Not set'}</span>
        <button class="sp-edit-btn" onclick="editField('${mapping.id}')">Edit</button>
      </div>
      <div class="sp-field-actions">
        <button class="sp-approve-btn" onclick="approveField('${mapping.id}')">✓ Approve</button>
        ${mapping.source === 'agent' ? '<button class="sp-add-kb-btn" onclick="addToKnowledge(\'' + mapping.id + '\')">+ Add to Knowledge</button>' : ''}
      </div>
    </div>
  `).join('');
}

// Render knowledge suggestions from semantic search
function renderKnowledgeSuggestions(suggestions) {
  const container = document.getElementById('sp-knowledge-suggestions');

  if (!suggestions || suggestions.length === 0) {
    container.innerHTML = '<p class="sp-empty">No relevant knowledge found.</p>';
    return;
  }

  suggestedKnowledge = suggestions;

  container.innerHTML = suggestions.map(kb => `
    <div class="sp-knowledge-item" data-kb-id="${kb.id}">
      <div class="sp-kb-type">${kb.type} - ${kb.category || 'General'}</div>
      <div class="sp-kb-title">${kb.title}</div>
      <div class="sp-kb-content">${kb.content}</div>
      <div class="sp-kb-meta">
        <span class="sp-similarity">Similarity: ${Math.round(kb.similarity * 100)}%</span>
        <span class="sp-verified">${kb.verified ? '✓ Verified' : 'Unverified'}</span>
      </div>
      <button class="sp-use-kb-btn" onclick="useKnowledge('${kb.id}')">Use for Response</button>
    </div>
  `).join('');
}

// Handle real-time field mapping sync
function handleFieldMappingSynced(mapping) {
  // Update local state
  const existingIndex = fieldMappings.findIndex(m => m.id === mapping.id);
  if (existingIndex >= 0) {
    fieldMappings[existingIndex] = mapping;
  } else {
    fieldMappings.push(mapping);
  }

  // Re-render
  renderFieldMappings();

  // Show sync indicator
  showSyncStatus('✓ Synced');
  setTimeout(() => showSyncStatus(''), 2000);
}

// Handle agent response with knowledge suggestions
function handleAgentResponse(message) {
  // Add agent message to chat
  addChatMessage('agent', message.response);

  // Update field mappings if agent provided new ones
  if (message.fieldMappings) {
    message.fieldMappings.forEach(mapping => {
      // Real-time sync: immediately save each mapping
      chrome.runtime.sendMessage({
        action: 'updateFieldMapping',
        mapping: mapping,
      });
    });
  }

  // Show knowledge suggestions from semantic search
  if (message.suggestedKnowledge) {
    renderKnowledgeSuggestions(message.suggestedKnowledge);
  }
}

// Approve a field mapping (marks it as ready for auto-fill)
function approveField(mappingId) {
  const mapping = fieldMappings.find(m => m.id === mappingId);
  if (mapping) {
    mapping.approved = true;
    mapping.approvedAt = new Date().toISOString();

    // Real-time sync
    chrome.runtime.sendMessage({
      action: 'updateFieldMapping',
      mapping: mapping,
    });

    renderFieldMappings();
  }
}

// Add field content to global knowledge base
function addToKnowledge(mappingId) {
  const mapping = fieldMappings.find(m => m.id === mappingId);
  if (!mapping || !mapping.approvedValue) return;

  // Ask user for knowledge type and category
  const type = prompt('Knowledge type (experience/skill/achievement/value/goal):', 'experience');
  const category = prompt('Category (leadership/community_service/academic/etc):', 'general');

  if (!type) return;

  chrome.runtime.sendMessage({
    action: 'addToKnowledgeBase',
    knowledge: {
      type: type,
      category: category,
      title: mapping.fieldLabel,
      content: mapping.approvedValue,
      confidence: 0.8,
      source: 'extension',
      sourceApplication: currentScholarship.id,
    },
  });
}

// Use knowledge item for current field
function useKnowledge(knowledgeId) {
  const kb = suggestedKnowledge.find(k => k.id === knowledgeId);
  if (!kb) return;

  // Add to chat as context
  addChatMessage('system', `Using knowledge: ${kb.title}`);

  // Ask agent to refine based on this knowledge
  chrome.runtime.sendMessage({
    action: 'sendAgentMessage',
    content: `I want to use this knowledge for my response: "${kb.title}" - ${kb.content}. Please help me adapt it for this scholarship application.`,
  });
}

// Send message to agent
document.getElementById('sp-send').addEventListener('click', sendMessage);
document.getElementById('sp-user-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

function sendMessage() {
  const input = document.getElementById('sp-user-input');
  const message = input.value.trim();
  if (!message) return;

  // Add user message to chat
  addChatMessage('user', message);

  // Clear input
  input.value = '';

  // Send to background service worker (will add context and call API)
  chrome.runtime.sendMessage({
    action: 'sendAgentMessage',
    content: message,
  });
}

function addChatMessage(role, content) {
  const container = document.getElementById('sp-chat-container');
  const messageDiv = document.createElement('div');
  messageDiv.className = `sp-chat-message sp-chat-${role}`;
  messageDiv.textContent = content;
  container.appendChild(messageDiv);
  container.scrollTop = container.scrollHeight;
}

function showSyncStatus(status) {
  document.getElementById('sp-sync-status').textContent = status;
}

function showSyncError(error) {
  showSyncStatus('⚠ Sync Error');
  addChatMessage('error', `Sync failed: ${error}`);
}

// Load chat history from server
async function loadChatHistory(scholarshipId) {
  // TODO: Implement chat history loading
  const container = document.getElementById('sp-chat-container');
  container.innerHTML = '<p class="sp-empty">Chat with the agent to get started!</p>';
}

// Notify background that sidebar is ready
chrome.runtime.sendMessage({ action: 'sidebarReady' });
```

---

## 2. Scholarship Management Page Updates

### 2.1 New UI Design

**Current:** Shows "Discover" and "Scrape All" buttons

**New:** Table of discovered scholarships with indexing status

```tsx
// app/routes/settings._index.tsx (Scholarship Management section)
<div className="space-y-4">
  {/* Discovery Section */}
  <div className="p-4 bg-gray-50 rounded-lg">
    <h3 className="font-medium mb-2">Discover Scholarships</h3>
    <p className="text-sm text-gray-600 mb-3">
      Use browser-use to discover scholarships from Native Forward
    </p>
    <button onClick={handleDiscover} className="px-4 py-2 bg-blue-600 text-white rounded">
      Discover Scholarships
    </button>
  </div>

  {/* Scholarships Table */}
  <div className="border rounded-lg overflow-hidden">
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
            Scholarship
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
            Portal
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
            Indexed Status
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
            Last Updated
          </th>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
            Actions
          </th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {scholarships.map((scholarship) => (
          <tr key={scholarship.id}>
            <td className="px-4 py-4">
              <div className="font-medium text-gray-900">{scholarship.title}</div>
              <a href={scholarship.sourceUrl} target="_blank" rel="noopener noreferrer"
                 className="text-sm text-blue-600 hover:text-blue-800">
                View on {scholarship.portal}
              </a>
            </td>
            <td className="px-4 py-4 text-sm text-gray-600">
              {scholarship.portal}
            </td>
            <td className="px-4 py-4">
              <IndexingStatusBadge status={scholarship.indexStatus} />
            </td>
            <td className="px-4 py-4 text-sm text-gray-600">
              {scholarship.indexedAt
                ? new Date(scholarship.indexedAt).toLocaleDateString()
                : 'Never'
              }
            </td>
            <td className="px-4 py-4 text-sm">
              <button
                onClick={() => openForIndexing(scholarship)}
                className="text-blue-600 hover:text-blue-900 mr-3"
              >
                ✨ Index with Extension
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
```

### 2.2 Indexing Status Badge Component

```tsx
function IndexingStatusBadge({ status }: { status: string }) {
  const styles = {
    not_indexed: "bg-gray-100 text-gray-800",
    in_progress: "bg-yellow-100 text-yellow-800",
    indexed: "bg-green-100 text-green-800",
    needs_update: "bg-orange-100 text-orange-800",
  };

  const labels = {
    not_indexed: "Not Indexed",
    in_progress: "In Progress",
    indexed: "✨ Indexed",
    needs_update: "Needs Update",
  };

  return (
    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${styles[status] || styles.not_indexed}`}>
      {labels[status] || status}
    </span>
  );
}
```

### 2.3 Open for Indexing Function

```typescript
async function openForIndexing(scholarship: ScrapedScholarship) {
  // Generate unique tracking ID for this indexing session
  const sessionId = crypto.randomUUID();

  // Create indexing session in database
  await prisma.indexingSession.create({
    data: {
      scholarshipId: scholarship.id,
      userId,
      status: 'pending',
      startedAt: new Date(),
    }
  });

  // Open the scholarship URL in new tab with session ID
  const url = `${scholarship.applicationUrl}?sp_session=${sessionId}`;
  window.open(url, '_blank');

  // Poll for session status (extension will update when opened)
  const interval = setInterval(async () => {
    const session = await prisma.indexingSession.findUnique({
      where: { id: sessionId },
    });

    if (session?.status === 'active') {
      clearInterval(interval);
      // Redirect to application page with sidebar/agent chat
      window.location.href = `/applications/${scholarship.id}?session=${sessionId}`;
    }
  }, 2000);
}
```

---

## 3. API Endpoints

### 3.1 Extension Endpoints

```typescript
// app/routes/api.extension.ts

/**
 * GET /api/extension/check-scholarship
 * Check if a URL matches a known scholarship
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const applicationUrl = url.searchParams.get('url');
  const portal = url.searchParams.get('portal');

  // Find matching scholarship
  const scholarship = await prisma.scrapedScholarship.findFirst({
    where: {
      applicationUrl,
      portal,
      userId,
    },
  });

  if (!scholarship) {
    return json({ known: false });
  }

  // Get field mappings for this scholarship
  const fieldMappings = await prisma.fieldMapping.findMany({
    where: { scholarshipId: scholarship.id },
  });

  return json({
    known: true,
    scholarship: {
      id: scholarship.id,
      title: scholarship.title,
      portal: scholarship.portal,
    },
    fieldMappings,
  });
};

/**
 * POST /api/extension/sync-cookies
 * Receive cookies from extension for status checking
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const userId = await requireUserId(request);
  const body = await request.json();
  const { url, portal, cookies } = body;

  // Update portal session
  await prisma.portalSession.upsert({
    where: {
      userId_portal: {
        userId,
        portal,
      }
    },
    update: {
      cookies: JSON.stringify(cookies),
      lastValid: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
    create: {
      userId,
      portal,
      cookies: JSON.stringify(cookies),
      lastValid: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }
  });

  // Check scholarship status
  const scholarship = await prisma.scrapedScholarship.findFirst({
    where: { applicationUrl: url }
  });

  if (scholarship) {
    // Check deadline, submission status, referral status
    const status = await checkScholarshipStatus(scholarship, cookies);

    return json({
      success: true,
      status: {
        deadline: scholarship.deadline,
        submissionStatus: status.submissionStatus,
        referralStatus: status.referralStatus,
      }
    });
  }

  return json({ success: true });
};

/**
 * POST /api/extension/index
 * Receive indexed data from extension
 */
export const indexAction = async ({ request }: ActionFunctionArgs) => {
  const userId = await requireUserId(request);
  const body = await request.json();
  const { scholarshipId, fieldMappings, formData } = body;

  // Save field mappings
  for (const mapping of fieldMappings) {
    await prisma.fieldMapping.upsert({
      where: {
        scholarshipId_fieldName: {
          scholarshipId,
          fieldName: mapping.fieldName,
        }
      },
      update: {
        fieldLabel: mapping.fieldLabel,
        fieldType: mapping.fieldType,
        approvedValue: mapping.approvedValue,
        options: mapping.options,
      },
      create: {
        scholarshipId,
        fieldName: mapping.fieldName,
        fieldLabel: mapping.fieldLabel,
        fieldType: mapping.fieldType,
        approvedValue: mapping.approvedValue,
        options: mapping.options,
      }
    });
  }

  // Update scholarship as indexed
  await prisma.scrapedScholarship.update({
    where: { id: scholarshipId },
    data: {
      indexStatus: 'indexed',
      indexedAt: new Date(),
      formData: formData,
    }
  });

  return json({ success: true });
};

/**
 * POST /api/extension/field-mappings/:scholarshipId
 * Get field mappings for a scholarship
 */
export async function getFieldMappings({ params }: LoaderFunctionArgs) {
  const scholarshipId = params.scholarshipId;

  const mappings = await prisma.fieldMapping.findMany({
    where: { scholarshipId },
  });

  return json({ mappings });
}

/**
 * POST /api/extension/field-mapping
 * Real-time sync: Save or update a single field mapping
 */
export async function saveFieldMapping({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const body = await request.json();
  const { scholarshipId, fieldName, fieldLabel, fieldType, approvedValue, options, approved } = body;

  const mapping = await prisma.fieldMapping.upsert({
    where: {
      scholarshipId_fieldName: {
        scholarshipId,
        fieldName,
      }
    },
    update: {
      fieldLabel,
      fieldType,
      approvedValue,
      options,
      approved: approved ?? false,
      updatedAt: new Date(),
    },
    create: {
      scholarshipId,
      fieldName,
      fieldLabel,
      fieldType,
      approvedValue,
      options,
      approved: approved ?? false,
    }
  });

  return json({ mapping });
}

/**
 * POST /api/extension/knowledge
 * Add content to global knowledge base
 */
export async function addToKnowledge({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const body = await request.json();
  const { type, category, title, content, confidence = 0.8, source, sourceApplication } = body;

  // Generate embedding
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: `${title}: ${content}`,
  });
  const embedding = embeddingResponse.data[0].embedding;

  const knowledge = await prisma.globalKnowledge.create({
    data: {
      userId,
      type,
      category,
      title,
      content,
      confidence,
      source: source || 'extension',
      sourceEssay: sourceApplication,
      verified: false,  // User should verify in interview
      embedding: JSON.stringify(embedding),
    }
  });

  return json({ knowledge });
}

/**
 * POST /api/extension/chat
 * Agent chat endpoint with semantic knowledge search
 */
export async function chatAction({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const body = await request.json();
  const { scholarshipId, applicationId, message, fieldMappings } = body;

  // 1. Generate embedding for user's message
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: message,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  // 2. Semantic search in GlobalKnowledge
  const embeddingStr = JSON.stringify(queryEmbedding);
  const knowledgeResults = await prisma.$queryRaw`
    SELECT
      id,
      type,
      category,
      title,
      content,
      confidence,
      verified,
      (embedding <#> ${embeddingStr}::vector) * -1 AS similarity
    FROM "GlobalKnowledge"
    WHERE
      userId = ${userId}
      AND verified = true
    ORDER BY similarity DESC
    LIMIT 5
  ` as any[];

  // 3. Get application-specific context
  const appContext = await prisma.applicationContext.findMany({
    where: {
      applicationId: applicationId,
    },
    orderBy: { sectionId: 'asc' },
  });

  // 4. Build agent context
  const agentContext = {
    scholarshipId,
    applicationId,
    message,
    fieldMappings: fieldMappings || [],
    relevantKnowledge: knowledgeResults.map(k => ({
      id: k.id,
      type: k.type,
      category: k.category,
      title: k.title,
      content: k.content,
      similarity: k.similarity,
      verified: k.verified,
    })),
    applicationContext: appContext.map(ctx => ({
      sectionId: ctx.sectionId,
      questionSummary: ctx.questionSummary,
      responseDraft: ctx.responseDraft,
      referencedGlobalKnowledge: ctx.referencedGlobalKnowledge,
    })),
  };

  // 5. Call agent with full context
  const agentResponse = await callAgentWithContext(userId, agentContext);

  // 6. Save ApplicationContext if agent drafted a response
  if (agentResponse.responseDraft) {
    await prisma.applicationContext.create({
      data: {
        userId,
        applicationId: applicationId,
        sectionId: `chat_${Date.now()}`,
        sectionType: 'chat',
        questionSummary: message,
        responseDraft: agentResponse.responseDraft,
        referencedGlobalKnowledge: agentResponse.referencedKnowledge || [],
      }
    });
  }

  // 7. Update GlobalKnowledge useCount
  if (agentResponse.referencedKnowledge && agentResponse.referencedKnowledge.length > 0) {
    await prisma.globalKnowledge.updateMany({
      where: {
        id: { in: agentResponse.referencedKnowledge },
      },
      data: {
        useCount: { increment: 1 },
        lastUsedAt: new Date(),
      }
    });
  }

  return json({
    response: agentResponse.text,
    fieldMappings: agentResponse.fieldMappings,
    suggestedKnowledge: knowledgeResults,
    referencedKnowledge: agentResponse.referencedKnowledge,
  });
}

/**
 * Call agent with full context (GlobalKnowledge + ApplicationContext)
 */
async function callAgentWithContext(userId: string, context: any) {
  // Build prompt with knowledge context
  const prompt = `
You are helping a user fill out a scholarship application.

RELEVANT KNOWLEDGE (from user's past experiences):
${context.relevantKnowledge.map((k: any, i: number) => `
${i + 1}. [${k.type} - ${k.category || 'General'}] ${k.title}
   Similarity: ${Math.round(k.similarity * 100)}%
   Content: ${k.content}
`).join('\n')}

APPLICATION-SPECIFIC CONTEXT (what user has drafted for this app):
${context.applicationContext.length > 0 ? context.applicationContext.map((ctx: any) => `
- Section: ${ctx.sectionId}
  Question: ${ctx.questionSummary}
  Draft: ${ctx.responseDraft || 'Not drafted yet'}
`).join('\n') : 'No previous drafts for this application.'}

CURRENT FIELD MAPPINGS:
${context.fieldMappings.map((f: any) => `
- ${f.fieldLabel} (${f.fieldName}): ${f.approvedValue || 'Not set'}
`).join('\n')}

USER MESSAGE: ${context.message}

Instructions:
1. Use relevant knowledge to help draft responses
2. Adapt knowledge to fit the specific scholarship requirements
3. Reference knowledge items by ID when using them: [Knowledge: ${context.relevantKnowledge[0]?.id || 'ID'}]
4. If suggesting a field mapping, include it in fieldMappings array
5. If using knowledge items, list their IDs in referencedKnowledge array

Respond with:
{
  "text": "Your response to user",
  "fieldMappings: [...] (optional, new mappings to save),
  "referencedKnowledge": ["id1", "id2"] (knowledge items used),
  "responseDraft": "Full drafted response" (optional, for ApplicationContext)
}
`;

  // Call OpenAI API
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a scholarship application assistant. Help users craft compelling responses using their past experiences and knowledge."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    response_format: { type: "json_object" },
  });

  return JSON.parse(completion.choices[0].message.content || '{}');
}
```

---

## 4. Database Schema Changes

### 4.1 New Tables

```prisma
// Field mappings for scholarships
model FieldMapping {
  id            String   @id @default(cuid())
  scholarshipId String
  fieldName     String   // e.g., "first_name", "gpa"
  fieldLabel    String   // e.g., "First Name", "GPA"
  fieldType     String   // e.g., "text", "select", "radio"
  approvedValue String?  @db.Text // The AI-approved response
  options       Json?    // For select/radio fields
  source        String   @default("agent") // "agent", "user", "import"
  approved      Boolean  @default(false) // User explicitly approved
  approvedAt    DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([scholarshipId, fieldName])
  @@index([scholarshipId])
  @@index([scholarshipId, approved])
}

// Indexing sessions track extension-based indexing
model IndexingSession {
  id            String   @id @default(cuid())
  scholarshipId String
  userId        String
  status        String   // pending, active, completed, failed
  startedAt     DateTime @default(now())
  completedAt   DateTime?

  @@index([scholarshipId])
  @@index([userId])
}

// ScrapedScholarship updates
model ScrapedScholarship {
  // ... existing fields ...

  indexStatus String   @default("not_indexed") // not_indexed, in_progress, indexed, needs_update
  indexedAt   DateTime?
  formData    Json?    // Store indexed form data
  sessionId   String?  // Link to indexing session

  @@index([indexStatus])
}

// ApplicationContext for application-specific responses
// (Already exists in schema, listed here for completeness)
model ApplicationContext {
  id              String   @id @default(cuid())
  userId          String
  applicationId   String   // Links to Application table
  sectionId       String   // "essay_1", "short_answer_3", "leadership_experience"
  sectionType     String   // "essay", "short_answer", "text_input", "select"
  questionSummary String   @db.Text  // The question/prompt
  responseDraft   String?  @db.Text  // Drafted response for this section

  // What was referenced in THIS application
  referencedGlobalKnowledge String[]  // IDs from GlobalKnowledge used in this response
  referencedOtherSections   String[]  // Other section IDs referenced ("essay_1")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([applicationId, sectionId])
  @@index([applicationId])
}

// GlobalKnowledge for cross-application knowledge sharing
// (Already exists in schema, listed here for completeness)
model GlobalKnowledge {
  id          String   @id @default(cuid())
  userId      String

  type        String   // "experience", "skill", "achievement", "value", "goal"
  category    String?  // "leadership", "community_service", "academic", etc.
  title       String   // "Food bank volunteer coordinator"
  content     String   @db.Text  // Full details, story, context
  source      String?  // "interview", "essay", "manual_entry", "inference", "extension"
  sourceEssay String?  // If from essay, which one
  confidence  Float    @default(0.5)  // How confirmed is this? 0-1
  verified    Boolean  @default(false)  // User explicitly confirmed this

  // For semantic search
  embedding   Unsupported("vector(1536)")?

  // Usage tracking - when/how this has been used
  useCount    Int      @default(0)
  lastUsedAt  DateTime?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, type])
  @@index([userId, category])
  @@index([userId, confidence])
  @@index([userId, verified])
}
```

---

## 5. Field Mapping & Sparkle Icon System

### 5.1 Sparkle Icon Detection

**Content Script Logic:**

1. **Detect form fields:** `querySelectorAll('input, textarea, select')`
2. **Create sparkle icon:** `<span class="sparkle-icon">✨</span>`
3. **Position after field:** Insert into DOM after input element
4. **Click handler:** Opens scholarship in web app with field context

### 5.2 Field Mapping Data Structure

```typescript
interface FieldMapping {
  fieldName: string;      // "first_name"
  fieldLabel: string;      // "First Name"
  fieldType: string;      // "text", "select", "radio"
  approvedValue?: string; // "John" (from agent chat)
  options?: Array<{      // For select fields
    label: string;
    value: string;
  }>;
}
```

### 5.3 User Workflow

1. **User visits scholarship application URL**
2. **Extension detects known scholarship**
3. **Sparkle icons appear next to each field**
4. **User clicks sparkle icon** → Opens app in sidebar/dropdown
5. **Agent chat shows:** "This field asks for your first name. How should you respond?"
6. **User types:** "Use my profile first name"
7. **Agent approves response** → Field mapping saved
8. **Extension updates sparkle icon** → Shows "John" next to field

---

## 6. Extension Store Approval Strategy

### 6.1 Approval Requirements

#### Functionality Criteria
- ✅ **Clear purpose** - Scholarship application assistant
- ✅ **No data mining** - Only processes user's explicit applications
- ✅ **Privacy-first** - All data stored locally, synced only to user's account
- ✅ **Opt-in only** - User must explicitly enable for each scholarship

#### Privacy Policy Requirements
1. **Data collected:**
   - Scholarship application URLs (for indexing)
   - Form field labels and types (for mapping)
   - User's approved responses (for autofill)
   - Cookies (for session validation only)

2. **Data NOT collected:**
   - Credentials
   - Personal information unless user explicitly provides
   - Browsing history
   - Data from other websites

3. **Storage:**
   - All data encrypted at rest
   - User can export/delete all data
   - No third-party data sharing

#### Permission Justification
- `activeTab` - Detect which scholarship page user is on
- `storage` - Cache field mappings and responses
- `cookies` - Validate session status (read-only)
- `sidepanel` - Agent chat interface
- `host_permissions` - Specific scholarship portals (narrow scope)

### 6.2 Screenshots for Store

1. **Hero shot:** Extension showing sparkle icons on a scholarship application
2. **Sidebar:** Agent chat interface with field suggestions
3. **Settings:** Privacy controls and data management
4. **Status:** Indicator showing which scholarships are indexed

### 6.3 Documentation

- **Privacy Policy** - Full transparency on data handling
- **Help Center** - How to use extension
- **Video Demo** - 30-second walkthrough
- **FAQ** - Common questions

---

## 7. Migration Phases

### Phase 1: Foundation (Week 1)
- [ ] Create extension skeleton (manifest, background, content script)
- [ ] Add sparkle icon to form fields
- [ ] Create API endpoints for extension
- [ ] Implement cookie sync

### Phase 2: Sidebar Integration (Week 2)
- [ ] Build sidebar UI
- [ ] Connect to existing agent chat API
- [ ] Implement field mapping approval flow

### Phase 3: Scholarship Management Page (Week 3)
- [ ] Redesign settings page with scholarship list
- [ ] Add indexing status badges
- [ ] Implement "Open for Indexing" button

### Phase 4: Testing & Polish (Week 4)
- [ ] Test on SmarterSelect
- [ ] Test on OASIS (AISES/Cobell)
- [ ] Privacy review
- [ ] Performance optimization

### Phase 5: Store Submission (Week 5)
- [ ] Prepare screenshots
- [ ] Write documentation
- [ ] Submit to Chrome Web Store
- [ ] Address review feedback

---

## 8. Key Design Decisions (REVISED)

### 1. Real-Time Sync Architecture
**Decision: Real-time sync with optimistic updates**

- Field mappings are saved immediately when user approves them in sidebar
- Uses `chrome.runtime.onMessage` for instant communication between components
- Local cache in background service worker (`tabContext` Map) for offline resilience
- Optimistic UI updates (show "Syncing..." → "✓ Synced" indicator)
- Conflict resolution: Last-write-wins based on `updatedAt` timestamp

**Why:**
- Better UX than manual "Send to App" button
- Users can work across tabs without losing data
- Simple conflict resolution avoids complex merge logic

### 2. Multi-Tab Support
**Decision: Context-aware sidebar with per-tab scholarship tracking**

- Each tab tracks its own scholarship context (scholarshipId, applicationId, fieldMappings)
- Background service worker maintains `tabContext` Map: `tabId → { scholarshipId, fieldMappings, lastSynced }`
- Sidebar automatically switches context when user activates different tab
- Uses `chrome.tabs.onActivated` to detect tab switches and reload sidebar context

**Why:**
- Users can compare scholarships side-by-side
- Can work on multiple applications simultaneously
- No artificial "one active scholarship" limitation

### 3. Knowledge Base Integration
**Decision: Two-tier knowledge system**

**Global Knowledge Base (GlobalKnowledge table):**
- Shared across all scholarship applications
- Types: experience, skill, achievement, value, goal
- Agent uses semantic similarity search to find relevant knowledge
- User can add approved responses to global knowledge from sidebar
- Embedding-based search with pgvector for finding relevant past content

**Application Context (ApplicationContext table):**
- Application-specific: responses, references to GlobalKnowledge
- Tracks which global knowledge items were used in each response
- Enables cross-referencing between essay sections

**Workflow:**
1. Agent searches GlobalKnowledge semantically for relevant content
2. Shows suggestions in sidebar with similarity scores
3. User can "Use for Response" to adapt knowledge to current field
4. User can "+ Add to Knowledge" to save approved responses to GlobalKnowledge
5. Each response in ApplicationContext tracks referencedGlobalKnowledge IDs

**Why:**
- Reuses content across applications (don't rewrite the same story twice)
- Semantic search finds relevant past experiences even with different wording
- Application-specific context allows tailoring the same experience for different scholarships

### 4. Field Auto-Fill Policy
**Decision: Manual trigger, not automatic**

- User must explicitly click "Apply" or "Approve" to fill field
- Extension NEVER auto-fills without user action
- Sidebar shows "✓ Approve" button for each field mapping
- User can edit before approving

**Why:**
- Privacy-first approach for Chrome Web Store approval
- User maintains control over what gets submitted
- Prevents accidental form submissions with wrong data

### 5. Cookie Sync Strategy
**Decision: Automatic periodic sync with status tracking**

- Cookies sync every 5 minutes via `chrome.alarms`
- Also syncs immediately when scholarship is registered
- Server-side: checks deadline, submission status, referral status
- Updates `PortalSession` table in database

**Why:**
- Keeps application status up-to-date without user action
- Periodic sync is less intrusive than real-time
- Status tracking enables deadline reminders and submission monitoring

---

## 9. Technical Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Extension rejected by store | Follow strict privacy guidelines, narrow permissions, clear disclosure |
| Sparkle icons break page layouts | Test on multiple sites, use absolute positioning, z-index management |
| Session cookies expire | Implement periodic sync (5 min), show warning in UI, re-auth prompt |
| Field detection inconsistent | Fallback to manual field selection, user can map fields manually |
| Agent chat performance | Cache common responses, use streaming, limit knowledge search to top 5 |
| Real-time sync conflicts | Last-write-wins with `updatedAt` timestamp, show visual conflict indicator |
| Multi-tab context confusion | Clear scholarship name in sidebar header, tab activation updates context immediately |
| Knowledge search latency | Pre-compute embeddings, use pgvector index, async search with loading indicator |
| User adds low-quality knowledge to GlobalKnowledge | Default `verified: false`, require interview verification before including in search |
| Extension background service worker memory leak | Clean up tabContext on tab removal, limit cache size, monitor memory usage |
| Semantic search returns irrelevant results | Use similarity threshold (>0.3), allow user to flag irrelevant knowledge, use reranking |
| ApplicationContext grows too large | Archive old applications, limit chat history, provide cleanup tools |
| Sync fails silently | Show persistent error indicator, retry logic, manual "Retry Sync" button |

---

## 10. Success Metrics

- **Time to index:** < 2 minutes per scholarship (vs 10+ minutes with browser-use)
- **Accuracy:** > 95% correct field detection
- **Store approval:** Pass review on first submission
- **User adoption:** > 80% of discovered scholarships get indexed
- **Knowledge reuse:** > 50% of responses reuse existing GlobalKnowledge (vs writing from scratch)
- **Sync reliability:** > 99% successful sync rate, < 1s average sync latency
- **Multi-tab performance:** No UI lag when switching between 3+ scholarship tabs
