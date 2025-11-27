import { useEffect } from 'react';

/**
 * usePrivyBrandingReplacer
 * 
 * React hook that replaces Privy branding with Sher branding in all Privy modals.
 * Uses MutationObserver to watch for dynamically loaded Privy UI elements and
 * replaces "Protected by Privy" with "Protected by Sher" linking to https://sher.one/
 */
export function usePrivyBrandingReplacer() {
  useEffect(() => {
    // Function to replace Privy branding with Sher branding
    const replacePrivyBranding = () => {
      // Method 1: Target by ID (most reliable)
      const protectedByPrivyElement = document.getElementById('protected-by-privy');
      
      if (protectedByPrivyElement) {
        // Update the link
        protectedByPrivyElement.setAttribute('href', 'https://sher.one/');
        protectedByPrivyElement.setAttribute('target', '_blank');
        protectedByPrivyElement.setAttribute('rel', 'noopener noreferrer');
        
        // Replace SVG logo with text "Protected by Sher"
        // Clear existing content (SVG)
        protectedByPrivyElement.innerHTML = '';
        
        // Create text node with "Protected by Sher"
        const textNode = document.createTextNode('Protected by Sher');
        protectedByPrivyElement.appendChild(textNode);
        
        // Add styling to match Privy's original style
        protectedByPrivyElement.style.cssText = `
          color: currentColor;
          text-decoration: none;
          font-size: 13px;
          font-weight: 400;
          display: inline-block;
        `;
        
        console.log('✅ Replaced Privy branding with Sher branding');
      }
      
      // Method 2: Search for elements containing "Protected by Privy" text
      // This handles cases where the ID might not be present
      const allElements = document.querySelectorAll('*');
      allElements.forEach((element) => {
        // Check if element contains the Privy branding text
        if (element.textContent?.includes('Protected by Privy') || 
            element.textContent?.includes('Protected by privy')) {
          
          // Skip if we already processed this element
          if (element.id === 'protected-by-privy') {
            return;
          }
          
          // Check if it's a link element
          if (element.tagName === 'A' || element.closest('a')) {
            const linkElement = element.tagName === 'A' 
              ? element as HTMLAnchorElement 
              : element.closest('a') as HTMLAnchorElement;
            
            if (linkElement) {
              linkElement.href = 'https://sher.one/';
              linkElement.target = '_blank';
              linkElement.rel = 'noopener noreferrer';
              
              // Replace text content
              if (linkElement.textContent) {
                linkElement.textContent = linkElement.textContent.replace(
                  /Protected by Privy/gi,
                  'Protected by Sher'
                );
              }
            }
          } else {
            // For non-link elements, just replace the text
            if (element.textContent) {
              element.textContent = element.textContent.replace(
                /Protected by Privy/gi,
                'Protected by Sher'
              );
            }
          }
        }
      });
      
      // Method 3: Target by class name (fallback)
      const modalFooterElements = document.querySelectorAll('[class*="ModalFooter"]');
      modalFooterElements.forEach((element) => {
        const linkElement = element.querySelector('a[href*="privy.io"]');
        if (linkElement) {
          (linkElement as HTMLAnchorElement).href = 'https://sher.one/';
          (linkElement as HTMLAnchorElement).target = '_blank';
          (linkElement as HTMLAnchorElement).rel = 'noopener noreferrer';
          
          // Replace any Privy text
          const textNodes = getTextNodesIn(element);
          textNodes.forEach((node) => {
            if (node.textContent?.includes('Protected by Privy') || 
                node.textContent?.includes('Protected by privy')) {
              node.textContent = node.textContent.replace(
                /Protected by Privy/gi,
                'Protected by Sher'
              );
            }
          });
        }
      });
    };
    
    // Helper function to get all text nodes in an element
    const getTextNodesIn = (node: Node): Text[] => {
      const textNodes: Text[] = [];
      if (node.nodeType === Node.TEXT_NODE) {
        textNodes.push(node as Text);
      } else {
        const children = node.childNodes;
        for (let i = 0; i < children.length; i++) {
          textNodes.push(...getTextNodesIn(children[i]));
        }
      }
      return textNodes;
    };
    
    // Initial replacement attempt (in case element already exists)
    replacePrivyBranding();
    
    // Set up MutationObserver to watch for dynamically added elements
    const observer = new MutationObserver((mutations) => {
      let shouldReplace = false;
      
      mutations.forEach((mutation) => {
        // Check if new nodes were added
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              
              // Check if the added element or its children contain Privy branding
              if (element.id === 'protected-by-privy' ||
                  element.querySelector('#protected-by-privy') ||
                  element.textContent?.includes('Protected by Privy') ||
                  element.textContent?.includes('Protected by privy') ||
                  element.querySelector('[href*="privy.io"]')) {
                shouldReplace = true;
              }
            }
          });
        }
        
        // Check if attributes changed (e.g., href updated)
        if (mutation.type === 'attributes' && 
            (mutation.attributeName === 'href' || mutation.attributeName === 'id')) {
          const target = mutation.target as Element;
          if (target.id === 'protected-by-privy' || 
              target.getAttribute('href')?.includes('privy.io')) {
            shouldReplace = true;
          }
        }
      });
      
      // Only run replacement if we detected relevant changes
      if (shouldReplace) {
        // Small delay to ensure DOM is fully updated
        setTimeout(() => {
          replacePrivyBranding();
        }, 50);
      }
    });
    
    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'id'],
    });
    
    // Cleanup function
    return () => {
      observer.disconnect();
    };
  }, []);
}

