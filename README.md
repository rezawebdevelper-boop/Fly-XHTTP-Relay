# ✈️ Fly-XHTTP Relay

یه relay ساده روی [Fly.io](https://fly.io) که ترافیک XHTTP رو از کلاینت Xray/V2Ray به سرور backend فوروارد می‌کنه.  
هدف: پنهان کردن IP سرور اصلی پشت دامنه‌ی `*.fly.dev`.

```
┌──────────┐  TLS / SNI=fly.dev   ┌─────────────────┐  HTTP(S)   ┌──────────────┐
│  کلاینت  │ ───────────────────► │  Fly.io Machine │ ─────────► │  سرور Xray  │
│(v2rayN / │  XHTTP request       │  (relay — این   │  forward   │ XHTTP inbound│
│ Hiddify) │                      │    پروژه‌ست)    │            │              │
└──────────┘                      └─────────────────┘            └──────────────┘
```

کلاینت با SNI=fly.dev به Fly.io وصل می‌شه → برای سانسورچی شبیه ترافیک عادی Fly به‌نظر می‌رسه.  
Fly Machine بدنه‌ی request رو بدون buffer به سرور Xray فوروارد می‌کنه.  
پاسخ هم به همون صورت stream برمی‌گرده.

---

## ⚠️ هشدارها

| | |
|---|---|
| ⚠️ **فقط XHTTP** | WebSocket, gRPC, TCP و Reality مستقیماً روی این relay کار نمی‌کنن |
| ⚠️ **TOS Fly.io** | استفاده‌ی proxy ممکنه TOS رو نقض کنه. ترافیک رو متعادل نگه دار |
| ⚠️ **آموزشی** | این repo برای آموزش و تست شخصیه، نه production با ترافیک سنگین |
| 🟢 **Scale-to-zero** | با `min_machines_running = 0` ماشین فقط وقتی request داره روشنه → هزینه صفر در idle |

---

## 📋 پیش‌نیازها

- یک سرور لینوکس خارج از ایران با IP عمومی (Ubuntu 22.04 یا 24.04)
- Xray روی سرور نصب‌شده با **XHTTP inbound** فعال
- یک دامنه (پولی یا رایگان مثل DuckDNS) که A record اون به IP سرور اشاره کنه
- اکانت رایگان Fly.io (کارت بانکی برای تأیید لازمه)
- `flyctl` نصب‌شده روی سیستم محلی

---

## 🚀 Deploy — مرحله به مرحله

### ۱. نصب flyctl

**مک/لینوکس:**
```bash
curl -L https://fly.io/install.sh | sh
```

**ویندوز (PowerShell):**
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

### ۲. لاگین به Fly.io

```bash
flyctl auth login
```

مرورگر باز میشه، ثبت‌نام یا لاگین کن.

### ۳. کلون پروژه

```bash
git clone https://github.com/YOUR_USERNAME/fly-xhttp.git
cd fly-xhttp
```

### ۴. ساخت App روی Fly.io

```bash
flyctl apps create fly-xhttp-relay
```

> نام app باید globally unique باشه. اگه این نام گرفته‌شده، اسم دیگه‌ای انتخاب کن و در `fly.toml` هم `app =` رو عوض کن.

### ۵. انتخاب ریجن

ریجنی نزدیک‌تر به سرور Xrayت انتخاب کن:

| کد | موقعیت |
|---|---|
| `ams` | آمستردام (پیشنهاد برای اروپا) |
| `fra` | فرانکفورت |
| `lhr` | لندن |
| `sin` | سنگاپور |
| `syd` | سیدنی |

در `fly.toml`:
```toml
primary_region = "ams"
```

### ۶. تنظیم TARGET_URL (مهم!)

```bash
flyctl secrets set TARGET_URL=https://your-domain.example.com:443
```

- `your-domain.example.com` → دامنه یا IP سرور Xray
- پورت همونی که در Xray config `XHTTP inbound` تنظیم کردی
- اگه سرور TLS داره: `https://...` | اگه نداره: `http://...`

**مثال:**
```bash
flyctl secrets set TARGET_URL=https://myserver.duckdns.org:2053
```

### ۷. Deploy

```bash
flyctl deploy
```

چند دقیقه طول می‌کشه (build Docker image + deploy).

پس از موفقیت، آدرسی مثل این می‌گیری:
```
https://fly-xhttp-relay.fly.dev
```

---

## ⚙️ تنظیم Xray کلاینت

در کانفیگ کلاینت (v2rayN / Hiddify / ...):

```json
{
  "type": "vless",
  "server": "fly-xhttp-relay.fly.dev",
  "server_port": 443,
  "uuid": "YOUR_UUID",
  "tls": {
    "enabled": true,
    "server_name": "fly-xhttp-relay.fly.dev"
  },
  "transport": {
    "type": "xhttp",
    "path": "/YOUR_XHTTP_PATH"
  }
}
```

---

## 💡 نکات مهم Fly.io

### Scale-to-zero چطور کار می‌کنه؟

با تنظیم `min_machines_running = 0` در `fly.toml`:
- وقتی ترافیک نداری → ماشین خاموش میشه → **هزینه صفر**
- وقتی request میاد → ماشین ظرف ~۱-۲ ثانیه روشن میشه (cold start)
- برای XHTTP این تأخیر کوچیک معمولاً قابل قبوله

### پلن رایگان Fly.io

- **3 shared-cpu-1x با 256MB** رایگان
- **160GB outbound** ترافیک رایگان در ماه
- با scale-to-zero هزینه compute عملاً صفره

### Custom Domain

اگه می‌خوای از دامنه‌ی شخصی استفاده کنی:
```bash
flyctl certs add your-domain.example.com
```
بعد CNAME → `fly-xhttp-relay.fly.dev` بذار.

### مانیتورینگ

```bash
flyctl logs          # لاگ زنده
flyctl status        # وضعیت ماشین‌ها
flyctl dashboard     # باز کردن داشبورد وب
```

---

## 🔄 مقایسه با Vercel-XHTTP

| ویژگی | Vercel-XHTTP | Fly-XHTTP |
|---|---|---|
| Runtime | Edge / Node.js Serverless | Fly Machine (Docker) |
| Scale-to-zero | ✅ | ✅ |
| HTTP/2 | ✅ (Edge) | ✅ (Fly proxy) |
| ترافیک رایگان ماهیانه | ~100GB (Hobby) | 160GB |
| Cold start | ~50ms | ~1-2s |
| Custom domain | ✅ | ✅ |
| TOS risk | متوسط | پایین‌تر |
| کنترل runtime | محدود | کامل (Docker) |

---

## 📁 ساختار فایل‌ها

```
fly-xhttp/
├── src/
│   └── index.js      ← relay server (Node.js, بدون dependency خارجی)
├── Dockerfile
├── fly.toml          ← تنظیمات Fly.io
├── package.json
└── README.md
```

---

## ❓ سؤالات رایج

**آیا WebSocket پشتیبانی میشه؟**  
نه. این relay فقط برای XHTTP طراحی شده.

**اگه cold start داره، آیا connection قطع میشه؟**  
خیر. Fly.io در زمان cold start request رو نگه می‌داره تا ماشین آماده بشه.

**چند کاربر می‌تونم داشته باشم؟**  
Fly به ازای هر UUID تفاوتی قائل نمیشه. در Xray config چند `clients` با UUID جداگانه بساز.

**آیا Fly.io IP ایران رو بلاک می‌کنه؟**  
بعضی ریجن‌ها ممکنه مشکل داشته باشن. اگه `ams` کار نکرد، `fra` یا `lhr` امتحان کن.
