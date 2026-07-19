# الرفع على Hostinger — دليل خطوة بخطوة

يشرح هذا الدليل رفع النظام على استضافة Hostinger المشتركة (Shared Hosting).
إن كنتِ على VPS فالخطوات أبسط — يمكنك تشغيل `queue:work` كخدمة دائمة بدل Cron.

---

## قبل البدء

| المتطلب | القيمة |
|---|---|
| إصدار PHP | **8.3 أو أحدث** — يُضبط من hPanel ← Advanced ← PHP Configuration |
| Extensions | `openssl` · `pdo_mysql` · `mbstring` · `fileinfo` · `curl` · `zip` · `gd` · `bcmath` |
| MySQL | 8+ |
| **SSL** | **إلزامي** — إشعارات الويب (Push) وتحديد الموقع لا تعمل إلا على HTTPS |

> ⚠️ **بدون شهادة SSL لن تصل الإشعارات ولن يعمل زر «موقعي الحالي».**
> فعّلي شهادة Let's Encrypt المجانية من hPanel ← Security ← SSL قبل أي شيء.

---

## ١. تجهيز الحزمة محليًا

نفّذي البناء على جهازك — لا تعتمدي على تشغيل `npm` على الاستضافة المشتركة:

```bash
composer install --optimize-autoloader --no-dev
npm ci
npm run build
```

ثم ارفعي كل شيء **ما عدا**:

```
node_modules/     ← غير مطلوب على الخادم
.env              ← يُنشأ على الخادم مباشرة
.git/
tests/
storage/logs/*
```

> `vendor/` و `public/build/` **يجب رفعهما** لأن الاستضافة المشتركة لا تشغّل Composer/npm بسهولة.

---

## ٢. هيكل المجلدات على الخادم

الطريقة الآمنة هي وضع ملفات المشروع **خارج** المجلد العام:

```
/home/uXXXXXXX/
├── cityeng/              ← ملفات المشروع (لا يصل إليها المتصفح)
│   ├── app/  bootstrap/  config/  database/  routes/  storage/  vendor/
│   └── .env
└── domains/example.com/
    └── public_html/      ← محتويات مجلد public/ فقط
        ├── index.php
        ├── .htaccess
        ├── build/  brand/  fonts/
        ├── sw.js  manifest.webmanifest
        └── storage → رابط رمزي
```

### تعديل `public_html/index.php`

بعد نقل `public/` إلى `public_html`، عدّلي المسارات في أعلى الملف:

```php
require __DIR__.'/../../cityeng/vendor/autoload.php';

$app = require_once __DIR__.'/../../cityeng/bootstrap/app.php';
```

> **بديل أبسط:** إن سمحت لكِ Hostinger بتغيير Document Root من
> hPanel ← Websites ← Manage ← وجّهي الدومين مباشرة إلى `cityeng/public`
> وتجاهلي هذا القسم بالكامل. هذا الخيار **أفضل وأأمن**.

---

## ٣. قاعدة البيانات

من hPanel ← Databases ← MySQL Databases:

1. أنشئي قاعدة بيانات ومستخدمًا وامنحيه كل الصلاحيات.
2. سجّلي الاسم والمستخدم وكلمة المرور — ستحتاجينها في `.env`.

---

## ٤. ملف `.env` على الخادم

أنشئي `/home/uXXXXXXX/cityeng/.env`:

```env
APP_NAME="City Engineering"
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://example.com

APP_LOCALE=ar
APP_FALLBACK_LOCALE=en
APP_TIMEZONE=Africa/Cairo

LOG_CHANNEL=stack
LOG_LEVEL=error

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=uXXXXXXX_cityeng
DB_USERNAME=uXXXXXXX_admin
DB_PASSWORD=كلمة_المرور_هنا

SESSION_DRIVER=database
CACHE_STORE=database
QUEUE_CONNECTION=database
FILESYSTEM_DISK=public

MAIL_MAILER=smtp
MAIL_HOST=smtp.hostinger.com
MAIL_PORT=465
MAIL_SCHEME=smtps
MAIL_USERNAME=no-reply@example.com
MAIL_PASSWORD=كلمة_مرور_البريد
MAIL_FROM_ADDRESS="no-reply@example.com"
MAIL_FROM_NAME="City Engineering"

VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT="mailto:no-reply@example.com"

VITE_VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY}"
```

> **مهم:** `APP_DEBUG=false` في الإنتاج — وإلا ظهرت تفاصيل الأخطاء والمسارات للزوار.

---

## ٥. أوامر التنصيب (عبر SSH أو Terminal في hPanel)

```bash
cd ~/cityeng

php artisan key:generate --force
php artisan migrate --force

# مستخدم مدير النظام الأول
php artisan tinker
```

داخل tinker:

```php
App\Models\User::create([
    'name'     => 'مدير النظام',
    'email'    => 'admin@example.com',
    'password' => 'كلمة-مرور-قوية-جدا',
    'role'     => App\Enums\UserRole::Admin,
    'phone'    => '01000000000',
]);
exit
```

> ⚠️ **لا تشغّلي `--seed` على الإنتاج** — سينشئ حسابات تجريبية بكلمة مرور `password`.

ثم:

```bash
php artisan storage:link
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

### مفاتيح الإشعارات

```bash
php artisan webpush:vapid
```

يكتب الأمر المفتاحين في `.env` تلقائيًا. **بعد توليدهما أعيدي بناء الواجهة محليًا
وارفعي `public/build` من جديد**، لأن المفتاح العام يُحقن داخل ملفات JavaScript وقت البناء:

```bash
# محليًا — بعد نسخ VAPID_PUBLIC_KEY من الخادم إلى .env المحلي
npm run build
```

ثم ارفعي `public/build/` و `public/sw.js` و `public/manifest.webmanifest`.

---

## ٦. الصلاحيات

```bash
chmod -R 755 ~/cityeng
chmod -R 775 ~/cityeng/storage ~/cityeng/bootstrap/cache
```

---

## ٧. تشغيل الطابور (Queue) — خطوة لا غنى عنها

**الإشعارات والبريد لن تُرسَل إطلاقًا بدون هذه الخطوة.**

على الاستضافة المشتركة لا يمكن تشغيل عملية دائمة، فنستخدم Cron.
من hPanel ← Advanced ← Cron Jobs، أضيفي مهمة كل دقيقة:

```
* * * * * /usr/bin/php /home/uXXXXXXX/cityeng/artisan queue:work --stop-when-empty --tries=3 --max-time=55 >> /dev/null 2>&1
```

`--stop-when-empty` تُنهي العملية بعد تفريغ الطابور، و `--max-time=55` تمنع تراكم
العمليات فوق بعضها إن طال التنفيذ.

### تنظيف دوري (اختياري لكن مستحسن)

```
0 3 * * * /usr/bin/php /home/uXXXXXXX/cityeng/artisan queue:prune-failed --hours=168 >> /dev/null 2>&1
```

> تأكدي من مسار PHP الصحيح — قد يكون `/opt/alt/php83/usr/bin/php` على بعض الخوادم.
> اعرفيه بتنفيذ `which php` في الطرفية.

---

## ٨. ملف `.htaccess`

ملف `public/.htaccess` الافتراضي من Laravel كافٍ. أضيفي إليه هذه الرؤوس لتحسين
الأمان والأداء:

```apache
<IfModule mod_headers.c>
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"

    # يسمح للـ Service Worker بالتحكم في الموقع كاملًا
    <FilesMatch "sw\.js$">
        Header set Service-Worker-Allowed "/"
        Header set Cache-Control "no-cache, no-store, must-revalidate"
    </FilesMatch>

    # أصول مبنية ببصمة في الاسم — تُخزَّن طويلًا بأمان
    <FilesMatch "\.(js|css|woff2|png|svg)$">
        Header set Cache-Control "public, max-age=31536000, immutable"
    </FilesMatch>
</IfModule>

# إجبار HTTPS
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>
```

> استثنِ `sw.js` من قاعدة الـ cache الطويلة (الترتيب أعلاه يفعل ذلك) وإلا
> علق المستخدمون على نسخة قديمة من التطبيق.

---

## ٩. التحقق بعد الرفع

| # | الفحص | المتوقع |
|---|---|---|
| 1 | فتح `https://example.com` | تظهر صفحة تسجيل الدخول بالعربية |
| 2 | `https://example.com/sw.js` | يفتح ملف JavaScript (لا 404) |
| 3 | `https://example.com/manifest.webmanifest` | يفتح ملف JSON |
| 4 | تسجيل الدخول بحساب المدير | تفتح لوحة المعلومات |
| 5 | إنشاء عميل ثم مهمة وإسنادها لفني | تُنشأ برقم `WO-…` |
| 6 | فحص جدول `jobs` بعد دقيقة | فارغ (الطابور يعمل) |
| 7 | وصول بريد الإسناد للفني | رسالة بتفاصيل المهمة |
| 8 | من الموبايل: تثبيت التطبيق ثم تفعيل الإشعارات | يظهر إشعار عند إسناد مهمة |

### التثبيت على الموبايل

- **أندرويد (Chrome):** القائمة ← «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».
- **آيفون (Safari):** زر المشاركة ← «إضافة إلى الشاشة الرئيسية».
  **على iOS لا تعمل الإشعارات إلا بعد التثبيت** — هذا قيد من Apple وليس خطأ في النظام.

---

## ١٠. التحديثات اللاحقة

```bash
# محليًا
composer install --optimize-autoloader --no-dev
npm run build

# ارفعي الملفات المتغيّرة، ثم على الخادم:
cd ~/cityeng
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

> بعد أي `npm run build` ارفعي `public/build/` **و** `public/sw.js` معًا —
> الملفان مرتبطان، ورفع أحدهما دون الآخر يكسر التخزين المؤقت للتطبيق المثبّت.

---

## حل المشكلات الشائعة

| العَرَض | السبب الأرجح | الحل |
|---|---|---|
| صفحة بيضاء | خطأ PHP و `APP_DEBUG=false` | راجعي `storage/logs/laravel.log` |
| `500` بعد النشر | كاش قديم | `php artisan optimize:clear` ثم أعيدي الـ cache |
| الأصول لا تُحمَّل (CSS/JS) | `public/build` غير مرفوع | ارفعي المجلد كاملًا |
| الإشعارات لا تصل | الطابور لا يعمل | تحققي من Cron ومن جدول `failed_jobs` |
| الإشعارات لا تصل رغم عمل الطابور | مفاتيح VAPID غير متطابقة | أعيدي البناء بعد توليد المفاتيح وارفعي `build/` |
| «موقعي الحالي» لا يعمل | الموقع على HTTP | فعّلي SSL |
| الصور المرفوعة لا تظهر | رابط `storage` مفقود | `php artisan storage:link` |
| التطبيق لا يتحدّث بعد النشر | `sw.js` مخزَّن مؤقتًا | تأكدي من رؤوس `no-cache` عليه في `.htaccess` |
| رموز `؟؟؟` بدل العربية | ترميز القاعدة | تأكدي أنها `utf8mb4_unicode_ci` |

---

## نسخ احتياطي

من hPanel ← Files ← Backups فعّلي النسخ التلقائي. وللنسخ اليدوي:

```bash
# قاعدة البيانات
mysqldump -u USER -p DATABASE > backup-$(date +%F).sql

# الملفات المرفوعة
tar -czf uploads-$(date +%F).tar.gz ~/cityeng/storage/app/public
```

يُنصح بجدولة نسخة يومية لقاعدة البيانات وأسبوعية للملفات.
