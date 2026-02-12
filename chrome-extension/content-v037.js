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
.sp-sparkle-icon{position:relative!important;width:24px!important;height:24px!important;min-width:24px!important;max-width:24px!important;min-height:24px!important;max-height:24px!important;z-index:999999!important;cursor:pointer!important;flex-shrink:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;vertical-align:middle!important;margin-left:8px!important;opacity:1!important;transform:translateY(-2px)!important}
.sp-sparkle-icon:hover{transform:translateY(-2px) scale(1.2)!important;opacity:1!important}
.sp-sparkle-icon span,.sp-sparkle-icon img{width:24px!important;height:24px!important;display:block!important;object-fit:contain!important}
.sp-sparkle-icon.sp-sparkle-ready img{filter:none!important;opacity:1!important}
.sp-sparkle-icon.sp-sparkle-ready:hover{filter:drop-shadow(0 0 4px rgba(255,188,0,.6))!important;opacity:1!important}
.sp-sparkle-icon.sp-sparkle-generating{animation:pulse 1s ease-in-out infinite!important}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.sp-tooltip{position:absolute!important;bottom:calc(100% + 8px)!important;left:50%!important;transform:translateX(-50%)!important;padding:6px 10px!important;background:rgba(31,41,55,.95)!important;color:#fff!important;font-size:11px!important;font-family:system-ui,-apple-system,sans-serif!important;white-space:nowrap!important;border-radius:4px!important;z-index:9999999!important;pointer-events:none!important;opacity:0!important;transition:opacity .2s ease!important;max-width:200px!important;text-align:center!important;line-height:1.3!important}
.sp-sparkle-icon:hover .sp-tooltip{opacity:1!important}
.sp-demo-banner{position:fixed!important;top:20px!important;left:50%!important;transform:translateX(-50%)!important;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)!important;color:white!important;padding:12px 20px!important;border-radius:8px!important;font-family:system-ui,-apple-system,sans-serif!important;font-size:14px!important;z-index:9999999!important;box-shadow:0 4px 12px rgba(102,126,234,.4)!important;transition:opacity .5s ease!important;text-align:center!important;line-height:1.4!important;max-width:90vw!important}
`;
  (document.head || document.documentElement).appendChild(style);
  console.log('Scholarships Plus: CSS injected directly');
})();

// Signal to page that extension is loaded
var event = new CustomEvent('scholarshipsPlusExtensionLoaded', { detail: { version: '0.5.9' } });
window.dispatchEvent(event);
console.log('Scholarships Plus: Extension detection event dispatched');

// Configuration
var API_BASE_URL = 'http://localhost:3030';
var WEBAPP_BASE_URL = 'http://localhost:3030';  // Updated to match dev server port
var EXTENSION_AUTH_URL = WEBAPP_BASE_URL + '/extension-auth';  // Dedicated extension auth page
var POLL_INTERVAL = 3000;
var MAX_POLLS = 40;

// Storage for field data
var extractedFields = [];
var fieldMappings = {};
var fieldElements = {}; // Map fieldName -> DOM element
var labelsWithSparkles = new Set(); // Track labels that have sparkles to avoid duplicates
var scholarshipId = null;
var scholarshipTitle = null;
var applicationId = null;
var pollCount = 0;
var pollTimer = null;
var authToken = null;

// Current conversation state
var currentConversation = null;
var conversationModal = null;
var currentFieldName = null;

/**
 * Extract scholarship title from page content
 * Tries multiple selectors to find the scholarship name
 */
function extractScholarshipTitle() {
  // Try common selectors for scholarship titles
  var selectors = [
    'h1',                      // Main heading
    'title',                   // Page title
    '[class*="title"]',        // Elements with "title" in class
    '[id*="title"]',           // Elements with "title" in id
    '.program-title',          // Common class
    '.scholarship-title',      // Common class
    'h2',                      // Secondary heading
  ];

  for (var i = 0; i < selectors.length; i++) {
    var elements = document.querySelectorAll(selectors[i]);
    for (var j = 0; j < elements.length; j++) {
      var text = elements[j].textContent.trim();
      // Skip empty text, navigation links, or very short text
      if (text && text.length > 10 && !text.includes('Click to') && !text.includes('Apply')) {
        console.log('[SCHOLARSHIP] Found title from ' + selectors[i] + ':', text.substring(0, 50));
        return text.substring(0, 200); // Limit length
      }
    }
  }

  console.log('[SCHOLARSHIP] No title found, using fallback');
  return 'Scholarship Application';
}

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
 * Extract clean text from a label element, excluding form element content
 * This prevents select option text from being included in the label
 *
 * For example, if the label contains:
 *   "Major/Field of Study <select><option>CS</option><option>EE</option></select>"
 * This returns: "Major/Field of Study"
 */
function getCleanLabelText(labelElement) {
  if (!labelElement) return '';

  // Clone the label to avoid modifying the original DOM
  var clone = labelElement.cloneNode(true);

  // Remove all form elements from the clone (select, input, textarea)
  var formElements = clone.querySelectorAll('select, input, textarea, button');
  for (var i = 0; i < formElements.length; i++) {
    formElements[i].parentNode.removeChild(formElements[i]);
  }

  // Get text content from the cleaned clone
  var text = clone.textContent.trim();

  // Remove trailing asterisks and whitespace
  text = text.replace(/\*+$/, '').trim();

  // Remove common instruction suffixes that may have been in the label
  var suffixesToRemove = [
    ' - please select from the list\\s*$',
    ' - please select\\s*$',
    ' please select from the list\\s*$',
    ' please select\\s*$',
    ' - .*\\(if applicable\\)\\s*$',
    ' - .*\\(if different\\)\\s*$',
    ' if not listed.*\\s*$',
    ' if other.*\\s*$',
  ];

  for (var i = 0; i < suffixesToRemove.length; i++) {
    var regex = new RegExp(suffixesToRemove[i], 'gi');
    text = text.replace(regex, '');
  }

  // Clean up extra whitespace and trailing punctuation
  text = text.replace(/\s+/g, ' ').replace(/[.,;:!]+$/, '');

  return text.trim();
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

  console.log('[FINDLABEL] Starting for element:', element.name || element.id, element.type);

  // STEP 1: Handle Radio & Checkbox Groups (Semantic Grouping)
  if ((element.type === 'radio' || element.type === 'checkbox') && element.name) {
    var groupInputs = document.querySelectorAll('input[name="' + element.name + '"]');
    if (groupInputs.length > 1) {
      var lca = findLCA(Array.from(groupInputs));
      if (lca) {
        // First, try to find a legend or fieldset label (question label)
        label = lca.querySelector('legend');
        if (label && label.textContent.trim().length > 5) {
          source = 'radio-group-legend';
        } else {
          // No legend, look for question label BEFORE the radio group
          // Check if LCA is inside a fieldset - use the fieldset's legend
          var fieldset = lca.closest('fieldset');
          if (fieldset && fieldset !== lca) {
            var fieldsetLegend = fieldset.querySelector('legend');
            if (fieldsetLegend && fieldsetLegend.textContent.trim().length > 5) {
              label = fieldsetLegend;
              source = 'fieldset-legend';
            }
          }

          // Still no label? Look for a label or text element BEFORE the first radio input
          if (!label) {
            var firstInput = groupInputs[0];
            var parentContainer = firstInput.closest('div, fieldset, section, article');

            if (parentContainer) {
              // Look for elements BEFORE the first radio option that have meaningful text
              // These are typically the question labels
              var candidates = parentContainer.querySelectorAll('label, p, span, div, h1, h2, h3, h4, h5, h6');

              for (var i = 0; i < candidates.length; i++) {
                var candidate = candidates[i];

                // Skip if this candidate is a label wrapping a radio input (option label)
                if (candidate.tagName === 'LABEL' &&
                    (candidate.querySelector('input[type="radio"]') ||
                     candidate.querySelector('input[type="checkbox"]'))) {
                  continue;
                }

                // Skip if this candidate is a descendant of another label (nested option label)
                if (candidate.closest('label') !== null) {
                  continue;
                }

                // Get clean text excluding nested form elements
                var candidateText = getCleanLabelText(candidate);

                // Skip option labels (typically short: "Yes", "No", "Male", "Female")
                // Question labels are usually longer and contain question words
                if (candidateText.length < 15) {
                  continue;
                }

                // Check if this candidate appears BEFORE the first radio input
                var candidateRect = candidate.getBoundingClientRect();
                var inputRect = firstInput.getBoundingClientRect();

                // Use DOM position comparison rather than viewport coordinates
                // Candidate must come before the input in DOM order OR be visually above
                var position = candidate.compareDocumentPosition(firstInput);
                var isBefore = !!(position & Node.DOCUMENT_POSITION_FOLLOWING);

                if (isBefore || candidateRect.top < inputRect.top - 10) {
                  var textLength = candidateText.length;
                  // Question labels are typically longer than option labels
                  // Prefer labels with question marks or longer text
                  var hasQuestionMark = candidateText.indexOf('?') !== -1;
                  var priority = hasQuestionMark ? 1000 : textLength;
                  var currentPriority = label ? ((label.textContent.indexOf('?') !== -1 ? 1000 : 0) + label.textContent.trim().length) : 0;

                  if (priority > currentPriority) {
                    label = candidate;
                    source = 'radio-group-before-input';
                  }
                }
              }
            }
          }

          // Last resort: check previous sibling of LCA
          if (!label) {
            label = lca.previousElementSibling;
            if (label) source = 'radio-group-lca-prev-sibling';
          }
        }
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
    console.log('[FINDLABEL] header found:', !!header, 'text length:', header ? header.textContent.trim().length : 0);
    if (header && header.textContent.trim().length > 5) {
      label = header;
      source = 'container-header';
      console.log('[FINDLABEL] Using header label, text:', header.textContent.trim().substring(0, 50));
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

  // STEP 4: FALLBACK - Use container element as label if it has meaningful text
  // This handles forms where the label text is directly in the container (not in a <label> element)
  if (!label) {
    var container = element.closest('article, section, div.field, div.form-group, .question, .form-row');
    if (container) {
      // Get text content but exclude the form element's own options/text
      var containerText = getCleanLabelText(container);
      // Check if container has meaningful label-like text (not just whitespace or option text)
      if (containerText && containerText.length > 5 && containerText.length < 200) {
        label = container;
        source = 'container-as-label';
      }
    }
  }

  console.log('[FINDLABEL] Returning label:', !!label, 'source:', source, 'text:', label ? label.textContent.trim().substring(0, 40) : 'none');
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
    info.fieldLabel = getCleanLabelText(label);
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

  console.log('[SPARKLE] extractAllFields: Starting extraction...');
  var elements = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');
  console.log('[SPARKLE] Found ' + elements.length + ' total form elements');

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
  // Extract scholarship title from page content before submitting
  var extractedTitle = extractScholarshipTitle();
  console.log('[SCHOLARSHIP] Submitting with title:', extractedTitle);

  getAuthToken(function(token) {
    if (!token) {
      console.error('Scholarships Plus: No auth token found');
      // Return specific error indicating auth required
      callback({ authRequired: true });
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
        scholarshipTitle: extractedTitle,
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
      scholarshipTitle = data.scholarshipTitle;
      applicationId = data.applicationId;

      fieldMappings = {};
      if (data.mappings && Array.isArray(data.mappings)) {
        data.mappings.forEach(function(mapping) {
          // Defensive: skip undefined/null mappings
          if (!mapping || !mapping.fieldName) return;
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
          // Defensive: skip undefined/null mappings
          if (!mapping || !mapping.fieldName) return;

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

  // Set tooltip based on state
  if (state === 'empty') {
    icon.classList.add('sp-sparkle-empty');
    icon.setAttribute('data-tooltip', 'Chat about this.');
  } else if (state === 'generating') {
    icon.classList.add('sp-sparkle-generating');
    icon.setAttribute('data-tooltip', 'Generating response...');
  } else if (state === 'conflict') {
    icon.classList.add('sp-sparkle-conflict');
    icon.setAttribute('data-tooltip', 'Chat about this.');
  } else if (state === 'ready') {
    icon.classList.add('sp-sparkle-ready');
    icon.setAttribute('data-tooltip', 'Autofill');
  } else if (state === 'filled') {
    icon.classList.add('sp-sparkle-filled');
    icon.setAttribute('data-tooltip', 'Modify this response.');
  }

  // Try to use sparkle.svg, fallback to emoji
  var content;
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      var img = document.createElement('img');
      img.src = chrome.runtime.getURL('icons/sparkle.svg');
      img.style.width = '24px';
      img.style.height = '24px';
      img.style.display = 'block';
      // No filter - let the sparkle show in its natural gold color

      content = img;
    } else {
      throw new Error('chrome.runtime not available');
    }
  } catch (e) {
    // Fallback to emoji
    content = document.createElement('span');
    content.textContent = '✨';
    content.style.fontSize = '24px';
    content.style.display = 'block';
  }

  icon.appendChild(content);
  return icon;
}

/**
 * Add sparkle icon to a field
 */
function addSparkleIcon(input, fieldName, labelElement, fieldLabel) {
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
    } else if (mapping.hasConflict) {
      state = 'conflict';  // Multiple options available
    }
  }

  var icon = createSparkleIcon(state);

  icon.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();

    if (state === 'generating') return;

    // If field has an approved value, fill it directly
    var mapping = fieldMappings[fieldName];
    if (mapping && mapping.approvedValue && state === 'ready') {
      fillField(input, mapping.approvedValue);
      return;
    }

    // Otherwise, open conversation for editing/generating
    openConversation(fieldName, input, icon, fieldLabel);
  });

  input._sparkleIcon = icon;
  input._sparkleState = state;
  // Store element reference for later updates
  fieldElements[fieldName] = input;

  // Position sparkle next to label instead of input
  if (labelElement) {
    // Apply wrap-safe flex to the label to allow text wrapping
    labelElement.style.setProperty('display', 'flex', 'important');
    labelElement.style.setProperty('flex-wrap', 'wrap', 'important');
    labelElement.style.setProperty('align-items', 'baseline', 'important');
    labelElement.style.setProperty('gap', '6px', 'important');
    labelElement.style.setProperty('overflow', 'visible', 'important');

    // Create a wrapper span to hold the sparkle
    var wrapper = document.createElement('span');
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.flexShrink = '0'; // Don't shrink the sparkle

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
  var input = fieldElements[fieldName];
  if (!input) {
    // Try name selector first (works for all field names)
    input = document.querySelector('[name="' + fieldName + '"]');
    // If not found, try ID selector with proper escaping
    if (!input) {
      try {
        input = document.querySelector('#' + CSS.escape(fieldName));
      } catch (e) {
        // Invalid selector, skip
      }
    }
  }
  if (!input || !input._sparkleIcon) return;

  var icon = input._sparkleIcon;
  var img = icon.querySelector('img') || icon.querySelector('span');

  icon.classList.remove('sp-sparkle-empty', 'sp-sparkle-generating', 'sp-sparkle-filled', 'sp-sparkle-conflict');
  icon.classList.add('sp-sparkle-ready');
  // No inline filter - let CSS handle the appearance
  // Update tooltip using data-tooltip attribute
  icon.setAttribute('data-tooltip', 'Autofill');
  input._sparkleState = 'ready';
}

/**
 * Update sparkle state
 */
function updateSparkleState(fieldName, isGenerating) {
  // Use stored element reference first, fall back to querySelector
  var input = fieldElements[fieldName];
  if (!input) {
    // Try name selector first (works for all field names)
    input = document.querySelector('[name="' + fieldName + '"]');
    // If not found, try ID selector with proper escaping
    if (!input) {
      try {
        input = document.querySelector('#' + CSS.escape(fieldName));
      } catch (e) {
        // Invalid selector, skip
      }
    }
  }
  if (!input || !input._sparkleIcon) return;

  var icon = input._sparkleIcon;
  var img = icon.querySelector('img') || icon.querySelector('span');

  if (isGenerating) {
    icon.classList.remove('sp-sparkle-empty', 'sp-sparkle-ready', 'sp-sparkle-filled', 'sp-sparkle-conflict');
    icon.classList.add('sp-sparkle-generating');
    // No inline filter - let CSS handle the appearance
    // Update tooltip using data-tooltip attribute
    icon.setAttribute('data-tooltip', 'Generating response...');
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

  icon.classList.remove('sp-sparkle-empty', 'sp-sparkle-generating', 'sp-sparkle-ready', 'sp-sparkle-conflict');
  icon.classList.add('sp-sparkle-filled');
  // No inline filter - let CSS handle the appearance
  // Update tooltip using data-tooltip attribute
  icon.setAttribute('data-tooltip', 'Modify this response.');
  input._sparkleState = 'filled';
}

/**
 * Open conversation modal
 */
function openConversation(fieldName, input, icon, extractedLabel) {
  var mapping = fieldMappings[fieldName];
  // Use extracted label if available, otherwise fall back to mapping label or fieldName
  var fieldLabel = extractedLabel || (mapping ? mapping.fieldLabel : fieldName);

  closeConversation();

  // IMPORTANT: Set currentFieldName AFTER closeConversation() since closeConversation clears it
  currentFieldName = fieldName;

  conversationModal = createConversationModal(fieldName, fieldLabel, input, icon, scholarshipTitle);
  document.body.appendChild(conversationModal);

  // Check authentication status first
  getAuthToken(function(token) {
    if (!token) {
      // Not logged in - show login prompt
      addMessageToConversation('agent', 'Authentication Required',
        'Please log in to use the AI assistant. Click the link below to authenticate:<br><br>' +
        '<a href="' + EXTENSION_AUTH_URL + '" target="_blank" style="color:#3b82f6;text-decoration:underline;font-weight:bold;">🔗 Log in to Scholarships Plus</a>',
        false, true);
      return;
    }

    // Check if field is already filled (editing case)
    var sparkleState = input._sparkleState;
    if (mapping && mapping.approvedValue && sparkleState === 'filled') {
      // Field is filled, user wants to edit - show current value
      addMessageToConversation('agent', 'Current response:', mapping.approvedValue);
    } else {
      // No value yet, or user is generating for the first time
      // Send initial greeting to show application context
      sendInitialGreeting(fieldName, fieldLabel);
    }
  });
}

/**
 * Send initial greeting with application context
 */
function sendInitialGreeting(fieldName, fieldLabel) {
  if (!scholarshipId || !applicationId) {
    addMessageToConversation('agent', 'Assistant', 'Hello! I can help you craft a response for this field. What would you like to say?', false);
    return;
  }

  // Show loading indicator
  var loadingEl = document.getElementById('sp-conversation-loading');
  if (loadingEl) {
    loadingEl.style.display = 'flex';
  }

  getAuthToken(function(token) {
    if (!token) {
      // Hide loading indicator - always get current reference
      var currentLoadingEl = document.getElementById('sp-conversation-loading');
      if (currentLoadingEl) currentLoadingEl.style.display = 'none';
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
      // Hide loading indicator - always get current reference
      var currentLoadingEl = document.getElementById('sp-conversation-loading');
      if (currentLoadingEl) currentLoadingEl.style.display = 'none';

      if (data.response) {
        // Check if we have multiple options to present
        if (data.options && Array.isArray(data.options) && data.options.length > 1) {
          // Show message with option buttons
          addMessageWithOptions('agent', 'Assistant', data.response, data.options);
        } else {
          addMessageToConversation('agent', 'Assistant', data.response, false);
        }
      }
    })
    .catch(function(error) {
      console.error('Scholarships Plus: Greeting API error:', error);
      // Hide loading indicator - always get current reference
      var currentLoadingEl = document.getElementById('sp-conversation-loading');
      if (currentLoadingEl) currentLoadingEl.style.display = 'none';
      addMessageToConversation('agent', 'Assistant', 'Hello! I can help you craft a response for this field. What would you like to say?', false);
    });
  });
}

/**
 * Create conversation modal
 */
function createConversationModal(fieldName, fieldLabel, input, icon, scholarshipTitle) {
  var modal = document.createElement('div');
  modal.className = 'sp-conversation-modal';
  modal.id = 'sp-conversation-modal';

  // Build modal without inline event handlers
  var header = document.createElement('div');
  header.className = 'sp-conversation-header';

  var heading = document.createElement('h3');
  // Use scholarship title as the modal title, fallback to field label if not available
  heading.textContent = scholarshipTitle || fieldLabel || fieldName;

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
 * Simple Markdown Parser
 * Supports: bold, italic, links, line breaks, paragraphs
 */
function parseMarkdown(text) {
  if (!text) return '';

  // Escape HTML first to prevent XSS
  var html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Links [text](url) - must be done before other processing
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, text, url) {
    return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
  });

  // Bold **text** or __text__
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic *text* or _text_ (but not if already part of bold)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Line breaks - convert double newlines to paragraphs
  var paragraphs = html.split(/\n\n+/);
  var result = paragraphs.map(function(para) {
    // Single line breaks within paragraphs become <br>
    return '<p>' + para.replace(/\n/g, '<br>') + '</p>';
  }).join('');

  return result;
}

/**
 * Add message to conversation
 */
function addMessageToConversation(type, label, content, withApproval, allowHTML) {
  var messagesContainer = document.getElementById('sp-conversation-messages');
  if (!messagesContainer) return;

  var messageDiv = document.createElement('div');
  messageDiv.className = 'sp-message sp-message-' + type;

  var labelDiv = document.createElement('div');
  labelDiv.className = 'sp-message-label';
  labelDiv.textContent = label;

  var contentDiv = document.createElement('div');
  contentDiv.className = 'sp-message-content';
  // Parse markdown for agent messages, use plain text for user messages
  if (allowHTML) {
    contentDiv.innerHTML = content;
  } else if (type === 'agent' || type === 'suggestion') {
    // Parse markdown for AI responses (with HTML escaping for security)
    contentDiv.innerHTML = parseMarkdown(content);
  } else {
    // Use plain text for user messages
    contentDiv.textContent = content;
  }

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
 * Add message with option buttons (for multiple candidate values)
 */
function addMessageWithOptions(type, label, content, options) {
  var messagesContainer = document.getElementById('sp-conversation-messages');
  if (!messagesContainer) return;

  var messageDiv = document.createElement('div');
  messageDiv.className = 'sp-message sp-message-' + type;

  var labelDiv = document.createElement('div');
  labelDiv.className = 'sp-message-label';
  labelDiv.textContent = label;

  var contentDiv = document.createElement('div');
  contentDiv.className = 'sp-message-content';
  contentDiv.innerHTML = parseMarkdown(content);

  messageDiv.appendChild(labelDiv);
  messageDiv.appendChild(contentDiv);

  // Add option buttons
  if (options && options.length > 0) {
    var optionsDiv = document.createElement('div');
    optionsDiv.className = 'sp-options-buttons';
    optionsDiv.style.display = 'flex';
    optionsDiv.style.flexDirection = 'column';
    optionsDiv.style.gap = '8px';
    optionsDiv.style.marginTop = '12px';

    options.forEach(function(option, index) {
      var optionBtn = document.createElement('button');
      optionBtn.className = 'sp-option-button';
      optionBtn.textContent = option;
      optionBtn.style.padding = '10px 16px';
      optionBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      optionBtn.style.color = 'white';
      optionBtn.style.border = 'none';
      optionBtn.style.borderRadius = '6px';
      optionBtn.style.cursor = 'pointer';
      optionBtn.style.fontSize = '14px';
      optionBtn.style.fontWeight = '500';
      optionBtn.style.textAlign = 'left';
      optionBtn.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';

      optionBtn.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-2px)';
        this.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
      });

      optionBtn.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
        this.style.boxShadow = 'none';
      });

      optionBtn.addEventListener('click', function() {
        // User selected this option - treat as if they typed it
        var inputField = document.getElementById('sp-conversation-input-field');
        if (inputField) {
          inputField.value = option;
          sendUserMessage();
        }
      });

      optionsDiv.appendChild(optionBtn);
    });

    // Add "Other" button for custom value
    var otherBtn = document.createElement('button');
    otherBtn.className = 'sp-option-button sp-option-other';
    otherBtn.textContent = 'None of these - let me type it';
    otherBtn.style.padding = '10px 16px';
    otherBtn.style.background = '#6b7280';
    otherBtn.style.color = 'white';
    otherBtn.style.border = 'none';
    otherBtn.style.borderRadius = '6px';
    otherBtn.style.cursor = 'pointer';
    otherBtn.style.fontSize = '14px';
    otherBtn.style.fontWeight = '500';
    otherBtn.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';

    otherBtn.addEventListener('mouseenter', function() {
      this.style.transform = 'translateY(-2px)';
      this.style.boxShadow = '0 4px 12px rgba(107, 114, 128, 0.4)';
    });

    otherBtn.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = 'none';
    });

    otherBtn.addEventListener('click', function() {
      // Just focus the input field so user can type
      var inputField = document.getElementById('sp-conversation-input-field');
      if (inputField) {
        inputField.focus();
      }
    });

    optionsDiv.appendChild(otherBtn);
    messageDiv.appendChild(optionsDiv);
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

  // Call chat API for all messages - let LLM decide canPropose
  callChatAPI(message);
}

/**
 * Call chat API for field conversation or general chat
 */
function callChatAPI(userMessage) {
  // For field-specific chat, require currentFieldName
  // For general chat, currentFieldName is null but we still need scholarshipId/applicationId
  if (!scholarshipId || !applicationId) {
    console.error('Scholarships Plus: Missing context for chat', { scholarshipId, applicationId });
    addMessageToConversation('agent', 'Assistant', 'I\'m still connecting to the server. Please wait a moment and try again!', false);
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
      var currentLoadingEl = document.getElementById('sp-conversation-loading');
      if (currentLoadingEl) currentLoadingEl.style.display = 'none';
      if (inputField) inputField.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      return;
    }

    // Build request body - include field info only if in field-specific mode
    var requestBody = {
      scholarshipId: scholarshipId,
      applicationId: applicationId,
      message: userMessage,
    };

    // Add field-specific parameters only if we're in field-specific mode
    if (currentFieldName) {
      var mapping = fieldMappings[currentFieldName];
      requestBody.fieldName = currentFieldName;
      requestBody.fieldLabel = mapping ? mapping.fieldLabel : currentFieldName;
      requestBody.fieldType = mapping ? mapping.fieldType : 'text';
      requestBody.currentValue = mapping ? mapping.approvedValue : null;
    }

    fetch(API_BASE_URL + '/api/extension/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify(requestBody),
    })
    .then(function(response) {
      if (!response.ok) {
        throw new Error('Chat API failed: ' + response.status);
      }
      return response.json();
    })
    .then(function(data) {
      // Debug: Log the API response
      console.log('[CHAT-API] Response received:', data);

      // Hide loading indicator - always get current reference
      var currentLoadingEl = document.getElementById('sp-conversation-loading');
      if (currentLoadingEl) currentLoadingEl.style.display = 'none';
      if (inputField) inputField.disabled = false;
      if (sendBtn) sendBtn.disabled = false;

      if (data.response) {
        // Check if this is an autofill response (user selected from options)
        if (data.autofill && currentFieldName) {
          // Find the input element
          var input = document.querySelector('[name="' + currentFieldName + '"], #' + currentFieldName);

          if (input) {
            // Fill the field
            fillField(input, data.response);

            // Show notification
            showNotification('Saved!');

            // Close modal after a brief delay to show the notification
            setTimeout(closeConversation, 500);
          }

          return; // Exit early, no need to show chat message
        }

        // In field-specific mode:
        // - If options array exists, show option buttons
        // - If canPropose is true, show as suggestion with approval buttons
        // - If canPropose is false/missing, show as regular agent message (clarifying questions)
        if (currentFieldName) {
          // NEW: Check if we have multiple options to present
          if (data.options && Array.isArray(data.options) && data.options.length > 1) {
            // Show message with option buttons
            addMessageWithOptions('agent', 'Assistant', data.response, data.options);
          } else if (data.canPropose) {
            // AI has enough info - show as proposal with action buttons
            // Use proposedValue if provided (for single candidate), otherwise use response
            var proposedValue = data.proposedValue || data.response;

            // If proposedValue exists, show greeting first, then the value as suggestion
            if (data.proposedValue) {
              // Show greeting as regular message
              addMessageToConversation('agent', 'Assistant', data.response, false);
              // Show proposed value as suggestion with approval buttons
              addMessageToConversation('suggestion', 'Proposed Response:', data.proposedValue, true);
            } else {
              // Legacy: AI generated the value, show as suggestion
              addMessageToConversation('suggestion', 'Proposed Response:', data.response, true);
            }

            // Store the actual value for approval (not the greeting message)
            if (!currentConversation) {
              currentConversation = [];
            }
            currentConversation.push({
              type: 'suggestion',
              content: proposedValue,  // Use proposedValue, not the greeting
            });
          } else {
            // AI needs more info - show as regular message (asking clarifying questions)
            addMessageToConversation('agent', 'Assistant', data.response, false);
          }
        } else {
          // General chat mode - just show the response
          addMessageToConversation('agent', 'Assistant', data.response, false);
        }
      }
    })
    .catch(function(error) {
      console.error('Scholarships Plus: Chat API error:', error);
      // Hide loading indicator - always get current reference
      var currentLoadingEl = document.getElementById('sp-conversation-loading');
      if (currentLoadingEl) currentLoadingEl.style.display = 'none';
      if (inputField) inputField.disabled = false;
      if (sendBtn) sendBtn.disabled = false;

      addMessageToConversation('agent', 'Error', 'Sorry, I couldn\'t generate a response. Please try again.', false);
    });
  });
}

/**
 * Escape special characters in CSS selectors
 * Handles square brackets and other special chars that break selectors
 */
function escapeCssSelector(str) {
  return str.replace(/[:[\]\\\/&~.,|$^*=!<>?@()]/g, '\\$&');
}

/**
 * Approve suggestion and fill field
 */
window.approveSuggestion = function() {
  if (!currentConversation || currentConversation.length === 0) return;

  var lastSuggestion = currentConversation[currentConversation.length - 1];
  if (lastSuggestion.type !== 'suggestion') return;

  var suggestedValue = lastSuggestion.content;
  var escapedFieldName = escapeCssSelector(currentFieldName);
  var input = document.querySelector('[name="' + escapedFieldName + '"], #' + escapedFieldName);

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
  } else {
    console.error('[SPARKLE] Could not find input for field:', currentFieldName);
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

  // Store original autofilled value for comparison
  input._autofilledValue = value;

  // Fill with adaptive speed
  fillFieldWithAnimation(input, value).then(function() {
    // Transition to filled state
    transitionToFilled(input);

    // For essay fields, add auto-save on blur
    var isEssayField = input.tagName === 'TEXTAREA' ||
                       (input.type !== 'number' && input.type !== 'date' && input.type !== 'select-one' && value.length > 100);

    if (isEssayField && !input._blurHandlerAttached) {
      input._blurHandlerAttached = true;

      input.addEventListener('blur', function() {
        var currentValue = input.value.trim();
        var originalValue = input._autofilledValue;

        // Only save if value changed and is not empty
        if (currentValue && currentValue !== originalValue) {
          console.log('[AUTO-SAVE] Field edited, saving to history:', input.name || input.id);
          saveEditedResponseToHistory(input, currentValue);
          // Update stored value
          input._autofilledValue = currentValue;
        }
      });

      console.log('[AUTO-SAVE] Attached blur handler to essay field:', input.name || input.id);
    }
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
    var inputType = (input.type || '').toLowerCase();

    // For select, number, date, time, email, tel, url - set value directly (no animation)
    // These fields have validation/formatting that breaks with character-by-character input
    if (input.tagName === 'SELECT' ||
        inputType === 'number' ||
        inputType === 'date' ||
        inputType === 'time' ||
        inputType === 'datetime-local' ||
        inputType === 'email' ||
        inputType === 'tel' ||
        inputType === 'url') {

      if (input.tagName === 'SELECT') {
        // Try to match by value or text
        var matched = false;
        for (var i = 0; i < input.options.length; i++) {
          var option = input.options[i];
          if (option.value === value || option.textContent.trim() === value) {
            input.value = option.value;
            matched = true;
            break;
          }
        }

        if (!matched) {
          // Try case-insensitive partial match
          for (var i = 0; i < input.options.length; i++) {
            var option = input.options[i];
            var optionText = option.textContent.trim().toLowerCase();
            var valueLower = value.toLowerCase();
            if (optionText.includes(valueLower) || valueLower.includes(optionText)) {
              input.value = option.value;
              matched = true;
              break;
            }
          }
        }

        // If still no match and value is long (likely a text response), call LLM to map to option
        if (!matched && value.length > 15) {
          console.log('[FILL] No direct match for select, calling LLM to map:', value);

          // Collect all option values
          var availableOptions = [];
          for (var i = 0; i < input.options.length; i++) {
            var opt = input.options[i];
            if (opt.value && opt.value !== '' && opt.value !== 'Select...') {
              availableOptions.push(opt.textContent.trim());
            }
          }

          // Call API to map response to best option
          getAuthToken(function(token) {
            if (!token) {
              console.error('[FILL] No auth token for option mapping');
              return;
            }

            fetch(API_BASE_URL + '/api/extension/map-option', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
              },
              body: JSON.stringify({
                response: value,
                options: availableOptions,
                fieldLabel: input.name || input.id || 'Field',
              }),
            })
            .then(function(response) {
              return response.json();
            })
            .then(function(data) {
              if (data.bestOption) {
                console.log('[FILL] LLM mapped to option:', data.bestOption);
                // Find and select the matching option
                for (var i = 0; i < input.options.length; i++) {
                  var option = input.options[i];
                  if (option.textContent.trim() === data.bestOption ||
                      option.value === data.bestOption) {
                    input.value = option.value;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    break;
                  }
                }
              }
            })
            .catch(function(error) {
              console.error('[FILL] Option mapping error:', error);
            });
          });

          // Don't resolve yet - will happen after API call
          return;
        }
      } else {
        // For number, date, etc. - set directly
        input.value = value;
      }

      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      resolve(true);
    } else {
      // Text fields - use typewriter animation
      input.value = '';

      var speed;
      if (value.length < 100) {
        speed = 15;
      } else if (value.length < 500) {
        speed = 8;
      } else {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
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
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          resolve(true);
        }
      }, speed);

      var fullDuration = value.length * speed + 500;
      setTimeout(function() {
        if (index < value.length) {
          clearInterval(interval);
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        resolve(true);
      }, fullDuration);
    }
  });
}

/**
 * Show status banner
 */
function showBanner(totalFields, readyCount, generatingCount) {
  // Don't show normal banner if auth banner is present
  if (document.querySelector('.sp-auth-banner')) {
    return;
  }

  // Remove any existing Scholarships Plus banners first
  var existingBanners = document.querySelectorAll('.sp-demo-banner');
  for (var i = 0; i < existingBanners.length; i++) {
    existingBanners[i].remove();
  }

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
 * Show authentication required banner
 */
function showAuthBanner() {
  // Check if banner already exists
  if (document.querySelector('.sp-auth-banner')) return;

  // Remove any normal status banners first
  var existingBanners = document.querySelectorAll('.sp-demo-banner:not(.sp-auth-banner):not(.sp-error-banner)');
  for (var i = 0; i < existingBanners.length; i++) {
    existingBanners[i].remove();
  }

  var banner = document.createElement('div');
  banner.className = 'sp-demo-banner sp-auth-banner';
  banner.innerHTML = '✨ <strong>Scholarships+ Extension</strong><br>Please <a href="' + EXTENSION_AUTH_URL + '" target="_blank" style="color:white;text-decoration:underline;font-weight:bold;">log in</a> to use the AI assistant';

  // Add inline style to keep banner visible (doesn't auto-dismiss)
  banner.style.position = 'fixed';
  banner.style.top = '20px';
  banner.style.left = '50%';
  banner.style.transform = 'translateX(-50%)';
  banner.style.background = 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)'; // Red/orange for auth required
  banner.style.textAlign = 'center';

  document.body.appendChild(banner);
}

/**
 * Show error banner
 */
function showErrorBanner(errorMessage) {
  // Don't show error banner if auth banner is present (auth is more specific)
  if (document.querySelector('.sp-auth-banner')) {
    return;
  }

  // Remove any existing error banner
  var existingErrorBanner = document.querySelector('.sp-error-banner');
  if (existingErrorBanner) existingErrorBanner.remove();

  var banner = document.createElement('div');
  banner.className = 'sp-demo-banner sp-error-banner';
  banner.innerHTML = '✨ <strong>Scholarships Plus</strong><br>' + errorMessage;

  // Add inline style to make it stand out (red tint)
  banner.style.background = 'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)';

  // Make it dismissible
  banner.style.cursor = 'pointer';
  banner.addEventListener('click', function() {
    banner.remove();
  });

  document.body.appendChild(banner);
}

/**
 * Process fields and add sparkles
 */
function processFields() {
  console.log('Scholarships Plus: Processing fields...');

  // Check authentication status first
  getAuthToken(function(token) {
    if (!token) {
      // Not logged in - show auth banner
      showAuthBanner();
      console.log('Scholarships Plus: User not authenticated, showing login banner');
    }
  });

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

  // IMPORTANT: Clear data-sparkle-added attribute from all form elements
  // This allows re-processing after login without missing fields
  var allFormElements = document.querySelectorAll('[data-sparkle-added]');
  allFormElements.forEach(function(el) {
    el.removeAttribute('data-sparkle-added');
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
    // Defensive: skip undefined entries
    if (!fieldInfo || !fieldInfo.fieldName) return;

    // Use the stored element reference directly
    var input = fieldInfo.element;
    if (!input) {
      // Try name selector first (works for all field names)
      input = document.querySelector('[name="' + fieldInfo.fieldName + '"]');
      // If not found, try ID selector with proper escaping
      if (!input) {
        try {
          input = document.querySelector('#' + CSS.escape(fieldInfo.fieldName));
        } catch (e) {
          // Invalid selector, skip
        }
      }
    }
    if (!input) {
      console.log('[SPARKLE] Skipping - no input element found for:', fieldInfo.fieldName);
      return;
    }

    // Use the new holistic injection method
    injectSparkleHolistically(input, fieldInfo.fieldName, fieldInfo.fieldLabel);
    sparkleCount++;
  });

  console.log('Scholarships Plus: Added initial sparkles for ' + sparkleCount + ' unique labels');

  // Then submit to API to get mappings
  submitFieldsToAPI(extractedFields, function(response) {
    if (!response) {
      console.error('Scholarships Plus: Failed to submit fields');
      // Show error banner
      showErrorBanner('Failed to connect to server. Please refresh the page.');
      return;
    }

    // Check if auth is required
    if (response && response.authRequired) {
      console.log('Scholarships Plus: Auth required');
      // Show auth banner instead of normal banner
      showAuthBanner();
      return;
    }

    // Show normal status banner
    showBanner(extractedFields.length, 0, 0);

    var readyCount = 0;
    var generatingCount = 0;

    // Update sparkle states based on API response
    extractedFields.forEach(function(fieldInfo) {
      // Defensive: skip undefined entries
      if (!fieldInfo || !fieldInfo.fieldName) return;

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
 * Find Lowest Common Ancestor of multiple elements
 */
function findLCA(elements) {
  if (elements.length === 0) return null;
  if (elements.length === 1) return elements[0];

  // Build paths using ES5 syntax
  var paths = [];
  for (var pi = 0; pi < elements.length; pi++) {
    var path = [];
    var el = elements[pi];
    while (el) {
      path.push(el);
      el = el.parentElement;
    }
    path.reverse();
    paths.push(path);
  }

  // Find minimum path length
  var minLength = paths[0].length;
  for (var pj = 1; pj < paths.length; pj++) {
    if (paths[pj].length < minLength) {
      minLength = paths[pj].length;
    }
  }

  var lca = paths[0][0];
  for (var i = 0; i < minLength; i++) {
    var current = paths[0][i];
    var allMatch = true;
    for (var pk = 0; pk < paths.length; pk++) {
      if (paths[pk][i] !== current) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) {
      lca = current;
    } else {
      break;
    }
  }
  return lca;
}

/**
 * Holistically inject sparkle for an input field
 * Finds the logical block and question text to position sparkle correctly
 */
function injectSparkleHolistically(input, fieldName, fieldLabel) {
  if (input.dataset.hasSparkleAdded) return;

  // 1. Identify the "Logical Block"
  // We climb until we find a container that likely holds the whole question
  // Standard scholarship apps use: article, fieldset, tr, or div.form-row
  var logicalBlock = input.closest('article, fieldset, tr, section, [class*="question"], [class*="form-row"], [class*="field"], .question, .field');

  if (!logicalBlock) {
    // Fallback: use parent div or form group
    logicalBlock = input.closest('div, label, span');
    if (!logicalBlock || logicalBlock === document.body) {
      // Last resort: use the input's parent
      logicalBlock = input.parentElement;
    }
    console.log('[SPARKLE] Using fallback logical block for:', fieldName);
  }

  if (!logicalBlock) {
    console.log('[SPARKLE] No logical block found for:', fieldName);
    return;
  }

  // 2. Locate the "Question Text" (The Anchor)
  var anchor = null;

  // PRIORITY A: Find the SPECIFIC label for THIS input (via for attribute, wrapping, or HTML5)
  // This ensures we find the correct label for each field, not just any label in the block
  if (input.id) {
    var labelByFor = document.querySelector('label[for="' + input.id + '"]');
    if (labelByFor) {
      anchor = labelByFor;
    }
  }

  // If no for-attribute label, check for wrapping label
  if (!anchor) {
    var labelByWrapper = input.closest('label');
    if (labelByWrapper && !labelByWrapper.querySelector('input, select, textarea')) {
      anchor = labelByWrapper;
    }
  }

  // If still no anchor, check HTML5 labels property
  if (!anchor && input.labels && input.labels.length > 0) {
    anchor = input.labels[0];
  }

  // PRIORITY B: Fall back to finding a label in the logical block (for fields without specific labels)
  if (!anchor) {
    var labels = logicalBlock.querySelectorAll('label');
    for (var j = 0; j < labels.length; j++) {
      var lab = labels[j];
      if (!lab.querySelector('input, select, textarea')) {
        anchor = lab;
        break;
      }
    }
  }

  // PRIORITY B: Look for legend (used in fieldsets)
  if (!anchor) {
    anchor = logicalBlock.querySelector('legend');
  }

  // PRIORITY C: Look for header, but check if it contains a label and use that instead
  if (!anchor) {
    var header = logicalBlock.querySelector('header');
    if (header) {
      // Check if header contains a label - if so, use the label
      var headerLabel = header.querySelector('label');
      if (headerLabel && !headerLabel.querySelector('input, select, textarea')) {
        anchor = headerLabel;
      } else {
        anchor = header;
      }
    }
  }

  // PRIORITY C: Group Logic for Radios/Checkboxes
  if (!anchor && (input.type === 'radio' || input.type === 'checkbox')) {
    var groupName = input.getAttribute('name');
    var groupInputs = document.querySelectorAll('input[name="' + groupName + '"]');
    var groupArray = [];
    for (var k = 0; k < groupInputs.length; k++) {
      groupArray.push(groupInputs[k]);
    }

    // Find Lowest Common Ancestor
    var lca = findLCA(groupArray);

    // Pick the first significant text element that acts as a header
    // Skip labels that wrap radio inputs
    var candidates = lca ? lca.querySelectorAll('p, span, div, label') : [];
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      // Skip if this candidate wraps an input (option label)
      if (candidate.tagName === 'LABEL' && candidate.querySelector('input')) continue;
      // Skip if inside another label (nested option label)
      if (candidate.closest('label') !== null && candidate.closest('label') !== candidate) continue;
      // Check if it has meaningful text
      if (candidate.textContent && candidate.textContent.trim().length > 10) {
        anchor = candidate;
        break;
      }
    }
  }

  // PRIORITY D: Use the first meaningful text in the block
  if (!anchor) {
    var textElements = logicalBlock.querySelectorAll('p, span, div, label');
    for (var m = 0; m < textElements.length; m++) {
      var el = textElements[m];
      if (el.textContent && el.textContent.trim().length > 10) {
        anchor = el;
        break;
      }
    }
  }

  // 3. Prevent Double-Injections in the same label (not block-level check)
  // Only skip if THIS SPECIFIC label already has a sparkle
  if (anchor && anchor.querySelector('.sp-sparkle-icon')) {
    console.log('[SPARKLE] Label already has sparkle, skipping:', fieldName);
    input.dataset.hasSparkleAdded = 'true';
    return;
  }

  // 4. Inject
  if (anchor) {
    console.log('[SPARKLE] Injecting for', fieldName, 'anchor:', anchor.tagName, anchor.textContent.substring(0, 30));

    // Get mapping state
    var mapping = fieldMappings[fieldName];
    var state = 'empty';
    if (mapping) {
      if (mapping.generating) state = 'generating';
      else if (mapping.approvedValue) state = 'ready';
    }

    var icon = createSparkleIcon(state);

    icon.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();

      // Determine current state from icon's CSS class (most reliable)
      // The icon's class is updated by updateSparkleForField, so it reflects the true state
      var currentState = state; // Default to captured state
      if (icon.classList.contains('sp-sparkle-ready')) currentState = 'ready';
      else if (icon.classList.contains('sp-sparkle-generating')) currentState = 'generating';
      else if (icon.classList.contains('sp-sparkle-empty')) currentState = 'empty';
      else if (icon.classList.contains('sp-sparkle-filled')) currentState = 'filled';

      // If ready state with approved value, autofill directly
      if (currentState === 'ready' && fieldMappings[fieldName]?.approvedValue) {
        var suggestedValue = fieldMappings[fieldName].approvedValue;
        if (input && suggestedValue) {
          fillField(input, suggestedValue);
          closeConversation();
          return;
        }
      }

      // For empty/filled states or no approved value, open chat
      if (currentState !== 'generating') {
        openConversation(fieldName, input, icon, fieldLabel);
      }
    });

    input._sparkleIcon = icon;
    input._sparkleState = state;
    fieldElements[fieldName] = input;

    // Wrap-Safe Flex: Allows text to wrap naturally while keeping sparkle accessible
    // flex-wrap allows sparkle to move to a new line ONLY if text fills the entire line
    anchor.style.setProperty('display', 'flex', 'important');
    anchor.style.setProperty('flex-wrap', 'wrap', 'important');
    anchor.style.setProperty('align-items', 'baseline', 'important'); // Sparkle sits on text line, not vertical center
    anchor.style.setProperty('gap', '6px', 'important');
    anchor.style.setProperty('overflow', 'visible', 'important'); // Ensures sparkle isn't hidden if it overflows slightly

    // Create a wrapper span to hold the sparkle
    var wrapper = document.createElement('span');
    wrapper.className = 'schol-sparkle-container';
    wrapper.appendChild(icon);

    // Append sparkle wrapper to anchor - it will be the last child
    anchor.appendChild(wrapper);

    // Mark group as done
    var groupName = input.getAttribute('name');
    if (groupName) {
      var groupInputs2 = document.querySelectorAll('input[name="' + groupName + '"]');
      for (var n = 0; n < groupInputs2.length; n++) {
        groupInputs2[n].dataset.hasSparkleAdded = 'true';
      }
    }
    input.dataset.hasSparkleAdded = 'true';

    console.log('[SPARKLE] Successfully added sparkle for:', fieldName);
  } else {
    console.log('[SPARKLE] No anchor found for:', fieldName);
  }
}

/**
 * Initialize extension
 */
function init() {
  console.log('Scholarships Plus: Initializing...');

  // Check if document.body exists before trying to use it
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', init);
    return;
  }

  // Wait longer for dynamic content (like Select2) to finish rendering
  setTimeout(processFields, 1500);

  // Also try again later if first attempt doesn't find fields
  setTimeout(function() {
    var currentCount = document.querySelectorAll('.sp-sparkle-icon').length;
    if (currentCount === 0) {
      console.log('Scholarships Plus: Retrying field extraction...');
      processFields();
    }
  }, 3000);

  // Listen for auth token changes (user logs in)
  chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === 'local' && changes.authToken) {
      if (changes.authToken.newValue) {
        // Token was set or updated
        console.log('Scholarships Plus: Auth token detected, re-processing fields');
        // Remove auth banner if exists
        var authBanner = document.querySelector('.sp-auth-banner');
        if (authBanner) authBanner.remove();
        // Re-process fields with valid auth
        processFields();
      }
    }
  });

  // Also check for auth token when tab becomes visible/active (in case user logged in from another tab)
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
      console.log('Scholarships Plus: Tab became visible, checking auth status');
      getAuthToken(function(token) {
        if (token) {
          var authBanner = document.querySelector('.sp-auth-banner');
          if (authBanner) {
            console.log('Scholarships Plus: Found token, removing auth banner and re-processing');
            authBanner.remove();
            processFields();
          }
        }
      });
    }
  });
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

/**
 * Open general chat (not tied to a specific field)
 */
function openGeneralChat() {
  closeConversation();

  // Create a generic modal for general chat
  conversationModal = createConversationModal('General Chat', 'How can I help you?', null, null, scholarshipTitle || 'Scholarship Application');
  document.body.appendChild(conversationModal);

  // Build application status
  var statusMessage = buildApplicationStatus();

  // Show greeting with status
  var greeting = 'Hello! I\'m helping you with your application for **' + (scholarshipTitle || 'this scholarship') + '**.\n\n' + statusMessage + '\n\nHow can I help you?';

  addMessageToConversation('agent', 'Assistant', greeting, false);

  // Set currentFieldName to null to indicate general chat mode
  currentFieldName = null;
}

/**
 * Build application status message (what's filled/missing)
 */
function buildApplicationStatus() {
  var allFields = Object.keys(fieldMappings);
  var filledFields = [];
  var emptyFields = [];

  for (var i = 0; i < allFields.length; i++) {
    var fieldName = allFields[i];
    var mapping = fieldMappings[fieldName];

    if (mapping && mapping.approvedValue && mapping.approvedValue.trim()) {
      filledFields.push(mapping.fieldLabel || fieldName);
    } else {
      emptyFields.push(mapping.fieldLabel || fieldName);
    }
  }

  var message = '';

  if (filledFields.length > 0) {
    message += '**Fields with responses:**\n';
    for (var j = 0; j < Math.min(5, filledFields.length); j++) {
      message += '✓ ' + filledFields[j] + '\n';
    }
    if (filledFields.length > 5) {
      message += '... and ' + (filledFields.length - 5) + ' more\n';
    }
    message += '\n';
  }

  if (emptyFields.length > 0) {
    message += '**Fields still needed:**\n';
    for (var k = 0; k < Math.min(5, emptyFields.length); k++) {
      message += '○ ' + emptyFields[k] + '\n';
    }
    if (emptyFields.length > 5) {
      message += '... and ' + (emptyFields.length - 5) + ' more\n';
    }
  } else if (filledFields.length > 0) {
    message += '**All fields have been completed!** 🎉\n';
  } else {
    message += '**No fields have been filled yet.**\n';
  }

  return message;
}

/**
 * Save edited response to history (auto-save on blur)
 */
function saveEditedResponseToHistory(input, newValue) {
  var fieldName = input.name || input.id;
  if (!fieldName || !scholarshipId || !applicationId) {
    console.log('[AUTO-SAVE] Missing required info, skipping');
    return;
  }

  getAuthToken(function(token) {
    if (!token) {
      console.error('[AUTO-SAVE] No auth token');
      return;
    }

    // Get field label from mapping
    var mapping = fieldMappings[fieldName];
    var fieldLabel = mapping ? mapping.fieldLabel : fieldName;

    fetch(API_BASE_URL + '/api/extension/save-edit', {
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
        fieldType: 'textarea',
        content: newValue,
      }),
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      if (data.success) {
        console.log('[AUTO-SAVE] Saved to history successfully');
        // Show subtle notification
        showNotification('Saved ✓');
      }
    })
    .catch(function(error) {
      console.error('[AUTO-SAVE] Error saving to history:', error);
    });
  });
}

/**
 * Show notification toast
 */
function showNotification(message) {
  var notification = document.createElement('div');
  notification.className = 'sp-notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed !important;
    top: 20px !important;
    right: 20px !important;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
    color: white !important;
    padding: 16px 24px !important;
    border-radius: 8px !important;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4) !important;
    z-index: 999999 !important;
    font-family: system-ui, -apple-system, sans-serif !important;
    font-size: 16px !important;
    font-weight: 600 !important;
    animation: slideInRight 0.3s ease-out !important;
  `;

  document.body.appendChild(notification);

  // Remove after 2 seconds
  setTimeout(function() {
    notification.style.animation = 'slideOutRight 0.3s ease-out';
    setTimeout(function() {
      notification.remove();
    }, 300);
  }, 2000);
}

/**
 * Listen for messages from popup
 */
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'openGeneralChat') {
    openGeneralChat();
    sendResponse({ success: true });
  }
  return true;
});

console.log('Scholarships Plus: Content script loaded');
