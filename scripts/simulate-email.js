/**
 * Email Simulation CLI Script
 * 
 * Usage:
 *   node scripts/simulate-email.js <recipient_email> [subject]
 * 
 * Example:
 *   node scripts/simulate-email.js test1234@temple.local "Your OTP code is 998877"
 */

import { config } from '../src/config.js';

const targetEmail = process.argv[2] || `test-${Date.now().toString(36)}@${config.defaultDomain}`;
const subject = process.argv[3] || `ভেরিফিকেশন কোড: ${Math.floor(100000 + Math.random() * 900000)}`;

console.log(`Sending simulated email to: ${targetEmail}`);
console.log(`Subject: ${subject}`);

const payload = {
  to: targetEmail,
  from: {
    name: 'Facebook Security',
    address: 'security@facebookmail.com'
  },
  subject: subject,
  text: `Your security code is ${Math.floor(100000 + Math.random() * 900000)}. Enter it to continue.`,
  html: `
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background: #ffffff;">
      <h2 style="color: #1877f2; margin-top: 0;">নিরাপত্তা ভেরিফিকেশন</h2>
      <p style="color: #475569; font-size: 14px; line-height: 1.5;">
        আপনার একাউন্টে লগইন নিশ্চিত করার জন্য নিচের ওটিপি (OTP) কোডটি ব্যবহার করুন:
      </p>
      <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0f172a;">${Math.floor(100000 + Math.random() * 900000)}</span>
      </div>
      <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">
        কোডটির মেয়াদ ১০ মিনিট। এটি কারও সাথে শেয়ার করবেন না।
      </p>
    </div>
  `,
  headers: {
    'x-mailer': 'Temple Simulator CLI 1.0',
    'x-sender-ip': '127.0.0.1'
  }
};

try {
  const url = `http://localhost:${config.port}/api/webhook/email`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.webhookSecret}`
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (res.ok && data.success) {
    console.log('✅ Email simulated successfully!');
    console.log('Details:', data);
  } else {
    console.error('❌ Failed to simulate email:', data);
  }
} catch (err) {
  console.error('❌ Network or server error:', err.message);
  console.log('Make sure Temple server is running: npm start');
}
