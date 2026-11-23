import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import { config } from '../src/config.js';

console.log('🧪 Starting Temple Mail Automated Test Suite...\n');

// 1. Test database operations
console.log('1. Testing DB Mailbox Creation...');
const testAddress = 'test.user@temple.local';
const box = db.createMailbox(testAddress);
assert.equal(box.address, testAddress);
console.log('   ✓ Mailbox created successfully');

console.log('2. Testing Email Ingestion and Retrieval...');
const testEmail = db.saveEmail({
  mailboxAddress: testAddress,
  fromName: 'Google Security',
  fromAddress: 'no-reply@accounts.google.com',
  subject: 'Google Verification Code G-582910',
  textBody: 'Your Google verification code is 582910.',
  htmlBody: '<p>Your verification code is <b>582910</b></p>',
  rawHeaders: { 'x-test': 'true' },
  attachments: [{ filename: 'code.png', size: 1024 }],
});

assert(testEmail.id, 'Email ID should be generated');
assert.equal(testEmail.mailbox_address, testAddress);
assert.equal(testEmail.is_read, false);
console.log('   ✓ Email saved with UUID:', testEmail.id);

console.log('3. Testing Mailbox Email List...');
const list = db.getEmailsForMailbox(testAddress);
assert(list.length >= 1, 'Should find at least 1 email');
assert.equal(list[0].id, testEmail.id);
assert.equal(list[0].has_attachments, true);
console.log('   ✓ Mailbox email list retrieved correctly');

console.log('4. Testing Email Read & Mark as Read...');
const fetchedEmail = db.getEmailById(testEmail.id, true);
assert.equal(fetchedEmail.id, testEmail.id);
assert.equal(fetchedEmail.is_read, true);
console.log('   ✓ Email retrieved and marked as read');

console.log('5. Testing Stats API...');
const stats = db.getStats();
assert(stats.totalMailboxes >= 1);
assert(stats.totalEmails >= 1);
console.log('   ✓ Stats returned:', stats);

console.log('6. Testing Single Email Deletion...');
const delEmailRes = db.deleteEmailById(testEmail.id);
assert.equal(delEmailRes, true);
const afterDel = db.getEmailById(testEmail.id);
assert.equal(afterDel, null);
console.log('   ✓ Email deleted successfully');

console.log('7. Testing Mailbox Deletion...');
const delBoxRes = db.deleteMailbox(testAddress);
assert.equal(delBoxRes, true);
assert.equal(db.getMailbox(testAddress), null);
console.log('   ✓ Mailbox and associated records deleted');

console.log('8. Testing Expiration Cleanup Engine...');
const cleanupResult = db.cleanupExpired(60);
assert('deletedEmails' in cleanupResult);
assert('deletedMailboxes' in cleanupResult);
console.log('   ✓ Cleanup engine executed smoothly');

console.log('\n🎉 ALL 8 TESTS PASSED SUCCESSFULLY! The core engine is rock-solid.\n');
