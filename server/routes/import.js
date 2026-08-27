import { Router } from 'express';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMPORT_DIR = path.join(__dirname, '..', '..', 'import');

const router = Router();

const MIME_TYPES = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const TEXT_EXTENSIONS = new Set(['.md', '.txt']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const SUPPORTED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ...IMAGE_EXTENSIONS]);

function scanDir(dir, baseDir = dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDir(fullPath, baseDir));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        const stat = fs.statSync(fullPath);
        const relativePath = path.relative(baseDir, fullPath);
        results.push({
          filename: entry.name,
          relativePath,
          fullPath,
          extension: ext,
          fileType: TEXT_EXTENSIONS.has(ext) ? 'text' : 'image',
          mimeType: MIME_TYPES[ext] || 'application/octet-stream',
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    }
  }
  return results;
}

// Scan the import directory for available files
router.get('/scan', async (_req, res) => {
  try {
    const files = scanDir(IMPORT_DIR);

    // Check which files have already been imported (by original_path)
    const imported = (await db.all(
      'SELECT original_path FROM assets'
    )).map(r => r.original_path);
    const importedSet = new Set(imported);

    const result = files
      .filter(f => f.filename !== 'README.md')
      .map(f => ({
        ...f,
        alreadyImported: importedSet.has(f.relativePath),
      }));

    res.json(result);
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: 'Failed to scan import directory' });
  }
});

// Import selected files into the database
router.post('/ingest', async (req, res) => {
  const { files, projectId } = req.body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'files array is required' });
  }

  // Verify project exists if provided
  if (projectId) {
    const project = await db.get('SELECT id FROM stories WHERE id = ?', projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
  }

  const results = [];
  const INSERT_ASSET = `
    INSERT INTO assets (id, project_id, filename, original_path, file_type, mime_type, content, data, size, imported_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const importMany = (fileList) =>
    db.transaction(async (tx) => {
      for (const filePath of fileList) {
        const fullPath = path.join(IMPORT_DIR, filePath);
        if (!fs.existsSync(fullPath)) {
          results.push({ path: filePath, status: 'error', error: 'File not found' });
          continue;
        }

        // Security: ensure path doesn't escape import dir
        const resolved = path.resolve(fullPath);
        if (!resolved.startsWith(path.resolve(IMPORT_DIR))) {
          results.push({ path: filePath, status: 'error', error: 'Invalid path' });
          continue;
        }

        // Check if already imported
        const existing = await tx.get('SELECT id FROM assets WHERE original_path = ?', filePath);
        if (existing) {
          results.push({ path: filePath, status: 'skipped', reason: 'Already imported', id: existing.id });
          continue;
        }

        const ext = path.extname(filePath).toLowerCase();
        const fileType = TEXT_EXTENSIONS.has(ext) ? 'text' : 'image';
        const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
        const stat = fs.statSync(fullPath);
        const id = randomUUID();
        const now = new Date().toISOString();

        let content = null;
        let data = null;

        if (fileType === 'text') {
          content = fs.readFileSync(fullPath, 'utf-8');
        } else {
          data = fs.readFileSync(fullPath);
        }

        await tx.run(INSERT_ASSET, id, projectId || null, path.basename(filePath), filePath, fileType, mimeType, content, data, stat.size, now);
        results.push({ path: filePath, status: 'imported', id, fileType, size: stat.size });
      }
    });

  try {
    await importMany(files);
    return res.json({ results });
  } catch (err) {
    console.error('Import error:', err);
    return res.status(500).json({ error: 'Failed to import files' });
  }
});

// List imported assets, optionally filtered by projectId
router.get('/', async (req, res) => {
  const { projectId } = req.query;

  let assets;
  if (projectId) {
    assets = await db.all(`
      SELECT id, project_id as "projectId", filename, original_path as "originalPath", file_type as "fileType",
             mime_type as "mimeType", size, imported_at as "importedAt"
      FROM assets WHERE project_id = ? ORDER BY imported_at DESC
    `, projectId);
  } else {
    assets = await db.all(`
      SELECT id, project_id as "projectId", filename, original_path as "originalPath", file_type as "fileType",
             mime_type as "mimeType", size, imported_at as "importedAt"
      FROM assets ORDER BY imported_at DESC
    `);
  }

  res.json(assets);
});

// Get asset content (for text) or binary data (for images)
router.get('/:id', async (req, res) => {
  const asset = await db.get('SELECT * FROM assets WHERE id = ?', req.params.id);
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  if (asset.file_type === 'text') {
    return res.json({
      id: asset.id,
      projectId: asset.project_id,
      filename: asset.filename,
      fileType: asset.file_type,
      mimeType: asset.mime_type,
      content: asset.content,
      size: asset.size,
      importedAt: asset.imported_at,
    });
  }

  // For images, serve the binary data
  res.set('Content-Type', asset.mime_type);
  res.set('Content-Disposition', `inline; filename="${asset.filename}"`);
  return res.send(asset.data);
});

// Assign an asset to a project
router.put('/:id', async (req, res) => {
  const { projectId } = req.body;
  const existing = await db.get('SELECT id FROM assets WHERE id = ?', req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  await db.run('UPDATE assets SET project_id = ? WHERE id = ?', projectId || null, req.params.id);
  return res.json({ success: true });
});

// Delete an asset
router.delete('/:id', async (req, res) => {
  const result = await db.run('DELETE FROM assets WHERE id = ?', req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  return res.json({ success: true });
});

export default router;
