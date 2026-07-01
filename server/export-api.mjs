#!/usr/bin/env node

import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const exportScript = path.join(projectRoot, "tools", "export-impion-project.mjs");
const defaultExportsRoot = "/Users/hairway/Documents/Codex/tap-gallery-constructor-exports";
const port = Number(process.env.PLAYABLE_EXPORT_API_PORT || 8787);

const app = express();

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

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "tap-gallery-constructor-export-api",
    exportsRoot: defaultExportsRoot,
  });
});

app.post("/api/parse-tz-pdf", async (req, res) => {
  try {
    const dataUrl = req.body?.dataUrl;
    const filename = sanitizeProjectCode(req.body?.filename || "brief.pdf");
    const parsed = parseDataUrl(dataUrl);

    if (!parsed || parsed.buffer.length === 0) {
      res.status(400).json({ ok: false, error: "Invalid PDF payload." });
      return;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "playable-brief-pdf-"));
    const pdfPath = path.join(tempDir, filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
    fs.writeFileSync(pdfPath, parsed.buffer);

    const text = await extractPdfText(pdfPath);
    fs.rmSync(tempDir, { recursive: true, force: true });

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

app.listen(port, () => {
  console.log(`Tap Gallery export API listening on http://localhost:${port}`);
});

function sanitizeProjectCode(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "playable_project";
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;

  const isBase64 = Boolean(match[2]);
  const body = match[3] || "";
  const buffer = isBase64
    ? Buffer.from(body, "base64")
    : Buffer.from(decodeURIComponent(body), "utf8");

  return { mimeType: match[1] || "application/pdf", buffer };
}

async function extractPdfText(pdfPath) {
  const python = [
    "import sys",
    "from pathlib import Path",
    "try:",
    "    import pypdf",
    "    reader = pypdf.PdfReader(sys.argv[1])",
    "    text = '\\n'.join(page.extract_text() or '' for page in reader.pages)",
    "    sys.stdout.write(text)",
    "except Exception as exc:",
    "    sys.stderr.write(str(exc))",
    "    sys.exit(1)",
  ].join("\n");

  const pythonResult = await runCommand("python3", ["-c", python, pdfPath], projectRoot);
  if (pythonResult.code === 0 && pythonResult.stdout.trim()) {
    return normalizeExtractedText(pythonResult.stdout);
  }

  const pdftotextResult = await runCommand("pdftotext", ["-layout", pdfPath, "-"], projectRoot);
  if (pdftotextResult.code === 0 && pdftotextResult.stdout.trim()) {
    return normalizeExtractedText(pdftotextResult.stdout);
  }

  throw new Error(pythonResult.stderr || pdftotextResult.stderr || "PDF text extraction failed.");
}

async function importTextFromUrl(url) {
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
  const buffer = Buffer.from(await response.arrayBuffer());

  if (contentType.includes("application/pdf") || url.toLowerCase().includes(".pdf")) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "playable-brief-url-pdf-"));
    const pdfPath = path.join(tempDir, "brief.pdf");
    fs.writeFileSync(pdfPath, buffer);
    const text = await extractPdfText(pdfPath);
    fs.rmSync(tempDir, { recursive: true, force: true });
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

function isUnreadableWebAppShell(text) {
  const lower = String(text).toLowerCase();
  return (
    lower.includes("your browser was unable to load") ||
    lower.includes("enable javascript") ||
    lower.includes("please enable javascript") ||
    (lower.includes("trello") && lower.includes("troubleshooting guide") && !/\bTG_play\d+_\d+\b/i.test(text))
  );
}

function extractReadableTextFromHtml(html) {
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

function decodeHtmlEntities(value) {
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

function normalizeExtractedText(text) {
  return String(text)
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function runNode(scriptPath, args) {
  return runCommand(process.execPath, [scriptPath, ...args], projectRoot);
}

function runCommand(command, args, cwd) {
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

function findNewestZip(buildDir) {
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
