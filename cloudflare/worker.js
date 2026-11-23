/**
 * Cloudflare Email Worker for Temple Temp Mail
 * 
 * This worker intercepts all incoming emails from Cloudflare Email Routing (Catch-all)
 * parses the MIME message using PostalMime, and forwards the structured email
 * to your Temple server's webhook endpoint (/api/webhook/email).
 */

import PostalMime from 'postal-mime';

export default {
  async email(message, env, ctx) {
    try {
      console.log(`[CF Worker] Incoming email from ${message.from} to ${message.to}`);

      // Read the raw MIME stream
      const rawEmail = await new Response(message.raw).arrayBuffer();
      
      // Parse email (sender, subject, text body, HTML body, attachments)
      const parser = new PostalMime();
      const parsed = await parser.parse(rawEmail);

      const payload = {
        to: message.to,
        from: {
          name: parsed.from?.name || '',
          address: message.from,
        },
        subject: parsed.subject || '(No Subject)',
        text: parsed.text || '',
        html: parsed.html || '',
        headers: Object.fromEntries(message.headers ? message.headers.entries() : []),
        attachments: (parsed.attachments || []).map(att => ({
          filename: att.filename || 'attachment',
          contentType: att.mimeType || 'application/octet-stream',
          size: att.content ? att.content.byteLength : 0,
        })),
      };

      // Webhook target (your live server URL)
      const webhookUrl = env.TEMPLE_WEBHOOK_URL || 'https://your-domain-or-server.com/api/webhook/email';
      const webhookSecret = env.TEMPLE_WEBHOOK_SECRET || 'temple-secret-key-12345';

      // Send to Temple backend
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${webhookSecret}`,
          'X-Webhook-Secret': webhookSecret,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[CF Worker Error] Webhook responded with HTTP ${res.status}: ${errText}`);
      } else {
        console.log(`[CF Worker Success] Email delivered to Temple webhook successfully!`);
      }
    } catch (err) {
      console.error('[CF Worker Fatal Error]', err);
    }
  },

  // Fallback HTTP fetch handler (for health checks)
  async fetch(request, env, ctx) {
    return new Response(JSON.stringify({
      status: 'active',
      service: 'Temple Cloudflare Email Forwarder Worker',
      time: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
