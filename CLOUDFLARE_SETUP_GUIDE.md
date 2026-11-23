# 🌐 DigitalPlat ডোমেইন ও Cloudflare দিয়ে সম্পূর্ণ Temp Mail সেটআপ গাইড

এই গাইডে বিস্তারিতভাবে দেখানো হয়েছে কিভাবে **DigitalPlat** থেকে কেনা ডোমেইন এবং **Cloudflare Email Routing** ব্যবহার করে আপনার নিজস্ব প্রফেশনাল টেম্প মেইল (Temp Mail) ওয়েবসাইট ও API লাইভ করবেন।

---

## 🏗️ সিস্টেমের কার্যপদ্ধতি (Architecture Overview)

```
[যেকোনো প্রেরক] 
      │ (ইমেইল পাঠায়)
      ▼
[DigitalPlat ডোমেইন (e.g. yourdomain.com)]
      │
      ▼ (Nameserver দ্বারা Cloudflare এ পয়েন্ট করা)
[Cloudflare Email Routing (MX + SPF Records)]
      │
      ▼ (Catch-all Rule: *@yourdomain.com)
[Cloudflare Email Worker]
      │
      ▼ (POST /api/webhook/email with Secret Key)
[Temple Server (Node.js + SQLite)]
      │
      ├── 1. REST API (/api/mailbox/..., /api/email/...)
      └── 2. Modern Web UI (Live Inbox, Instant Copy, QR Code, Sound)
```

---

## 📋 ধাপ ১: DigitalPlat থেকে ডোমেইনটি Cloudflare-এ যুক্ত করা

১. **Cloudflare একাউন্ট তৈরি করুন**:
   - [dash.cloudflare.com](https://dash.cloudflare.com/) এ গিয়ে ফ্রি একাউন্ট খুলুন (যদি আগে না থাকে)।

২. **ডোমেইন যোগ করুন**:
   - Cloudflare ড্যাশবোর্ডে **"Add a site"** বা **"Add domain"** বাটনে ক্লিক করুন।
   - আপনার ডিজিটালপ্ল্যাট (DigitalPlat) থেকে কেনা ডোমেইন নাম লিখুন (যেমন: `example.com`)।
   - প্ল্যান সিলেক্ট করার অপশনে স্ক্রোল করে নিচে নেমে **Free Plan ($0/month)** সিলেক্ট করুন এবং Continue চাপুন।

৩. **Cloudflare Nameservers সংগ্রহ করুন**:
   - Cloudflare আপনাকে ২টি নেমসার্ভার দেবে, যেমন:
     - `olga.ns.cloudflare.com`
     - `walt.ns.cloudflare.com`

৪. **DigitalPlat এ Nameservers পরিবর্তন করুন**:
   - [DigitalPlat](https://digitalplat.net/) ওয়েবসাইটে আপনার একাউন্টে লগইন করুন।
   - **Domains** বা **My Domains** এ যান।
   - আপনার ডোমেইনটির পাশে **Manage Domain** বা **DNS / Nameservers** অপশনে ক্লিক করুন।
   - **Custom Nameservers** নির্বাচন করুন এবং Cloudflare-এর দেওয়া ২টি Nameserver বসিয়ে **Save / Update** করুন।
   - *টিপস:* নেমসার্ভার আপডেট হতে সাধারণত ৫ মিনিট থেকে সর্বোচ্চ কয়েক ঘণ্টা সময় লাগতে পারে।

---

## ✉️ ধাপ ২: Cloudflare Email Routing সক্রিয় করা

১. Cloudflare ড্যাশবোর্ডে আপনার ডোমেইনে ক্লিক করুন।
২. বাম পাশের মেনু থেকে **Email** -> **Email Routing** এ ক্লিক করুন।
৩. **"Get started"** বা **"Enable Email Routing"** বাটনে ক্লিক করুন।
৪. Cloudflare স্বয়ংক্রিয়ভাবে প্রয়োজনীয় **MX Records** এবং **TXT (SPF) Record** দেখাবে।
৫. নিচে **"Add records automatically"** বাটনে ক্লিক করুন। Cloudflare নিজে থেকেই DNS টেবিলে সব রেকর্ড বসিয়ে দেবে!

---

## ⚡ ধাপ ৩: Cloudflare Email Worker তৈরি করা

Cloudflare Worker যেকোনো আসা ইমেইল রিসিভ করে সরাসরি আপনার Temple ব্যাকএন্ডে ফরোয়ার্ড করবে।

১. Cloudflare ড্যাশবোর্ডের বাম পাশের মেনু থেকে **Workers & Pages** এ যান।
২. **Create application** -> **Create Worker** এ ক্লিক করুন।
৩. Worker-এর একটি নাম দিন (যেমন: `temple-email-worker`) এবং **Deploy** চাপুন।
৪. ডিপ্লয় হওয়ার পর **Edit code** এ ক্লিক করুন।
৫. এডিটরে থাকা আগের কোড মুছে দিয়ে আমাদের তৈরি করা `cloudflare/simple-worker-no-deps.js` ফাইলের কোডটি পেস্ট করুন:

```javascript
export default {
  async email(message, env, ctx) {
    try {
      const webhookUrl = env.TEMPLE_WEBHOOK_URL;
      const webhookSecret = env.TEMPLE_WEBHOOK_SECRET;

      // Read raw MIME email
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
```

৬. উপরে ডানে **Save and Deploy** এ ক্লিক করুন।

৭. **Environment Variables সেট করুন**:
   - Worker-এর পেজে গিয়ে **Settings** -> **Variables and Secrets** এ যান।
   - **Add variable** এ ক্লিক করে নিচের ২টি ভ্যারিয়েবল যোগ করুন:
     - `TEMPLE_WEBHOOK_URL` : `https://your-server-url.com/api/webhook/email`
     - `TEMPLE_WEBHOOK_SECRET` : `temple-secret-key-12345` (আপনার `.env` ফাইলের সিক্রেট কি)
   - **Save and Deploy** চাপুন।

---

## 🎯 ধাপ ৪: Catch-All রুল দিয়ে Worker কানেক্ট করা

১. আবার আপনার ডোমেইনে ফিরে যান: **Email** -> **Email Routing** -> **Routing Rules** ট্যাবে যান।
২. নিচে **Catch-all address** অপশনটি খুঁজে বের করে **Edit** এ ক্লিক করুন।
3. সেটিংসগুলো এভাবে দিন:
   - **Action**: `Send to a Worker` সিলেক্ট করুন।
   - **Destination worker**: আগের ধাপে তৈরি করা `temple-email-worker` সিলেক্ট করুন।
   - **Status**: Enabled / Active রাখুন।
4. **Save** চাপুন।

এখন আপনার ডোমেইনের যেকোনো অ্যাড্রেসে (`*@yourdomain.com`) ইমেইল আসলে Cloudflare সেটি সরাসরি আপনার Worker-এ পাঠাবে এবং Worker সেটি আপনার Temple সিস্টেমে জমা করে দেবে!

---

## 💻 ধাপ ৫: Temple সার্ভার কনফিগারেশন ও রান করা

### ১. লোকাল কনফিগারেশন (`.env` ফাইল)
আপনার প্রজেক্ট ডিরেক্টরিতে `.env` ফাইলটি খুলুন এবং আপনার ডোমেইন দিন:

```env
PORT=3000
DOMAINS=yourdomain.com,temp.yourdomain.com
WEBHOOK_SECRET=temple-secret-key-12345
EMAIL_TTL_MINUTES=60
MAX_EMAILS_PER_MAILBOX=100
```

### ২. সার্ভার চালু করা:
টার্মিনালে কমান্ড দিন:
```bash
npm start
```
অথবা ডেভেলপমেন্ট মোডে:
```bash
npm run dev
```

ব্রাউজারে ওপেন করুন: `http://localhost:3000`

---

## 🚀 ফ্রি হোস্টিং ও পাবলিক লাইভ করার উপায়সমূহ

লোকালহোস্টের সার্ভারকে ইন্টারনেটে লাইভ করার জন্য বেশ কয়েকটি সহজ উপায় আছে:

### অপশন ক: Cloudflare Tunnel (সবচেয়ে সহজ ও ফ্রি)
আপনার পিসির লোকাল সার্ভারকেই আপনার ডোমেইনে সরাসরি লাইভ করতে পারেন Cloudflare Tunnel দিয়ে:
```bash
cloudflared tunnel --url http://localhost:3000
```
এটি আপনাকে একটি ফ্রি HTTPS লিংক দেবে যা আপনি ক্লাউডফ্লেয়ার ওয়ার্কারের `TEMPLE_WEBHOOK_URL` এ বসাতে পারবেন।

### অপশন খ: Railway বা Render এ ফ্রি ডিপ্লয়
- GitHub-এ প্রজেক্টটি পুশ করুন।
- Railway বা Render এ "New Web Service" খুলে রিপোজিটরি কানেক্ট করুন।
- Environment Variables এ আপনার `.env` এর ভ্যালুগুলো দিয়ে ডিপ্লয় করে দিন।
- Railway আপনাকে একটি ফ্রি লাইভ ডোমেইন দেবে (যেমন: `temple-production.up.railway.app`)।

---

## 🛠️ টেস্ট ও সিমুলেশন

আপনার সিস্টেম ঠিকমতো কাজ করছে কিনা তা দেখতে:
১. ব্রাউজারে `http://localhost:3000` এ যান।
২. ওয়েবসাইটের উপরে থাকা **"টেস্ট ইমেইল সিমুলেট"** বাটনে ক্লিক করুন অথবা টার্মিনালে রান করুন:
   ```bash
   node scripts/simulate-email.js user123@yourdomain.com
   ```
৩. সাথে সাথে ইনবক্সে নোটিফিকেশন সাউন্ড বাজবে এবং ভেরিফিকেশন কোডের ইমেইল দেখতে পাবেন!
