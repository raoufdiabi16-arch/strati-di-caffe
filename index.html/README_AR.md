# AIRVER — حزمة التأمين (الطلبات، الأسعار، المخزون، الدفع)

## ما الذي تغيّر؟
| قبل | بعد |
|---|---|
| المتصفح يكتب الطلب مباشرة في جدول `orders` بالسعر الذي يريده | المتصفح **لا يستطيع كتابة ولا قراءة** `orders`. كل طلب يمر عبر دالة `create-order` |
| السعر الإجمالي يأتي من المتصفح | الخادم **يعيد حساب** السعر (القطعة + خصم الدفع الإلكتروني + سعر التوصيل للولاية) |
| رقم الطلب `#AV-` + 6 أرقام يُولَّد في المتصفح | الخادم يولّد رقمًا عشوائيًا طويلًا `#AV-K7M2QX9P` |
| لا حماية من الطلبات الوهمية | Cloudflare Turnstile + حد للطلبات (حسب IP مُشفَّر وحسب رقم الهاتف) |
| «Reserved 9:59» شكلية وجدول حجوزات مفتوح للجميع | حُذف الجدول. المخزون الحقيقي يُنقَص ذريًا لحظة الطلب ولا يمكن بيع ما ليس موجودًا |
| الدفع: المبلغ ورابط العودة يأتيان من المتصفح | الخادم يرسل المبلغ الصحيح لـ Chargily، والـ webhook الموقّع هو **الوحيد** الذي يضع الطلب «مدفوعًا» بعد مطابقة المبلغ |
| لا ترويسات أمان | `_headers`: CSP صارم، منع التضمين في مواقع أخرى، HTTPS إجباري… |

## ترتيب التنفيذ (مهم: لا ترفع الموقع قبل الخطوة 6)
1. **نسخة احتياطية**: في Supabase → Database → Backups (أو انسخ المشروع لتجربة أولًا).
2. **SQL**: افتح SQL Editor والصق محتوى `sql/01_hardening.sql` ثم Run.
   إن ظهرت رسالة `AIRVER PRE-FLIGHT FAILED` فلم يتغير شيء، أرسل لي الرسالة.
3. **أسعار التوصيل والمخزون**: الأسعار الحالية في `shipping_rates` **مؤقتة** (800 للمنزل / 500 للمكتب لكل الولايات).
   ```sql
   update public.shipping_rates set home_fee = 600, office_fee = 400 where wilaya_code = 16;
   update public.hoodie_inventory set stock = 30 where size = 'M';   -- مخزونك الحقيقي
   update public.site_prices set price_cod = 8900, online_discount_pct = 5 where sku = 'hoodie';
   ```
4. **Turnstile**: لوحة Cloudflare → Turnstile → Add widget (اكتب نطاقك) → خذ **Site key** و**Secret key**.
   ضع الـ Site key في `site/index.html` مكان `TURNSTILE_SITE_KEY`.
5. **الأسرار والدوال** (Supabase CLI، أو Dashboard → Edge Functions → Secrets):
   ```bash
   supabase login
   supabase link --project-ref xmyojdmoyuhqfsfwwlqe
   supabase secrets set \
     TURNSTILE_SECRET="السر_من_Cloudflare" \
     IP_HASH_SALT="$(openssl rand -hex 24)" \
     SITE_URL="https://نطاقك" \
     ALLOWED_ORIGINS="https://نطاقك,https://اسم-موقعك.netlify.app" \
     CHARGILY_SECRET_KEY="المفتاح_السري_من_Chargily" \
     CHARGILY_MODE="test"          # غيّرها إلى live عند الإطلاق فقط
   supabase functions deploy create-order     --no-verify-jwt
   supabase functions deploy payment-webhook  --no-verify-jwt
   supabase functions delete create-checkout   # ⚠ الدالة القديمة تقبل مبلغًا من المتصفح: يجب حذفها
   ```
6. **الموقع**: اسحب مجلد `site` (فيه `index.html` و`_headers`) إلى Netlify → Deploys.

## اختبارات بعد النشر (10 دقائق)
- اطلب سترة بالدفع عند الاستلام: يجب أن يظهر الطلب في لوحتك بالسعر + التوصيل الصحيحين، وبرقم `#AV-XXXXXXXX`.
- جرّب مقاسًا نفد (`stock = 0`): يجب أن يظهر مشطوبًا ولا يمكن طلبه.
- **تأكد أن الجمهور لا يستطيع قراءة الطلبات** (يجب أن ترى خطأ صلاحيات أو `[]`):
  ```bash
  curl -s "https://xmyojdmoyuhqfsfwwlqe.supabase.co/rest/v1/orders?select=*" -H "apikey: ANON_KEY" -H "Authorization: Bearer ANON_KEY"
  curl -s -X POST "https://xmyojdmoyuhqfsfwwlqe.supabase.co/rest/v1/orders" -H "apikey: ANON_KEY" -H "Authorization: Bearer ANON_KEY" -H "Content-Type: application/json" -d '{"name":"x","total":1}'
  ```
- الدفع الإلكتروني بمفاتيح Chargily التجريبية: يجب أن ينتقل الطلب من `pending_payment` إلى `new` بعد الدفع.
- أرسل طلبين متتاليين بنفس الهاتف 6 مرات: السادس يجب أن يُرفض (حد 5 كل 24 ساعة).

## ⚡ السرعة (المرحلة 2): كيف صار الموقع مبنيًا
- `site/index.html` (167 كيلوبايت بدل 1.7 ميغابايت) + مجلد `site/assets/` فيه الصور (WebP مصغّرة) وملفا السكربت `app1*.js` و`app2*.js`.
- **ارفع المجلد `site` كاملًا دائمًا** (لا الملف وحده)، وإلا ستظهر الصفحة بلا صور ولا سكربتات.
- أسماء الملفات فيها بصمة (مثل `hoodie-1.427e890a.webp`) لذلك يخزنها المتصفح سنة كاملة بأمان.
- **صورك الحقيقية لاحقًا:** `python3 tools/optimize_images.py مجلد_الصور site/assets 900` يحوّلها إلى WebP خفيفة ويطبع لك اسم كل ملف لتضعه في `index.html`.
- خط Amiri العربي حُذف (كان يحمّل نحو 100 كيلوبايت لعبارة واحدة) واستُبدل بخط النظام. لإعادته أضف `&family=Amiri:ital@0;1` إلى رابط Google Fonts في `index.html`.
- خط Google يُحمَّل الآن دون أن يوقف أول عرض للصفحة.
- حلقة الحركة (`renderReveals`) كانت تعمل في كل إطار حتى لو لم تتحرك الصفحة، فصارت تنام بعد 0.7 ثانية من السكون وتستيقظ مع التمرير.
- طلبا `public_stock` و`shipping_rates` يُؤجَّلان إلى وقت فراغ المتصفح بدل أن يتزاحما مع أول عرض.


## 📄 صفحة السياسات (Shipping / Returns / Privacy / Terms)
- تفتح الآن كصفحة كاملة (لا نافذة صغيرة) من كل الروابط: التذييل، وروابط صفحة المنتج، وشريط الكوكيز، والبحث.
- شريط زجاجي ثابت في الأعلى: زر **Back** من اليسار، وتبويب بقطرة زجاجية تنزلق (ويمكن سحبها)، وشعار AIRVER من اليمين.
- زر الرجوع في الهاتف (السحب أو الزر) و`Esc` يغلقانها. وروابط مباشرة مثل `/#policies-returns` تفتحها على التبويب المطلوب.
- لتعديل نصوص السياسات: ابحث في `index.html` عن `class="pp-row"` وعدّل النص مباشرة (تعديل HTML العادي آمن).
- عدّلتُ نصّين فقط ليتوافقا مع الموقع الحالي: «58 ولاية» صارت «كل ولايات الجزائر»، وفقرة تكلفة التوصيل صارت تذكر أنها تختلف حسب الولاية ونوع التوصيل وتظهر في المجموع قبل التأكيد.
- أصلحتُ خطأً قديمًا كان يظهر في كل مرة تغلق فيها صفحة المنتج (`reservationLine is not defined`).

## ⚠ بعد أي تعديل على `index.html`
السكربتات الكبيرة صارت ملفات خارجية (`assets/app*.js`) ويسمح بها الـ CSP تلقائيًا، فتعديلها لا يحتاج شيئًا.
بقي داخل `index.html` سكربت صغير واحد مسموح ببصمته. إن عدّلت داخل `<script>` في `index.html` شغّل:
```bash
python3 tools/make_headers.py site/index.html
```
وارفع المجلد من جديد، وإلا سيحجب Netlify السكربت المعدَّل ويبدو الموقع ميتًا. تعديل النصوص أو CSS أو HTML العادي آمن دائمًا.

## ما لم أتمكن من التحقق منه (لأنه عندك لا عندي)
- لم أنفّذ الـ SQL على قاعدة Supabase الحقيقية ولا استدعيت Chargily/Turnstile الحقيقيين. المنطق مُختبَر بـ 25 اختبار وحدات + 28 اختبار شامل لمتصفح بخادم وهمي، لكن التجربة الأولى عندك يجب أن تكون بمفاتيح تجريبية.
- **المخزون**: إن كانت لوحتك تُنقص المخزون يدويًا عند تأكيد الطلب فسيُحسب مرتين. أخبرني.
- **كلمات الحالة**: الدوال تستخدم `new` و`pending_payment` و`cancelled`. إن كان جدول `orders` يقيّدها بكلمات أخرى (CHECK) أخبرني.
- `review_check_order` و`submit_review` يجب أن تكونا `SECURITY DEFINER` وإلا ستتوقف المراجعات بعد منع القراءة العامة لـ `orders`.
- روابط العودة بعد الدفع تعتمد على `SITE_URL` (يجب أن يطابق نطاقك بالضبط).
