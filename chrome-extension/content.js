/**
 * Content Script for Scholarships Plus Extension
 * Full version with SVG icons, sparkle burst effect, and container-based positioning
 */

console.log('Scholarships Plus: Content script START');

// Signal to page that extension is loaded using custom event (works with CSP)
var event = new CustomEvent('scholarshipsPlusExtensionLoaded', { detail: { version: '0.1.0' } });
window.dispatchEvent(event);
console.log('Scholarships Plus: Extension detection event dispatched');

// Mock field mappings for demo
const DEMO_MAPPINGS = {
  firstName: { approvedValue: 'Jane', fieldLabel: 'First Name' },
  lastName: { approvedValue: 'Doe', fieldLabel: 'Last Name' },
  email: { approvedValue: 'jane.doe@example.com', fieldLabel: 'Email' },
  phone: { approvedValue: '(555) 123-4567', fieldLabel: 'Phone' },
  gpa: { approvedValue: '3.75', fieldLabel: 'GPA' },
  classLevel: { approvedValue: 'Junior', fieldLabel: 'Class Level' },
  major: { approvedValue: 'Computer Science', fieldLabel: 'Major' },
  enrollmentStatus: { approvedValue: 'Full-Time', fieldLabel: 'Enrollment Status' },
  graduationDate: { approvedValue: '2025-05', fieldLabel: 'Expected Graduation Date' },
  leadership: { approvedValue: 'During my sophomore year, I served as the president of our university\'s Computer Science Club, where I organized weekly coding workshops and mentored underclassmen.', fieldLabel: 'Leadership Experience' },
  goals: { approvedValue: 'My academic goal is to graduate with honors in Computer Science. My career goal is to become a software engineer creating technology for social good.', fieldLabel: 'Academic and Career Goals' },
  challenges: { approvedValue: 'As a first-generation college student, I faced significant challenges adapting to university life. I sought mentorship from professors and joined study groups.', fieldLabel: 'Overcoming Challenges' },
  communityService: { approvedValue: 'I volunteer weekly at a local food bank. I also tutor K-12 students in math and computer science.', fieldLabel: 'Community Service' },
  income: { approvedValue: '$50,000 - $75,000', fieldLabel: 'Household Income' },
  fafsa: { approvedValue: 'Yes', fieldLabel: 'FAFSA' },
};

console.log('Scholarships Plus: Mappings loaded:', Object.keys(DEMO_MAPPINGS).length);

// Create sparkle icon element using the SVG file
function createSparkleIconElement(color) {
  color = color || '#9CA3AF';

  // Create img element pointing to the SVG file
  var img = document.createElement('img');
  img.src = chrome.runtime.getURL('icons/sparkle.svg');
  img.style.width = '20px';
  img.style.height = '20px';
  img.style.display = 'block';
  img.style.filter = 'brightness(0) saturate(100%)';

  // Apply color tint using CSS filter based on color
  if (color === '#9CA3AF') {
    // Grey
    img.style.filter = 'grayscale(100%) brightness(0.6)';
  } else if (color === '#10B981') {
    // Green
    img.style.filter = 'sepia(1) saturate(5) hue-rotate(90deg) brightness(0.8)';
  } else if (color === '#60A5FA') {
    // Blue
    img.style.filter = 'sepia(1) saturate(3) hue-rotate(180deg) brightness(0.9)';
  }

  return img;
}

// CSS content (will be injected when document.head is ready)
const CSS_CONTENT = `
  /* Container method for input-with-icon */
  .sp-input-wrapper {
    position: relative !important;
    display: flex !important;
    align-items: center !important;
    width: 100% !important;
  }

  /* Add right padding to input to make room for icon */
  .sp-input-wrapper > input,
  .sp-input-wrapper > textarea {
    padding-right: 40px !important;
  }

  /* SVG icon positioned absolutely on right side */
  .sp-sparkle-icon {
    position: absolute !important;
    right: 12px !important;
    width: 20px !important;
    height: 20px !important;
    min-width: 20px !important;
    max-width: 20px !important;
    min-height: 20px !important;
    max-height: 20px !important;
    cursor: pointer !important;
    transition: transform 0.2s ease !important;
    pointer-events: auto !important;
    z-index: 10 !important;
    flex-shrink: 0 !important;
    display: block !important;
    overflow: hidden !important;
  }

  .sp-sparkle-icon img {
    width: 20px !important;
    height: 20px !important;
    min-width: 20px !important;
    max-width: 20px !important;
    min-height: 20px !important;
    max-height: 20px !important;
    display: block !important;
    object-fit: contain !important;
  }

  .sp-sparkle-icon:hover {
    transform: scale(1.1) !important;
  }

  /* Color states using CSS filters on SVG paths */
  .sp-sparkle-icon.sp-sparkle-grey path {
    fill: #9CA3AF !important;
  }

  .sp-sparkle-icon.sp-sparkle-filled path {
    fill: #10B981 !important;
  }

  .sp-sparkle-icon.sp-sparkle-loading path {
    fill: #60A5FA !important;
  }

  .sp-sparkle-icon.sp-sparkle-loading {
    animation: pulse 0.5s ease-in-out infinite !important;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(1.1); }
  }

  /* Demo banner */
  .sp-demo-banner {
    position: fixed;
    top: 10px;
    right: 10px;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  /* Sparkle burst particles */
  .sp-sparkle-particle {
    position: fixed !important;
    pointer-events: none !important;
    background: #60A5FA !important;
    border-radius: 50% !important;
    z-index: 999999 !important;
    animation: sparkle-burst 0.6s ease-out forwards !important;
  }

  @keyframes sparkle-burst {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 1;
    }
    100% {
      transform: translate(var(--tw-x), var(--tw-y)) scale(0);
      opacity: 0;
    }
  }
`;

// Create sparkle burst particles
function createSparkleBurst(x, y) {
  var particleCount = 8;

  for (var i = 0; i < particleCount; i++) {
    var particle = document.createElement('div');
    particle.className = 'sp-sparkle-particle';

    // Randomize direction and distance
    var destinationX = (Math.random() - 0.5) * 100;
    var destinationY = (Math.random() - 0.5) * 100;

    particle.style.setProperty('--tw-x', destinationX + 'px');
    particle.style.setProperty('--tw-y', destinationY + 'px');

    // Randomize size
    var size = Math.random() * 6 + 4;
    particle.style.width = size + 'px';
    particle.style.height = size + 'px';

    // Position at click - use viewport coordinates
    particle.style.left = x + 'px';
    particle.style.top = y + 'px';

    document.body.appendChild(particle);

    // Clean up DOM after animation
    setTimeout(function() { particle.remove(); }, 600);
  }
}

// Fill field with typewriter animation
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
      var index = 0;
      var interval = setInterval(function() {
        if (index < value.length) {
          input.value += value[index];
          index++;
        } else {
          clearInterval(interval);
          resolve(true);
        }
      }, 15);

      // Fallback: ensure value is set after timeout
      setTimeout(function() {
        clearInterval(interval);
        input.value = value;
        resolve(true);
      }, Math.min(800, value.length * 15));
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

// Add sparkle icon to a field with intelligent positioning
function addSparkleIcon(input, fieldName) {
  var mapping = DEMO_MAPPINGS[fieldName];
  if (!mapping) return;

  // Check if already has sparkle
  if (input.hasAttribute('data-sparkle-added')) return;
  input.setAttribute('data-sparkle-added', 'true');

  var icon = document.createElement('div');
  icon.className = 'sp-sparkle-icon sp-sparkle-grey';

  // Create the image element
  var img = createSparkleIconElement('#9CA3AF');
  icon.appendChild(img);

  // Set tooltip - use help text if available, otherwise field label
  var helpText = null;
  var formGroup = input.closest('div, .form-group, .ss-field, [class*="field"]');
  if (formGroup) {
    // Look for help text with pattern: text-xs text-gray-500 mt-1 and contains "AI"
    var helpElements = formGroup.querySelectorAll('div');
    for (var i = 0; i < helpElements.length; i++) {
      var el = helpElements[i];
      var classes = el.className || '';
      if ((classes.includes('text-xs') || classes.includes('text-gray-500') || classes.includes('hint')) &&
          el.textContent && el.textContent.includes('AI')) {
        helpText = el.textContent.trim();
        // Hide the help text
        el.style.display = 'none';
        break;
      }
    }
  }

  icon.setAttribute('data-tooltip', helpText || mapping.fieldLabel);
  icon.title = helpText || mapping.fieldLabel;

  // Track if filled
  var isFilled = false;

  icon.addEventListener('click', async function(e) {
    e.preventDefault();
    e.stopPropagation();

    if (isFilled) return; // Already filled

    // Get viewport position for sparkle burst
    var rect = icon.getBoundingClientRect();
    var centerX = rect.left + rect.width / 2;
    var centerY = rect.top + rect.height / 2;

    // Create sparkle burst at viewport coordinates
    createSparkleBurst(centerX, centerY);

    // Update state - change color to blue (loading)
    var img = icon.querySelector('img');
    icon.classList.remove('sp-sparkle-grey');
    icon.classList.add('sp-sparkle-loading');
    if (img) img.style.filter = 'sepia(1) saturate(3) hue-rotate(180deg) brightness(0.9)';

    await fillFieldWithAnimation(input, mapping.approvedValue);

    setTimeout(function() {
      // Change color to green (filled)
      icon.classList.remove('sp-sparkle-loading');
      icon.classList.add('sp-sparkle-filled');
      if (img) img.style.filter = 'sepia(1) saturate(5) hue-rotate(90deg) brightness(0.8)';
      icon.title = '✓ ' + mapping.fieldLabel;
      isFilled = true;
    }, 300);
  });

  // Add wrapper class and append icon - CSS handles positioning based on input type
  var parent = input.parentElement;
  if (parent) {
    parent.classList.add('sp-input-wrapper');
    parent.appendChild(icon);
  }
}

// Find and process all form fields
function processFields() {
  var fields = document.querySelectorAll('input:not([type=hidden]), textarea, select');
  console.log('Scholarships Plus: Found ' + fields.length + ' form fields');

  var matchedCount = 0;
  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    var fieldName = field.name || field.id;
    if (fieldName && DEMO_MAPPINGS[fieldName]) {
      addSparkleIcon(field, fieldName);
      matchedCount++;
    }
  }

  console.log('Scholarships Plus: Added sparkles to ' + matchedCount + ' fields');

  // Show banner
  var banner = document.createElement('div');
  banner.className = 'sp-demo-banner';
  banner.innerHTML = '✨ <strong>Scholarships+ Extension</strong><br>' + matchedCount + ' fields ready • Click sparkles to auto-fill';
  document.body.appendChild(banner);

  setTimeout(function() {
    banner.style.transition = 'opacity 0.5s';
    banner.style.opacity = '0';
    setTimeout(function() { banner.remove(); }, 500);
  }, 5000);
}

// Process fields with multiple attempts for React-rendered content
function init() {
  // Inject CSS first - force inject to ensure it works
  try {
    const style = document.createElement('style');
    style.id = 'scholarships-plus-styles';
    style.textContent = `
      .sp-input-wrapper {
        position: relative !important;
        display: flex !important;
        align-items: center !important;
        width: 100% !important;
      }
      .sp-input-wrapper > input,
      .sp-input-wrapper > textarea {
        padding-right: 40px !important;
      }
      .sp-sparkle-icon {
        position: absolute !important;
        right: 12px !important;
        width: 20px !important;
        height: 20px !important;
        min-width: 20px !important;
        max-width: 20px !important;
        min-height: 20px !important;
        max-height: 20px !important;
        cursor: pointer !important;
        transition: transform 0.2s ease !important;
        pointer-events: auto !important;
        z-index: 10 !important;
        flex-shrink: 0 !important;
        display: block !important;
        overflow: hidden !important;
      }
      .sp-sparkle-icon img {
        width: 20px !important;
        height: 20px !important;
        min-width: 20px !important;
        max-width: 20px !important;
        min-height: 20px !important;
        max-height: 20px !important;
        display: block !important;
        object-fit: contain !important;
      }
      .sp-sparkle-icon:hover {
        transform: scale(1.1) !important;
      }
      .sp-sparkle-icon.sp-sparkle-loading {
        animation: pulse 0.5s ease-in-out infinite !important;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.6; transform: scale(1.1); }
      }
      .sp-demo-banner {
        position: fixed;
        top: 10px;
        right: 10px;
        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        z-index: 999999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease-out;
      }
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .sp-sparkle-particle {
        position: fixed !important;
        pointer-events: none !important;
        background: #60A5FA !important;
        border-radius: 50% !important;
        z-index: 999999 !important;
        animation: sparkle-burst 0.6s ease-out forwards !important;
      }
      @keyframes sparkle-burst {
        0% {
          transform: translate(0, 0) scale(1);
          opacity: 1;
        }
        100% {
          transform: translate(var(--tw-x), var(--tw-y)) scale(0);
          opacity: 0;
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
    console.log('Scholarships Plus: CSS injected');
  } catch (e) {
    console.error('Scholarships Plus: CSS injection failed:', e);
  }

  // Try immediately
  if (document.body) {
    processFields();
  }

  // Try again after delays for React rendering
  setTimeout(processFields, 500);
  setTimeout(processFields, 1500);
  setTimeout(processFields, 3000);
}

// Start
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
