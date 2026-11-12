# 🧠 My Code AI — نموذج ذكاء اصطناعي خاص للبرمجة، مبني من الصفر

<div dir="rtl">

هذا نموذج لغوي (Transformer من نوع GPT) **مبني ومدرَّب من الصفر بالكامل**:

- ❌ لا يستخدم أي نموذج آخر (لا OpenAI، لا Claude، لا Llama، لا HuggingFace).
- ❌ لا أوزان مدرَّبة مسبقًا (pretrained weights) — يبدأ بأرقام عشوائية.
- ❌ لا يتصل بالإنترنت ولا بأي API — يعمل محليًا على جهازك فقط.
- ✅ الـ Tokenizer (BPE) مكتوب من الصفر ومدرَّب على بياناتك.
- ✅ بنية النموذج مكتوبة من الصفر (RoPE + RMSNorm + SwiGLU + Causal Attention).
- ✅ كل ما "يعرفه" النموذج تعلّمه من الكود الذي دُرِّب عليه.

المكتبة الوحيدة المستخدمة هي **PyTorch** (مكتبة رياضيات للمصفوفات والاشتقاق التلقائي، وليست نموذجًا).

## الملفات

| الملف | الوظيفة |
|---|---|
| `tokenizer.py` | Byte-level BPE tokenizer مكتوب من الصفر |
| `model.py` | بنية النموذج (CodeGPT) |
| `prepare_data.py` | يجمع الكود، يدرّب الـ tokenizer، ويحوّل البيانات لأرقام |
| `train.py` | تدريب النموذج من الصفر (مع استئناف تلقائي) |
| `generate.py` | إكمال الكود من سطر الأوامر |
| `server.py` + `web/index.html` | واجهة ويب لتجربة النموذج |
| `checkpoints/model.pt` | أوزان النموذج المدرَّب (ملكك أنت) |
| `data/tokenizer.json` | المفردات التي تعلّمها الـ tokenizer |

## التشغيل

```bash
cd my_code_ai
pip install -r requirements.txt

# 1) تجهيز البيانات (افتراضيًا: مكتبة بايثون القياسية والحزم المثبتة)
python prepare_data.py
#    أو درّبه على مشاريعك أنت ليتعلّم أسلوبك:
python prepare_data.py --src ~/my_projects --ext .py .js .ts

# 2) التدريب
python train.py --preset cpu-small     # على المعالج (CPU)
python train.py --preset gpu-base      # إذا عندك كرت شاشة NVIDIA

# 3) الاستخدام
python generate.py "def fibonacci(n):"
python generate.py                      # وضع تفاعلي
python server.py --port 8000            # واجهة ويب: http://localhost:8000
```

## 📊 نتائج التدريب الفعلية (النموذج المرفق)

- 4.26M معامل · 4 طبقات · 4 رؤوس انتباه · سياق 256 توكن · مفردات 4096
- 3000 خطوة تدريب (~12 مليون توكن، ~45 دقيقة على CPU بنواتين)
- خسارة التحقق: **8.3 → 2.52** (perplexity من 4096 إلى **12.4**)

مثال حقيقي من النموذج (المدخل حتى `"""Return all files in path."""`):

```python
import os

def list_files(path):
    """Return all files in path."""
    if not os.path.exists(path) and not os.path.isdir(path):
        return os.path.join(path)
    return os.path.join(path, 'rb').split("/")
```

لاحظ: الصيغة واستخدام `os.path` صحيحة، لكن المنطق غير دقيق — هذا متوقّع لحجم النموذج.

## ⚠️ توقعات واقعية

النموذج المرفق صغير (**~4 مليون معامل**) ودُرِّب حوالي ساعة على معالج بنواتين فقط،
على ~10 مليون توكن من كود بايثون. لذلك:

- ✅ يكتب كود بايثون **بصيغة صحيحة غالبًا**: مسافات، `def`، `class`، `import`، docstrings، أسماء متغيرات منطقية.
- ❌ **ليس** مساعدًا مثل ChatGPT — لا يفهم الأسئلة باللغة الطبيعية ولا يحل مسائل معقّدة.
- ❌ الكود الناتج كثيرًا ما يكون غير صحيح منطقيًا.

هذا طبيعي: النماذج القوية للبرمجة فيها مليارات المعاملات ودُرِّبت على تريليونات التوكنات بآلاف كروت الشاشة.
**لكن الكود هنا يكبر معك** — نفس الملفات تدعم نماذج أكبر:

| Preset | المعاملات | العتاد المطلوب | ماذا تتوقع |
|---|---|---|---|
| `cpu-small` | ~4M | لابتوب | صيغة بايثون صحيحة، منطق ضعيف |
| `gpu-base` | ~25M | GPU عادي، ساعات | دوال قصيرة منطقية أحيانًا |
| `gpu-large` | ~120M | GPU قوي + بيانات كثيرة (GBs) | إكمال كود مفيد فعليًا |

### كيف تحسّنه؟
1. **بيانات أكثر**: استنسخ مستودعات مفتوحة المصدر من GitHub ومرّرها بـ `--src`، وارفع `--max_mb`.
2. **نموذج أكبر**: `--preset gpu-base` أو `gpu-large`.
3. **تدريب أطول**: `--max_iters` أكبر (التدريب يُستأنف تلقائيًا من آخر checkpoint).
4. **لغات أخرى**: `--ext .js .ts .java .cpp .go`.

</div>

---

### English summary
A ~4M-parameter GPT-style code-completion model with a from-scratch BPE tokenizer,
trained from random initialisation on Python source code. No pretrained weights,
no external models or APIs. Scale it up with the `gpu-base` / `gpu-large` presets
and more data.
