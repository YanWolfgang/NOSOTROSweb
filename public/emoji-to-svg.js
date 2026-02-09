// Feather Icons Loader - Load SVG icons from CDN
// Reference: https://feathericons.com/

const iconCache = {};

// Function to get Feather Icon SVG from CDN
async function getFeatherIcon(iconName) {
  if (iconCache[iconName]) {
    return iconCache[iconName];
  }

  try {
    // Try the correct CDN path first
    const response = await fetch(`https://unpkg.com/feather-icons@latest/dist/icons/${iconName}.svg`);
    if (response.ok) {
      const svg = await response.text();
      iconCache[iconName] = svg;
      return svg;
    }
  } catch (e) {
    console.warn(`Could not load icon: ${iconName}`, e);
  }
  return null;
}

// Load all icons with data-icon attribute
async function loadFeatherIcons() {
  const elements = document.querySelectorAll('[data-icon]');

  for (const el of elements) {
    const iconName = el.getAttribute('data-icon');
    if (!iconName) continue;

    const color = el.getAttribute('data-color') || 'currentColor';
    const size = el.getAttribute('data-size') || '1em';

    // Show placeholder while loading
    el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>`;

    // Load actual icon
    const svg = await getFeatherIcon(iconName);
    if (svg) {
      // Parse and customize the SVG
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
      const svgElement = svgDoc.documentElement;

      // Set size and color
      svgElement.setAttribute('width', size);
      svgElement.setAttribute('height', size);
      svgElement.setAttribute('stroke', color);
      svgElement.setAttribute('fill', 'none');
      svgElement.setAttribute('stroke-width', '2');
      svgElement.setAttribute('stroke-linecap', 'round');
      svgElement.setAttribute('stroke-linejoin', 'round');

      el.innerHTML = svgElement.outerHTML;
    }
  }
}

// Watch for dynamically added icons
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.hasAttribute && node.hasAttribute('data-icon')) {
            const iconName = node.getAttribute('data-icon');
            const color = node.getAttribute('data-color') || 'currentColor';
            const size = node.getAttribute('data-size') || '1em';

            // Load icon
            getFeatherIcon(iconName).then(svg => {
              if (svg) {
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
                const svgElement = svgDoc.documentElement;

                svgElement.setAttribute('width', size);
                svgElement.setAttribute('height', size);
                svgElement.setAttribute('stroke', color);
                svgElement.setAttribute('fill', 'none');
                svgElement.setAttribute('stroke-width', '2');

                node.innerHTML = svgElement.outerHTML;
              }
            });
          }

          // Also check children
          const childIcons = node.querySelectorAll('[data-icon]');
          childIcons.forEach(child => {
            const iconName = child.getAttribute('data-icon');
            if (iconCache[iconName]) {
              const color = child.getAttribute('data-color') || 'currentColor';
              const size = child.getAttribute('data-size') || '1em';
              const parser = new DOMParser();
              const svgDoc = parser.parseFromString(iconCache[iconName], 'image/svg+xml');
              const svgElement = svgDoc.documentElement;
              svgElement.setAttribute('width', size);
              svgElement.setAttribute('height', size);
              svgElement.setAttribute('stroke', color);
              child.innerHTML = svgElement.outerHTML;
            }
          });
        }
      });
    }
  });
});

// Start watching for dynamic content
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Run on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadFeatherIcons);
} else {
  loadFeatherIcons();
}
