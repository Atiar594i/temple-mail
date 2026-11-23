import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { apiRouter } from '../src/routes/api.js';
import { config } from '../src/config.js';

console.log('🧪 Starting HTTP API Endpoints Test...\n');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', apiRouter);

const server = app.listen(3999, async () => {
  try {
    const baseUrl = 'http://localhost:3999/api';

    // 1. Test /api/config
    const resConfig = await fetch(`${baseUrl}/config`);
    const cfg = await resConfig.json();
    assert.equal(cfg.success, true);
    assert(Array.isArray(cfg.domains));
    console.log('   ✓ GET /api/config verified');

    // 2. Test /api/mailbox/generate
    const resGen = await fetch(`${baseUrl}/mailbox/generate`, { method: 'POST' });
    const gen = await resGen.json();
    assert.equal(gen.success, true);
    assert(gen.address.includes('@'));
    console.log('   ✓ POST /api/mailbox/generate returned:', gen.address);

    // 3. Test /api/mailbox/custom
    const resCustom = await fetch(`${baseUrl}/mailbox/custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'developer.test' })
    });
    const custom = await resCustom.json();
    assert.equal(custom.success, true);
    assert(custom.address.startsWith('developer.test@'));
    console.log('   ✓ POST /api/mailbox/custom verified:', custom.address);

    // 4. Test unauthorized webhook rejection
    const resReject = await fetch(`${baseUrl}/webhook/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: custom.address })
    });
    assert.equal(resReject.status, 401);
    console.log('   ✓ POST /api/webhook/email (Unauthorized) correctly rejected with 401');

    // 5. Test authorized webhook acceptance
    const resHook = await fetch(`${baseUrl}/webhook/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.webhookSecret}`
      },
      body: JSON.stringify({
        to: custom.address,
        from: { name: 'GitHub', address: 'noreply@github.com' },
        subject: '[GitHub] Please verify your device',
        text: 'Your verification code is 192837.',
        html: '<p>Your verification code is <b>192837</b></p>'
      })
    });
    const hookData = await resHook.json();
    assert.equal(hookData.success, true);
    assert(hookData.id);
    console.log('   ✓ POST /api/webhook/email (Authorized) successfully processed');

    // 6. Test /api/mailbox/:address to find the delivered email
    const resBox = await fetch(`${baseUrl}/mailbox/${custom.address}`);
    const boxData = await resBox.json();
    assert.equal(boxData.success, true);
    assert(boxData.emails.length >= 1);
    assert.equal(boxData.emails[0].subject, '[GitHub] Please verify your device');
    console.log('   ✓ GET /api/mailbox/:address delivered email verified in inbox');

    // 7. Test /api/email/:id
    const resEmail = await fetch(`${baseUrl}/email/${hookData.id}`);
    const emailData = await resEmail.json();
    assert.equal(emailData.success, true);
    assert.equal(emailData.email.is_read, true);
    console.log('   ✓ GET /api/email/:id email details read and verified');

    // 8. Test /api/test/simulate
    const resSim = await fetch(`${baseUrl}/test/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: custom.address })
    });
    const simData = await resSim.json();
    assert.equal(simData.success, true);
    console.log('   ✓ POST /api/test/simulate successfully generated simulated message');

    console.log('\n🎉 ALL HTTP API INTEGRATION TESTS PASSED 100%!\n');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    server.close();
  }
});
