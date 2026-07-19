# الرفع على Hostinger Business — دليل خطوة بخطوة

مكتوب خصيصًا لخطة **Business Hosting** (استضافة مشتركة، ليست VPS)، وبالاعتماد على
**Git** للنشر، وبأدوات **مجانية بالكامل** — لا اشتراكات إضافية.

---

## أولًا: ما لا يمكن عمله على الاستضافة المشتركة

اقرئي هذا القسم أولًا — هذه قيود المنصّة نفسها وليست نقصًا في النظام.
لحسن الحظ **كل قيد منها له بديل مجاني منفّذ بالفعل** في المشروع.

| ❌ غير متاح | لماذا | ✅ البديل المستخدم |
|---|---|---|
| **عملية دائمة للطابور** `queue:work` | لا يُسمح بعمليات خلفية دائمة (لا Supervisor ولا systemd) | **Cron كل دقيقة** بـ `--stop-when-empty` — منفّذ ومُختبَر |
| **بناء الواجهة على الخادم** (`npm run build`) | Node.js غير متاح | **البناء محليًا** ورفع الناتج داخل الـ Git — مضبوط بالفعل |
| **Redis / Memcached** | خدمات غير متاحة | `database` driver للكاش والجلسات والطابور — مضبوط |
| **Laravel Horizon** | يحتاج Redis + عملية دائمة | غير مطلوب أصلًا بهذا الحجم |
| **WebSockets / Reverb** (تحديث لحظي) | يحتاج منفذًا ومعالجة دائمة | **Polling** كل ٤٥–٦٠ ثانية + **Web Push** للتنبيه الفوري |
| **صلاحية root / تثبيت حزم نظام** | استضافة مشتركة | لا حاجة — كل الاعتماديات عبر Composer |
| **`php artisan schedule:work`** | عملية دائمة | Cron مباشر لكل مهمة (غير مستخدم حاليًا) |
| **رفع ملفات ضخمة** | حد `upload_max_filesize` (غالبًا 64–128MB) | الحد في النظام **8MB للصورة** — أقل بكثير من السقف |

### قيود أخرى تستحق الانتباه

- **حد عدد العمليات (Entry Processes)** — لو تراكمت مهام Cron فوق بعضها قد يرفض
  الخادم طلبات. لهذا يستخدم أمر الطابور `--max-time=55` لينتهي قبل الدورة التالية.
- **مهلة تنفيذ PHP** — عادة 120–300 ثانية. لا يؤثر على النظام لأن أثقل عملية
  (رفع الصور) أسرع من ذلك بكثير.
- **`exec` / `proc_open`** قد تكون معطّلة — لا يستخدمها النظام.

---

## ثانيًا: الخدمات المجانية المستخدمة

كل ما يحتاجه النظام مجاني أو ضمن خطتك الحالية:

| الخدمة | التكلفة | ملاحظات |
|---|---|---|
| **إشعارات Web Push** | **مجانية تمامًا** | معيار متصفحات — بلا Firebase ولا اشتراك |
| **واتساب** (روابط `wa.me`) | **مجانية تمامًا** | بلا WhatsApp Business API وبلا توثيق Meta |
| **Google Maps** (روابط اتجاهات) | **مجانية تمامًا** | روابط فقط — لا نستخدم Maps JS API المدفوعة |
| **شهادة SSL** | **مجانية** | Let's Encrypt من hPanel |
| **البريد الإلكتروني** | ضمن خطتك | حسابات بريد Business Hosting + SMTP |
| **قاعدة البيانات MySQL** | ضمن خطتك | — |
| **استضافة الكود على GitHub** | **مجانية** | مستودع خاص مجاني |
| **الخط العربي Cairo** | **مجاني** | محفوظ داخل المشروع — لا يُحمّل من الخارج |

> **لا يوجد أي بند يتطلب دفعًا إضافيًا.**

---

## ثالثًا: المتطلبات قبل البدء

| المتطلب | القيمة | أين تُضبط |
|---|---|---|
| إصدار PHP | **8.3+** | hPanel ← Advanced ← PHP Configuration |
| Extensions | `openssl` `pdo_mysql` `mbstring` `fileinfo` `curl` `zip` `gd` `bcmath` | نفس الصفحة ← تبويب Extensions |
| **SSL** | **إلزامي** | hPanel ← Security ← SSL |
| SSH | مفعّل | hPanel ← Advanced ← SSH Access |

> ⚠️ **بدون SSL لن تعمل الإشعارات ولا زر «موقعي الحالي» إطلاقًا.**
> المتصفحات تمنع هذه الميزات على HTTP. فعّلي الشهادة المجانية أولًا.

---

## رابعًا: تجهيز نسخة النشر محليًا

قبل كل رفع، ابني الواجهة محليًا واحفظي الناتج في Git:

```bash
npm run build
git add public/build public/sw.js public/manifest.webmanifest
git commit -m "build: تحديث أصول الواجهة"
git push
```

> **لماذا نرفع ناتج البناء داخل Git؟** لأن الاستضافة المشتركة لا تحتوي Node.js،
> فلا يمكن تنفيذ `npm run build` على الخادم. الناتج مرفوع عمدًا (راجع `.gitignore`).

---

## خامسًا: أول نشر على الخادم

### ١) توجيه الدومين إلى مجلد `public`

من hPanel ← Websites ← Manage ← **Change Document Root**، اضبطيه على:

```
/home/uXXXXXXX/cityeng/public
```

> هذا **أهم إعداد أمني** في الدليل. لو بقي الدومين على `public_html` فسيصبح ملف
> `.env` وكل ملفات المشروع قابلة للتحميل من المتصفح.
>
> إن لم تسمح خطتك بتغيير Document Root، راجعي **الملحق (أ)** في نهاية الملف.

### ٢) سحب المشروع عبر Git

اتصلي بـ SSH (بيانات الاتصال في hPanel ← Advanced ← SSH Access):

```bash
cd ~
git clone https://github.com/Shahdhenagl/ERP_ENG.git cityeng
cd cityeng
```

> **مستودع خاص؟** أنشئي Personal Access Token من GitHub
> (Settings ← Developer settings ← Tokens ← صلاحية `repo`) واستخدميه ككلمة مرور.
> أو استخدمي **hPanel ← Advanced ← Git** لربط المستودع من الواجهة مباشرة.

### ٣) قاعدة البيانات

من hPanel ← Databases ← MySQL Databases: أنشئي قاعدة ومستخدمًا، وامنحيه كل الصلاحيات.
سجّلي الاسم والمستخدم وكلمة المرور.

### ٤) ملف البيئة

```bash
cp .env.example .env
nano .env
```

املئيه هكذا:

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
DB_PASSWORD=كلمة_المرور

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

> **`APP_DEBUG=false` إلزامي في الإنتاج** — وإلا ظهرت مسارات الخادم وتفاصيل
> الأخطاء لأي زائر.

### ٥) التنصيب

```bash
bash deploy.sh
php artisan key:generate --force
```

### ٦) مفاتيح الإشعارات — انتبهي للترتيب

```bash
php artisan webpush:vapid
cat .env | grep VAPID_PUBLIC_KEY
```

انسخي المفتاح العام، ثم **محليًا على جهازك**:

1. الصقيه في ملف `.env` المحلي مقابل `VAPID_PUBLIC_KEY`
2. نفّذي `npm run build`
3. ارفعي الناتج: `git add public/build public/sw.js && git commit -m "build: مفتاح الإشعارات" && git push`
4. على الخادم: `git pull && php artisan optimize:clear`

> **لماذا هذه الدورة؟** المفتاح العام يُحقن داخل ملفات JavaScript **وقت البناء**،
> فلا يكفي وجوده في `.env` على الخادم. هذا أكثر سبب تفشل معه الإشعارات.

### ٧) إنشاء أول مستخدم

```bash
php artisan tinker
```

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

> ⚠️ **لا تنفّذي `--seed` على الإنتاج** — ينشئ حسابات تجريبية كلمة مرورها `password`.

---

## سادسًا: تشغيل الطابور — خطوة لا غنى عنها

**بدون هذه الخطوة لن يصل أي إشعار ولا أي بريد إلكتروني إطلاقًا.**

اعرفي مسار PHP الصحيح أولًا:

```bash
which php
```

ثم من hPanel ← Advanced ← **Cron Jobs**، أضيفي مهمة **كل دقيقة**:

```
* * * * * /usr/bin/php /home/uXXXXXXX/cityeng/artisan queue:work --stop-when-empty --tries=3 --max-time=55 >> /dev/null 2>&1
```

- `--stop-when-empty` تُنهي العملية فور تفريغ الطابور (لا تبقى معلّقة)
- `--max-time=55` تمنع تراكم العمليات فوق بعضها
- `--tries=3` تعيد المحاولة عند فشل مؤقت في SMTP

### مهمة تنظيف أسبوعية (مستحسنة)

```
0 3 * * * /usr/bin/php /home/uXXXXXXX/cityeng/artisan queue:prune-failed --hours=168 >> /dev/null 2>&1
```

---

## سابعًا: ملف `.htaccess`

أضيفي هذه الرؤوس إلى `public/.htaccess`:

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

    # أصول مبنية ببصمة في اسمها — آمن تخزينها طويلًا
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

> ترتيب القواعد مهم: استثناء `sw.js` مكتوب **قبل** قاعدة التخزين الطويل، وإلا
> علق المستخدمون على نسخة قديمة من التطبيق بعد كل تحديث.

---

## ثامنًا: التحقق بعد الرفع

| # | الفحص | المتوقع |
|---|---|---|
| 1 | `https://example.com` | صفحة تسجيل الدخول بالعربية |
| 2 | `https://example.com/.env` | **404 أو 403** — لو نزّل الملف فالـ Document Root خاطئ ❗ |
| 3 | `https://example.com/sw.js` | ملف JavaScript (لا 404) |
| 4 | `https://example.com/manifest.webmanifest` | ملف JSON |
| 5 | تسجيل الدخول بحساب المدير | تفتح لوحة المعلومات |
| 6 | إنشاء عميل ثم مهمة وإسنادها | تُنشأ برقم `WO-…` |
| 7 | بعد دقيقة: `php artisan queue:monitor` | الطابور فارغ |
| 8 | وصول بريد الإسناد للفني | رسالة بتفاصيل المهمة |
| 9 | من الموبايل: تثبيت ثم تفعيل الإشعارات | يصل إشعار عند إسناد مهمة |

### التثبيت على الموبايل

- **أندرويد (Chrome):** القائمة ← «تثبيت التطبيق»
- **آيفون (Safari):** زر المشاركة ← «إضافة إلى الشاشة الرئيسية»
  **على iOS لا تعمل الإشعارات إلا بعد التثبيت** — قيد من Apple، ليس خطأً في النظام.

---

## تاسعًا: التحديثات اللاحقة

**محليًا:**

```bash
npm run build
git add -A
git commit -m "وصف التغيير"
git push
```

**على الخادم:**

```bash
cd ~/cityeng
git pull
bash deploy.sh
```

> `deploy.sh` يتولّى: تنصيب اعتماديات PHP، تنفيذ الـ migrations، إعادة بناء
> الكاش، وضبط الصلاحيات.

---

## حل المشكلات الشائعة

| العَرَض | السبب الأرجح | الحل |
|---|---|---|
| صفحة بيضاء | خطأ PHP و `APP_DEBUG=false` | `tail -50 storage/logs/laravel.log` |
| `500` بعد النشر | كاش قديم | `php artisan optimize:clear` ثم أعيدي `deploy.sh` |
| الأصول لا تُحمَّل | `public/build` غير مرفوع في Git | ابني محليًا وارفعي المجلد |
| **الإشعارات لا تصل** | الطابور لا يعمل | راجعي Cron وجدول `failed_jobs` |
| الإشعارات لا تصل رغم عمل الطابور | مفاتيح VAPID غير متطابقة | أعيدي البناء محليًا بعد نسخ المفتاح العام (قسم ٦) |
| «موقعي الحالي» لا يعمل | الموقع على HTTP | فعّلي SSL |
| الصور المرفوعة لا تظهر | رابط `storage` مفقود | `php artisan storage:link` |
| التطبيق لا يتحدّث | `sw.js` مخزَّن مؤقتًا | تأكدي من رؤوس `no-cache` عليه |
| `؟؟؟` بدل العربية | ترميز القاعدة | `utf8mb4_unicode_ci` |
| `composer: command not found` | غير مثبّت | `curl -sS https://getcomposer.org/installer \| php -- --install-dir=$HOME` |

---

## عاشرًا: النسخ الاحتياطي

فعّلي النسخ التلقائي من hPanel ← Files ← Backups. وللنسخ اليدوي:

```bash
mysqldump -u USER -p DATABASE > ~/backup-$(date +%F).sql
tar -czf ~/uploads-$(date +%F).tar.gz ~/cityeng/storage/app/public
```

> الكود محفوظ في Git، لكن **قاعدة البيانات والصور المرفوعة ليست كذلك** —
> هذان ما يجب نسخهما. يُنصح بنسخة يومية للقاعدة وأسبوعية للملفات.

---

## الملحق (أ): إذا تعذّر تغيير Document Root

إن لم تسمح الخطة بتوجيه الدومين إلى `cityeng/public`:

1. اسحبي المشروع في `~/cityeng` (خارج `public_html`).
2. انسخي محتويات `public/` إلى `public_html/`:

   ```bash
   cp -r ~/cityeng/public/* ~/domains/example.com/public_html/
   ```

3. عدّلي المسارات في `public_html/index.php`:

   ```php
   require __DIR__.'/../../cityeng/vendor/autoload.php';
   $app = require_once __DIR__.'/../../cityeng/bootstrap/app.php';
   ```

4. أعيدي إنشاء رابط التخزين:

   ```bash
   rm -f ~/domains/example.com/public_html/storage
   ln -s ~/cityeng/storage/app/public ~/domains/example.com/public_html/storage
   ```

5. **كرّري نسخ محتويات `public/` بعد كل تحديث** — هذا عيب هذه الطريقة،
   ولهذا يبقى تغيير Document Root هو الخيار الأفضل.
