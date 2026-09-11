# Seed Data & Decoy Files — Design Reference (Step 9)

هذا الملف يوثّق المحتوى **بالضبط** للملفات الثلاثة وبيانات المستخدمين، حتى
تبقى `preview-render.sh` / `previewService.js` deterministic بعد كل reset.
لا شيء هنا عشوائي أو مولّد وقت التشغيل.

---

## مسار الملفات داخل الـ container

كل الملفات التالية موجودة تحت `/app/data/fixtures/` داخل صورة
`techvault-api` (نُسخت وقت البناء، للقراءة فقط — read-only مقصودًا، الحقن
بيقرأها بس مش بيعدلها):

```
/app/data/fixtures/
├── render_cache.tmp          ← ملف 1: decoy عادي
├── worker_status.log         ← ملف 2: decoy يلمّح لبنية داخلية
└── YmlsbGluZy1ndy5jb25m      ← ملف 3: اسمه Base64، فك الترميز = billing-gw.conf
```

بعد ما اللاعب يفك اسم الملف التالت (`YmlsbGluZy1ndy5jb25m` → `billing-gw.conf`)،
لازم يقرأه بنفس آلية الحقن. **لكن الملف الفعلي مخزّن باسمه المُرمّز على
القرص** — يعني لازم يعمل `cat` على الاسم المُرمّز *كما هو* (مفيش ملف اسمه
`billing-gw.conf` فعليًا موجود)، وده تفصيلة مهمة لازم تتوضح صراحة في
Official Solution لاحقًا، وتترك من غير توضيح في الـ README الخاص باللاعب.

---

## محتوى كل ملف

### 1) `render_cache.tmp` (Decoy #1)
```
# preview render cache — safe to delete
last_cleanup: 2026-08-30T02:00:00Z
entries: 0
```
لا قيمة استغلالية. الغرض: يبدو كملف نظام طبيعي تمامًا.

### 2) `worker_status.log` (Decoy #2)
```
[worker] preview render pool: 2/2 healthy
[worker] last job duration: 340ms
[worker] upstream services reachable: true
```
يلمّح بشكل غامض لوجود "upstream services" من غير أي اسم أو تفصيل — بيبني
توقّع عند اللاعب إن فيه خدمات داخلية، لكن من غير معلومة قابلة للاستغلال.

### 3) `YmlsbGluZy1ndy5jb25m` (المفتاح — بعد فك الـ Base64 = `billing-gw.conf`)
```
# billing-gw internal configuration
service: billing-gateway
upstream = http://billing-core.techvault.local:5000
account_ref = 39303432
```

- `upstream` → hostname الخدمة الداخلية الحقيقي (نفس الاسم المستخدم في
  `docker-compose.yml` كـ container name + المنفذ 5000 بتاع `billing-core`).
- `account_ref` → مُرمّز بصيغة **hex** (فك الترميز = `9042`)، وهو
  `accountId` الصحيح المطلوب استخدامه مع `billing-core.accountBalance`.

**ملاحظة معمارية:** `billing-core.techvault.local` هو اسم DNS داخلي بديل
لنفس container name (`billing-core`) — يُضاف كـ network alias في
`docker-compose.yml` (تحديث بسيط مطلوب) بدل الاعتماد على اسم الـ container
المباشر، عشان يبان كـ FQDN داخلي واقعي وليس مجرد اسم container تقني.

---

## بيانات المستخدمين (Seed Users)

| username | password | role | ملاحظات |
|---|---|---|---|
| `alice` | `Sup3rSecure!2026` (bcrypt hash فعلي مخزّن) | CUSTOMER | الحساب المستهدف — اللاعب يعرف `username=alice` بس مش الباسورد |
| `support_bot` | (باسورد عشوائي طويل، غير معروف حتى للمطور) | SUPPORT | حساب decoy، موجود بس عشان الكتالوج يبان واقعي (مفيش دور له في المسار المقصود) |

**نقطة مهمة:** اللاعب المفروض يعرف `username=alice` بس (من صفحة "نسيت كلمة
المرور" أو من الـ scenario نفسه في الـ README) — الباسورد الحقيقي غير معروف
ومش جزء من المسار المقصود؛ الـ auth bypass بيتجاوزه بالكامل.

---

## بيانات اللابتوبات (Seed Laptops)
بيانات عرض فقط، لا علاقة لها بالثغرات — 4-5 لابتوبات بأسعار/مواصفات واقعية،
تُستخدم فقط كسياق لصفحة المنتج التي منها يُستدعى `fetchCompetitorPrice`
منطقيًا (زر "قارن مع المنافسين" في صفحة تفاصيل لابتوب معيّن، مثلاً
`productId = "LP-2049"`).
