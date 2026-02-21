(function redirectMarkdownFileToViewer() {
  const href = window.location.href;
  if (!href.toLowerCase().startsWith("file://")) {
    return;
  }

  const pathname = window.location.pathname || "";
  const normalizedPath = decodeURIComponent(pathname).toLowerCase();
  const isMarkdownFile = normalizedPath.endsWith(".md") || normalizedPath.endsWith(".markdown");
  if (!isMarkdownFile) {
    return;
  }

  if (window.location.search.includes("mdv_redirected=1")) {
    return;
  }

  const viewerUrl = chrome.runtime.getURL("viewer.html");
  const target = `${viewerUrl}?src=${encodeURIComponent(href)}&mdv_redirected=1`;
  window.location.replace(target);
})();
