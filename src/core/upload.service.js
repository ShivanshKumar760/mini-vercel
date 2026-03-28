import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";
import { deepStrictEqual } from "assert";
//what does path.resolve does ?
//it basically looks for the given folder in "quotes"
//and resolves its path
const UPLOADS_DIR = path.resolve("uploads");

function detectStripPrefix(entries) {
  const names = entries.map((e) => e.entryName);
  if (!names.length) return "";
  const candidate = names[0].split("/")[0] + "/";
  return names.every((n) => n.startsWith(candidate)) ? candidate : "";
}

//ZIP upload
export function extractBuildZip(zipBuffer, projectId) {
  const destDir = path.join(UPLOADS_DIR, projectId, "dist");
  fs.mkdirSync(destDir, { recursive: true });

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const prefix = detectStripPrefix(entries);

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const relPath = entry.entryName.slice(prefix.length);
    const outPath = path.join(destDir, relPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, entry.getData());
  }
  return path.join(UPLOADS_DIR, projectId);
}

// ── Raw file / folder upload ──────────────────────────────────────────────────
// Handles two cases:
//   1. User clicks "Upload Folder" → browser sends webkitRelativePath
//      e.g. "dist/assets/index.js", "dist/index.html"
//   2. User drags individual files → only originalname is available
//      e.g. "index.js", "main.css"
//
// multer's memoryStorage does NOT preserve webkitRelativePath on its own.
// The frontend must send it explicitly as a custom field (see note below).

export function saveRawFiles(files, projectId) {
  const destDir = path.join(UPLOADS_DIR, projectId, "dist");
  fs.mkdirSync(destDir, { recursive: true });

  for (const file of files) {
    // Priority order for reconstructing the relative path:
    //
    // 1. file.relativePath  — set by our custom multer storage (see upload.routes.js)
    //    This is the webkitRelativePath sent from the frontend as a hidden field.
    //
    // 2. file.fieldname     — when using .fields(), multer puts the field name here.
    //    If the frontend sent relativePath as the field name this works as a fallback.
    //
    // 3. file.originalname  — flat filename, no folder info. Last resort.

    const relPath =
      file.relativePath ||
      (file.fieldname?.includes("/") ? file.fieldname : null) ||
      file.originalname;

    // Strip any leading "dist/" or "files/" prefix the user may have included

    const cleanPath = relPath.replace(/^(dist\/|files\/)+/, "");

    const outPath = path.join(destDir, cleanPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, file.buffer);
  }
  return path.join(UPLOADS_DIR, projectId);
}
