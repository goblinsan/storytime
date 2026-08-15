import app from './app.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`StoryTime API server running on http://localhost:${PORT}`);
});
