// Scrape data from the Shopify Product Admin page
function scrapeProductData() {
  const titleInput = document.querySelector('input[name="product[title]"]');
  const images = Array.from(document.querySelectorAll('img.Polaris-Thumbnail__Image'))
    .map(img => img.src)
    .slice(0, 5);

  return {
    title: titleInput ? titleInput.value : '',
    images: images
  };
}

// Inject data back into the Shopify Product Admin page
function injectProductData(title, description) {
  // 1. Update Title
  if (title) {
    const titleInput = document.querySelector('input[name="product[title]"]');
    if (titleInput) {
      titleInput.value = title;
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // 2. Update Description (TinyMCE)
  if (description) {
    const iframe = document.getElementById('product-description_ifr');
    const editorBody = iframe?.contentDocument?.body;
    if (editorBody) {
      editorBody.innerHTML = description;
      editorBody.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // Fallback for non-iframe editor
      const editor = document.querySelector('.tox-edit-area__iframe') || document.querySelector('#product-description');
      if (editor) {
        editor.innerHTML = description;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }
}

// Listen for messages from the Side Panel or Background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SCRAPE_PRODUCT_DATA") {
    const data = scrapeProductData();
    chrome.runtime.sendMessage({
      action: "PRODUCT_DATA_SCRAPED",
      data: data
    });
  }

  if (request.action === "APPLY_TO_SHOPIFY") {
    injectProductData(request.data.title, request.data.description);
    sendResponse({ success: true });
  }
});
