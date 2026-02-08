// Emoji to SVG Icon Map - Using Feather Icons from CDN
// Reference: https://feathericons.com/

const emojiIconMap = {
  // News / Media
  '📰': { icon: 'newspaper', label: 'Newspaper' },
  '📱': { icon: 'smartphone', label: 'Mobile' },
  '📺': { icon: 'tv', label: 'Television' },
  '📻': { icon: 'radio', label: 'Radio' },

  // Business / Dashboard
  '📊': { icon: 'bar-chart-2', label: 'Dashboard' },
  '📈': { icon: 'trending-up', label: 'Trending Up' },
  '📉': { icon: 'trending-down', label: 'Trending Down' },
  '💼': { icon: 'briefcase', label: 'Work' },

  // People / Users
  '👥': { icon: 'users', label: 'Users' },
  '👤': { icon: 'user', label: 'User' },
  '👨': { icon: 'user', label: 'Man' },
  '👩': { icon: 'user', label: 'Woman' },

  // Technology / Code
  '💻': { icon: 'monitor', label: 'Computer' },
  '⌨️': { icon: 'keyboard', label: 'Keyboard' },
  '🖱️': { icon: 'mouse-pointer', label: 'Mouse' },
  '🔧': { icon: 'tool', label: 'Tool' },

  // Sports
  '⚽': { icon: 'activity', label: 'Soccer' },
  '🏀': { icon: 'activity', label: 'Basketball' },
  '🎾': { icon: 'activity', label: 'Tennis' },

  // Storage / Package
  '📦': { icon: 'package', label: 'Package' },
  '📁': { icon: 'folder', label: 'Folder' },
  '📂': { icon: 'folder-open', label: 'Open Folder' },
  '📄': { icon: 'file', label: 'File' },

  // Navigation / UI
  '🌐': { icon: 'globe', label: 'Globe' },
  '🔍': { icon: 'search', label: 'Search' },
  '🔔': { icon: 'bell', label: 'Notification' },
  '⚙️': { icon: 'settings', label: 'Settings' },
  '🔐': { icon: 'lock', label: 'Lock' },
  '🔓': { icon: 'unlock', label: 'Unlock' },

  // Actions
  '✅': { icon: 'check-circle', label: 'Complete' },
  '✓': { icon: 'check', label: 'Check' },
  '❌': { icon: 'x-circle', label: 'Cancel' },
  '❎': { icon: 'x', label: 'Close' },
  '➕': { icon: 'plus-circle', label: 'Add' },
  '➖': { icon: 'minus-circle', label: 'Remove' },
  '🔄': { icon: 'refresh-cw', label: 'Refresh' },
  '↩️': { icon: 'undo', label: 'Undo' },
  '↪': { icon: 'share-2', label: 'Share' },
  '🔙': { icon: 'arrow-left', label: 'Back' },
  '🗑️': { icon: 'trash-2', label: 'Delete' },
  '✏️': { icon: 'edit-2', label: 'Edit' },
  '✍️': { icon: 'edit-3', label: 'Write' },
  '📝': { icon: 'clipboard', label: 'Notes' },
  '📋': { icon: 'list', label: 'List' },
  '📌': { icon: 'pin', label: 'Pin' },

  // Communication
  '💬': { icon: 'message-circle', label: 'Chat' },
  '💭': { icon: 'message-square', label: 'Message' },
  '📞': { icon: 'phone', label: 'Call' },
  '📧': { icon: 'mail', label: 'Email' },
  '📨': { icon: 'inbox', label: 'Inbox' },

  // AI / Brain
  '🧠': { icon: 'zap', label: 'AI' },
  '🤖': { icon: 'cpu', label: 'Robot' },

  // Time / Clock
  '🕐': { icon: 'clock', label: 'Clock' },
  '⏰': { icon: 'bell', label: 'Alarm' },
  '⏱️': { icon: 'stopwatch', label: 'Timer' },
  '📅': { icon: 'calendar', label: 'Calendar' },

  // Status / Indicators
  '🔴': { icon: 'circle', label: 'Red Circle', color: '#EF4444' },
  '🟡': { icon: 'circle', label: 'Yellow Circle', color: '#FCD34D' },
  '🟢': { icon: 'circle', label: 'Green Circle', color: '#10B981' },
  '⚪': { icon: 'circle', label: 'White Circle' },

  // Views / Display
  '👁️': { icon: 'eye', label: 'View' },
  '👀': { icon: 'eye', label: 'Look' },
  '🔍': { icon: 'search', label: 'Magnifying Glass' },

  // Theme / UI
  '🌙': { icon: 'moon', label: 'Moon' },
  '☀️': { icon: 'sun', label: 'Sun' },
  '⭐': { icon: 'star', label: 'Star' },

  // Misc
  '🎭': { icon: 'smile', label: 'Drama' },
  '🎥': { icon: 'video', label: 'Video' },
  '🎬': { icon: 'film', label: 'Film' },
  '🎤': { icon: 'mic-2', label: 'Microphone' },
  '🎵': { icon: 'music', label: 'Music' },
  '🎨': { icon: 'palette', label: 'Paint' },
  '🔥': { icon: 'flame', label: 'Fire', color: '#F59E0B' },
  '🇲🇽': { icon: 'map-pin', label: 'Mexico' },
  '🏠': { icon: 'home', label: 'Home' },
  '🚀': { icon: 'send', label: 'Launch' },
  '⚡': { icon: 'zap', label: 'Power' },
  '❤️': { icon: 'heart', label: 'Love' },
  '💚': { icon: 'heart', label: 'Love', color: '#10B981' },
};

// Function to get Feather Icon SVG from CDN
async function getFeatherIcon(iconName) {
  try {
    const response = await fetch(`https://cdn.jsdelivr.net/npm/feather-icons/dist/icons/${iconName}.svg`);
    if (response.ok) {
      return await response.text();
    }
  } catch (e) {
    console.warn(`Could not load icon: ${iconName}`);
  }
  return null;
}

// Cache for loaded icons
const iconCache = {};

// Convert emojis to SVG icons
async function convertEmojisToSVG(node = document.body) {
  const walker = document.createTreeWalker(
    node,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  const nodesToReplace = [];
  let currentNode;

  while (currentNode = walker.nextNode()) {
    let text = currentNode.textContent;
    let hasEmoji = false;

    for (const emoji of Object.keys(emojiIconMap)) {
      if (text.includes(emoji)) {
        hasEmoji = true;
        break;
      }
    }

    if (hasEmoji) {
      nodesToReplace.push(currentNode);
    }
  }

  // Process replacements
  for (const node of nodesToReplace) {
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let text = node.textContent;
    let emojiRegex = new RegExp(`[${Object.keys(emojiIconMap).map(e => e.replace(/[\[\]\\^$.|?*+(){}]/g, '\\$&')).join('')}]`, 'g');
    let match;

    while ((match = emojiRegex.exec(text)) !== null) {
      // Add text before emoji
      if (match.index > lastIndex) {
        fragment.appendChild(
          document.createTextNode(text.substring(lastIndex, match.index))
        );
      }

      // Add SVG icon
      const emoji = match[0];
      const iconConfig = emojiIconMap[emoji];
      if (iconConfig) {
        const span = document.createElement('span');
        span.className = 'emoji-icon';
        span.setAttribute('data-emoji', emoji);
        span.setAttribute('data-icon', iconConfig.icon);
        span.setAttribute('aria-label', iconConfig.label);
        span.style.display = 'inline-block';
        span.style.verticalAlign = 'middle';
        span.style.marginRight = '0.25em';
        span.style.width = '1em';
        span.style.height = '1em';

        // Try to load from cache or CDN
        if (iconCache[iconConfig.icon]) {
          span.innerHTML = iconCache[iconConfig.icon];
        } else {
          // Fallback while loading
          span.innerHTML = `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>`;

          // Load async
          getFeatherIcon(iconConfig.icon).then(svg => {
            if (svg) {
              iconCache[iconConfig.icon] = svg;
              document.querySelectorAll(`[data-icon="${iconConfig.icon}"]`).forEach(el => {
                el.innerHTML = svg;
              });
            }
          });
        }

        if (iconConfig.color) {
          span.style.color = iconConfig.color;
        }

        fragment.appendChild(span);
      }

      lastIndex = match.index + 1;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    if (fragment.childNodes.length > 0) {
      node.parentNode.replaceChild(fragment, node);
    }
  }
}

// Run on document load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => convertEmojisToSVG(), 100);
  });
} else {
  setTimeout(() => convertEmojisToSVG(), 100);
}

// Also convert dynamically added content
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          convertEmojisToSVG(node);
        }
      });
    }
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
