import express from 'express';
import cors from 'cors';
import path from 'path';
import { referenceRouter } from './reference.js';
import { mediaFilesRouter } from './mediaStore.js';
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
import derivativesRouter from './routes/derivatives.js';
import relationshipsRouter from './routes/relationships.js';
import factionsRouter from './routes/factions.js';
import timelineEventsRouter from './routes/timelineEvents.js';
import technologiesRouter from './routes/technologies.js';
import mysterySignalsRouter from './routes/mysterySignals.js';
import composerRouter from './routes/composer.js';
import editorialWorkspaceRouter from './routes/editorialWorkspace.js';
import readerReviewRouter from './routes/readerReview.js';
import imageSourcesRouter from './routes/imageSources.js';
import mediaRouter from './routes/media.js';

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
  app.use(`${prefix}/factions`, factionsRouter);
  app.use(`${prefix}/timeline-events`, timelineEventsRouter);
  app.use(`${prefix}/technologies`, technologiesRouter);
  app.use(`${prefix}/mystery-signals`, mysterySignalsRouter);
  app.use(`${prefix}/terrain`, terrainRouter);
  app.use(`${prefix}/paths`, pathsRouter);
  app.use(`${prefix}/import`, importRouter);
  app.use(`${prefix}/generated-drafts`, generatedDraftsRouter);
  app.use(`${prefix}/derivatives`, derivativesRouter);
  app.use(`${prefix}/relationships`, relationshipsRouter);
  app.use(`${prefix}/composer`, composerRouter);
  app.use(`${prefix}/editorial`, editorialWorkspaceRouter);
  app.use(`${prefix}/reader-review`, readerReviewRouter);
  app.use(`${prefix}/image-sources`, imageSourcesRouter);
  app.use(`${prefix}/media`, mediaRouter);
  app.get(`${prefix}/health`, (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
}

// API routes. The /storytime prefix supports the built public-preview bundle
// when the app is opened directly through its private container port.
mountApi('/api');
mountApi('/storytime/api');

// Reference art. See server/reference.js: in deployment this streams from a
// read-only file service on the storage node, so no project image is ever
// written to the disk of the machine hosting the app.
app.use('/reference', referenceRouter());
app.use('/storytime/reference', referenceRouter());

// Pictures that were kept. Written by POST /api/media when a preview is
// accepted, and read back from the storage volume -- never from this machine's
// own disk. See server/mediaStore.js.
app.use('/media-files', mediaFilesRouter());
app.use('/storytime/media-files', mediaFilesRouter());

const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get(/^(?!\/(api|reference|media-files|storytime\/(api|reference|media-files))).*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

export default app;
