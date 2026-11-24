import { config } from './config.js';
import { getDatabase } from './db.js';

/**
 * Execute SQL statement on Cloudflare D1
 */
export async function executeD1Query(sql, params = []) {
  if (!config.cfAccountId || !config.cfD1DatabaseId || !config.cfAuthKey) {
    return null;
  }

  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${config.cfAccountId}/d1/database/${config.cfD1DatabaseId}/query`;
    const headers = {
      'X-Auth-Email': config.cfAuthEmail,
      'X-Auth-Key': config.cfAuthKey,
      'Content-Type': 'application/json'
    };

    const payload = params.length > 0 ? { sql, params } : { sql };
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.success) {
      console.warn('[D1 Query Warning]', data.errors || data.messages);
      return null;
    }
    return data.result;
  } catch (err) {
    console.error('[D1 Network Error]', err.message);
    return null;
  }
}

/**
 * Pull all data from Cloudflare D1 on container startup
 * Restores all settings (custom password), mailboxes, and emails
 */
export async function syncDownFromCloud() {
  console.log('🔄 [CloudSync] Connecting to Cloudflare D1 persistent cloud database...');
  try {
    const results = await executeD1Query(
      'SELECT key, value FROM settings; SELECT address, created_at, last_accessed FROM mailboxes; SELECT id, mailbox_address, from_name, from_address, subject, text_body, html_body, raw_headers, attachments_json, received_at, is_read, otp FROM emails;'
    );

    if (!results || results.length < 3) {
      console.log('ℹ️ [CloudSync] Cloudflare D1 initialized or empty.');
      return;
    }

    const localDb = getDatabase();

    // 1. Restore Settings (including Admin Password)
    const settingsRows = results[0]?.results || [];
    if (settingsRows.length > 0) {
      const stmt = localDb.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      for (const row of settingsRows) {
        stmt.run(row.key, String(row.value));
      }
      console.log(`✅ [CloudSync] Restored ${settingsRows.length} setting(s) (including custom admin password).`);
    }

    // 2. Restore Mailboxes
    const mailboxRows = results[1]?.results || [];
    if (mailboxRows.length > 0) {
      const stmt = localDb.prepare('INSERT OR REPLACE INTO mailboxes (address, created_at, last_accessed) VALUES (?, ?, ?)');
      for (const row of mailboxRows) {
        stmt.run(row.address, row.created_at, row.last_accessed);
      }
      console.log(`✅ [CloudSync] Restored ${mailboxRows.length} user mailbox(es).`);
    }

    // 3. Restore Emails & OTPs
    const emailRows = results[2]?.results || [];
    if (emailRows.length > 0) {
      const stmt = localDb.prepare(`
        INSERT OR REPLACE INTO emails (
          id, mailbox_address, from_name, from_address, subject,
          text_body, html_body, raw_headers, attachments_json,
          received_at, is_read, otp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const row of emailRows) {
        stmt.run(
          row.id,
          row.mailbox_address,
          row.from_name || '',
          row.from_address || '',
          row.subject || '',
          row.text_body || '',
          row.html_body || '',
          row.raw_headers || '',
          row.attachments_json || '[]',
          row.received_at,
          row.is_read || 0,
          row.otp || null
        );
      }
      console.log(`✅ [CloudSync] Restored ${emailRows.length} email(s) and verification codes.`);
    }

    console.log('🎉 [CloudSync] Cloudflare D1 synchronization complete! All data is persistent.');
  } catch (err) {
    console.error('❌ [CloudSync Error]', err);
  }
}
