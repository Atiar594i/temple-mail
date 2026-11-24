import dotenv from 'dotenv';
dotenv.config();

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const dbId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const headers = {
  'X-Auth-Email': process.env.CLOUDFLARE_AUTH_EMAIL,
  'X-Auth-Key': process.env.CLOUDFLARE_AUTH_KEY,
  'Content-Type': 'application/json'
};

async function initSchema() {
  const sql = `
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
      otp TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_emails_mailbox ON emails(mailbox_address);
    CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at);
  `;

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sql })
  });

  const data = await res.json();
  console.log('Init schema result:', JSON.stringify(data, null, 2));
}

initSchema().catch(console.error);
