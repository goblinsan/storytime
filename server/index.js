import app from './app.js';
import { migrate } from './db.js';

const PORT = process.env.PORT || 3001;

/**
 * A net under the async routes, not a substitute for handling.
 *
 * Express 4 does not catch a rejection thrown from an async handler, so any
 * route that awaits the database without a try/catch takes the whole process
 * with it when that await rejects. That is what happened when a picture was
 * kept against a subject the table's CHECK constraint had never heard of: one
 * bad insert, and the API was gone for everybody.
 *
 * A server that dies while somebody is using it is worse than one that logs
 * loudly and keeps answering, so this logs and keeps answering. It is a net:
 * anything caught here is a bug in a route that should have handled its own
 * failure, and the log says so in those words so it does not read as normal.
 */
process.on('unhandledRejection', (reason) => {
  const said = reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason);
  console.error(`UNHANDLED in a route -- this should have been caught where it happened:\n${said}`);
});

await migrate();

app.listen(PORT, () => {
  console.log(`Contesora API server running on http://localhost:${PORT}`);
});
