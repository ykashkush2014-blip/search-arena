"""
Honest evaluation: ask the model things phrased in ways it NEVER saw during
training, extract the Python code it writes, run it, and check correctness.

    python eval_chat.py
"""
import contextlib
import io
import re
import signal

import torch

from chat import answer, load_chat

# (request, test that must pass after exec'ing the generated code)
CODE_TESTS = [
    # --- Arabic, unseen phrasings
    ("ممكن فنكشن تعطيني مجموع عددين؟", "assert add(2, 3) == 5"),
    ("بدي اعرف اذا رقم معين اولي، اكتبلي كود", "assert is_prime(13) and not is_prime(12)"),
    ("كيف بقلب كلمة بالبايثون؟ اعطيني دالة", "assert reverse_string('abc') == 'cba'"),
    ("محتاج دالة تحسبلي مضروب العدد", "assert factorial(5) == 120"),
    ("دالة لإيجاد أكبر قيمة في مصفوفة", "assert find_max([1, 8, 3]) == 8"),
    ("اريد كود يحذف التكرار من ليست", "assert remove_duplicates([1, 1, 2]) == [1, 2]"),
    ("دالة فيبوناتشي لو سمحت", "assert fibonacci(10) == 55"),
    ("اعملي كلاس Teacher فيه name و subject", "t = Teacher('a', 'b'); assert t.name == 'a' and t.subject == 'b'"),
    ("دالة بتحسب معدل علامات", "assert average([10, 20]) == 15"),
    ("بدي دالة بتعرفني اذا الجملة palindrome", "assert is_palindrome('abba') and not is_palindrome('abc')"),
    ("رتبلي ليست بخوارزمية bubble", "assert bubble_sort([3, 1, 2]) == [1, 2, 3]"),
    ("دالة بتعد الكلمات بجملة", "assert count_words('a b c') == 3"),
    # --- English, unseen phrasings
    ("I want python code that tells me if a number is prime", "assert is_prime(13) and not is_prime(12)"),
    ("function for summing two ints", "assert add(2, 3) == 5"),
    ("how can I reverse a string? show me a function", "assert reverse_string('abc') == 'cba'"),
    ("give me the factorial of n as a python function", "assert factorial(5) == 120"),
    ("need code to get the biggest element of a list", "assert find_max([1, 8, 3]) == 8"),
    ("python: dedupe a list while keeping order", "assert remove_duplicates([1, 1, 2]) == [1, 2]"),
    ("nth fibonacci number function", "assert fibonacci(10) == 55"),
    ("define a class Laptop that stores brand and price", "l = Laptop('a', 1); assert l.brand == 'a' and l.price == 1"),
    ("binary search implementation please", "assert binary_search([1, 2, 3, 4], 3) == 2"),
    ("count vowels in a word", "assert count_vowels('education') == 5"),
    ("check if 2024 is a leap year with a function", "assert is_leap_year(2024) and not is_leap_year(1900)"),
    ("can u code merge sort for me", "assert merge_sort([3, 1, 2]) == [1, 2, 3]"),
]

# (request, regex the answer should match) — conversation / concepts / language
TEXT_TESTS = [
    ("اهلين", r"[\u0600-\u06FF]"),
    ("hello there!", r"(?i)hi|hello|hey"),
    ("مين انت", r"من الصفر"),
    ("who are you", r"(?i)scratch"),
    ("اشرحلي شو هي الليست", r"list"),
    ("explain what a dictionary is", r"(?i)key"),
    ("احكيلي نكتة", r"البرمجة"),
    ("what's the weather like?", r"(?i)programming"),
    ("اطبع الأرقام من 1 إلى 37", r"range\(1, 37 \+ 1\)"),
    ("print numbers from 1 to 64", r"range\(1, 64 \+ 1\)"),
    ("اكتب دالة بتقلب نص بجافاسكربت", r"```javascript"),
]


class Timeout(Exception):
    pass


def run_code(code, test):
    def handler(*_):
        raise Timeout()
    signal.signal(signal.SIGALRM, handler)
    signal.alarm(3)
    try:
        ns = {"input": lambda *a: "5"}
        with contextlib.redirect_stdout(io.StringIO()):
            exec(code, ns)
            exec(test, ns)
        return True
    except BaseException:
        return False
    finally:
        signal.alarm(0)


def main():
    torch.set_num_threads(2)
    model, tok, ck = load_chat()
    print(f"chat model iter {ck['iter']}, val loss {ck['val_loss']:.3f}\n")
    ok = 0
    for req, test in CODE_TESTS:
        ans = answer(model, tok, req)
        m = re.search(r"```python\n(.*?)```", ans, re.S)
        passed = bool(m) and run_code(m.group(1), test)
        ok += passed
        print(f"{'✅' if passed else '❌'} {req}")
        if not passed:
            print("   ", ans[:300].replace("\n", "\n    "))
    print(f"\nCODE: {ok}/{len(CODE_TESTS)} generated programs run and pass tests\n")
    ok2 = 0
    for req, pat in TEXT_TESTS:
        ans = answer(model, tok, req)
        passed = re.search(pat, ans) is not None
        ok2 += passed
        print(f"{'✅' if passed else '❌'} {req}  →  {ans[:90]!r}")
    print(f"\nTEXT: {ok2}/{len(TEXT_TESTS)}")


if __name__ == "__main__":
    main()
