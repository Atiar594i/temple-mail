/**
 * Zero-Dependency Cloudflare Email Worker
 * 
 * Perfect for direct copy-paste into the Cloudflare Dashboard web editor!
 * Requires no npm packages, no bundler, no build step.
 * 
 * Forwards the raw email stream directly to your Temple backend,
 * where Node.js mailparser handles the full parsing.
 */

export default {
  async email(message, env, ctx) {
    try {
      const webhookUrl = env.TEMPLE_WEBHOOK_URL || 'https://your-domain.com/api/webhook/email';
      const webhookSecret = env.TEMPLE_WEBHOOK_SECRET || 'temple-secret-key-12345';

      // Read raw MIME content
      const rawText = await new Response(message.raw).text();

      const payload = {
        to: message.to,
        from: message.from,
        raw: rawText,
        headers: Object.fromEntries(message.headers ? message.headers.entries() : []),
      };

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${webhookSecret}`,
          'X-Webhook-Secret': webhookSecret,
        },
        body: JSON.stringify(payload),
      });

      console.log(`Forwarded email from ${message.from} to ${message.to}. Status: ${res.status}`);
    } catch (err) {
      console.error('Failed to forward email:', err);
    }
  }
};
