import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { db, getDatabase } from './db.js';
import { apiRouter } from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Initialize DB schema
getDatabase();

// Middlewares
app.use(cors());
// Support large email payloads (up to 25MB for HTML & attachments)
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Request logging
app.use((req, res, next) => {
  if (!req.path.startsWith('/public') && !req.path.endsWith('.css') && !req.path.endsWith('.js')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// API Routes
app.use('/api', apiRouter);

// Serve Static Frontend UI
const publicDir = path.resolve(__dirname, '../public');
app.use(express.static(publicDir));

// Fallback to index.html for SPA-like navigation
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(publicDir, 'index.html'));
  }
  next();
});

// Start cleanup background task (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  try {
    const res = db.cleanupExpired(config.emailTtlMinutes);
    if (res.deletedEmails > 0 || res.deletedMailboxes > 0) {
      console.log(`[Auto-Cleanup] Removed ${res.deletedEmails} expired emails and ${res.deletedMailboxes} inactive mailboxes.`);
    }
  } catch (err) {
    console.error('[Cleanup Error]', err);
  }
}, CLEANUP_INTERVAL_MS);

// Start HTTP Server
const server = app.listen(config.port, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Temple Mail Server is running!`);
  console.log(`📍 Web UI:      http://localhost:${config.port}`);
  console.log(`📡 API Base:    http://localhost:${config.port}/api`);
  console.log(`📩 Webhook:     http://localhost:${config.port}/api/webhook/email`);
  console.log(`🌐 Domains:     ${config.domains.join(', ')}`);
  console.log(`⏱️  TTL:         ${config.emailTtlMinutes} minutes`);
  console.log(`=======================================================`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down Temple Mail gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
