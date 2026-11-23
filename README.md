# 🏛️ Temple - Disposable Temp Mail System & REST API

একটি সম্পূর্ণ ওপেন সোর্স, আধুনিক এবং পাওয়ারফুল **ডিসপোজেবল টেম্প মেইল সার্ভিস (Temporary Disposable Email Service)**।
এটি কাস্টম ডোমেইন (DigitalPlat, Namecheap, GoDaddy ইত্যাদি) এবং **Cloudflare Email Routing** এর সাথে সম্পূর্ণ ফ্রি এবং সার্ভারলেস ইন্টিগ্রেশনের উপযোগী করে তৈরি।

![Temple Mail Preview](https://img.shields.io/badge/Status-Production%20Ready-emerald?style=for-the-badge)
![Node Version](https://img.shields.io/badge/Node.js-v24%2B-blue?style=for-the-badge)
![Database](https://img.shields.io/badge/SQLite-Built--in%20WAL-indigo?style=for-the-badge)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Email%20Routing%20Worker-orange?style=for-the-badge)

---

## ✨ প্রধান বৈশিষ্ঠ্যসমূহ (Key Features)

- ⚡ **জিরো কনফিগ ডাটাবেজ**: Node.js 24-এর বিল্ট-ইন হাই-স্পিড SQLite (`node:sqlite`) ব্যবহার করা হয়েছে। কোনো এক্সটার্নাল C++ বিল্ড টুল ছাড়াই কাজ করে।
- 🎨 **আধুনিক প্রিমিয়াম ওয়েব UI**:
  - ডার্ক মোড ও রেসপন্সিভ গ্লাস-ডিজাইন (মোবাইল ও পিসিতে পারফেক্ট)।
  - এক ক্লিকে অ্যাড্রেস কপি করার সুবিধা ও টোস্ট অ্যালার্ট।
  - লাইভ অটো-রিফ্রেশ ও কাউন্টডাউন ইন্ডিকেটর (প্রতি ৮ সেকেন্ড পর পর)।
  - নতুন ইমেইল আসার সাথে সাথে প্লে হয় মেলোডিয়াস নোটিফিকেশন সাউন্ড।
  - স্যান্ডবক্সড Iframe এ HTML ইমেইল প্রিভিউ (CSS বা স্ক্রিপ্ট ব্লিড প্রতিরোধ করে নিরাপদ ব্রাউজিং)।
  - মোবাইল স্ক্যানিংয়ের জন্য বিল্ট-ইন QR কোড জেনারেটর।
  - কাস্টম ইউজারনেম দিয়ে ইনস্ট্যান্ট ইনবক্স তৈরির অপশন (`myname@yourdomain.com`)।
  - ইনবক্স বা নির্দিষ্ট ইমেইল ডিলিট করার ব্যবস্থা।
- 🌐 **Cloudflare Catch-All ইন্টিগ্রেশন**: আপনার ডোমেইনের যেকোনো ঠিকানায় পাঠানো ইমেইল নিমেষেই রিসিভ হয়।
- 📡 **ফুল REST API**: বট, অটোমেশন বা অ্যাপ তৈরিতে ব্যবহার করার জন্য ওপেন এপিআই।
- ⏱️ **অটো-ক্লিনআপ ইঞ্জিন**: নির্দিষ্ট সময় পর (যেমন ১ ঘণ্টা বা ২৪ ঘণ্টা) স্বয়ংক্রিয়ভাবে এক্সপায়ার হওয়া ইমেইল ডিলিট হয়ে যায়।
- 🧪 **টেস্টিং ও সিমুলেশন টুল**: ডোমেইন DNS প্রোপাগেশনের আগেই লোকাল টেস্ট ইমেইল পাঠিয়ে যাচাই করার সুবিধা।

---

## 📁 ফাইল স্ট্রাকচার

```
Temple/
├── src/
│   ├── config.js               # কনফিগারেশন ও এনভায়রনমেন্ট ভ্যারিয়েবল
│   ├── db.js                   # বিল্ট-ইন SQLite ডাটাবেজ ইঞ্জিন ও কুয়েরি
│   ├── server.js               # এক্সপ্রেস সার্ভার ও ব্যাকগ্রাউন্ড ক্লিনার
│   └── routes/
│       └── api.js              # REST API ও ক্লাউডফ্লেয়ার ইনবাউন্ড ওয়েবহুক
├── public/
│   ├── index.html              # ফ্রন্টএন্ড ওয়েব UI
│   ├── app.js                  # ক্লায়েন্ট লজিক, পোলিং, সাউন্ড ও কিউআর
│   └── styles.css              # কাস্টম অ্যানিমেশন ও স্টাইল
├── cloudflare/
│   ├── simple-worker-no-deps.js # জিরো-ডিপেনডেন্সি ক্লাউডফ্লেয়ার ইমেইল ওয়ার্কার
│   ├── worker.js               # PostalMime ভিত্তিক ফুল ওয়ার্কার
│   └── wrangler.toml           # Wrangler ডিপ্লয়মেন্ট কনফিগ
├── scripts/
│   └── simulate-email.js       # টেস্ট ইমেইল পাঠানোর CLI স্ক্রিপ্ট
├── tests/
│   ├── run-tests.js            # কোর ডাটাবেজ টেস্ট স্যুট
│   └── test-api.js             # HTTP API ইন্টিগ্রেশন টেস্ট
├── .env.example                # এনভায়রনমেন্ট কনফিগ টেমপ্লেট
├── CLOUDFLARE_SETUP_GUIDE.md   # ডিজিটালপ্ল্যাট ও ক্লাউডফ্লেয়ার সেটআপ গাইড
└── package.json
```

---

## 🚀 দ্রুত শুরু করুন (Quick Start)

### ১. ডিপেনডেন্সি ইনস্টল ও রান:
```bash
# সার্ভার চালু করুন
npm start
```

ব্রাউজারে যান: **`http://localhost:3000`**

### ২. টেস্ট ইমেইল পাঠিয়ে যাচাই করুন:
টার্মিনালে আরেকটি উইন্ডো খুলে রান করুন:
```bash
npm run test:simulate
```
অথবা ওয়েবসাইটের **"টেস্ট ইমেইল সিমুলেট"** বাটনে ক্লিক করুন।

### ৩. স্বয়ংক্রিয় টেস্ট চালান:
```bash
node tests/run-tests.js
node tests/test-api.js
```

---

## 📡 REST API ডকুমেন্টেশন

| মেথড | এন্ডপয়েন্ট | বিবরণ |
| :--- | :--- | :--- |
| `GET` | `/api/config` | সার্ভিস কনফিগ ও সাপোর্টেড ডোমেইন লিস্ট |
| `POST` | `/api/mailbox/generate` | নতুন র‍্যান্ডম ইমেইল ইনবক্স তৈরি |
| `POST` | `/api/mailbox/custom` | কাস্টম ইউজারনেম দিয়ে ইনবক্স তৈরি (`{ username, domain }`) |
| `GET` | `/api/mailbox/:address` | একটি ইনবক্সের সকল ইমেইল লিস্ট পাওয়া |
| `DELETE`| `/api/mailbox/:address` | সম্পূর্ণ ইনবক্স ও এর সকল ইমেইল মুছে ফেলা |
| `GET` | `/api/email/:id` | নির্দিষ্ট ইমেইল পড়া (HTML, টেক্সট ও অ্যাটাচমেন্ট) |
| `DELETE`| `/api/email/:id` | নির্দিষ্ট ইমেইল মুছে ফেলা |
| `POST` | `/api/webhook/email` | ক্লাউডফ্লেয়ার ওয়ার্কারের ইনবাউন্ড ইমেইল রিসিভার |
| `POST` | `/api/test/simulate` | টেস্ট ইমেইল সিমুলেট করা |
| `GET` | `/api/stats` | মোট ইনবক্স ও ইমেইলের পরিসংখ্যান |

---

## 📖 ক্লাউডফ্লেয়ার ও ডিজিটালপ্ল্যাট ডোমেইন সেটআপ
বিস্তারিত ধাপে ধাপে গাইড পড়ার জন্য দেখুন: [CLOUDFLARE_SETUP_GUIDE.md](file:///c:/Users/mdkha/Desktop/Temple/CLOUDFLARE_SETUP_GUIDE.md)
