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

function mountApi(prefix) {
  app.use(`${prefix}/stories`, storiesRouter);
  app.use(`${prefix}/projects`, storiesRouter);
  app.use(`${prefix}/characters`, charactersRouter);
  app.use(`${prefix}/arcs`, arcsRouter);
  app.use(`${prefix}/bestiary`, bestiaryRouter);
  app.use(`${prefix}/locations`, locationsRouter);
  app.use(`${prefix}/terrain`, terrainRouter);
  app.use(`${prefix}/paths`, pathsRouter);
  app.use(`${prefix}/import`, importRouter);
  app.use(`${prefix}/generated-drafts`, generatedDraftsRouter);
  app.get(`${prefix}/health`, (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
}

// API routes. The /storytime prefix supports the built public-preview bundle
// when the app is opened directly through its private container port.
mountApi('/api');
mountApi('/storytime/api');

const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

export default app;
