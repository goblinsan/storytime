import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import storiesRouter from './routes/stories.js';
import charactersRouter from './routes/characters.js';
import arcsRouter from './routes/arcs.js';
import bestiaryRouter from './routes/bestiary.js';
import importRouter from './routes/import.js';
import locationsRouter from './routes/locations.js';
import terrainRouter from './routes/terrain.js';
import pathsRouter from './routes/paths.js';
import generatedDraftsRouter from './routes/generatedDrafts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API routes
app.use('/api/stories', storiesRouter);
app.use('/api/characters', charactersRouter);
app.use('/api/arcs', arcsRouter);
app.use('/api/bestiary', bestiaryRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/terrain', terrainRouter);
app.use('/api/paths', pathsRouter);
app.use('/api/import', importRouter);
app.use('/api/generated-drafts', generatedDraftsRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

export default app;
