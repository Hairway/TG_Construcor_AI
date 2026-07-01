import fetch from "node-fetch";

async function test() {
  const pageId = "364a86b6-63a1-8095-95f6-f21ca75928ee";
  const url = "https://www.notion.so/api/v3/loadPageChunk";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    body: JSON.stringify({
      pageId: pageId,
      limit: 100,
      cursor: { stack: [] },
      chunkNumber: 0,
      verticalColumns: false
    })
  });

  console.log("Status:", res.status);
  const data = await res.json() as any;
  console.log("Keys in response:", Object.keys(data));
  if (data.recordMap) {
    console.log("Keys in recordMap:", Object.keys(data.recordMap));
    const blocks = data.recordMap.block;
    if (blocks) {
      console.log("Number of blocks:", Object.keys(blocks).length);
      const pageBlock = blocks[pageId] || Object.values(blocks).find((b: any) => b.value?.type === "page");
      console.log("Page block:", JSON.stringify(pageBlock?.value, null, 2));
    }
  } else {
    console.log("No recordMap returned! Full response:", JSON.stringify(data, null, 2).slice(0, 500));
  }
}

test().catch(console.error);
