import { Router } from 'express';
import crypto from 'node:crypto';
import { simpleParser } from 'mailparser';
import { config } from '../config.js';
import { db } from '../db.js';

export const apiRouter = Router();

// Disable all browser and proxy caching on API responses
apiRouter.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Helper: Extract OTP verification code from text/subject
function extractOtp(subject = '', text = '') {
  const combined = `${subject} ${text}`;
  // 1. Look for patterns like "code is 123456", "OTP: 123456", "verification: 123456"
  const contextMatch = combined.match(/(?:code|otp|verification|pin|ভেরিফিকেশন|কোড)[^0-9]{0,15}(\b\d{4,8}\b)/i);
  if (contextMatch) return contextMatch[1];
  
  // 2. Look for standard 6-digit standalone codes
  const sixDigitMatch = combined.match(/\b\d{6}\b/);
  if (sixDigitMatch) return sixDigitMatch[0];

  // 3. Fallback to any 4 to 8 digit number
  const anyDigitMatch = combined.match(/\b\d{4,8}\b/);
  return anyDigitMatch ? anyDigitMatch[0] : null;
}

// Clean, friendly names for natural-looking temporary email addresses (without awkward dots)
const PREFIX_NAMES = [
  'alex', 'sam', 'jordan', 'taylor', 'morgan', 'chris', 'casey', 'riley',
  'nova', 'echo', 'zen', 'pixel', 'spark', 'shadow', 'cyber', 'swift',
  'falcon', 'tiger', 'storm', 'star', 'nexus', 'pulse', 'vivid', 'lunar',
  'blaze', 'clover', 'frost', 'hawk', 'meteor', 'orion', 'phoenix', 'titan'
];

function generateRandomAddress(domain) {
  const chosenDomain = domain && config.domains.includes(domain.toLowerCase())
    ? domain.toLowerCase()
    : config.defaultDomain;

  const prefix = PREFIX_NAMES[Math.floor(Math.random() * PREFIX_NAMES.length)];
  const randomNum = Math.floor(1000 + Math.random() * 9000); // 4 clean digits (e.g. alex4821)

  return `${prefix}${randomNum}@${chosenDomain}`;
}

// Server-Sent Events (SSE) subscribers for 0-latency live inbox push
const sseSubscribers = new Map();

export function broadcastEmailToMailbox(mailboxAddress, emailData) {
  const normalized = mailboxAddress.toLowerCase().trim();
  const clients = sseSubscribers.get(normalized);
  if (clients && clients.size > 0) {
    const payload = `data: ${JSON.stringify({ type: 'new_email', email: emailData })}\n\n`;
    for (const client of clients) {
      try {
        client.write(payload);
      } catch (e) {
        clients.delete(client);
      }
    }
  }
}

// 0. Live SSE Stream endpoint
apiRouter.get('/events/:address', (req, res) => {
  const address = req.params.address.toLowerCase().trim();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', address })}\n\n`);

  if (!sseSubscribers.has(address)) {
    sseSubscribers.set(address, new Set());
  }
  const clients = sseSubscribers.get(address);
  clients.add(res);

  // Heartbeat ping every 25 seconds to keep connection alive through cloud proxies
  const pingInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(pingInterval);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(pingInterval);
    clients.delete(res);
    if (clients.size === 0) sseSubscribers.delete(address);
  });
});

// 1. Get service config & supported domains
apiRouter.get('/config', (req, res) => {
  res.json({
    success: true,
    title: config.siteTitle,
    domains: config.domains,
    defaultDomain: config.defaultDomain,
    emailTtlMinutes: config.emailTtlMinutes,
    maxEmailsPerMailbox: config.maxEmailsPerMailbox,
  });
});

// 2. Generate new random mailbox
apiRouter.post('/mailbox/generate', (req, res) => {
  try {
    const requestedDomain = req.body?.domain || req.query?.domain;
    const address = generateRandomAddress(requestedDomain);
    const mailbox = db.createMailbox(address);

    const ttlSeconds = config.emailTtlMinutes * 60;
    res.json({
      success: true,
      address: mailbox.address,
      createdAt: mailbox.created_at,
      expiresAt: mailbox.created_at + ttlSeconds,
      ttlMinutes: config.emailTtlMinutes,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Create or access custom mailbox
apiRouter.post('/mailbox/custom', (req, res) => {
  try {
    const { username, domain } = req.body || {};

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ success: false, error: 'Username is required' });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (cleanUsername.length < 3 || cleanUsername.length > 32) {
      return res.status(400).json({
        success: false,
        error: 'Username must be between 3 and 32 characters and contain only letters, numbers, dots, dashes, or underscores',
      });
    }

    const chosenDomain = domain && config.domains.includes(domain.toLowerCase())
      ? domain.toLowerCase()
      : config.defaultDomain;

    const fullAddress = `${cleanUsername}@${chosenDomain}`;
    const mailbox = db.createMailbox(fullAddress);

    const ttlSeconds = config.emailTtlMinutes * 60;
    res.json({
      success: true,
      address: mailbox.address,
      createdAt: mailbox.created_at,
      expiresAt: mailbox.created_at + ttlSeconds,
      ttlMinutes: config.emailTtlMinutes,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Get mailbox and email list
apiRouter.get('/mailbox/:address', (req, res) => {
  try {
    const address = req.params.address.toLowerCase().trim();
    const mailbox = db.getMailbox(address);

    if (!mailbox) {
      // Auto-create on first query so users can check any address instantly
      const created = db.createMailbox(address);
      return res.json({
        success: true,
        address: created.address,
        createdAt: created.created_at,
        emails: [],
      });
    }

    const rawEmails = db.getEmailsForMailbox(address);
    const emails = rawEmails.map(em => ({
      ...em,
      otp: extractOtp(em.subject, em.preview),
    }));

    res.json({
      success: true,
      address: mailbox.address,
      createdAt: mailbox.created_at,
      lastAccessed: mailbox.last_accessed,
      count: emails.length,
      emails,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Delete entire mailbox
apiRouter.delete('/mailbox/:address', (req, res) => {
  try {
    const address = req.params.address.toLowerCase().trim();
    const deleted = db.deleteMailbox(address);
    res.json({ success: true, deleted, address });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Get single email detail
apiRouter.get('/email/:id', (req, res) => {
  try {
    const email = db.getEmailById(req.params.id, true);
    if (!email) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }
    const otp = extractOtp(email.subject, email.text_body);
    res.json({ success: true, email: { ...email, otp } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Delete single email
apiRouter.delete('/email/:id', (req, res) => {
  try {
    const deleted = db.deleteEmailById(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }
    res.json({ success: true, deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Inbound Email Webhook (for Cloudflare Email Worker)
apiRouter.post('/webhook/email', async (req, res) => {
  try {
    // Verify secret token
    const authHeader = req.headers.authorization || '';
    const secretHeader = req.headers['x-webhook-secret'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : secretHeader;

    if (config.webhookSecret && token !== config.webhookSecret) {
      return res.status(401).json({ success: false, error: 'Unauthorized webhook request. Invalid secret.' });
    }

    let { to, from, subject, text, html, raw, headers, attachments } = req.body || {};

    // If raw MIME content was sent instead of pre-parsed JSON
    if (raw && (!text && !html)) {
      const parsed = await simpleParser(raw);
      to = parsed.to?.text || to;
      from = {
        name: parsed.from?.value?.[0]?.name || '',
        address: parsed.from?.value?.[0]?.address || 'unknown@example.com'
      };
      subject = parsed.subject || subject;
      text = parsed.text || '';
      html = parsed.html || '';
      if (parsed.attachments && parsed.attachments.length > 0) {
        attachments = parsed.attachments.map(att => ({
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
        }));
      }
    }

    if (!to) {
      return res.status(400).json({ success: false, error: 'Recipient email ("to") is required.' });
    }

    // Extract raw email address if format is "Name <user@domain.com>"
    let recipientAddress = to;
    const match = to.match(/<([^>]+)>/);
    if (match) {
      recipientAddress = match[1];
    }
    recipientAddress = recipientAddress.toLowerCase().trim();

    let fromName = '';
    let fromAddress = 'unknown@example.com';
    if (typeof from === 'object' && from !== null) {
      fromName = from.name || '';
      fromAddress = from.address || 'unknown@example.com';
    } else if (typeof from === 'string') {
      const fromMatch = from.match(/^(.*?)\s*<([^>]+)>$/);
      if (fromMatch) {
        fromName = fromMatch[1].replace(/^["']|["']$/g, '').trim();
        fromAddress = fromMatch[2].trim();
      } else {
        fromAddress = from.trim();
      }
    }

    const saved = db.saveEmail({
      mailboxAddress: recipientAddress,
      fromName,
      fromAddress,
      subject: subject || '(No Subject)',
      textBody: text || '',
      htmlBody: html || '',
      rawHeaders: headers || {},
      attachments: attachments || [],
    });

    console.log(`[Email Received] To: ${recipientAddress} | From: ${fromAddress} | Subject: "${subject || ''}"`);

    // Broadcast in real-time over SSE (0ms latency!)
    broadcastEmailToMailbox(recipientAddress, {
      id: saved.id,
      mailbox_address: recipientAddress,
      from_name: fromName,
      from_address: fromAddress,
      subject: saved.subject,
      preview: (text || '').slice(0, 160),
      received_at: saved.received_at,
      is_read: false,
      has_attachments: (attachments && attachments.length > 0),
      otp: extractOtp(saved.subject, text || html),
    });

    res.json({
      success: true,
      message: 'Email processed and saved successfully',
      id: saved.id,
      mailbox: recipientAddress,
    });
  } catch (error) {
    console.error('[Webhook Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. Simulation endpoint (for local testing without needing active Cloudflare webhook yet)
apiRouter.post('/test/simulate', async (req, res) => {
  try {
    const { to, fromName, fromAddress, subject, text, html } = req.body || {};

    if (!to) {
      return res.status(400).json({ success: false, error: 'Recipient "to" is required' });
    }

    const saved = db.saveEmail({
      mailboxAddress: to,
      fromName: fromName || 'Temple Verification Team',
      fromAddress: fromAddress || 'noreply@service.com',
      subject: subject || 'Your verification code is 849201',
      textBody: text || 'Your verification code is 849201. It is valid for 10 minutes.',
      htmlBody: html || `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
          <h2 style="color: #4f46e5; margin-top: 0;">Welcome to Temple Mail!</h2>
          <p>Thank you for using our disposable temporary email service.</p>
          <div style="background: #ffffff; padding: 16px; border: 1px solid #e5e7eb; border-radius: 6px; margin: 20px 0; text-align: center;">
            <span style="font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px;">Your Verification Code</span>
            <div style="font-size: 32px; font-weight: bold; color: #111827; letter-spacing: 4px; margin-top: 8px;">849201</div>
          </div>
          <p style="color: #6b7280; font-size: 13px;">This is a simulated email to verify your Temp Mail setup.</p>
        </div>
      `,
      rawHeaders: { 'x-simulated': 'true' },
      attachments: [],
    });

    // Broadcast in real-time over SSE
    broadcastEmailToMailbox(to, {
      id: saved.id,
      mailbox_address: to,
      from_name: saved.from_name,
      from_address: saved.from_address,
      subject: saved.subject,
      preview: (text || 'Your verification code is 849201.').slice(0, 160),
      received_at: saved.received_at,
      is_read: false,
      has_attachments: false,
      otp: extractOtp(saved.subject, text || html),
    });

    res.json({
      success: true,
      message: 'Simulated email delivered successfully',
      email: saved,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 10. Service Statistics
apiRouter.get('/stats', (req, res) => {
  res.json({
    success: true,
    stats: db.getStats(),
    uptime: Math.floor(process.uptime()),
    timestamp: Math.floor(Date.now() / 1000),
  });
});
