/**
 * Temple Mail - Admin Dashboard & Real-Time OTP Monitor
 */

(function () {
  'use strict';

  // State
  let adminToken = sessionStorage.getItem('admin_token') || '';
  let eventSource = null;
  let currentTab = 'live-feed';
  let activeFilter = 'all';
  let cachedEmails = [];
  let cachedMailboxes = [];

  // DOM Elements
  const loginOverlay = document.getElementById('login-overlay');
  const formLogin = document.getElementById('form-login');
  const inputAdminPass = document.getElementById('input-admin-pass');
  const btnLogout = document.getElementById('btn-logout');

  // Stats
  const statMailboxes = document.getElementById('stat-mailboxes');
  const statEmails = document.getElementById('stat-emails');
  const statOtps = document.getElementById('stat-otps');
  const statUptime = document.getElementById('stat-uptime');
  const liveIndicator = document.getElementById('live-indicator');

  // Tabs & Sections
  const tabLiveFeed = document.getElementById('tab-live-feed');
  const tabAllMailboxes = document.getElementById('tab-all-mailboxes');
  const tabSettings = document.getElementById('tab-settings');
  const sectionLiveFeed = document.getElementById('section-live-feed');
  const sectionAllMailboxes = document.getElementById('section-all-mailboxes');
  const sectionSettings = document.getElementById('section-settings');
  const inputSearch = document.getElementById('input-search');
  const btnRefreshAdmin = document.getElementById('btn-refresh-admin');

  // Tables & Badges
  const tableEmailsBody = document.getElementById('table-emails-body');
  const tableMailboxesBody = document.getElementById('table-mailboxes-body');
  const badgeEmailCount = document.getElementById('badge-email-count');
  const badgeMailboxCount = document.getElementById('badge-mailbox-count');

  // Filter Buttons
  const filterAll = document.getElementById('filter-all');
  const filterOtpOnly = document.getElementById('filter-otp-only');
  const filterDomainTempgmail = document.getElementById('filter-domain-tempgmail');
  const filterDomainProgmail = document.getElementById('filter-domain-progmail');
  const btnExportCsv = document.getElementById('btn-export-csv');

  // Password Change Form
  const formChangePassword = document.getElementById('form-change-password');
  const inputCurrPass = document.getElementById('input-curr-pass');
  const inputNewPass = document.getElementById('input-new-pass');
  const inputConfirmPass = document.getElementById('input-confirm-pass');
  const passMsg = document.getElementById('pass-msg');

  // Modal
  const adminEmailModal = document.getElementById('admin-email-modal');
  const modalAdminSubject = document.getElementById('modal-admin-subject');
  const modalAdminMeta = document.getElementById('modal-admin-meta');
  const adminModalIframe = document.getElementById('admin-modal-iframe');
  const btnCloseModal = document.getElementById('btn-close-modal');

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    if (adminToken) {
      testAndInitToken(adminToken);
    } else {
      showLogin();
    }

    setupEventListeners();
  });

  function setupEventListeners() {
    // Login form
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pass = inputAdminPass.value.trim();
      if (!pass) return;

      try {
        const res = await fetch('/api/admin/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pass }),
        });
        const data = await res.json();
        if (data.success && data.token) {
          adminToken = data.token;
          sessionStorage.setItem('admin_token', adminToken);
          hideLogin();
          initDashboard();
        } else {
          alert(data.error || 'ভুল অ্যাডমিন পাসওয়ার্ড!');
        }
      } catch (err) {
        alert('সার্ভার কানেকশন এরর: ' + err.message);
      }
    });

    // Logout
    btnLogout.addEventListener('click', () => {
      sessionStorage.removeItem('admin_token');
      adminToken = '';
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      showLogin();
    });

    // Tab switching
    tabLiveFeed.addEventListener('click', () => switchTab('live-feed'));
    tabAllMailboxes.addEventListener('click', () => switchTab('all-mailboxes'));
    if (tabSettings) {
      tabSettings.addEventListener('click', () => switchTab('settings'));
    }

    // Filter Buttons
    if (filterAll) filterAll.addEventListener('click', () => setFilter('all'));
    if (filterOtpOnly) filterOtpOnly.addEventListener('click', () => setFilter('otp-only'));
    if (filterDomainTempgmail) filterDomainTempgmail.addEventListener('click', () => setFilter('tempgmail.dpdns.org'));
    if (filterDomainProgmail) filterDomainProgmail.addEventListener('click', () => setFilter('progmail.dpdns.org'));

    // CSV Export
    if (btnExportCsv) {
      btnExportCsv.addEventListener('click', exportToCsv);
    }

    // Password Change Form Submit
    if (formChangePassword) {
      formChangePassword.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = inputCurrPass.value.trim();
        const newPassword = inputNewPass.value.trim();
        const confirmPassword = inputConfirmPass.value.trim();

        if (newPassword !== confirmPassword) {
          showPassMessage('নতুন পাসওয়ার্ড দুটি মিলছে না!', false);
          return;
        }

        if (newPassword.length < 5) {
          showPassMessage('নতুন পাসওয়ার্ড কমপক্ষে ৫ অক্ষরের হতে হবে!', false);
          return;
        }

        try {
          const res = await fetch('/api/admin/change-password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ currentPassword, newPassword }),
          });
          const data = await res.json();
          if (data.success) {
            adminToken = data.newToken || newPassword;
            sessionStorage.setItem('admin_token', adminToken);
            showPassMessage('✅ পাসওয়ার্ড সফলভাবে পরিবর্তিত ও সংরক্ষিত হয়েছে!', true);
            formChangePassword.reset();
          } else {
            showPassMessage(data.error || 'পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে', false);
          }
        } catch (err) {
          showPassMessage('সার্ভার এরর: ' + err.message, false);
        }
      });
    }

    // Search filter
    inputSearch.addEventListener('input', applyFilters);

    // Refresh button
    btnRefreshAdmin.addEventListener('click', () => {
      loadStats();
      if (currentTab === 'live-feed') {
        loadEmails();
      } else if (currentTab === 'all-mailboxes') {
        loadMailboxes();
      }
    });

    // Close Modal
    btnCloseModal.addEventListener('click', closeModal);
    adminEmailModal.addEventListener('click', (e) => {
      if (e.target === adminEmailModal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !adminEmailModal.classList.contains('hidden')) {
        closeModal();
      }
    });
  }

  function showPassMessage(msg, isSuccess) {
    if (!passMsg) return;
    passMsg.textContent = msg;
    passMsg.className = `text-xs p-2.5 rounded-xl block font-medium ${isSuccess ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40' : 'bg-red-950/60 text-red-300 border border-red-800/40'}`;
  }

  function showLogin() {
    loginOverlay.classList.remove('hidden');
    inputAdminPass.focus();
  }

  function hideLogin() {
    loginOverlay.classList.add('hidden');
  }

  async function testAndInitToken(token) {
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        hideLogin();
        initDashboard();
      } else {
        sessionStorage.removeItem('admin_token');
        adminToken = '';
        showLogin();
      }
    } catch {
      showLogin();
    }
  }

  function initDashboard() {
    loadStats();
    loadEmails();
    loadMailboxes();
    connectAdminSse();

    // Auto-refresh stats every 30 seconds
    setInterval(loadStats, 30000);
  }

  function switchTab(tab) {
    currentTab = tab;
    const activeClass = 'px-4 py-2 rounded-xl bg-brand-600 text-white font-medium text-xs sm:text-sm transition flex items-center gap-1.5 shadow-md shadow-brand-600/30 whitespace-nowrap';
    const inactiveClass = 'px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-medium text-xs sm:text-sm transition flex items-center gap-1.5 whitespace-nowrap';

    tabLiveFeed.className = (tab === 'live-feed') ? activeClass : inactiveClass;
    tabAllMailboxes.className = (tab === 'all-mailboxes') ? activeClass : inactiveClass;
    if (tabSettings) tabSettings.className = (tab === 'settings') ? activeClass : inactiveClass;

    sectionLiveFeed.classList.toggle('hidden', tab !== 'live-feed');
    sectionAllMailboxes.classList.toggle('hidden', tab !== 'all-mailboxes');
    if (sectionSettings) sectionSettings.classList.toggle('hidden', tab !== 'settings');

    if (tab === 'live-feed') {
      inputSearch.placeholder = 'ইমেইল বা ওটিপি খুঁজুন...';
    } else if (tab === 'all-mailboxes') {
      inputSearch.placeholder = 'ইউজার ইনবক্স ঠিকানা খুঁজুন...';
    } else {
      inputSearch.placeholder = 'খুঁজুন...';
    }
  }

  function setFilter(filter) {
    activeFilter = filter;
    const btns = [
      { el: filterAll, name: 'all' },
      { el: filterOtpOnly, name: 'otp-only' },
      { el: filterDomainTempgmail, name: 'tempgmail.dpdns.org' },
      { el: filterDomainProgmail, name: 'progmail.dpdns.org' },
    ];

    btns.forEach(b => {
      if (b.el) {
        b.el.className = (b.name === activeFilter)
          ? 'px-2.5 py-1 rounded-lg bg-brand-600 text-white font-medium shadow-sm'
          : 'px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white';
      }
    });

    applyFilters();
  }

  function applyFilters() {
    const q = inputSearch.value.toLowerCase().trim();

    if (currentTab === 'live-feed') {
      let filtered = cachedEmails;

      // Filter by active filter pill
      if (activeFilter === 'otp-only') {
        filtered = filtered.filter(em => Boolean(em.otp));
      } else if (activeFilter === 'tempgmail.dpdns.org') {
        filtered = filtered.filter(em => em.mailbox_address && em.mailbox_address.endsWith('@tempgmail.dpdns.org'));
      } else if (activeFilter === 'progmail.dpdns.org') {
        filtered = filtered.filter(em => em.mailbox_address && em.mailbox_address.endsWith('@progmail.dpdns.org'));
      }

      // Filter by search query
      if (q) {
        filtered = filtered.filter(em =>
          (em.otp && em.otp.toLowerCase().includes(q)) ||
          (em.mailbox_address && em.mailbox_address.toLowerCase().includes(q)) ||
          (em.from_address && em.from_address.toLowerCase().includes(q)) ||
          (em.from_name && em.from_name.toLowerCase().includes(q)) ||
          (em.subject && em.subject.toLowerCase().includes(q))
        );
      }

      renderEmails(filtered);
    } else if (currentTab === 'all-mailboxes') {
      let filtered = cachedMailboxes;
      if (q) {
        filtered = filtered.filter(mb => mb.address.toLowerCase().includes(q));
      }
      renderMailboxes(filtered);
    }
  }

  // Fetch Stats
  async function loadStats() {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success && data.stats) {
        const s = data.stats;
        statMailboxes.textContent = Number(s.totalMailboxes || 0).toLocaleString();
        statEmails.textContent = Number(s.totalEmails || 0).toLocaleString();
        statOtps.textContent = Number(s.totalOtps || 0).toLocaleString();

        const hours = Math.floor(s.uptimeSeconds / 3600);
        const mins = Math.floor((s.uptimeSeconds % 3600) / 60);
        statUptime.textContent = `সার্ভার আপটাইম: ${hours}ঘণ্টা ${mins}মিনিট`;
      }
    } catch (err) {
      console.error('Stats fetch error:', err);
    }
  }

  // Fetch Recent Emails
  async function loadEmails() {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/emails?limit=200', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success && data.emails) {
        cachedEmails = data.emails;
        badgeEmailCount.textContent = `${cachedEmails.length}টি`;
        applyFilters();
      }
    } catch (err) {
      console.error('Emails fetch error:', err);
    }
  }

  // Render Emails Table
  function renderEmails(emails) {
    if (!emails || emails.length === 0) {
      tableEmailsBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-12 text-slate-500 font-sans">
            কোনো ইমেইল মেসেজ পাওয়া যায়নি।
          </td>
        </tr>
      `;
      return;
    }

    tableEmailsBody.innerHTML = emails.map(em => {
      const otpBadge = em.otp ? `
        <div class="flex items-center gap-1.5">
          <span class="inline-block px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 text-sm tracking-wider shadow-sm select-all">
            ${escapeHtml(em.otp)}
          </span>
          <button class="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition" onclick="copyText('${escapeHtml(em.otp)}', this)" title="ওটিপি কপি করুন">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
          </button>
        </div>
      ` : `<span class="text-slate-600 font-sans text-xs">কোনো কোড নেই</span>`;

      const timeAgo = formatTime(em.received_at);

      return `
        <tr class="hover:bg-slate-800/40 transition group" id="email-row-${em.id}">
          <td class="py-3 px-4">${otpBadge}</td>
          <td class="py-3 px-4">
            <span class="text-brand-300 font-medium select-all">${escapeHtml(em.mailbox_address || '')}</span>
          </td>
          <td class="py-3 px-4 max-w-[180px] truncate" title="${escapeHtml(em.from_address || '')}">
            <div class="text-slate-200 font-medium truncate">${escapeHtml(em.from_name || em.from_address || '')}</div>
            <div class="text-[11px] text-slate-500 truncate">${escapeHtml(em.from_address || '')}</div>
          </td>
          <td class="py-3 px-4 max-w-[280px]">
            <div class="text-slate-100 font-medium truncate">${escapeHtml(em.subject || '(No Subject)')}</div>
            <div class="text-[11px] text-slate-500 truncate font-sans">${escapeHtml(em.preview || '')}</div>
          </td>
          <td class="py-3 px-4 text-slate-400 font-sans text-[11px] whitespace-nowrap">${timeAgo}</td>
          <td class="py-3 px-4 text-right whitespace-nowrap">
            <button class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition font-sans text-xs mr-1" onclick="viewEmail('${em.id}')">
              ভিউ
            </button>
            <button class="px-2 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 transition font-sans text-xs" onclick="deleteEmail('${em.id}')" title="মুছুন">
              ✕
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Fetch All Mailboxes
  async function loadMailboxes() {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/mailboxes?limit=250', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success && data.mailboxes) {
        cachedMailboxes = data.mailboxes;
        badgeMailboxCount.textContent = `${cachedMailboxes.length}টি`;
        applyFilters();
      }
    } catch (err) {
      console.error('Mailboxes fetch error:', err);
    }
  }

  // Render Mailboxes Table
  function renderMailboxes(mailboxes) {
    if (!mailboxes || mailboxes.length === 0) {
      tableMailboxesBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-12 text-slate-500 font-sans">
            কোনো ইনবক্স পাওয়া যায়নি।
          </td>
        </tr>
      `;
      return;
    }

    tableMailboxesBody.innerHTML = mailboxes.map(mb => {
      const createdAt = mb.created_at ? new Date(mb.created_at * 1000).toLocaleString() : 'N/A';
      const lastActive = formatTime(mb.last_accessed || mb.last_active_at);
      const emailCount = mb.email_count ?? mb.received_count ?? 0;

      return `
        <tr class="hover:bg-slate-800/40 transition" id="mailbox-row-${encodeURIComponent(mb.address)}">
          <td class="py-3 px-4">
            <span class="text-slate-100 font-medium select-all">${escapeHtml(mb.address)}</span>
          </td>
          <td class="py-3 px-4">
            <span class="px-2 py-0.5 rounded-full ${emailCount > 0 ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30' : 'bg-slate-800 text-slate-400'} text-xs font-semibold">
              ${emailCount}টি
            </span>
          </td>
          <td class="py-3 px-4 text-slate-400 font-sans text-[11px] whitespace-nowrap">${createdAt}</td>
          <td class="py-3 px-4 text-slate-400 font-sans text-[11px] whitespace-nowrap">${lastActive}</td>
          <td class="py-3 px-4 text-right whitespace-nowrap">
            <a href="/?mailbox=${encodeURIComponent(mb.address)}" target="_blank" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition font-sans text-xs mr-1">
              ওপেন ইনবক্স ↗
            </a>
            <button class="px-2 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 transition font-sans text-xs" onclick="deleteMailbox('${escapeHtml(mb.address)}')" title="ইনবক্স ডিলিট করুন">
              ডিলিট
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Real-Time SSE Stream for Admin
  function connectAdminSse() {
    if (!adminToken) return;
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource(`/api/admin/events?token=${encodeURIComponent(adminToken)}`);

    eventSource.onopen = () => {
      liveIndicator.classList.remove('hidden');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'admin_email' && data.email) {
          handleIncomingEmail(data.email);
        } else if (data.type === 'admin_mailbox' && data.mailbox) {
          handleIncomingMailbox(data.mailbox);
        }
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    };

    eventSource.onerror = () => {
      // Reconnect automatically handled by browser EventSource
    };
  }

  // Handle Live Incoming Email Push (0ms)
  function handleIncomingEmail(email) {
    // Add to cache
    cachedEmails.unshift(email);
    badgeEmailCount.textContent = `${cachedEmails.length}টি`;

    // Increment Stats
    const currentEmails = parseInt(statEmails.textContent.replace(/,/g, '') || '0', 10);
    statEmails.textContent = (currentEmails + 1).toLocaleString();

    if (email.otp) {
      const currentOtps = parseInt(statOtps.textContent.replace(/,/g, '') || '0', 10);
      statOtps.textContent = (currentOtps + 1).toLocaleString();

      // Browser Notification if granted
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`🔥 নতুন OTP কোড: ${email.otp}`, {
          body: `ইনবক্স: ${email.mailbox_address}\nপ্রেরক: ${email.from_name || email.from_address}`,
          icon: '/favicon.ico'
        });
      }
    }

    // Refresh view according to active filter
    applyFilters();
  }

  // Handle Live Mailbox Creation Push (from API or Web)
  function handleIncomingMailbox(mb) {
    const existing = cachedMailboxes.find(m => m.address.toLowerCase() === mb.address.toLowerCase());
    if (!existing) {
      cachedMailboxes.unshift({
        address: mb.address,
        created_at: mb.created_at ? mb.created_at : Math.floor(Date.now() / 1000),
        last_accessed: mb.last_accessed ? mb.last_accessed : Math.floor(Date.now() / 1000),
        email_count: 0,
      });

      // Increment stats
      const currentMailboxes = parseInt(statMailboxes.textContent.replace(/,/g, '') || '0', 10);
      statMailboxes.textContent = (currentMailboxes + 1).toLocaleString();
      badgeMailboxCount.textContent = `${cachedMailboxes.length}টি`;

      if (currentTab === 'all-mailboxes') {
        applyFilters();
      }
    }
  }

  // View Email Modal
  window.viewEmail = async function (id) {
    try {
      const res = await fetch(`/api/email/${id}`);
      const data = await res.json();
      if (!data.success || !data.email) {
        alert('ইমেইলটি খুঁজে পাওয়া যায়নি');
        return;
      }

      const email = data.email;
      modalAdminSubject.textContent = email.subject || '(No Subject)';
      modalAdminMeta.textContent = `প্রাপক: ${email.mailbox_address} | প্রেরক: ${email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address} | তারিখ: ${new Date(email.received_at).toLocaleString()}`;

      // Load HTML or Plain text into iframe
      const content = email.html_body || `<pre style="font-family: monospace; white-space: pre-wrap; padding: 20px; font-size: 14px;">${escapeHtml(email.text_body || 'মেসেজ বডি ফাঁকা')}</pre>`;
      adminModalIframe.srcdoc = content;

      adminEmailModal.classList.remove('hidden');
    } catch (err) {
      alert('ইমেইল ওপেন করতে সমস্যা হয়েছে: ' + err.message);
    }
  };

  function closeModal() {
    adminEmailModal.classList.add('hidden');
    adminModalIframe.srcdoc = '';
  }

  // Delete Email
  window.deleteEmail = async function (id) {
    if (!confirm('আপনি কি সত্যিই এই ইমেইলটি মুছে ফেলতে চান?')) return;
    try {
      const res = await fetch(`/api/admin/email/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success) {
        cachedEmails = cachedEmails.filter(e => e.id !== id);
        const row = document.getElementById(`email-row-${id}`);
        if (row) row.remove();
        badgeEmailCount.textContent = `${cachedEmails.length}টি`;
      } else {
        alert('মুছতে সমস্যা হয়েছে: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('সার্ভার এরর: ' + err.message);
    }
  };

  // Delete Mailbox
  window.deleteMailbox = async function (address) {
    if (!confirm(`আপনি কি "${address}" ইনবক্স এবং এর সমস্ত মেসেজ চিরতরে মুছে ফেলতে চান?`)) return;
    try {
      const res = await fetch(`/api/admin/mailbox/${encodeURIComponent(address)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success) {
        cachedMailboxes = cachedMailboxes.filter(m => m.address !== address);
        renderMailboxes(cachedMailboxes);
        badgeMailboxCount.textContent = `${cachedMailboxes.length}টি`;
        loadStats();
      } else {
        alert('মুছতে সমস্যা হয়েছে: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('সার্ভার এরর: ' + err.message);
    }
  };

  // Export to CSV
  function exportToCsv() {
    if (!cachedEmails || cachedEmails.length === 0) {
      alert('এক্সপোর্ট করার মতো কোনো ইমেইল পাওয়া যায়নি।');
      return;
    }

    const headers = ['OTP', 'Mailbox (Recipient)', 'From Name', 'From Address', 'Subject', 'Preview', 'Received At'];
    const rows = cachedEmails.map(em => [
      `"${(em.otp || '').replace(/"/g, '""')}"`,
      `"${(em.mailbox_address || '').replace(/"/g, '""')}"`,
      `"${(em.from_name || '').replace(/"/g, '""')}"`,
      `"${(em.from_address || '').replace(/"/g, '""')}"`,
      `"${(em.subject || '').replace(/"/g, '""')}"`,
      `"${(em.preview || '').replace(/"/g, '""')}"`,
      `"${new Date(em.received_at).toLocaleString()}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `temple_mail_otps_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Copy helper
  window.copyText = function (text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const original = btn.innerHTML;
      btn.innerHTML = `<span class="text-emerald-400 font-bold text-xs">কপি!</span>`;
      setTimeout(() => {
        btn.innerHTML = original;
      }, 1500);
    }).catch(() => {
      prompt('কপি করতে Ctrl+C চাপুন:', text);
    });
  };

  // Utilities
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const ts = typeof timestamp === 'number' && timestamp < 10000000000 ? timestamp * 1000 : new Date(timestamp).getTime();
    const diff = Math.floor((now - ts) / 1000);

    if (diff < 60) return 'এইমাত্র';
    if (diff < 3600) return `${Math.floor(diff / 60)} মিনিট আগে`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ঘণ্টা আগে`;
    return new Date(ts).toLocaleDateString();
  }

  // Request browser notification permission once loaded
  if ('Notification' in window && Notification.permission === 'default') {
    setTimeout(() => {
      Notification.requestPermission();
    }, 2000);
  }

})();
