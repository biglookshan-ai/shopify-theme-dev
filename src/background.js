chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "generate-ai-description",
    title: "Generate AI Description",
    contexts: ["all"],
    documentUrlPatterns: ["https://admin.shopify.com/*"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "generate-ai-description") {
    chrome.sidePanel.open({ tabId: tab.id });
    
    // Give it a moment to open before sending the scrape command
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_PRODUCT_DATA" });
    }, 500);
  }
});
