/**
 * Render Deployment Script
 * 
 * Creates a Web Service on Render using the Render API
 * 
 * Usage:
 *   node scripts/deploy-render.js <GITHUB_REPO_URL>
 * 
 * Example:
 *   node scripts/deploy-render.js https://github.com/Atiar594i/temple-mail
 */

const apiKey = process.env.RENDER_API_KEY || 'rnd_zFapJnIb1d51rSh9B2HfrMAD5iaj';
const repoUrl = process.argv[2] || process.env.REPO_URL;
const ownerId = 'tea-dbeu9vbncjis73ffqnv0'; // Atiar's workspace

if (!repoUrl) {
  console.log('Usage: node scripts/deploy-render.js <GITHUB_REPO_URL>');
  process.exit(1);
}

async function createRenderService() {
  console.log(`🚀 Creating Render Web Service for repo: ${repoUrl}...`);

  const payload = {
    type: 'web_service',
    name: 'temple-mail',
    ownerId: ownerId,
    repo: repoUrl,
    autoDeploy: 'yes',
    branch: 'main',
    serviceDetails: {
      env: 'node',
      plan: 'free',
      region: 'singapore',
      envSpecificDetails: {
        buildCommand: 'npm install',
        startCommand: 'npm start'
      },
      envVars: [
        { key: 'DOMAINS', value: 'atiar.dpdns.org' },
        { key: 'WEBHOOK_SECRET', value: 'temple-secret-key-12345' },
        { key: 'EMAIL_TTL_MINUTES', value: '60' },
        { key: 'SITE_TITLE', value: 'Temple - Instant Temp Mail' }
      ]
    }
  };

  const res = await fetch('https://api.render.com/v1/services', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('❌ Render API Error:', data);
    process.exit(1);
  }

  console.log('✅ Render Web Service created successfully!');
  console.log('Service ID:', data.service?.id);
  console.log('Service Name:', data.service?.name);
  console.log('Service URL:', data.service?.serviceDetails?.url);
  console.log('Dashboard URL:', data.service?.dashboardUrl);
}

createRenderService().catch(console.error);
