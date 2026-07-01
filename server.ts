import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
import { Client } from "@notionhq/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname);
const exportScript = path.join(projectRoot, "tools", "export-impion-project.mjs");

// Fallback to local exports folder if user path doesn't exist
const localUserPath = "/Users/hairway/Documents/Codex/tap-gallery-constructor-exports";
const defaultExportsRoot = fs.existsSync("/Users/hairway/Documents/Codex/")
  ? localUserPath
  : path.join(projectRoot, "exports");

const app = express();
const PORT = 3000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: "150mb" }));

// 1. Health check
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "tap-gallery-constructor-export-api",
    exportsRoot: defaultExportsRoot,
  });
});

// 2. Parse PDF Brief (Uses high-performance pdf-parse library)
app.post("/api/parse-tz-pdf", async (req, res) => {
  try {
    const dataUrl = req.body?.dataUrl;
    const parsed = parseDataUrl(dataUrl);

    if (!parsed || parsed.buffer.length === 0) {
      res.status(400).json({ ok: false, error: "Invalid PDF payload." });
      return;
    }

    // Direct in-memory parsing using pdf-parse
    const pdfData = await pdf(parsed.buffer);
    const text = normalizeExtractedText(pdfData.text);

    res.json({
      ok: true,
      text,
      chars: text.length,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Could not parse PDF.",
    });
  }
});

// 3. Import URL (Standard HTML or PDF URLs)
app.post("/api/import-tz-url", async (req, res) => {
  try {
    const url = String(req.body?.url || "").trim();
    if (!/^https?:\/\//i.test(url)) {
      res.status(400).json({ ok: false, error: "Invalid URL." });
      return;
    }

    const imported = await importTextFromUrl(url);
    res.json({
      ok: true,
      url,
      text: imported.text,
      chars: imported.text.length,
      contentType: imported.contentType,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Could not import URL.",
    });
  }
});

// 4. Notion Page Import (The requested Notion Connector!)
app.post("/api/import-notion", async (req, res) => {
  try {
    const urlOrId = String(req.body?.url || "").trim();
    const token = String(req.body?.notionToken || process.env.NOTION_INTEGRATION_TOKEN || "").trim();

    const pageId = extractNotionPageId(urlOrId);
    if (!pageId) {
      res.status(400).json({
        ok: false,
        error: "Could not extract a valid 32-character Notion Page ID from the input.",
      });
      return;
    }

    // Try fetching the page via public API first
    const publicData = await fetchPublicNotionPage(pageId);
    if (publicData) {
      res.json({
        ok: true,
        url: urlOrId,
        pageId,
        title: publicData.title,
        text: publicData.text,
        chars: publicData.text.length,
      });
      return;
    }

    // Fall back to official API client if public fetch failed and we have a token
    if (!token) {
      res.status(400).json({
        ok: false,
        error: "The page is private or could not be loaded publicly, and no Notion Integration Token was provided. Please provide a token for private pages.",
      });
      return;
    }

    const notion = new Client({ auth: token });

    // Fetch page details to get the title
    const page: any = await notion.pages.retrieve({ page_id: pageId });
    let title = "Notion Page Brief";
    if (page?.properties) {
      const titleProp: any = Object.values(page.properties).find((prop: any) => prop.type === "title");
      if (titleProp && titleProp.type === "title" && Array.isArray(titleProp.title)) {
        title = titleProp.title.map((t: any) => t.plain_text).join("") || title;
      }
    }

    // Fetch page block children
    const blocksResponse = await notion.blocks.children.list({ block_id: pageId });
    const blocks = blocksResponse.results;

    const markdownContent = convertBlocksToMarkdown(blocks);
    const text = `# ${title}\n\n${markdownContent}`;

    res.json({
      ok: true,
      url: urlOrId,
      pageId,
      title,
      text,
      chars: text.length,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Could not connect or fetch from Notion.",
    });
  }
});

// 5. Impion Project Exporter
app.post("/api/export-impion", async (req, res) => {
  try {
    const project = req.body?.project;
    if (!project || project.schemaVersion !== 1 || !project.scene?.grid || !Array.isArray(project.tiles)) {
      res.status(400).json({ ok: false, error: "Invalid playable project payload." });
      return;
    }

    if (project.validation && project.validation.totalTiles > 0 && project.validation.solvable === false) {
      res.status(422).json({
        ok: false,
        error: `Puzzle logic is blocked: ${project.validation.clearedTiles || 0}/${project.validation.totalTiles} tiles clear.`,
      });
      return;
    }

    const safeCode = sanitizeProjectCode(project.project?.code || "playable_project");
    const buildZip = Boolean(req.body?.buildZip);
    const outputDir = path.join(defaultExportsRoot, safeCode);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tap-gallery-constructor-"));
    const inputPath = path.join(tempDir, `${safeCode}.json`);

    fs.mkdirSync(defaultExportsRoot, { recursive: true });
    fs.writeFileSync(inputPath, `${JSON.stringify(project, null, 2)}\n`);

    const result = await runNode(exportScript, [
      "--input",
      inputPath,
      "--output",
      outputDir,
    ]);

    fs.rmSync(tempDir, { recursive: true, force: true });

    if (result.code !== 0) {
      res.status(500).json({
        ok: false,
        error: "Impion export failed.",
        outputDir,
        stdout: result.stdout,
        stderr: result.stderr,
      });
      return;
    }

    let installResult = null;
    let buildResult = null;
    let zipPath = null;

    if (buildZip) {
      installResult = await runCommand("npm", ["install"], outputDir);
      if (installResult.code !== 0) {
        res.status(500).json({
          ok: false,
          error: "npm install failed in exported Impion project.",
          outputDir,
          stdout: `${result.stdout}\n${installResult.stdout}`,
          stderr: `${result.stderr}\n${installResult.stderr}`,
        });
        return;
      }

      buildResult = await runCommand("npm", ["run", "build"], outputDir);
      if (buildResult.code !== 0) {
        res.status(500).json({
          ok: false,
          error: "Impion zip build failed.",
          outputDir,
          stdout: `${result.stdout}\n${installResult.stdout}\n${buildResult.stdout}`,
          stderr: `${result.stderr}\n${installResult.stderr}\n${buildResult.stderr}`,
        });
        return;
      }

      zipPath = findNewestZip(path.join(outputDir, "build"));
    }

    res.json({
      ok: true,
      outputDir,
      zipPath,
      stdout: result.stdout,
      stderr: result.stderr,
      next: buildZip ? null : `cd ${outputDir} && npm install && npm run build`,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown export error.",
    });
  }
});

// Helper functions
function sanitizeProjectCode(value: string) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "playable_project";
}

function parseDataUrl(dataUrl: string) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;

  const isBase64 = Boolean(match[2]);
  const body = match[3] || "";
  const buffer = isBase64
    ? Buffer.from(body, "base64")
    : Buffer.from(decodeURIComponent(body), "utf8");

  return { mimeType: match[1] || "application/pdf", buffer };
}

async function extractPdfText(pdfPath: string) {
  try {
    const buffer = fs.readFileSync(pdfPath);
    const pdfData = await pdf(buffer);
    return normalizeExtractedText(pdfData.text);
  } catch (e) {
    // Failback to CLI if needed
    const pdftotextResult = await runCommand("pdftotext", ["-layout", pdfPath, "-"], projectRoot);
    if (pdftotextResult.code === 0 && pdftotextResult.stdout.trim()) {
      return normalizeExtractedText(pdftotextResult.stdout);
    }
    throw e;
  }
}

async function importTextFromUrl(url: string) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Tap Gallery Constructor/0.1 (+local importer)",
      "accept": "text/html,application/pdf,text/plain,*/*",
    },
  });

  if (!response.ok) {
    throw new Error(`URL request failed with ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") || "";
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (contentType.includes("application/pdf") || url.toLowerCase().includes(".pdf")) {
    const text = await extractPdfTextFromBuffer(buffer);
    return { contentType, text };
  }

  const rawText = buffer.toString("utf8");
  const text = contentType.includes("html")
    ? extractReadableTextFromHtml(rawText)
    : normalizeExtractedText(rawText);

  if (!text || text.length < 20) {
    throw new Error("No readable text found at this URL.");
  }

  if (isUnreadableWebAppShell(text)) {
    throw new Error("The URL returned a web-app shell instead of brief text. The page may be private or JavaScript-only.");
  }

  return { contentType, text };
}

async function extractPdfTextFromBuffer(buffer: Buffer) {
  const data = await pdf(buffer);
  return normalizeExtractedText(data.text);
}

function isUnreadableWebAppShell(text: string) {
  const lower = String(text).toLowerCase();
  return (
    lower.includes("your browser was unable to load") ||
    lower.includes("enable javascript") ||
    lower.includes("please enable javascript") ||
    (lower.includes("trello") && lower.includes("troubleshooting guide") && !/\bTG_play\d+_\d+\b/i.test(text))
  );
}

function extractReadableTextFromHtml(html: string) {
  let text = String(html);
  const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";

  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  text = decodeHtmlEntities(`${title}\n${text}`);
  return normalizeExtractedText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, all) => line && all.indexOf(line) === index)
    .join("\n");
}

function decodeHtmlEntities(value: string) {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function normalizeExtractedText(text: string) {
  return String(text)
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function runNode(scriptPath: string, args: string[]) {
  return runCommand(process.execPath, [scriptPath, ...args], projectRoot);
}

function runCommand(command: string, args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function findNewestZip(buildDir: string) {
  if (!fs.existsSync(buildDir)) return null;

  const zipFiles = fs.readdirSync(buildDir)
    .filter((name) => name.endsWith(".zip"))
    .map((name) => {
      const filePath = path.join(buildDir, name);
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return zipFiles[0]?.filePath || null;
}

// Notion helper functions
function extractNotionPageId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  const urlWithoutQuery = trimmed.split("?")[0];

  const plainIdRegex = /^[a-f0-9]{32}$/i;
  const hyphenatedIdRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

  if (plainIdRegex.test(urlWithoutQuery) || hyphenatedIdRegex.test(urlWithoutQuery)) {
    return urlWithoutQuery.replace(/-/g, "");
  }

  const match = urlWithoutQuery.match(/([a-f0-9]{32})/i);
  if (match) {
    return match[1];
  }

  const uuidMatch = urlWithoutQuery.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  if (uuidMatch) {
    return uuidMatch[1].replace(/-/g, "");
  }

  return null;
}

function toHyphenatedUuid(id: string): string {
  if (id.length !== 32) return id;
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

function parseNotionV3Property(prop: any[]): string {
  if (!Array.isArray(prop)) return "";
  return prop.map((chunk) => {
    const text = chunk[0] || "";
    const mods = chunk[1];
    if (!mods || !Array.isArray(mods)) return text;
    
    let result = text;
    for (const mod of mods) {
      const type = mod[0];
      const val = mod[1];
      if (type === "b") result = `**${result}**`;
      else if (type === "i") result = `*${result}*`;
      else if (type === "s") result = `~~${result}~~`;
      else if (type === "c") result = `\`${result}\``;
      else if (type === "a") result = `[${result}](${val})`;
    }
    return result;
  }).join("");
}

async function fetchPublicNotionPage(pageId: string): Promise<{ title: string; text: string } | null> {
  const formattedPageId = toHyphenatedUuid(pageId);
  const url = "https://www.notion.so/api/v3/loadPageChunk";
  
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      body: JSON.stringify({
        pageId: formattedPageId,
        limit: 100,
        cursor: { stack: [] },
        chunkNumber: 0,
        verticalColumns: false
      })
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json() as any;
    const blocks = data?.recordMap?.block;
    if (!blocks) {
      return null;
    }

    const pageBlock = blocks[formattedPageId]?.value?.value;
    if (!pageBlock) {
      return null;
    }

    const title = parseNotionV3Property(pageBlock.properties?.title) || "Notion Page";
    let markdown = `# ${title}\n\n`;

    const contentIds = pageBlock.content || [];
    let numberedListCounter = 1;

    for (const cid of contentIds) {
      const block = blocks[cid]?.value?.value;
      if (!block) continue;

      const type = block.type;
      const props = block.properties;
      const textContent = props?.title ? parseNotionV3Property(props.title) : "";

      if (type !== "numbered_list" && type !== "numbered_list_item") {
        numberedListCounter = 1;
      }

      switch (type) {
        case "divider":
          markdown += `\n---\n\n`;
          break;
        case "header":
        case "heading_1":
          markdown += `# ${textContent}\n\n`;
          break;
        case "sub_header":
        case "heading_2":
          markdown += `## ${textContent}\n\n`;
          break;
        case "sub_sub_header":
        case "heading_3":
          markdown += `### ${textContent}\n\n`;
          break;
        case "text":
          markdown += `${textContent}\n\n`;
          break;
        case "bulleted_list":
        case "bulleted_list_item":
          markdown += `* ${textContent}\n`;
          break;
        case "numbered_list":
        case "numbered_list_item":
          markdown += `${numberedListCounter}. ${textContent}\n`;
          numberedListCounter++;
          break;
        case "to_do": {
          const checked = props?.checked?.[0]?.[0] === "Yes";
          markdown += `- [${checked ? "x" : " "}] ${textContent}\n`;
          break;
        }
        case "code": {
          const lang = props?.language?.[0]?.[0] || "";
          markdown += `\`\`\`${lang}\n${textContent}\n\`\`\`\n\n`;
          break;
        }
        case "quote":
          markdown += `> ${textContent}\n\n`;
          break;
        case "callout": {
          const icon = block.format?.page_icon || "💡";
          markdown += `> ${icon} **Callout**: ${textContent}\n\n`;
          break;
        }
        case "page": {
          markdown += `📄 [${textContent}](https://notion.so/${cid.replace(/-/g, "")})\n\n`;
          break;
        }
        default:
          if (textContent) {
            markdown += `${textContent}\n\n`;
          }
          break;
      }
    }

    return { title, text: markdown };
  } catch (err) {
    console.error("Public Notion Page Fetch failed:", err);
    return null;
  }
}

function convertBlocksToMarkdown(blocks: any[]): string {
  let markdown = "";
  for (const block of blocks) {
    const type = block.type;
    const blockContent = block[type];
    if (!blockContent) continue;

    let text = "";
    if (Array.isArray(blockContent.rich_text)) {
      text = blockContent.rich_text.map((t: any) => t.plain_text).join("");
    }

    switch (type) {
      case "paragraph":
        markdown += `${text}\n\n`;
        break;
      case "heading_1":
        markdown += `# ${text}\n\n`;
        break;
      case "heading_2":
        markdown += `## ${text}\n\n`;
        break;
      case "heading_3":
        markdown += `### ${text}\n\n`;
        break;
      case "bulleted_list_item":
        markdown += `* ${text}\n`;
        break;
      case "numbered_list_item":
        markdown += `1. ${text}\n`;
        break;
      case "to_do": {
        const checked = blockContent.checked ? "[x]" : "[ ]";
        markdown += `- ${checked} ${text}\n`;
        break;
      }
      case "code":
        markdown += `\`\`\`${blockContent.language || ""}\n${text}\n\`\`\`\n\n`;
        break;
      case "quote":
        markdown += `> ${text}\n\n`;
        break;
      case "callout":
        markdown += `> 💡 **Callout**: ${text}\n\n`;
        break;
      default:
        if (text) {
          markdown += `${text}\n\n`;
        }
        break;
    }
  }
  return markdown;
}

// Vite and static asset serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
