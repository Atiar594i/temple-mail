import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env if present
dotenv.config();

const dataDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Comma-separated list of active email domains (atiar.dpdns.org & progmail.dpdns.org)
const rawDomains = process.env.DOMAINS || process.env.DOMAIN || 'atiar.dpdns.org,progmail.dpdns.org';
const domains = rawDomains
  .split(',')
  .map(d => d.trim().toLowerCase())
  .filter(Boolean);

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  domains: domains.length > 0 ? domains : ['atiar.dpdns.org'],
  defaultDomain: domains[0] || 'atiar.dpdns.org',
  webhookSecret: process.env.WEBHOOK_SECRET || 'temple-secret-key-change-me',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin12345',
  emailTtlMinutes: parseInt(process.env.EMAIL_TTL_MINUTES || '60', 10), // default 1 hour
  dataDir,
  dbPath: process.env.DB_PATH || path.join(dataDir, 'tempmail.sqlite'),
  siteTitle: process.env.SITE_TITLE || 'Temple - Instant Disposable Temp Mail',
  maxEmailsPerMailbox: parseInt(process.env.MAX_EMAILS_PER_MAILBOX || '100', 10),
};
