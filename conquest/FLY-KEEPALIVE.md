# تشغيل سيرفر Fly.io وإبقاؤه لا ينطفئ

كل ما هنا يُنفَّذ في **Terminal على جهازك** (macOS). لا لوحة تحكّم، ولا إعداد يدوي.

---

## أمر واحد: انشر ثم أبقِه حيًّا

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ykashkush2014-blip/search-arena/arena/07357b19-search-arena/conquest/update-fly.sh) \
  && nohup bash -c 'curl -fsSL https://raw.githubusercontent.com/ykashkush2014-blip/search-arena/arena/07357b19-search-arena/conquest/keep-fly.sh | bash' > ~/conquest-keep.log 2>&1 &
```

ما يفعله: ينزّل آخر نسخة من الفرع، ينشر على `conquest-online-8129`، يضبط
`auto_stop_machines=false`، ثم يترك عملية مراقبة في الخلفية تفحص `/health`
كل 30 ثانية وتعيد تشغيل الماشينة إن سقطت.

بعد دقيقة، افتح: **https://conquest-online-8129.fly.dev**

### إن أردت أن تراه يعمل أمامك (لا في الخلفية)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ykashkush2014-blip/search-arena/arena/07357b19-search-arena/conquest/keep-fly.sh | bash) --watch
```

اتركه مفتوحًا؛ كل سطر `✓` يعني أن الخادم استجاب. أوقفه بـ `Ctrl-C` (المراقبة
نفسها لا تكلّف شيئًا).

### لفحص الحالة فقط

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ykashkush2014-blip/search-arena/arena/07357b19-search-arena/conquest/keep-fly.sh | bash) --status
```

---

## لماذا كان ينطفئ؟ ثلاث أسباب، كلها مُصلحة

| السبب | ما كان يحدث | الإصلاح |
|---|---|---|
| `auto_stop_machines` افتراضيه `true` في Fly | الماشينة تتوقف بعد دقائق من الخمول — أشهر سبب لـ«الخادم أطفأ نفسه» | مثبّت `false` في `fly.toml` **و** يُفرض بالأمر بعد كل نشر (`services update`) |
| لا سقف لعدد الغرف | كل غرفة ≈ 50MB في الذاكرة؛ ليلة من إنشاء الغرف تُنهك 512MB فيقتل Fly العملية (OOM). النتيجة نفسها: الخادم اختفى | `MAX_ROOMS=6` في `fly.toml`؛ الغرفة السابعة تُرفَض برسالة بدل أن تقتل الخادم |
| ماشينتان بعد النشر | الغرف في ذاكرة العملية، فماشينتان = عالمان منفصلان: صديقان لا يلتقيان أبدًا | `keep-fly.sh` يفرض `scale count 1` ويتحقّق من `boot` واحد |
| اسم التطبيق في `fly.toml` كان `conquest-online` | أي `fly deploy` من داخل مجلد `conquest` يستهدف تطبيقًا آخر (أو ينشئ واحدًا)، والتطبيق الحقيقي لا يتغيّر | صُحّح إلى `conquest-online-8129`، و`[build]` الفارغ صار `dockerfile = "Dockerfile"` |

وهناك سبب رابع جعل **كل نشر سابق بلا أثر**: الخادم كان يقدّم `index.html`
القديم (قالب 20KB يحمّل `./js/main.js`) بينما كل الإصلاحات كانت في
`dist/conquest.html`. الآن يُبنى الملفان من قالب واحد (`index.src.html`)
وهما متطابقان بايت ببايت — يتحقّق من ذلك `conquest/.smoketest/server.mjs`.

---

## إن لم يظهر الموقع

```bash
fly logs -a conquest-online-8129 --no-tail     # آخر الأخطاء
fly status -a conquest-online-8129             # هل الماشينة started؟
curl -s https://conquest-online-8129.fly.dev/health
```

أكثر سببين متبقّيين:

1. **الحساب بلا طريقة دفع** — Fly لا تشغّل الماشينة على حساب مجاني غير موثّق.
   أضف بطاقة من https://fly.io/dashboard (لن تُخصم في الخطة المجانية).
2. **الماشينة بدأت للتوّ** — انتظر 30 ثانية وأعد `curl` أعلاه.

---

## ما تحقّق منه فعلًا (بلا مبالغة)

- الخادم يقلع ويخدم نفس الملف الذي يُسلَّم للاعب — 10/10 في `.smoketest/server.mjs`، بما فيها فتح WebSocket حقيقي وإنشاء غرفة وإثبات أن الغرفة الثانية تُرفَض وأن العملية تبقى حيّة.
- `keep-fly.sh` جُرِّب بأداة `fly` مُقلّدة: الحالة الحيّة، الحالة الميتة، الماشينة المتوقفة (تُشغَّل)، والماشينتان (تُقلَّصان).
- حجم الصورة بعد التنظيف: 26 ملفًا، ≈6MB. كان `node_modules` (22MB من تبعيات الاختبار) يُنسخ إليها بلا داعٍ.

**لم أستطع** التحقّق من النشر الحقيقي: الشبكة هنا لا تصل إلى `fly.io` ولا إلى
`*.fly.dev`، ولا يوجد `fly` ولا مفتاح Fly في هذه البيئة. عندك الأمر أعلاه،
ومخرجاتك هي الحكم — إن ظهر خطأ، الصقه لي وأصلحه.
