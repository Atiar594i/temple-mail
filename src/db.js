import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

let dbInstance = null;

export function getDatabase() {
  if (dbInstance) return dbInstance;

  dbInstance = new DatabaseSync(config.dbPath);

  // Enable WAL mode for better concurrency and performance
  dbInstance.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS mailboxes (
      address TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      last_accessed INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      mailbox_address TEXT NOT NULL,
      from_name TEXT,
      from_address TEXT NOT NULL,
      subject TEXT,
      text_body TEXT,
      html_body TEXT,
      raw_headers TEXT,
      attachments_json TEXT,
      received_at INTEGER NOT NULL,
      is_read INTEGER DEFAULT 0,
      FOREIGN KEY (mailbox_address) REFERENCES mailboxes (address) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_emails_mailbox ON emails(mailbox_address);
    CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at);
    CREATE INDEX IF NOT EXISTS idx_mailboxes_last_accessed ON mailboxes(last_accessed);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return dbInstance;
}

export const db = {
  createMailbox(address) {
    const database = getDatabase();
    const normalized = address.toLowerCase().trim();
    const now = Math.floor(Date.now() / 1000);

    const stmt = database.prepare(`
      INSERT INTO mailboxes (address, created_at, last_accessed)
      VALUES (?, ?, ?)
      ON CONFLICT(address) DO UPDATE SET last_accessed = excluded.last_accessed
    `);
    stmt.run(normalized, now, now);

    return {
      address: normalized,
      created_at: now,
      last_accessed: now,
    };
  },

  getMailbox(address) {
    const database = getDatabase();
    const normalized = address.toLowerCase().trim();
    const stmt = database.prepare(`SELECT * FROM mailboxes WHERE address = ?`);
    const box = stmt.get(normalized);
    if (box) {
      // Touch last accessed
      const now = Math.floor(Date.now() / 1000);
      database.prepare(`UPDATE mailboxes SET last_accessed = ? WHERE address = ?`).run(now, normalized);
    }
    return box || null;
  },

  deleteMailbox(address) {
    const database = getDatabase();
    const normalized = address.toLowerCase().trim();
    database.prepare(`DELETE FROM emails WHERE mailbox_address = ?`).run(normalized);
    const result = database.prepare(`DELETE FROM mailboxes WHERE address = ?`).run(normalized);
    return result.changes > 0;
  },

  saveEmail({
    mailboxAddress,
    fromName,
    fromAddress,
    subject,
    textBody,
    htmlBody,
    rawHeaders = '',
    attachments = [],
  }) {
    const database = getDatabase();
    const normalized = mailboxAddress.toLowerCase().trim();

    // Ensure mailbox exists
    this.createMailbox(normalized);

    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const attachmentsJson = JSON.stringify(attachments || []);

    const stmt = database.prepare(`
      INSERT INTO emails (
        id, mailbox_address, from_name, from_address,
        subject, text_body, html_body, raw_headers,
        attachments_json, received_at, is_read
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    stmt.run(
      id,
      normalized,
      fromName || '',
      fromAddress || 'unknown@example.com',
      subject || '(No Subject)',
      textBody || '',
      htmlBody || '',
      typeof rawHeaders === 'object' ? JSON.stringify(rawHeaders) : String(rawHeaders || ''),
      attachmentsJson,
      now
    );

    // Limit mailbox email count if exceeded
    const countStmt = database.prepare(`SELECT COUNT(*) as count FROM emails WHERE mailbox_address = ?`);
    const { count } = countStmt.get(normalized);
    if (count > config.maxEmailsPerMailbox) {
      database.prepare(`
        DELETE FROM emails WHERE id IN (
          SELECT id FROM emails WHERE mailbox_address = ?
          ORDER BY received_at ASC
          LIMIT ?
        )
      `).run(normalized, count - config.maxEmailsPerMailbox);
    }

    return this.getEmailById(id, false);
  },

  getEmailsForMailbox(address) {
    const database = getDatabase();
    const normalized = address.toLowerCase().trim();

    const stmt = database.prepare(`
      SELECT
        id, mailbox_address, from_name, from_address,
        subject, substr(text_body, 1, 160) as preview,
        received_at, is_read,
        length(attachments_json) > 2 as has_attachments
      FROM emails
      WHERE mailbox_address = ?
      ORDER BY received_at DESC
    `);

    return stmt.all(normalized).map(row => ({
      ...row,
      has_attachments: Boolean(row.has_attachments),
      is_read: Boolean(row.is_read)
    }));
  },

  getEmailById(id, markAsRead = true) {
    const database = getDatabase();
    const stmt = database.prepare(`SELECT * FROM emails WHERE id = ?`);
    const email = stmt.get(id);

    if (!email) return null;

    if (markAsRead && !email.is_read) {
      database.prepare(`UPDATE emails SET is_read = 1 WHERE id = ?`).run(id);
      email.is_read = 1;
    }

    let attachments = [];
    try {
      attachments = JSON.parse(email.attachments_json || '[]');
    } catch {
      attachments = [];
    }

    return {
      ...email,
      is_read: Boolean(email.is_read),
      attachments,
    };
  },

  deleteEmailById(id) {
    const database = getDatabase();
    const result = database.prepare(`DELETE FROM emails WHERE id = ?`).run(id);
    return result.changes > 0;
  },

  cleanupExpired(ttlMinutes = config.emailTtlMinutes) {
    // Permanent retention: preserve all user mailboxes, emails, and OTPs indefinitely
    return {
      deletedEmails: 0,
      deletedMailboxes: 0,
      cutoffTime: 0,
    };
  },

  getStats() {
    const database = getDatabase();
    const mailboxesCount = database.prepare(`SELECT COUNT(*) as count FROM mailboxes`).get().count;
    const emailsCount = database.prepare(`SELECT COUNT(*) as count FROM emails`).get().count;
    const unreadCount = database.prepare(`SELECT COUNT(*) as count FROM emails WHERE is_read = 0`).get().count;

    return {
      totalMailboxes: mailboxesCount,
      totalEmails: emailsCount,
      totalUnread: unreadCount,
    };
  },

  // Admin Methods
  getAllMailboxes(limit = 100, search = '') {
    const database = getDatabase();
    let query = `
      SELECT m.address, m.created_at, m.last_accessed,
             COUNT(e.id) as email_count
      FROM mailboxes m
      LEFT JOIN emails e ON m.address = e.mailbox_address
    `;
    const params = [];

    if (search) {
      query += ` WHERE m.address LIKE ? `;
      params.push(`%${search.toLowerCase().trim()}%`);
    }

    query += ` GROUP BY m.address ORDER BY m.last_accessed DESC LIMIT ? `;
    params.push(limit);

    return database.prepare(query).all(...params);
  },

  getRecentEmails(limit = 100, search = '') {
    const database = getDatabase();
    let query = `
      SELECT id, mailbox_address, from_name, from_address,
             subject, substr(text_body, 1, 200) as preview,
             received_at, is_read,
             length(attachments_json) > 2 as has_attachments
      FROM emails
    `;
    const params = [];

    if (search) {
      query += ` WHERE mailbox_address LIKE ? OR from_address LIKE ? OR subject LIKE ? OR text_body LIKE ? `;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY received_at DESC LIMIT ? `;
    params.push(limit);

    return database.prepare(query).all(...params).map(row => ({
      ...row,
      has_attachments: Boolean(row.has_attachments),
      is_read: Boolean(row.is_read)
    }));
  },

  getSetting(key, defaultValue = null) {
    const database = getDatabase();
    const row = database.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  },

  setSetting(key, value) {
    const database = getDatabase();
    const stmt = database.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, String(value));
    return value;
  }
};
