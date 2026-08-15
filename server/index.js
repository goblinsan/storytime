import express from 'express';
import cors from 'cors';
import storiesRouter from './routes/stories.js';
import charactersRouter from './routes/characters.js';
import arcsRouter from './routes/arcs.js';
import bestiaryRouter from './routes/bestiary.js';
import importRouter from './routes/import.js';
import locationsRouter from './routes/locations.js';
import terrainRouter from './routes/terrain.js';
import pathsRouter from './routes/paths.js';

const app = express();
const PORT = process.env.PORT || 3001;

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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`StoryTime API server running on http://localhost:${PORT}`);
});
