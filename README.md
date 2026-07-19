# City Engineering — نظام إدارة التركيب والصيانة

نظام إدارة أوامر العمل لشركة City Engineering (أجهزة UPS): المدير ينشئ المهمة ويُسندها لفني،
والفني ينفّذها من موبايله ويرفع تقريرًا فنيًا بالقراءات والصور وتوقيع العميل.

**Laravel 12 API + React 19 PWA** — واجهة عربية RTL، تعمل من الموبايل كتطبيق مثبّت على الشاشة الرئيسية.

---

## المزايا المنفّذة

| المجال | التفاصيل |
|---|---|
| **المستخدمون** | ثلاثة أدوار: مدير النظام / مدير / فني — بصلاحيات مفصولة على مستوى المسار والصف |
| **العملاء** | بيانات كاملة + إحداثيات وموقع على الخريطة + رقم واتساب |
| **المهام** | أمر عمل مرقّم `WO-2026-0001` بنوع وأولوية وموعد وبيانات جهاز |
| **دورة الحياة** | بانتظار القبول ← تم القبول ← في الطريق ← جارٍ العمل ← منتهية (أو ملغاة) |
| **آلة الحالة** | انتقالات محكومة — لا يمكن تخطّي خطوة ولا إعادة فتح مهمة منتهية |
| **سجل التتبّع** | كل تغيير حالة يُسجَّل بمن نفّذه ووقته وإحداثياته |
| **التقارير الفنية** | قراءات مُهيكلة (جهد/تحميل/بطاريات/Backup) + تشخيص + إنهاء + قطع غيار + توقيع |
| **المرفقات** | صور قبل/بعد + مستندات مرفوعة من كاميرا الموبايل |
| **الإشعارات** | داخل النظام + بريد إلكتروني + **Web Push** (تصل والتطبيق مغلق) |
| **واتساب** | روابط `wa.me` جاهزة بالرسالة: المدير→الفني، الفني→المدير، المدير→العميل |
| **الخرائط** | زر «الاتجاهات» يفتح Google Maps على موقع العميل |
| **لوحة المعلومات** | إحصائيات، توزيع الحالات، حِمل العمل على الفنيين، المهام المتأخرة |
| **سجل التدقيق** | `activity_logs` لكل إنشاء/تعديل/تغيير حالة |

---

## التشغيل محليًا

### المتطلبات
PHP ‏8.3+ · Composer · MySQL ‏8+ · Node ‏20+

### الخطوات

```bash
composer install
npm install

cp .env.example .env
php artisan key:generate

# أنشئ قاعدة البيانات ثم اضبط DB_* في ملف .env
php artisan migrate --seed

# مفاتيح إشعارات الويب
php artisan webpush:vapid

php artisan storage:link
npm run build

php artisan serve
```

> **على ويندوز:** إن فشل `webpush:vapid` بخطأ OpenSSL، اضبط المتغيّر
> `OPENSSL_CONF` على مسار `openssl.cnf` داخل مجلد PHP قبل تنفيذ الأمر.

### حسابات تجريبية (بعد `--seed`)

| الدور | البريد | كلمة المرور |
|---|---|---|
| مدير النظام | `admin@cityeng.local` | `password` |
| مدير | `manager@cityeng.local` | `password` |
| فني | `tech1@cityeng.local` | `password` |

### التطوير

```bash
npm run dev            # Vite مع HMR
php artisan queue:work # لازم يعمل حتى تُرسَل الإشعارات
```

---

## الاختبارات

```bash
php artisan test              # 70 اختبار PHP (Pest)
npm run typecheck             # فحص أنواع TypeScript

# اختبارات المتصفح — تحتاج السيرفر شغالًا على المنفذ 8000
node tests/Browser/uiguard.mjs   # التحقق من الصلاحيات
node tests/Browser/uie2e.mjs     # دورة الحياة كاملة
node tests/Browser/uicheck.mjs   # لقطات شاشة لكل الصفحات
```

> اختبارات PHP تعمل على قاعدة `city_eng_test` في **MySQL** وليس SQLite،
> لأن ترتيب المهام يستخدم دالة `FIELD()` الخاصة بـ MySQL.

---

## بنية المشروع

```
app/
  Enums/          UserRole · TaskStatus (آلة الحالة) · TaskType · TaskPriority
  Models/         User · Customer · Task · TaskReport · TaskStatusLog · TaskAttachment
  Services/       TaskWorkflow (المالك الوحيد لتغيير الحالة) · WhatsAppLinkBuilder
  Notifications/  TaskAssigned · TaskStatusChanged  (database + mail + webpush)
  Http/           Controllers/Api · Resources · Middleware/EnsureUserRole

resources/js/
  lib/            api · auth · queries (TanStack Query) · domain (ألوان الحالات) · push · format
  components/     AppLayout · TaskCard · StatusRail · ReportForm · SignaturePad · Modal · Toast
  pages/          Login · Dashboard · TaskList · TaskDetail · TaskForm · CustomerList · UserList
  sw.ts           Service Worker — يستقبل الـ Push ويفتح المهمة عند الضغط

docs/
  requirements-analysis.md   تحليل المتطلبات الكامل والفجوات
  deployment-hostinger.md    دليل الرفع خطوة بخطوة
```

### قرارات تصميمية تستحق المعرفة

- **`TaskWorkflow` هو المكان الوحيد الذي يغيّر حالة المهمة.** الـ Controllers لا تكتب
  `status` مباشرة — هذا ما يضمن تطابق الطوابع الزمنية وسجل التتبّع والإشعارات دائمًا.
- **القراءات الفنية أعمدة مُهيكلة لا نص حر** — حتى يمكن لاحقًا تحليل اتجاه كل جهاز
  («جهد البطاريات ينخفض منذ ٣ زيارات ← سيتعطل قريبًا»).
- **واتساب عبر روابط `wa.me` لا عبر WhatsApp Business API** — بلا تكلفة لكل رسالة
  وبلا توثيق أعمال من Meta، والمقابل أن المُرسِل يضغط «إرسال» بنفسه.
- **الـ Service Worker يُنسخ إلى جذر الموقع** (`scripts/publish-sw.mjs`) لأن نطاق
  الـ SW محصور بمساره، ولو بقي داخل `/build` لما تحكّم في التطبيق كله.
- **موقع المهمة يرث موقع العميل** إن لم يُدخله المدير — حتى لا يصل الفني لعنوان فارغ.

---

## الرفع على Hostinger

راجع **[docs/deployment-hostinger.md](docs/deployment-hostinger.md)** — يشرح رفع الملفات،
توجيه الدومين إلى `public/`، إعداد قاعدة البيانات، تشغيل الطابور عبر Cron، وضبط SMTP.

---

## سجل الأصول

الجهاز كيان مستقل بسيريال، لا حقول نصية مكرّرة على كل مهمة. كل مهمة تُربط
بجهاز واحد (`tasks.asset_id`)، فيصبح لكل جهاز **سجل صيانة كامل** على
`/manager/assets/{id}`.

**الضمان يُحتسب من تاريخ البيع** — قرار عمل، لا افتراض تقني. وله ثلاث حالات
لا حالتين: `ساري`، `منتهي`، و`غير محدد` حين لا يوجد تاريخ بيع مسجّل. اعتبار
«غير محدد» انتهاءً يعني تحميل العميل تكلفة زيارة مشمولة بالضمان، لذلك تُعرَض
الحالة الثالثة صراحةً في كل مكان.

**البطاريات ليست أصولًا** — تُدار كأصناف مخزون. ما فعلته الزيارة بالبطاريات
يبقى في التقرير الفني.

ترحيل البيانات القديمة تم في
[`2026_07_19_000008_move_task_device_fields_into_assets`](database/migrations/2026_07_19_000008_move_task_device_fields_into_assets.php):
يُجمَّع بالسيريال حين يوجد، وإلا بالعميل+الماركة+الموديل+القدرة. لا يُحذف عمود
قبل نسخ محتواه، و`down()` يعيد البيانات إلى أعمدتها.

---

## ما لم يُنفَّذ بعد

هذه المرحلة تغطي **دورة التركيب والصيانة** وسجل الأصول. الموديولات التالية
مؤجّلة عمدًا (راجع [docs/requirements-analysis.md](docs/requirements-analysis.md)):

المخزون والمشتريات · العقود · الحسابات والخزنة · إدارة العُهد ·
عروض الأسعار وأوامر البيع · الموارد البشرية · بوابة العميل
