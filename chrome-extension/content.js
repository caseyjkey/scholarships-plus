/**
 * Content Script for Scholarships Plus Extension
 * Extracts fields, calls backend API, enables interactive conversation for field responses
 */

console.log('Scholarships Plus: Content script START');

// Inject sparkle CSS directly since Chrome may not load it from manifest
(function injectSparkleCSS() {
  var style = document.createElement('style');
  style.id = 'scholarships-plus-sparkle-css';
  style.textContent = `.sp-sparkle-wrapper{position:relative!important;display:inline-flex!important;align-items:center!important;vertical-align:middle!important;margin-left:6px!important}
.sp-sparkle-icon{position:relative!important;width:20px!important;height:20px!important;min-width:20px!important;max-width:20px!important;min-height:20px!important;max-height:20px!important;z-index:999999!important;cursor:pointer!important;transition:transform .3s cubic-bezier(.4,0,.2,1),opacity .3s ease,filter .3s ease!important;pointer-events:auto!important;flex-shrink:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;vertical-align:middle!important;margin-left:10px!important;line-height:1!important;opacity:0.6!important;transform:translateY(-2px)!important;transform-box:fill-box!important;transform-origin:center!important;filter:grayscale(100%) brightness(0.7)!important}
.sp-sparkle-icon:hover{transform:translateY(-2px) scale(1.4)!important;filter:grayscale(100%) brightness(0.7)!important;opacity:1!important}
.sp-sparkle-icon span,.sp-sparkle-icon img{width:20px!important;height:20px!important;display:block!important;min-width:20px!important;max-width:20px!important;min-height:20px!important;max-height:20px!important;object-fit:contain!important;transform-box:fill-box!important;transform-origin:center!important}
.sp-sparkle-icon.sp-sparkle-ready{filter:grayscale(0%) brightness(1) saturate(1)!important;opacity:1!important}
.sp-sparkle-icon.sp-sparkle-ready:hover{transform:translateY(-2px) scale(1.4)!important;filter:grayscale(0%) drop-shadow(0 0 8px rgba(59,130,246,.8)) drop-shadow(0 0 16px rgba(59,130,246,.4))!important;opacity:1!important}
.sp-sparkle-icon.sp-sparkle-filled{filter:grayscale(100%) brightness(0.7) hue-rotate(90deg) saturate(3)!important;opacity:1!important}
.sp-sparkle-icon.sp-sparkle-generating{animation:pulse 1s ease-in-out infinite!important}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
.sp-tooltip{position:absolute!important;bottom:calc(100% + 8px)!important;left:50%!important;transform:translateX(-50%)!important;padding:6px 10px!important;background:rgba(31,41,55,.95)!important;color:#fff!important;font-size:11px!important;font-family:system-ui,-apple-system,sans-serif!important;white-space:nowrap!important;border-radius:4px!important;z-index:9999999!important;pointer-events:none!important;opacity:0!important;transition:opacity .2s ease!important;max-width:200px!important;text-align:center!important;line-height:1.3!important}
.sp-sparkle-icon:hover .sp-tooltip{opacity:1!important}
`;
  document.head.appendChild(style);
  console.log('Scholarships Plus: CSS injected directly');
})();

// Signal to page that extension is loaded
var event = new CustomEvent('scholarshipsPlusExtensionLoaded', { detail: { version: '0.3.5' } });
window.dispatchEvent(event);
console.log('Scholarships Plus: Extension detection event dispatched');

// Configuration
var API_BASE_URL = 'https://localhost:3443';
var POLL_INTERVAL = 3000;
var MAX_POLLS = 40;

// Storage for field data
var extractedFields = [];
var fieldMappings = {};
var fieldElements = {}; // Map fieldName -> DOM element
var labelsWithSparkles = new Set(); // Track labels that have sparkles to avoid duplicates
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
 * Find the Lowest Common Ancestor for a group of elements
 * Used for radio/checkbox group label detection
 */
function findLCA(elements) {
  if (!elements || elements.length === 0) return null;
  if (elements.length === 1) return elements[0];

  var paths = elements.map(function(el) {
    var path = [];
    while (el) {
      path.push(el);
      el = el.parentElement;
    }
    return path.reverse();
  });

  var lca = paths[0][0];
  for (var i = 0; i < Math.min.apply(Math, paths.map(function(p) { return p.length; })); i++) {
    var current = paths[0][i];
    if (paths.every(function(p) { return p[i] === current; })) {
      lca = current;
    } else {
      break;
    }
  }
  return lca;
}

/**
 * Find label for a form element using multi-stage approach:
 * 1. Direct Association (for attribute, wrapping label)
 * 2. Radio/Checkbox Grouping (LCA to find group question)
 * 3. Proximity Search (find nearest meaningful label)
 */
function findLabelForElement(element) {
  var label = null;
  var source = '';

  // STEP 1: Handle Radio & Checkbox Groups (Semantic Grouping)
  if ((element.type === 'radio' || element.type === 'checkbox') && element.name) {
    var groupInputs = document.querySelectorAll('input[name="' + element.name + '"]');
    if (groupInputs.length > 1) {
      var lca = findLCA(Array.from(groupInputs));
      if (lca) {
        // Look for legend, label without for, or text element in the LCA
        label = lca.querySelector('legend, label:not([for]), p, span, div') ||
                lca.previousElementSibling;
        if (label) source = 'radio-group-lca';
      }
    }
  }

  // STEP 2: Standard Label Detection (Explicit or Implicit)
  if (!label) {
    // Check for label with for attribute
    if (element.id) {
      label = document.querySelector('label[for="' + element.id + '"]');
      if (label && label.textContent.trim().length > 0) source = 'for-attribute';
      else label = null;
    }

    // Check for wrapping label
    if (!label) {
      label = element.closest('label');
      if (label && label.textContent.trim().length > 0) source = 'wrapping-label';
      else label = null;
    }

    // Check HTML5 labels property
    if (!label && element.labels && element.labels.length > 0) {
      label = element.labels[0];
      if (label && label.textContent.trim().length > 0) source = 'html5-labels';
      else label = null;
    }

    // Preceding sibling (if it has meaningful text)
    if (!label) {
      var prev = element.previousElementSibling;
      if (prev && prev.textContent && prev.textContent.trim().length > 3) {
        label = prev;
        source = 'preceding-sibling';
      }
    }
  }

  // STEP 3: DOM-tree-based Proximity Search
  // Find label in same or parent container (more robust than viewport coordinates)
  if (!label) {
    var container = element.closest('article, section, div.field, div.form-group, .question');
    var searchRoot = container || document.body;

    // First, try to find a label in a header within the same container
    var header = searchRoot.querySelector('header label, .question-label, .field-label, .label');
    if (header && header.textContent.trim().length > 5) {
      label = header;
      source = 'container-header';
    }

    // If no header label, look for the first meaningful label in the container
    if (!label) {
      var containerLabels = Array.from(searchRoot.querySelectorAll('label'));
      var bestLabel = null;
      var bestTextLength = 0;

      containerLabels.forEach(function(lbl) {
        var textLength = lbl.textContent.trim().length;

        // Skip very short labels
        if (textLength < 5) return;

        // Skip labels that contain radio/checkbox inputs (option labels)
        if (lbl.querySelector('input[type="radio"], input[type="checkbox"]')) return;

        // Skip labels that are inside other labels (nested option labels)
        if (lbl.closest('label') !== null) return;

        // Prefer longer labels (more likely to be field labels vs option labels)
        if (textLength > bestTextLength) {
          bestTextLength = textLength;
          bestLabel = lbl;
        }
      });

      if (bestLabel) {
        label = bestLabel;
        source = 'container-label';
      }
    }
  }

  return { label: label, source: source };
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

  // Use the 3-stage label finding approach
  var result = findLabelForElement(element);
  var label = result.label;
  var labelSource = result.source;

  if (label) {
    info.fieldLabel = label.textContent.trim().replace(/\*$/, '').trim();
  } else {
    info.fieldLabel = element.placeholder || element.name || element.id || 'Field ' + (index + 1);
  }

  // Store label element reference for positioning sparkle
  info.labelElement = label;
  // Store the actual DOM element reference for later use
  info.element = element;

  console.log('[SPARKLE] Field:', info.fieldName, 'Source:', labelSource, 'Label text:', label ? label.textContent.trim().substring(0, 50) : 'none');

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
  var processedRadioGroups = {};

  var elements = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');

  elements.forEach(function(element) {
    if (element.hasAttribute('data-sparkle-added')) return;

    // Skip Select2 auto-generated inputs
    var elemId = element.id || '';
    var elemName = element.name || '';
    if (elemId.indexOf('s2id_') === 0 || elemName.indexOf('s2id_') === 0) {
      return;
    }

    // Skip hidden/offscreen elements - but use offsetWidth/offsetHeight for more reliable check
    // Also check if element is in a container with a label (for hidden selects)
    var rect = element.getBoundingClientRect();
    var isInVisibleContainer = element.closest('article, section, div.field, div.form-group, .question');
    if ((rect.width === 0 || rect.height === 0) && !isInVisibleContainer) return;

    // Handle radio button groups - only process the first radio button in each group
    if (element.type === 'radio') {
      if (processedRadioGroups[element.name]) return;
      processedRadioGroups[element.name] = true;
    }

    var fieldInfo = extractFieldInfo(element, fieldIndex);

    // Only add if we found a label
    if (fieldInfo.labelElement) {
      // Skip if this label already has a sparkle
      if (labelsWithSparkles.has(fieldInfo.labelElement)) {
        console.log('[SPARKLE] Skipping duplicate label:', fieldInfo.fieldLabel);
        return;
      }

      labelsWithSparkles.add(fieldInfo.labelElement);

      fields.push(fieldInfo);
      fieldIndex++;
    }

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

  // Try to use sparkle.svg, fallback to emoji
  var content;
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      var img = document.createElement('img');
      img.src = chrome.runtime.getURL('icons/sparkle.svg');
      img.style.width = '20px';
      img.style.height = '20px';
      img.style.display = 'block';
      img.style.marginTop = '18px';

      if (state === 'empty') {
        img.style.filter = 'grayscale(100%) brightness(0.4) opacity(0.5)';
      } else if (state === 'generating') {
        img.style.filter = 'sepia(1) saturate(3) hue-rotate(180deg) brightness(0.9)';
      } else if (state === 'ready') {
        img.style.filter = 'sepia(1) saturate(5) hue-rotate(90deg) brightness(0.8)';
      } else if (state === 'filled') {
        img.style.filter = 'grayscale(100%) brightness(0.7)';
      }

      content = img;
    } else {
      throw new Error('chrome.runtime not available');
    }
  } catch (e) {
    // Fallback to emoji
    content = document.createElement('span');
    content.textContent = '✨';
    content.style.fontSize = '20px';
    content.style.display = 'block';

    if (state !== 'empty' && state !== 'ready') {
      content.style.opacity = state === 'generating' ? '0.7' : '0.5';
    }
  }

  icon.appendChild(content);
  return icon;
}

/**
 * Add sparkle icon to a field
 */
function addSparkleIcon(input, fieldName, labelElement) {
  // Check if this label already has a sparkle or is being processed
  if (labelElement) {
    if (labelElement._addingSparkle) {
      console.log('[SPARKLE] Already adding sparkle to this label, skipping');
      return;
    }
    if (labelElement.querySelector('.sp-sparkle-icon')) {
      console.log('[SPARKLE] Label already has sparkle, skipping:', labelElement.textContent.substring(0, 30));
      return;
    }
    // Mark that we're adding a sparkle to this label
    labelElement._addingSparkle = true;
  }

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

  // Create separate tooltip element (doesn't rotate with sparkle)
  var tooltip = document.createElement('div');
  tooltip.className = 'sp-tooltip';
  tooltip.textContent = tooltipText;
  icon.appendChild(tooltip);
  icon.title = tooltipText;

  icon.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();

    if (state === 'generating') return;

    // Open conversation for all states except generating
    openConversation(fieldName, input, icon);
  });

  input._sparkleIcon = icon;
  input._sparkleState = state;
  // Store element reference for later updates
  fieldElements[fieldName] = input;

  // Position sparkle next to label instead of input
  if (labelElement) {
    // Create a wrapper span to hold the sparkle for proper vertical alignment
    var wrapper = document.createElement('span');
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.verticalAlign = 'middle';
    wrapper.style.marginLeft = '6px';

    // Style the icon to center within wrapper
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.justifyContent = 'center';
    icon.style.position = 'relative';
    icon.style.width = '20px';
    icon.style.height = '20px';

    wrapper.appendChild(icon);

    // Always append sparkle as last child of label
    labelElement.appendChild(wrapper);
  } else {
    // Fallback: append to input's parent if no label found
    var parent = input.parentElement;
    if (parent) {
      parent.classList.add('sp-input-wrapper');
      parent.appendChild(icon);
    }
  }
}

/**
 * Update sparkle for a specific field
 */
function updateSparkleForField(fieldName, approvedValue) {
  // Use stored element reference first, fall back to querySelector
  var input = fieldElements[fieldName] || document.querySelector('[name="' + fieldName + '"], #' + fieldName);
  if (!input || !input._sparkleIcon) return;

  var icon = input._sparkleIcon;
  var img = icon.querySelector('img') || icon.querySelector('span');

  icon.classList.remove('sp-sparkle-empty', 'sp-sparkle-generating');
  icon.classList.add('sp-sparkle-ready');
  if (img) {
    img.style.filter = 'sepia(1) saturate(5) hue-rotate(90deg) brightness(0.8)';
  }
  icon.setAttribute('data-tooltip', 'Click to fill');
  icon.title = 'Click to fill';
  input._sparkleState = 'ready';
}

/**
 * Update sparkle state
 */
function updateSparkleState(fieldName, isGenerating) {
  // Use stored element reference first, fall back to querySelector
  var input = fieldElements[fieldName] || document.querySelector('[name="' + fieldName + '"], #' + fieldName);
  if (!input || !input._sparkleIcon) return;

  var icon = input._sparkleIcon;
  var img = icon.querySelector('img') || icon.querySelector('span');

  if (isGenerating) {
    icon.classList.remove('sp-sparkle-empty', 'sp-sparkle-ready', 'sp-sparkle-filled');
    icon.classList.add('sp-sparkle-generating');
    if (img) {
      img.style.filter = 'sepia(1) saturate(3) hue-rotate(180deg) brightness(0.9)';
    }
    // Update tooltip
    var tooltip = icon.querySelector('.sp-tooltip');
    if (tooltip) {
      tooltip.textContent = 'Generating response...';
    }
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
  // Update tooltip
  var tooltip = icon.querySelector('.sp-tooltip');
  if (tooltip) {
    tooltip.textContent = 'Click to edit';
  }
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
  } else {
    // Send initial greeting to show application context
    sendInitialGreeting(fieldName, fieldLabel);
  }
}

/**
 * Send initial greeting with application context
 */
function sendInitialGreeting(fieldName, fieldLabel) {
  if (!scholarshipId || !applicationId) {
    addMessageToConversation('agent', 'Assistant', 'Hello! I can help you craft a response for this field. What would you like to say?', false);
    return;
  }

  var loadingEl = document.getElementById('sp-conversation-loading');
  if (loadingEl) {
    loadingEl.style.display = 'flex';
  }

  getAuthToken(function(token) {
    if (!token) {
      if (loadingEl) loadingEl.style.display = 'none';
      addMessageToConversation('agent', 'Assistant', 'Hello! I can help you craft a response for this field. What would you like to say?', false);
      return;
    }

    fetch(API_BASE_URL + '/api/extension/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({
        scholarshipId: scholarshipId,
        applicationId: applicationId,
        fieldName: fieldName,
        fieldLabel: fieldLabel,
        init: true,  // Request initial greeting
      }),
    })
    .then(function(response) {
      if (!response.ok) {
        throw new Error('Greeting API failed: ' + response.status);
      }
      return response.json();
    })
    .then(function(data) {
      if (loadingEl) loadingEl.style.display = 'none';

      if (data.response) {
        addMessageToConversation('agent', 'Assistant', data.response, false);
      }
    })
    .catch(function(error) {
      console.error('Scholarships Plus: Greeting API error:', error);
      if (loadingEl) loadingEl.style.display = 'none';
      addMessageToConversation('agent', 'Assistant', 'Hello! I can help you craft a response for this field. What would you like to say?', false);
    });
  });
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

  // Clear old sparkles and reset tracking
  var oldSparkles = document.querySelectorAll('.sp-sparkle-icon');
  oldSparkles.forEach(function(sparkle) {
    // Remove the wrapper span if it exists
    if (sparkle.parentElement && sparkle.parentElement.tagName === 'SPAN') {
      sparkle.parentElement.remove();
    } else {
      sparkle.remove();
    }
  });
  labelsWithSparkles.clear();

  // Also clear _addingSparkle flags from all labels
  var allLabels = document.querySelectorAll('label');
  allLabels.forEach(function(label) {
    delete label._addingSparkle;
  });

  console.log('Scholarships Plus: Cleared ' + oldSparkles.length + ' old sparkles');

  extractedFields = extractAllFields();
  console.log('Scholarships Plus: Extracted ' + extractedFields.length + ' fields');

  if (extractedFields.length === 0) {
    console.log('Scholarships Plus: No fields found');
    return;
  }

  // Add sparkles IMMEDIATELY without waiting for API
  var sparkleCount = 0;

  extractedFields.forEach(function(fieldInfo) {
    // Use the stored element reference directly
    var input = fieldInfo.element || document.querySelector('[name="' + fieldInfo.fieldName + '"], #' + fieldInfo.fieldName);
    if (!input) return;

    // Skip if no label element - can't position sparkle properly
    if (!fieldInfo.labelElement) {
      console.log('[SPARKLE] Skipping field without label:', fieldInfo.fieldName);
      return;
    }

    // Use label element as unique key (not text content)
    if (labelsWithSparkles.has(fieldInfo.labelElement)) return;
    labelsWithSparkles.add(fieldInfo.labelElement);

    addSparkleIcon(input, fieldInfo.fieldName, fieldInfo.labelElement);
    sparkleCount++;
  });

  console.log('Scholarships Plus: Added initial sparkles for ' + sparkleCount + ' unique labels');

  // Then submit to API to get mappings
  submitFieldsToAPI(extractedFields, function(response) {
    if (!response) {
      console.error('Scholarships Plus: Failed to submit fields');
      return;
    }

    var readyCount = 0;
    var generatingCount = 0;

    // Update sparkle states based on API response
    extractedFields.forEach(function(fieldInfo) {
      var mapping = fieldMappings[fieldInfo.fieldName];
      if (mapping) {
        if (mapping.approvedValue) {
          readyCount++;
          // Update to ready state
          updateSparkleForField(fieldInfo.fieldName, mapping.approvedValue);
        } else if (mapping.generating) {
          generatingCount++;
          // Update to generating state
          updateSparkleState(fieldInfo.fieldName, true);
        }
      }
    });

    console.log('Scholarships Plus: Updated sparkles - ' + readyCount + ' ready, ' + generatingCount + ' generating');

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

  // Wait longer for dynamic content (like Select2) to finish rendering
  setTimeout(processFields, 1500);
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
