import express from 'express';
import cors from 'cors';
import storiesRouter from './routes/stories.js';
import charactersRouter from './routes/characters.js';
import arcsRouter from './routes/arcs.js';
import bestiaryRouter from './routes/bestiary.js';
import importRouter from './routes/import.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API routes
app.use('/api/stories', storiesRouter);
app.use('/api/characters', charactersRouter);
app.use('/api/arcs', arcsRouter);
app.use('/api/bestiary', bestiaryRouter);
app.use('/api/import', importRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`StoryTime API server running on http://localhost:${PORT}`);
});
