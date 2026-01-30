/**
 * Content Script for Scholarships Plus Extension
 * Extracts fields, calls backend API, enables interactive conversation for field responses
 */

console.log('Scholarships Plus: Content script START');

// Signal to page that extension is loaded
var event = new CustomEvent('scholarshipsPlusExtensionLoaded', { detail: { version: '0.2.0' } });
window.dispatchEvent(event);
console.log('Scholarships Plus: Extension detection event dispatched');

// Configuration
var API_BASE_URL = 'http://localhost:3030';
var POLL_INTERVAL = 3000;
var MAX_POLLS = 40;

// Storage for field data
var extractedFields = [];
var fieldMappings = {};
var scholarshipId = null;
var applicationId = null;
var pollCount = 0;
var pollTimer = null;
var authToken = null;

// Current conversation state
var currentConversation = null;
var conversationModal = null;
var currentFieldName = null;

/**
 * Generate CSS selector for an element
 */
function generateCSSSelector(element) {
  if (element.id) {
    return '#' + element.id;
  }

  if (element.name) {
    var tagName = element.tagName.toLowerCase();
    return tagName + '[name="' + element.name + '"]';
  }

  var path = [];
  var current = element;

  while (current && current !== document.body) {
    var tagName = current.tagName.toLowerCase();
    var selector = tagName;

    if (!current.id && !current.name) {
      var siblings = Array.from(current.parentNode.children).filter(function(el) {
        return el.tagName === current.tagName;
      });
      var index = siblings.indexOf(current) + 1;
      selector = tagName + ':nth-child(' + index + ')';
    }

    path.unshift(selector);
    current = current.parentElement;

    if (path.length >= 4) break;
  }

  return path.join(' > ');
}

/**
 * Generate XPath for an element
 */
function generateXPath(element) {
  if (element.id) {
    return '//*[@id="' + element.id + '"]';
  }

  var parts = [];
  var current = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    var index = 0;
    var hasFollowingSiblings = false;
    var sibling = current.previousSibling;

    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) {
        index++;
        hasFollowingSiblings = true;
      }
      sibling = sibling.previousSibling;
    }

    var tagName = current.tagName.toLowerCase();
    var pathIndex = (hasFollowingSiblings || index > 0) ? '[' + (index + 1) + ']' : '';
    parts.unshift(tagName + pathIndex);

    current = current.parentElement;

    if (parts.length >= 5) break;
  }

  return '//' + parts.join('/');
}

/**
 * Extract field information from a form element
 */
function extractFieldInfo(element, index) {
  var info = {
    fieldName: element.name || element.id || 'field_' + index,
    fieldLabel: '',
    fieldType: element.type || element.tagName.toLowerCase(),
    cssSelector: generateCSSSelector(element),
    xpath: generateXPath(element),
    position: index,
  };

  var label = null;

  if (element.id) {
    label = document.querySelector('label[for="' + element.id + '"]');
  }

  if (!label) {
    label = element.closest('label');
  }

  if (!label) {
    var formGroup = element.closest('div, .form-group, .ss-field, [class*="field"], .field');
    if (formGroup) {
      label = formGroup.querySelector('label');
    }
  }

  if (label) {
    info.fieldLabel = label.textContent.trim().replace(/\*$/, '').trim();
  } else {
    info.fieldLabel = element.placeholder || element.name || element.id || 'Field ' + (index + 1);
  }

  if (info.fieldType === 'select') {
    info.options = Array.from(element.options).map(function(opt) {
      return { label: opt.textContent.trim(), value: opt.value };
    }).filter(function(opt) { return opt.label; });
  }

  return info;
}

/**
 * Extract all form fields from the page
 */
function extractAllFields() {
  var fields = [];
  var fieldIndex = 0;

  var elements = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');

  elements.forEach(function(element) {
    if (element.hasAttribute('data-sparkle-added')) return;

    var fieldInfo = extractFieldInfo(element, fieldIndex);
    fields.push(fieldInfo);
    fieldIndex++;

    element.setAttribute('data-sparkle-added', 'true');
  });

  return fields;
}

/**
 * Get auth token from storage
 */
function getAuthToken(callback) {
  chrome.storage.local.get(['authToken'], function(result) {
    authToken = result.authToken;
    callback(authToken);
  });
}

/**
 * Submit extracted fields to backend API
 */
function submitFieldsToAPI(fields, callback) {
  getAuthToken(function(token) {
    if (!token) {
      console.error('Scholarships Plus: No auth token found');
      callback(null);
      return;
    }

    fetch(API_BASE_URL + '/api/extension/fields', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({
        url: window.location.href,
        fields: fields,
      }),
    })
    .then(function(response) {
      if (!response.ok) {
        throw new Error('API request failed: ' + response.status);
      }
      return response.json();
    })
    .then(function(data) {
      console.log('Scholarships Plus: Fields submitted, response:', data);
      scholarshipId = data.scholarshipId;
      applicationId = data.applicationId;

      fieldMappings = {};
      if (data.mappings && Array.isArray(data.mappings)) {
        data.mappings.forEach(function(mapping) {
          fieldMappings[mapping.fieldName] = mapping;
        });
      }

      callback(data);
    })
    .catch(function(error) {
      console.error('Scholarships Plus: API error:', error);
      callback(null);
    });
  });
}

/**
 * Poll for updated field mappings
 */
function pollForUpdates() {
  if (pollCount >= MAX_POLLS) {
    console.log('Scholarships Plus: Max polls reached, stopping');
    stopPolling();
    return;
  }

  pollCount++;

  getAuthToken(function(token) {
    if (!token || !scholarshipId) {
      stopPolling();
      return;
    }

    fetch(API_BASE_URL + '/api/extension/field-mappings/' + scholarshipId, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
      },
    })
    .then(function(response) {
      if (!response.ok) throw new Error('Poll failed');
      return response.json();
    })
    .then(function(data) {
      if (data.mappings && Array.isArray(data.mappings)) {
        data.mappings.forEach(function(mapping) {
          var existing = fieldMappings[mapping.fieldName];

          if (mapping.approvedValue && (!existing || !existing.approvedValue)) {
            console.log('Scholarships Plus: New value for ' + mapping.fieldName);
            fieldMappings[mapping.fieldName] = mapping;
            updateSparkleForField(mapping.fieldName, mapping.approvedValue);
          }

          if (existing && existing.generating !== mapping.generating) {
            fieldMappings[mapping.fieldName] = mapping;
            updateSparkleState(mapping.fieldName, mapping.generating);
          }
        });
      }

      var allDone = Object.keys(fieldMappings).every(function(key) {
        return fieldMappings[key].approvedValue && !fieldMappings[key].generating;
      });

      if (allDone) {
        console.log('Scholarships Plus: All fields have values, stopping poll');
        stopPolling();
      } else {
        pollTimer = setTimeout(pollForUpdates, POLL_INTERVAL);
      }
    })
    .catch(function(error) {
      console.error('Scholarships Plus: Poll error:', error);
      pollTimer = setTimeout(pollForUpdates, POLL_INTERVAL);
    });
  });
}

/**
 * Stop polling for updates
 */
function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

/**
 * Create sparkle icon element
 */
function createSparkleIcon(state) {
  state = state || 'empty';

  var icon = document.createElement('div');
  icon.className = 'sp-sparkle-icon';

  if (state === 'empty') {
    icon.classList.add('sp-sparkle-empty');
  } else if (state === 'generating') {
    icon.classList.add('sp-sparkle-generating');
  } else if (state === 'ready') {
    icon.classList.add('sp-sparkle-ready');
  } else if (state === 'filled') {
    icon.classList.add('sp-sparkle-filled');
  }

  var img = document.createElement('img');
  img.src = chrome.runtime.getURL('icons/sparkle.svg');
  img.style.width = '20px';
  img.style.height = '20px';
  img.style.display = 'block';

  if (state === 'empty') {
    img.style.filter = 'grayscale(100%) brightness(0.4) opacity(0.5)';
  } else if (state === 'generating') {
    img.style.filter = 'sepia(1) saturate(3) hue-rotate(180deg) brightness(0.9)';
  } else if (state === 'ready') {
    img.style.filter = 'sepia(1) saturate(5) hue-rotate(90deg) brightness(0.8)';
  } else if (state === 'filled') {
    img.style.filter = 'grayscale(100%) brightness(0.7)';
  }

  icon.appendChild(img);
  return icon;
}

/**
 * Add sparkle icon to a field
 */
function addSparkleIcon(input, fieldName) {
  var mapping = fieldMappings[fieldName];
  var state = 'empty';

  if (mapping) {
    if (mapping.generating) {
      state = 'generating';
    } else if (mapping.approvedValue) {
      state = 'ready';
    }
  }

  var icon = createSparkleIcon(state);

  var tooltipText = mapping ? mapping.fieldLabel : fieldName;
  if (state === 'empty') {
    tooltipText = 'Click to generate response';
  } else if (state === 'generating') {
    tooltipText = 'Generating response...';
  } else if (state === 'ready') {
    tooltipText = 'Click to fill';
  } else if (state === 'filled') {
    tooltipText = 'Click to edit';
  }

  icon.setAttribute('data-tooltip', tooltipText);
  icon.title = tooltipText;

  var isFilled = (state === 'filled');

  icon.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();

    if (state === 'generating') return;

    // Open conversation for all states except generating
    openConversation(fieldName, input, icon);
  });

  input._sparkleIcon = icon;
  input._sparkleState = state;

  var parent = input.parentElement;
  if (parent) {
    parent.classList.add('sp-input-wrapper');
    parent.appendChild(icon);
  }
}

/**
 * Update sparkle for a specific field
 */
function updateSparkleForField(fieldName, approvedValue) {
  var input = document.querySelector('[name="' + fieldName + '"], #' + fieldName);
  if (!input || !input._sparkleIcon) return;

  var icon = input._sparkleIcon;
  var img = icon.querySelector('img');

  icon.classList.remove('sp-sparkle-empty', 'sp-sparkle-generating');
  icon.classList.add('sp-sparkle-ready');
  img.style.filter = 'sepia(1) saturate(5) hue-rotate(90deg) brightness(0.8)';
  icon.setAttribute('data-tooltip', 'Click to fill');
  icon.title = 'Click to fill';
  input._sparkleState = 'ready';
}

/**
 * Update sparkle state
 */
function updateSparkleState(fieldName, isGenerating) {
  var input = document.querySelector('[name="' + fieldName + '"], #' + fieldName);
  if (!input || !input._sparkleIcon) return;

  var icon = input._sparkleIcon;
  var img = icon.querySelector('img');

  if (isGenerating) {
    icon.classList.remove('sp-sparkle-empty', 'sp-sparkle-ready', 'sp-sparkle-filled');
    icon.classList.add('sp-sparkle-generating');
    img.style.filter = 'sepia(1) saturate(3) hue-rotate(180deg) brightness(0.9)';
    icon.setAttribute('data-tooltip', 'Generating response...');
    icon.title = 'Generating response...';
    input._sparkleState = 'generating';
  }
}

/**
 * Transition sparkle to filled state after autofill
 */
function transitionToFilled(input) {
  if (!input || !input._sparkleIcon) return;

  var icon = input._sparkleIcon;
  var img = icon.querySelector('img');

  icon.classList.remove('sp-sparkle-empty', 'sp-sparkle-generating', 'sp-sparkle-ready');
  icon.classList.add('sp-sparkle-filled');
  img.style.filter = 'grayscale(100%) brightness(0.7)';
  icon.setAttribute('data-tooltip', 'Click to edit');
  icon.title = 'Click to edit';
  input._sparkleState = 'filled';
}

/**
 * Open conversation modal
 */
function openConversation(fieldName, input, icon) {
  currentFieldName = fieldName;
  var mapping = fieldMappings[fieldName];
  var fieldLabel = mapping ? mapping.fieldLabel : fieldName;

  closeConversation();

  conversationModal = createConversationModal(fieldName, fieldLabel, input, icon);
  document.body.appendChild(conversationModal);

  // If we have context (previous approvedValue), show it
  if (mapping && mapping.approvedValue) {
    addMessageToConversation('agent', 'Current response:', mapping.approvedValue);
  }
}

/**
 * Create conversation modal
 */
function createConversationModal(fieldName, fieldLabel, input, icon) {
  var modal = document.createElement('div');
  modal.className = 'sp-conversation-modal';
  modal.id = 'sp-conversation-modal';

  // Build modal without inline event handlers
  var header = document.createElement('div');
  header.className = 'sp-conversation-header';

  var heading = document.createElement('h3');
  heading.textContent = fieldLabel;

  var closeBtn = document.createElement('button');
  closeBtn.className = 'sp-conversation-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', closeConversation);

  header.appendChild(heading);
  header.appendChild(closeBtn);

  var body = document.createElement('div');
  body.className = 'sp-conversation-body';

  var messagesDiv = document.createElement('div');
  messagesDiv.className = 'sp-conversation-messages';
  messagesDiv.id = 'sp-conversation-messages';

  var loadingDiv = document.createElement('div');
  loadingDiv.id = 'sp-conversation-loading';
  loadingDiv.className = 'sp-conversation-loading';
  loadingDiv.style.display = 'none';
  loadingDiv.textContent = 'AI is thinking...';

  body.appendChild(messagesDiv);
  body.appendChild(loadingDiv);

  var inputDiv = document.createElement('div');
  inputDiv.className = 'sp-conversation-input';

  var inputField = document.createElement('input');
  inputField.type = 'text';
  inputField.id = 'sp-conversation-input-field';
  inputField.placeholder = 'Describe what you\'d like to say here...';

  var sendBtn = document.createElement('button');
  sendBtn.className = 'sp-conversation-send';
  sendBtn.id = 'sp-conversation-send-btn';
  sendBtn.textContent = 'Send';

  inputDiv.appendChild(inputField);
  inputDiv.appendChild(sendBtn);

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(inputDiv);

  // Setup input handling
  setTimeout(function() {
    inputField.addEventListener('keypress', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendUserMessage();
      }
    });

    sendBtn.addEventListener('click', sendUserMessage);

    inputField.focus();
  }, 100);

  return modal;
}

/**
 * Close conversation modal
 */
window.closeConversation = function() {
  if (conversationModal) {
    conversationModal.remove();
    conversationModal = null;
  }

  var backdrop = document.querySelector('.sp-conversation-backdrop');
  if (backdrop) {
    backdrop.remove();
  }

  currentFieldName = null;
  currentConversation = null;
};

/**
 * Add message to conversation
 */
function addMessageToConversation(type, label, content, withApproval) {
  var messagesContainer = document.getElementById('sp-conversation-messages');
  if (!messagesContainer) return;

  var messageDiv = document.createElement('div');
  messageDiv.className = 'sp-message sp-message-' + type;

  var labelDiv = document.createElement('div');
  labelDiv.className = 'sp-message-label';
  labelDiv.textContent = label;

  var contentDiv = document.createElement('div');
  contentDiv.className = 'sp-message-content';
  contentDiv.textContent = content;

  messageDiv.appendChild(labelDiv);
  messageDiv.appendChild(contentDiv);

  if (withApproval) {
    var approvalDiv = document.createElement('div');
    approvalDiv.className = 'sp-approval-buttons';

    var approveBtn = document.createElement('button');
    approveBtn.className = 'sp-approval-button sp-approval-approve';
    approveBtn.textContent = '✨ Sounds good!';
    approveBtn.addEventListener('click', function() {
      if (typeof window.approveSuggestion === 'function') {
        window.approveSuggestion();
      }
    });

    var rejectBtn = document.createElement('button');
    rejectBtn.className = 'sp-approval-button sp-approval-reject';
    rejectBtn.textContent = 'Let\'s change that.';
    rejectBtn.addEventListener('click', function() {
      if (typeof window.rejectSuggestion === 'function') {
        window.rejectSuggestion();
      }
    });

    approvalDiv.appendChild(approveBtn);
    approvalDiv.appendChild(rejectBtn);
    messageDiv.appendChild(approvalDiv);
  }

  messagesContainer.appendChild(messageDiv);

  // Scroll to bottom
  var body = document.querySelector('.sp-conversation-body');
  if (body) {
    body.scrollTop = body.scrollHeight;
  }
}

/**
 * Send user message
 */
function sendUserMessage() {
  var inputField = document.getElementById('sp-conversation-input-field');
  var message = inputField.value.trim();

  if (!message) return;

  inputField.value = '';

  addMessageToConversation('user', 'You', message, false);

  // Call chat API
  callChatAPI(message);
}

/**
 * Call chat API for field conversation
 */
function callChatAPI(userMessage) {
  if (!currentFieldName || !scholarshipId || !applicationId) {
    console.error('Scholarships Plus: Missing context for chat');
    return;
  }

  var loadingEl = document.getElementById('sp-conversation-loading');
  if (loadingEl) {
    loadingEl.style.display = 'flex';
  }

  var inputField = document.getElementById('sp-conversation-input-field');
  var sendBtn = document.getElementById('sp-conversation-send-btn');
  if (inputField) inputField.disabled = true;
  if (sendBtn) sendBtn.disabled = true;

  getAuthToken(function(token) {
    if (!token) {
      console.error('Scholarships Plus: No auth token for chat');
      if (loadingEl) loadingEl.style.display = 'none';
      if (inputField) inputField.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      return;
    }

    var mapping = fieldMappings[currentFieldName];

    fetch(API_BASE_URL + '/api/extension/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({
        scholarshipId: scholarshipId,
        applicationId: applicationId,
        fieldName: currentFieldName,
        fieldLabel: mapping ? mapping.fieldLabel : currentFieldName,
        fieldType: mapping ? mapping.fieldType : 'text',
        message: userMessage,
        currentValue: mapping ? mapping.approvedValue : null,
      }),
    })
    .then(function(response) {
      if (!response.ok) {
        throw new Error('Chat API failed: ' + response.status);
      }
      return response.json();
    })
    .then(function(data) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (inputField) inputField.disabled = false;
      if (sendBtn) sendBtn.disabled = false;

      if (data.response) {
        // Add as suggestion with approval buttons
        addMessageToConversation('suggestion', 'Suggested response:', data.response, true);

        // Store the suggested response for approval
        if (!currentConversation) {
          currentConversation = [];
        }
        currentConversation.push({
          type: 'suggestion',
          content: data.response,
        });
      }
    })
    .catch(function(error) {
      console.error('Scholarships Plus: Chat API error:', error);
      if (loadingEl) loadingEl.style.display = 'none';
      if (inputField) inputField.disabled = false;
      if (sendBtn) sendBtn.disabled = false;

      addMessageToConversation('agent', 'Error', 'Sorry, I couldn\'t generate a response. Please try again.', false);
    });
  });
}

/**
 * Approve suggestion and fill field
 */
window.approveSuggestion = function() {
  if (!currentConversation || currentConversation.length === 0) return;

  var lastSuggestion = currentConversation[currentConversation.length - 1];
  if (lastSuggestion.type !== 'suggestion') return;

  var suggestedValue = lastSuggestion.content;
  var input = document.querySelector('[name="' + currentFieldName + '"], #' + currentFieldName);

  if (input && suggestedValue) {
    // Fill the field
    fillField(input, suggestedValue);

    // Update the mapping
    fieldMappings[currentFieldName] = {
      fieldName: currentFieldName,
      approvedValue: suggestedValue,
      generating: false,
    };

    // Close conversation
    closeConversation();
  }
};

/**
 * Reject suggestion and allow further input
 */
window.rejectSuggestion = function() {
  // Remove the suggestion from history
  if (currentConversation && currentConversation.length > 0) {
    currentConversation.pop();
  }

  // Add message indicating rejection
  addMessageToConversation('agent', 'System', 'Got it! What would you like to change about the response?', false);

  // Focus input
  var inputField = document.getElementById('sp-conversation-input-field');
  if (inputField) {
    inputField.focus();
    inputField.placeholder = 'Tell me what to change...';
  }
};

/**
 * Fill field with animation
 */
function fillField(input, value) {
  // Get sparkle icon for animation
  var icon = input._sparkleIcon;
  var rect = null;

  if (icon) {
    rect = icon.getBoundingClientRect();
    createSparkleBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  // Fill with adaptive speed
  fillFieldWithAnimation(input, value).then(function() {
    // Transition to filled state
    transitionToFilled(input);
  });
}

/**
 * Create sparkle burst
 */
function createSparkleBurst(x, y) {
  var particleCount = 8;

  for (var i = 0; i < particleCount; i++) {
    var particle = document.createElement('div');
    particle.className = 'sp-sparkle-particle';

    var destinationX = (Math.random() - 0.5) * 100;
    var destinationY = (Math.random() - 0.5) * 100;

    particle.style.setProperty('--tw-x', destinationX + 'px');
    particle.style.setProperty('--tw-y', destinationY + 'px');

    var size = Math.random() * 6 + 4;
    particle.style.width = size + 'px';
    particle.style.height = size + 'px';

    particle.style.left = x + 'px';
    particle.style.top = y + 'px';

    document.body.appendChild(particle);

    setTimeout(function() { particle.remove(); }, 600);
  }
}

/**
 * Fill field with typewriter animation
 */
function fillFieldWithAnimation(input, value) {
  return new Promise(function(resolve) {
    if (input.tagName === 'SELECT') {
      for (var i = 0; i < input.options.length; i++) {
        var option = input.options[i];
        if (option.value === value || option.textContent.trim() === value) {
          input.value = option.value;
          break;
        }
      }
      resolve(true);
    } else {
      input.value = '';

      var speed;
      if (value.length < 100) {
        speed = 15;
      } else if (value.length < 500) {
        speed = 8;
      } else {
        input.value = value;
        resolve(true);
        return;
      }

      var index = 0;
      var interval = setInterval(function() {
        if (index < value.length) {
          input.value += value[index];
          index++;
        } else {
          clearInterval(interval);
          resolve(true);
        }
      }, speed);

      var fullDuration = value.length * speed + 500;
      setTimeout(function() {
        if (index < value.length) {
          clearInterval(interval);
          input.value = value;
        }
        resolve(true);
      }, fullDuration);
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/**
 * Show status banner
 */
function showBanner(totalFields, readyCount, generatingCount) {
  var banner = document.createElement('div');
  banner.className = 'sp-demo-banner';

  var message = '✨ <strong>Scholarships+ Extension</strong><br>';

  if (readyCount === totalFields) {
    message += totalFields + ' fields ready to fill!';
  } else if (generatingCount > 0) {
    message += readyCount + ' fields ready • ' + generatingCount + ' generating...';
  } else {
    message += 'Detected ' + totalFields + ' fields • Click sparkles to generate';
  }

  banner.innerHTML = message;
  document.body.appendChild(banner);

  setTimeout(function() {
    banner.style.transition = 'opacity 0.5s';
    banner.style.opacity = '0';
    setTimeout(function() { banner.remove(); }, 500);
  }, 5000);
}

/**
 * Process fields and add sparkles
 */
function processFields() {
  console.log('Scholarships Plus: Processing fields...');

  extractedFields = extractAllFields();
  console.log('Scholarships Plus: Extracted ' + extractedFields.length + ' fields');

  if (extractedFields.length === 0) {
    console.log('Scholarships Plus: No fields found');
    return;
  }

  submitFieldsToAPI(extractedFields, function(response) {
    if (!response) {
      console.error('Scholarships Plus: Failed to submit fields');
      return;
    }

    var readyCount = 0;
    var generatingCount = 0;

    extractedFields.forEach(function(fieldInfo) {
      var input = document.querySelector('[name="' + fieldInfo.fieldName + '"], #' + fieldInfo.fieldName);
      if (input) {
        addSparkleIcon(input, fieldInfo.fieldName);

        var mapping = fieldMappings[fieldInfo.fieldName];
        if (mapping) {
          if (mapping.approvedValue) {
            readyCount++;
          } else if (mapping.generating) {
            generatingCount++;
          }
        }
      }
    });

    console.log('Scholarships Plus: Added sparkles - ' + readyCount + ' ready, ' + generatingCount + ' generating');

    showBanner(extractedFields.length, readyCount, generatingCount);

    if (generatingCount > 0) {
      console.log('Scholarships Plus: Starting polling for updates...');
      pollTimer = setTimeout(pollForUpdates, POLL_INTERVAL);
    }
  });
}

/**
 * Initialize extension
 */
function init() {
  console.log('Scholarships Plus: Initializing...');

  if (!document.body) {
    document.addEventListener('DOMContentLoaded', init);
    return;
  }

  setTimeout(processFields, 500);
  setTimeout(processFields, 1500);
  setTimeout(processFields, 3000);
}

try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
} catch (e) {
  console.error('Scholarships Plus: Error:', e);
}

console.log('Scholarships Plus: Content script loaded');
