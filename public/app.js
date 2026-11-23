// Temple Mail Client Application

const STORAGE_KEY = 'temple_mail_current_address';
const SOUND_KEY = 'temple_mail_sound_enabled';

let currentAddress = localStorage.getItem(STORAGE_KEY) || null;
let soundEnabled = localStorage.getItem(SOUND_KEY) !== 'false';
let knownEmailIds = new Set();
let countdownTimer = null;
let countdownRemaining = 8;
const REFRESH_INTERVAL = 8; // seconds
let serverConfig = null;
let currentOpenedEmail = null;

// DOM Elements
const currentEmailEl = document.getElementById('current-email');
const emailListEl = document.getElementById('email-list');
const inboxEmptyEl = document.getElementById('inbox-empty');
const inboxBadgeEl = document.getElementById('inbox-badge');
const inboxStatusIndicator = document.getElementById('inbox-status-indicator');
const countdownText = document.getElementById('countdown-text');
const countdownProgress = document.getElementById('countdown-progress');
const iconRefresh = document.getElementById('icon-refresh');
const domainBadge = document.getElementById('current-domain-badge');

// Toast function
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  toastMsg.textContent = message;
  toast.classList.remove('border-red-500/50', 'border-brand-500/50');
  toast.classList.add(isError ? 'border-red-500/50' : 'border-brand-500/50');
  toast.classList.remove('translate-y-20', 'opacity-0');

  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 2500);
}

// Gentle pleasant sound chime via Web Audio API
function playChimeSound() {
  if (!soundEnabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.warn('Audio chime error:', e);
  }
}

// Format relative timestamp
function formatTimeAgo(epochSeconds) {
  if (!epochSeconds) return '';
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - epochSeconds);

  if (diff < 30) return 'এইমাত্র';
  if (diff < 60) return `${diff} সেকেন্ড আগে`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} মিনিট আগে`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ঘণ্টা আগে`;
  const days = Math.floor(hours / 24);
  return `${days} দিন আগে`;
}

// Load Server Configuration
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.success) {
      serverConfig = data;
      if (domainBadge) {
        domainBadge.textContent = `ডোমেইন: ${data.domains.join(', ')}`;
      }

      // Populate custom domain dropdown
      const select = document.getElementById('select-custom-domain');
      if (select) {
        select.innerHTML = data.domains.map(d => `<option value="${d}">${d}</option>`).join('');
      }
    }
  } catch (e) {
    console.error('Failed to load server config:', e);
  }
}

// Set Active Email
function setActiveAddress(address) {
  currentAddress = address.toLowerCase().trim();
  localStorage.setItem(STORAGE_KEY, currentAddress);
  currentEmailEl.textContent = currentAddress;
  knownEmailIds.clear();

  // Reset QR code if open
  updateQRCode();

  // Immediately refresh inbox for new address
  fetchInbox(true);
}

// Generate New Random Address
async function generateNewEmail(domain) {
  try {
    currentEmailEl.textContent = 'নতুন অ্যাড্রেস তৈরি হচ্ছে...';
    const res = await fetch('/api/mailbox/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain }),
    });
    const data = await res.json();
    if (data.success) {
      setActiveAddress(data.address);
      showToast('নতুন ইমেইল অ্যাড্রেস সক্রিয় হয়েছে!');
    } else {
      showToast(data.error || 'ইমেইল তৈরি ব্যর্থ হয়েছে', true);
    }
  } catch (err) {
    showToast('সার্ভার কানেকশন ত্রুটি', true);
  }
}

// Fetch Inbox Messages
async function fetchInbox(isManual = false) {
  if (!currentAddress) return;

  if (isManual && iconRefresh) {
    iconRefresh.classList.add('spinning');
  }

  inboxStatusIndicator.innerHTML = '<span class="w-2 h-2 rounded-full bg-brand-400 animate-ping"></span> আপডেট হচ্ছে...';

  try {
    const res = await fetch(`/api/mailbox/${encodeURIComponent(currentAddress)}`);
    const data = await res.json();

    if (data.success) {
      const emails = data.emails || [];
      inboxBadgeEl.textContent = `${emails.length}টি মেইল`;

      // Check for new emails to trigger chime
      let hasNew = false;
      emails.forEach(em => {
        if (!knownEmailIds.has(em.id)) {
          if (knownEmailIds.size > 0) {
            hasNew = true;
          }
          knownEmailIds.add(em.id);
        }
      });

      if (hasNew) {
        playChimeSound();
        showToast('নতুন ইমেইল এসেছে!');
      }

      renderEmailList(emails);
      inboxStatusIndicator.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400"></span> লাইভ';
    }
  } catch (err) {
    console.error('Inbox fetch error:', err);
    inboxStatusIndicator.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-400"></span> ত্রুটি';
  } finally {
    if (iconRefresh) {
      setTimeout(() => iconRefresh.classList.remove('spinning'), 500);
    }
  }
}

// Render Email List
function renderEmailList(emails) {
  if (!emails || emails.length === 0) {
    inboxEmptyEl.classList.remove('hidden');
    emailListEl.classList.add('hidden');
    emailListEl.innerHTML = '';
    return;
  }

  inboxEmptyEl.classList.add('hidden');
  emailListEl.classList.remove('hidden');

  emailListEl.innerHTML = emails.map(email => {
    const sender = email.from_name ? `${email.from_name} (${email.from_address})` : email.from_address;
    const initial = (email.from_name || email.from_address || 'M').charAt(0).toUpperCase();
    const timeAgo = formatTimeAgo(email.received_at);
    const unreadDot = !email.is_read
      ? '<span class="w-2.5 h-2.5 rounded-full bg-brand-500 shrink-0 shadow-lg shadow-brand-500/50"></span>'
      : '';

    return `
      <div data-email-id="${email.id}" class="email-card cursor-pointer p-4 rounded-2xl bg-slate-950/70 hover:bg-slate-800/60 border ${!email.is_read ? 'border-brand-500/40' : 'border-slate-800/80'} flex items-center justify-between gap-3 group transition">
        <div class="flex items-center gap-3 overflow-hidden flex-1">
          <div class="w-10 h-10 rounded-xl bg-slate-800 group-hover:bg-brand-600/20 text-slate-300 group-hover:text-brand-300 border border-slate-700/60 flex items-center justify-center font-bold text-sm shrink-0 transition">
            ${initial}
          </div>
          <div class="overflow-hidden flex-1">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="text-sm font-semibold text-slate-200 truncate">${escapeHtml(email.from_name || email.from_address)}</span>
              ${unreadDot}
              <span class="text-[11px] text-slate-500 ml-auto shrink-0">${timeAgo}</span>
            </div>
            <div class="text-xs font-medium text-slate-300 truncate">${escapeHtml(email.subject || '(No Subject)')}</div>
            <div class="text-[11px] text-slate-500 truncate mt-0.5">${escapeHtml(email.preview || '')}</div>
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <button data-delete-id="${email.id}" class="btn-item-delete p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition" title="মুছুন">
            <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Attach card click handlers
  emailListEl.querySelectorAll('.email-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-item-delete')) return;
      const id = card.dataset.emailId;
      openEmailModal(id);
    });
  });

  // Attach delete handlers
  emailListEl.querySelectorAll('.btn-item-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteId;
      await deleteEmail(id);
    });
  });
}

// Open Email Modal & Load Details
async function openEmailModal(emailId) {
  const modal = document.getElementById('email-modal');
  modal.classList.remove('hidden');

  try {
    const res = await fetch(`/api/email/${emailId}`);
    const data = await res.json();
    if (!data.success || !data.email) {
      showToast('ইমেইল লোড করতে ব্যর্থ', true);
      return;
    }

    currentOpenedEmail = data.email;
    const em = data.email;

    document.getElementById('modal-subject').textContent = em.subject || '(No Subject)';
    document.getElementById('modal-from').textContent = em.from_name ? `${em.from_name} <${em.from_address}>` : em.from_address;
    document.getElementById('modal-date').textContent = new Date(em.received_at * 1000).toLocaleString('bn-BD');
    document.getElementById('modal-sender-avatar').textContent = (em.from_name || em.from_address || 'M').charAt(0).toUpperCase();
    document.getElementById('modal-recipient-tag').textContent = `To: ${em.mailbox_address}`;

    // Render HTML in sandboxed iframe
    const iframe = document.getElementById('email-iframe');
    const content = em.html_body || `<pre style="font-family: monospace; white-space: pre-wrap; padding: 15px; color: #1e293b;">${escapeHtml(em.text_body || 'ইমেইলটিতে কোনো টেক্সট নেই')}</pre>`;
    iframe.srcdoc = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 16px; color: #1e293b; line-height: 1.6; }
          img { max-width: 100%; height: auto; }
          a { color: #6366f1; }
        </style>
      </head>
      <body>${content}</body>
      </html>
    `;

    // Text & Headers views
    document.getElementById('email-text-view').textContent = em.text_body || '(Plain text content unavailable)';
    document.getElementById('email-headers-view').textContent = em.raw_headers || '(Headers unavailable)';

    // Reset tabs to HTML view
    switchTab('html');

    // Attachments
    const attContainer = document.getElementById('attachments-container');
    const attSection = document.getElementById('modal-attachments');
    if (em.attachments && em.attachments.length > 0) {
      attSection.classList.remove('hidden');
      attContainer.innerHTML = em.attachments.map(att => `
        <span class="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
          </svg>
          ${escapeHtml(att.filename || 'attachment')} (${formatBytes(att.size || 0)})
        </span>
      `).join('');
    } else {
      attSection.classList.add('hidden');
    }

    // Refresh inbox list so read status dot disappears
    fetchInbox();
  } catch (err) {
    console.error('Error opening modal:', err);
  }
}

function switchTab(type) {
  const tabHtml = document.getElementById('tab-html');
  const tabText = document.getElementById('tab-text');
  const tabHeaders = document.getElementById('tab-headers');

  const viewHtml = document.getElementById('email-iframe');
  const viewText = document.getElementById('email-text-view');
  const viewHeaders = document.getElementById('email-headers-view');

  [tabHtml, tabText, tabHeaders].forEach(t => t.className = 'px-3 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200');
  [viewHtml, viewText, viewHeaders].forEach(v => v.classList.add('hidden'));

  if (type === 'html') {
    tabHtml.className = 'px-3 py-1 rounded-lg bg-brand-600 text-white font-medium';
    viewHtml.classList.remove('hidden');
  } else if (type === 'text') {
    tabText.className = 'px-3 py-1 rounded-lg bg-brand-600 text-white font-medium';
    viewText.classList.remove('hidden');
  } else {
    tabHeaders.className = 'px-3 py-1 rounded-lg bg-brand-600 text-white font-medium';
    viewHeaders.classList.remove('hidden');
  }
}

// Delete Email
async function deleteEmail(id) {
  try {
    const res = await fetch(`/api/email/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      knownEmailIds.delete(id);
      showToast('ইমেইল সফলভাবে মুছে ফেলা হয়েছে');
      fetchInbox();
    }
  } catch (e) {
    showToast('ইমেইল মুছতে ব্যর্থ', true);
  }
}

// Delete Current Mailbox
async function deleteCurrentMailbox() {
  if (!currentAddress) return;
  if (!confirm(`আপনি কি নিশ্চিত যে "${currentAddress}" ইনবক্স ও এর সকল ইমেইল মুছে ফেলতে চান?`)) return;

  try {
    await fetch(`/api/mailbox/${encodeURIComponent(currentAddress)}`, { method: 'DELETE' });
    showToast('ইনবক্স মুছে ফেলা হয়েছে!');
    generateNewEmail();
  } catch (e) {
    showToast('ইনবক্স মুছতে ব্যর্থ', true);
  }
}

// Send Quick Test Simulation Email
async function simulateTestEmail() {
  if (!currentAddress) return;
  showToast('টেস্ট ইমেইল পাঠানো হচ্ছে...');
  try {
    const res = await fetch('/api/test/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: currentAddress,
        fromName: 'DigitalPlat & Temple Verification',
        fromAddress: 'security@temple-verify.com',
        subject: `ভেরিফিকেশন কোড: ${Math.floor(100000 + Math.random() * 900000)}`,
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('টেস্ট ইমেইল সফলভাবে ইনবক্সে পাঠানো হয়েছে!');
      fetchInbox(true);
    }
  } catch (e) {
    showToast('সিমুলেশন ব্যর্থ হয়েছে', true);
  }
}

// QR Code render
function updateQRCode() {
  const qrBox = document.getElementById('qrcode-box');
  if (!qrBox || !window.QRCode || !currentAddress) return;
  qrBox.innerHTML = '';
  new QRCode(qrBox, {
    text: currentAddress,
    width: 160,
    height: 160,
    colorDark: '#0f172a',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

// Countdown & Auto Refresh Loop
function startAutoRefreshLoop() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownRemaining = REFRESH_INTERVAL;

  countdownTimer = setInterval(() => {
    countdownRemaining--;
    if (countdownRemaining <= 0) {
      countdownRemaining = REFRESH_INTERVAL;
      fetchInbox();
    }

    if (countdownText) {
      countdownText.textContent = `${countdownRemaining} সেকেন্ড`;
    }
    if (countdownProgress) {
      const percentage = (countdownRemaining / REFRESH_INTERVAL) * 100;
      countdownProgress.style.width = `${percentage}%`;
    }
  }, 1000);
}

// Escape HTML utility
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();

  if (currentAddress) {
    setActiveAddress(currentAddress);
  } else {
    await generateNewEmail();
  }

  startAutoRefreshLoop();

  // Event Listeners
  // 1. Copy Email
  document.getElementById('btn-copy-email').addEventListener('click', () => {
    if (currentAddress) {
      navigator.clipboard.writeText(currentAddress).then(() => {
        showToast('ইমেইল অ্যাড্রেস ক্লিপবোর্ডে কপি করা হয়েছে!');
      }).catch(() => {
        showToast('কপি করতে ব্যর্থ হয়েছে', true);
      });
    }
  });

  // 2. Refresh Button
  document.getElementById('btn-refresh').addEventListener('click', () => {
    fetchInbox(true);
    countdownRemaining = REFRESH_INTERVAL;
  });

  // 3. New Random Email
  document.getElementById('btn-random-email').addEventListener('click', () => {
    generateNewEmail();
  });

  // 4. Delete Mailbox
  document.getElementById('btn-delete-mailbox').addEventListener('click', () => {
    deleteCurrentMailbox();
  });

  // 5. Test Email Simulation
  document.getElementById('btn-simulate').addEventListener('click', simulateTestEmail);
  document.getElementById('btn-quick-test').addEventListener('click', simulateTestEmail);

  // 6. QR Code Toggle
  const qrContainer = document.getElementById('qr-container');
  document.getElementById('btn-qr-toggle').addEventListener('click', () => {
    qrContainer.classList.toggle('hidden');
    if (!qrContainer.classList.contains('hidden')) {
      updateQRCode();
    }
  });
  document.getElementById('btn-close-qr').addEventListener('click', () => {
    qrContainer.classList.add('hidden');
  });

  // 7. Custom Email Modal
  const customModal = document.getElementById('custom-email-modal');
  document.getElementById('btn-open-custom-modal').addEventListener('click', () => {
    customModal.classList.remove('hidden');
  });
  document.getElementById('btn-close-custom-modal').addEventListener('click', () => {
    customModal.classList.add('hidden');
  });
  document.getElementById('form-custom-email').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('input-custom-username').value;
    const domain = document.getElementById('select-custom-domain').value;

    try {
      const res = await fetch('/api/mailbox/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, domain })
      });
      const data = await res.json();
      if (data.success) {
        customModal.classList.add('hidden');
        setActiveAddress(data.address);
        showToast(`কাস্টম ইমেইল "${data.address}" তৈরি হয়েছে!`);
      } else {
        showToast(data.error || 'ত্রুটি ঘটেছে', true);
      }
    } catch (err) {
      showToast('সার্ভার কানেকশন ত্রুটি', true);
    }
  });

  // 8. Email Detail Modal tabs & close
  document.getElementById('btn-close-email-modal').addEventListener('click', () => {
    document.getElementById('email-modal').classList.add('hidden');
  });
  document.getElementById('btn-delete-email-modal').addEventListener('click', async () => {
    if (currentOpenedEmail) {
      await deleteEmail(currentOpenedEmail.id);
      document.getElementById('email-modal').classList.add('hidden');
    }
  });
  document.getElementById('tab-html').addEventListener('click', () => switchTab('html'));
  document.getElementById('tab-text').addEventListener('click', () => switchTab('text'));
  document.getElementById('tab-headers').addEventListener('click', () => switchTab('headers'));

  // 9. API Docs Modal
  const apiModal = document.getElementById('api-docs-modal');
  document.getElementById('btn-api-docs').addEventListener('click', () => {
    apiModal.classList.remove('hidden');
  });
  document.getElementById('btn-close-api-docs').addEventListener('click', () => {
    apiModal.classList.add('hidden');
  });

  // 10. Sound Toggle
  document.getElementById('btn-toggle-sound').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem(SOUND_KEY, soundEnabled ? 'true' : 'false');
    showToast(soundEnabled ? 'নোটিফিকেশন সাউন্ড চালু করা হয়েছে' : 'নোটিফিকেশন সাউন্ড বন্ধ করা হয়েছে');
  });
});
