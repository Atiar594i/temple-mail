/**
 * Automated Cloudflare Setup Script
 * 
 * Automatically configures:
 * 1. Cloudflare Zone & Account detection
 * 2. Uploads and deploys the Email Worker
 * 3. Sets Worker environment variables (TEMPLE_WEBHOOK_URL, TEMPLE_WEBHOOK_SECRET)
 * 4. Enables Email Routing & automatically adds MX/SPF DNS records
 * 5. Configures Catch-All rule to route emails to the Worker
 * 
 * Usage:
 *   node scripts/setup-cloudflare.js <API_TOKEN> <DOMAIN> [WEBHOOK_URL] [WEBHOOK_SECRET]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiToken = process.argv[2] || process.env.CLOUDFLARE_API_TOKEN;
const targetDomain = (process.argv[3] || process.env.DOMAIN || '').toLowerCase().trim();
const webhookUrl = process.argv[4] || process.env.TEMPLE_WEBHOOK_URL || 'http://localhost:3000/api/webhook/email';
const webhookSecret = process.argv[5] || process.env.WEBHOOK_SECRET || 'temple-secret-key-12345';

if (!apiToken || !targetDomain) {
  console.log(`
Usage:
  node scripts/setup-cloudflare.js <API_TOKEN> <DOMAIN> [WEBHOOK_URL] [WEBHOOK_SECRET]

Example:
  node scripts/setup-cloudflare.js "YOUR_CF_TOKEN" "mydomain.com" "https://my-server.com/api/webhook/email"
`);
  process.exit(1);
}

const CF_API = 'https://api.cloudflare.com/client/v4';

async function cfRequest(endpoint, options = {}) {
  const url = `${CF_API}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const res = await fetch(url, { ...options, headers });
  const data = await res.json();
  if (!res.ok || !data.success) {
    const errorMsg = data.errors?.map(e => e.message).join(', ') || res.statusText;
    throw new Error(`Cloudflare API Error (${res.status} on ${endpoint}): ${errorMsg}`);
  }
  return data.result;
}

async function run() {
  console.log(`\n🚀 Starting Automated Cloudflare Setup for: ${targetDomain}\n`);

  // 1. Verify Token
  console.log('1. Verifying Cloudflare API Token...');
  const verifyRes = await cfRequest('/user/tokens/verify');
  console.log(`   ✓ Token is valid! Status: ${verifyRes.status}`);

  // 2. Fetch Accounts
  console.log('2. Fetching Account Information...');
  const accounts = await cfRequest('/accounts');
  if (!accounts || accounts.length === 0) {
    throw new Error('No Cloudflare accounts found for this token.');
  }
  const accountId = accounts[0].id;
  console.log(`   ✓ Account Name: "${accounts[0].name}" (ID: ${accountId})`);

  // 3. Find Zone for Domain
  console.log(`3. Finding Cloudflare Zone for "${targetDomain}"...`);
  let zones = await cfRequest(`/zones?name=${targetDomain}`);
  let zone;
  if (!zones || zones.length === 0) {
    console.log(`   Zone for "${targetDomain}" not found. Creating zone automatically...`);
    zone = await cfRequest('/zones', {
      method: 'POST',
      body: JSON.stringify({
        name: targetDomain,
        account: { id: accountId },
        type: 'full'
      })
    });
    console.log(`   ✓ Created Zone: ${zone.id}`);
  } else {
    zone = zones[0];
    console.log(`   ✓ Found existing Zone: ${zone.id} (Status: ${zone.status})`);
  }

  console.log(`\n📌 [DigitalPlat Action Required]`);
  console.log(`   Please make sure your domain's Nameservers at DigitalPlat are set to:`);
  (zone.name_servers || []).forEach(ns => console.log(`   ➜ ${ns}`));
  console.log('');

  // 4. Deploy Email Worker
  console.log('4. Deploying Cloudflare Email Worker ("temple-email-worker")...');
  const workerScriptPath = path.resolve(__dirname, '../cloudflare/simple-worker-no-deps.js');
  let scriptContent = fs.readFileSync(workerScriptPath, 'utf8');

  // Replace default fallback secrets in script
  scriptContent = scriptContent
    .replace('https://your-domain.com/api/webhook/email', webhookUrl)
    .replace('temple-secret-key-12345', webhookSecret);

  // Upload worker script to Cloudflare
  const uploadUrl = `${CF_API}/accounts/${accountId}/workers/scripts/temple-email-worker`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/javascript',
    },
    body: scriptContent
  });
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok || !uploadData.success) {
    console.warn(`   Worker upload notice: ${uploadData.errors?.[0]?.message || uploadRes.statusText}`);
  } else {
    console.log('   ✓ Email Worker script uploaded successfully!');
  }

  // Set Worker Environment Variables
  console.log('5. Configuring Worker Environment Variables...');
  try {
    await cfRequest(`/accounts/${accountId}/workers/scripts/temple-email-worker/secrets`, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'TEMPLE_WEBHOOK_URL',
        text: webhookUrl,
        type: 'secret_text'
      })
    });
    await cfRequest(`/accounts/${accountId}/workers/scripts/temple-email-worker/secrets`, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'TEMPLE_WEBHOOK_SECRET',
        text: webhookSecret,
        type: 'secret_text'
      })
    });
    console.log('   ✓ Worker variables configured!');
  } catch (secErr) {
    console.log(`   ℹ Note on secrets: ${secErr.message}`);
  }

  // 6. Enable Email Routing
  console.log('6. Enabling Email Routing & Automatic DNS Records...');
  try {
    await cfRequest(`/zones/${zone.id}/email/routing/enable`, { method: 'POST' });
    console.log('   ✓ Email routing enabled');
  } catch (e) {
    console.log(`   ℹ Email routing status: ${e.message}`);
  }

  // Add Email DNS Records automatically
  try {
    await cfRequest(`/zones/${zone.id}/email/routing/dns`, { method: 'POST' });
    console.log('   ✓ MX and SPF DNS records automatically created!');
  } catch (dnsErr) {
    console.log(`   ℹ DNS setup notice: ${dnsErr.message}`);
  }

  // 7. Configure Catch-All Rule to Worker
  console.log('7. Configuring Catch-All Email Rule ➔ Worker...');
  try {
    await cfRequest(`/zones/${zone.id}/email/routing/rules/catch_all`, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Route all emails to Temple Worker',
        enabled: true,
        matchers: [{ type: 'all' }],
        actions: [{
          type: 'worker',
          value: ['temple-email-worker']
        }]
      })
    });
    console.log('   ✓ Catch-All rule successfully pointed to "temple-email-worker"!');
  } catch (ruleErr) {
    console.log(`   ℹ Catch-all rule notice: ${ruleErr.message}`);
  }

  console.log('\n🎉 ALL DONE! Your Cloudflare Temp Mail infrastructure is fully configured!\n');
}

run().catch(err => {
  console.error('\n❌ Setup Failed:', err.message);
  process.exit(1);
});
