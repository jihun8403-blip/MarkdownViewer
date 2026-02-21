const CHUNK_SIZE = 20;

self.onmessage = (event) => {
  const { type } = event.data || {};

  if (type === "PING") {
    self.postMessage({ type: "PONG" });
    return;
  }

  if (type === "PARSE_REQUEST") {
    const { docId, text } = event.data;
    try {
      const sections = splitIntoSections(text || "");
      for (let i = 0; i < sections.length; i += CHUNK_SIZE) {
        self.postMessage({
          type: "PARSE_PROGRESS",
          docId,
          sections: sections.slice(i, i + CHUNK_SIZE),
          done: false
        });
      }

      const toc = sections
        .filter((section) => section.headerText)
        .map((section) => ({
          sectionId: section.sectionId,
          headerLevel: section.headerLevel,
          headerText: section.headerText
        }));
      self.postMessage({ type: "PARSE_DONE", docId, meta: { toc } });
    } catch (error) {
      self.postMessage({
        type: "PARSE_ERROR",
        docId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
};

function splitIntoSections(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  const offsets = [];
  let cursor = 0;

  for (const line of lines) {
    offsets.push(cursor);
    cursor += line.length + 1;
  }

  const headerRows = [];
  const headerRegex = /^(#{1,3})\s+(.+)$/;
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(headerRegex);
    if (match) {
      headerRows.push({
        lineIndex: i,
        level: match[1].length,
        text: match[2].trim()
      });
    }
  }

  if (!headerRows.length) {
    const lineChunkSize = 120;
    let order = 0;
    for (let start = 0; start < lines.length; start += lineChunkSize) {
      const end = Math.min(start + lineChunkSize, lines.length);
      const markdown = lines.slice(start, end).join("\n");
      sections.push(
        makeSection({
          order,
          headerLevel: null,
          headerText: "",
          markdown,
          startOffset: offsets[start] || 0,
          endOffset: (offsets[end] || cursor) - 1
        })
      );
      order += 1;
    }
    return sections;
  }

  if (headerRows[0].lineIndex > 0) {
    const leadingMarkdown = lines.slice(0, headerRows[0].lineIndex).join("\n");
    sections.push(
      makeSection({
        order: 0,
        headerLevel: null,
        headerText: "",
        markdown: leadingMarkdown,
        startOffset: 0,
        endOffset: offsets[headerRows[0].lineIndex] - 1
      })
    );
  }

  headerRows.forEach((header, idx) => {
    const next = headerRows[idx + 1];
    const start = header.lineIndex;
    const end = next ? next.lineIndex : lines.length;
    const markdown = lines.slice(start, end).join("\n");
    sections.push(
      makeSection({
        order: sections.length,
        headerLevel: header.level,
        headerText: header.text,
        markdown,
        startOffset: offsets[start] || 0,
        endOffset: (offsets[end] || cursor) - 1
      })
    );
  });

  return sections;
}

function makeSection({ order, headerLevel, headerText, markdown, startOffset, endOffset }) {
  const sectionId = `s_${order.toString(36)}`;
  const plainTextPreview = markdown.replace(/\s+/g, " ").slice(0, 160);
  return {
    sectionId,
    order,
    headerLevel,
    headerText,
    startOffset,
    endOffset,
    markdown,
    plainTextPreview
  };
}
