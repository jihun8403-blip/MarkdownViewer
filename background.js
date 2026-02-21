const VIEWER_URL = chrome.runtime.getURL("viewer.html");

chrome.action.onClicked.addListener(async () => {
  await chrome.tabs.create({ url: VIEWER_URL });
});
