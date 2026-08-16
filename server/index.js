import app from './app.js';
import { migrate } from './db.js';

const PORT = process.env.PORT || 3001;

await migrate();

app.listen(PORT, () => {
  console.log(`StoryTime API server running on http://localhost:${PORT}`);
});
