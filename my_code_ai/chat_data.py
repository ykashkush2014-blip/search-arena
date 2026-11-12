"""
Generate an instruction / chat dataset for programming — 100% from hand-written
templates and hand-written, verified code. No other AI model is used.

Each example:   <|user|>\n{request}\n<|assistant|>\n{answer}<|endoftext|>
Requests come in Arabic (MSA + Levantine dialect) and English; the answer is in
the same language as the request.
"""
import random
import re

USER, ASSISTANT, EOT = "<|user|>", "<|assistant|>", "<|endoftext|>"

AR_RE = re.compile(r"[\u0600-\u06FF]")


def is_arabic(s):
    return bool(AR_RE.search(s))


def fmt_prompt(user_msg):
    return f"{USER}\n{user_msg.strip()}\n{ASSISTANT}\n"


def fmt_example(user_msg, answer):
    return fmt_prompt(user_msg) + answer.strip() + EOT


# --------------------------------------------------------------------------
# Phrasing banks
# --------------------------------------------------------------------------
AR_FUNC = ["اكتب دالة", "اكتبلي دالة", "اكتب لي دالة", "اعملي دالة", "اعمل دالة",
           "بدي دالة", "بدي فنكشن", "اكتبلي فنكشن", "ممكن تكتبلي دالة", "أريد دالة",
           "ابني دالة", "اعطيني دالة", "برمجلي دالة", "من فضلك اكتب دالة", "عايز دالة",
           "اكتب function", "بدي function", "ممكن دالة"]
EN_FUNC = ["Write a function that", "write a python function that", "Can you write a function that",
           "Create a function that", "I need a function that", "Give me a function that",
           "Make a function which", "Please write a function that",
           "Implement a function that", "could you create a function that", "code a function that"]
AR_PY_SUFFIX = ["", "", "", " بالبايثون", " بلغة بايثون", " ببايثون", " في بايثون", " python"]
EN_PY_SUFFIX = ["", "", "", " in python", " in Python", " using python"]
AR_END = ["", "", "", "؟", " من فضلك", " لو سمحت", " 🙏", "."]
EN_END = ["", "", "", "?", " please", ".", " thanks"]
AR_JS = [" بجافاسكربت", " بلغة جافاسكربت", " javascript", " بال JS", " في JavaScript"]
EN_JS = [" in javascript", " in JavaScript", " using JS", " in JS"]

AR_INTRO = ["أكيد! هاي دالة {d}:", "تفضل، هاي دالة {d}:", "هذه دالة {d}:",
            "تمام! هيك بتكتب دالة {d}:", "حاضر 👍 هاي دالة {d}:", "أكيد، هذا كود لدالة {d}:"]
EN_INTRO = ["Sure! Here's a function that {d}:", "Here is a function that {d}:",
            "Of course. This function {d}:", "Sure thing! Below is a function that {d}:",
            "Here's how you can write a function that {d}:"]
AR_INTRO_CODE = ["أكيد! هذا الكود:", "تفضل:", "تمام، هيك بتعملها:", "هذا الحل:", "أكيد 👍"]
EN_INTRO_CODE = ["Sure! Here's the code:", "Here you go:", "Here's how to do it:",
                 "Sure:", "Here's a simple solution:"]


def code_block(code, lang="python"):
    return f"```{lang}\n{code.strip()}\n```"


# --------------------------------------------------------------------------
# Fixed function tasks: (ar descriptions, en descriptions, python, ar expl, en expl, js)
# The first description of each list is used in the answer.
# --------------------------------------------------------------------------
FUNC_TASKS = [
    dict(ar=["بتجمع رقمين", "تجمع عددين", "لجمع رقمين", "بترجع مجموع رقمين", "تحسب مجموع رقمين"],
         en=["adds two numbers", "returns the sum of two numbers", "add two numbers", "sums two numbers"],
         py='''def add(a, b):
    return a + b


print(add(3, 5))  # 8''',
         ex_ar="الدالة `add` بتاخد رقمين `a` و `b` وبترجع مجموعهم باستخدام `+`.",
         ex_en="`add` takes two numbers `a` and `b` and returns their sum using `+`.",
         js='''function add(a, b) {
  return a + b;
}

console.log(add(3, 5)); // 8''',
         test="assert add(3, 5) == 8"),
    dict(ar=["بتطرح رقمين", "تطرح عددين", "لطرح رقم من رقم", "بترجع الفرق بين رقمين"],
         en=["subtracts two numbers", "returns the difference of two numbers", "subtract two numbers"],
         py='''def subtract(a, b):
    return a - b


print(subtract(10, 4))  # 6''',
         ex_ar="الدالة `subtract` بترجع ناتج طرح `b` من `a`.",
         ex_en="`subtract` returns `a` minus `b`.",
         js='''function subtract(a, b) {
  return a - b;
}

console.log(subtract(10, 4)); // 6''',
         test="assert subtract(10, 4) == 6"),
    dict(ar=["بتضرب رقمين", "تضرب عددين", "لضرب رقمين", "بترجع حاصل ضرب رقمين"],
         en=["multiplies two numbers", "returns the product of two numbers", "multiply two numbers"],
         py='''def multiply(a, b):
    return a * b


print(multiply(4, 6))  # 24''',
         ex_ar="الدالة `multiply` بترجع حاصل ضرب `a` في `b` باستخدام `*`.",
         ex_en="`multiply` returns `a` times `b` using `*`.",
         js='''function multiply(a, b) {
  return a * b;
}

console.log(multiply(4, 6)); // 24''',
         test="assert multiply(4, 6) == 24"),
    dict(ar=["بتقسم رقمين", "تقسم عدد على عدد", "لقسمة رقمين", "بتقسم رقمين وبتتعامل مع القسمة على صفر"],
         en=["divides two numbers", "divides a by b safely", "divide two numbers", "divides two numbers and handles division by zero"],
         py='''def divide(a, b):
    if b == 0:
        return None  # can't divide by zero
    return a / b


print(divide(10, 2))  # 5.0
print(divide(5, 0))   # None''',
         ex_ar="الدالة `divide` بتقسم `a` على `b`، وإذا كان `b` صفر بترجع `None` عشان ما يصير خطأ.",
         ex_en="`divide` returns `a / b`, and returns `None` when `b` is zero to avoid a crash.",
         js='''function divide(a, b) {
  if (b === 0) {
    return null; // can't divide by zero
  }
  return a / b;
}

console.log(divide(10, 2)); // 5''',
         test="assert divide(10, 2) == 5 and divide(5, 0) is None"),
    dict(ar=["بتحسب القوة (أس)", "بترفع رقم لقوة", "تحسب الأس", "بتحسب a أس b"],
         en=["raises a number to a power", "computes the power of a number", "calculates a to the power of b"],
         py='''def power(base, exp):
    return base ** exp


print(power(2, 10))  # 1024''',
         ex_ar="الرمز `**` ببايثون معناه الأس، فـ `2 ** 10` بتساوي 1024.",
         ex_en="In Python `**` is the power operator, so `2 ** 10` is 1024.",
         js='''function power(base, exp) {
  return base ** exp;
}

console.log(power(2, 10)); // 1024''',
         test="assert power(2, 10) == 1024"),
    dict(ar=["بتحسب مضروب رقم", "تحسب العاملي (factorial)", "بتحسب factorial", "لحساب المضروب"],
         en=["calculates the factorial of a number", "computes factorial", "returns n factorial", "finds the factorial of n"],
         py='''def factorial(n):
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result


print(factorial(5))  # 120''',
         ex_ar="المضروب هو ضرب كل الأرقام من 1 لـ n. الحلقة بتضرب `result` بكل رقم من 2 لـ n.",
         ex_en="The factorial is the product of all numbers from 1 to n. The loop multiplies `result` by every number from 2 to n.",
         js='''function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

console.log(factorial(5)); // 120''',
         test="assert factorial(5) == 120 and factorial(0) == 1"),
    dict(ar=["بتحسب المضروب بطريقة recursion", "تحسب factorial بالتكرار الذاتي", "بتحسب العاملي بشكل عودي"],
         en=["calculates factorial recursively", "computes the factorial using recursion"],
         py='''def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)


print(factorial(6))  # 720''',
         ex_ar="الدالة بتنادي حالها (recursion): `n! = n * (n-1)!`، وبتوقف لما `n` يصير 1.",
         ex_en="The function calls itself (recursion): `n! = n * (n-1)!`, stopping when `n` reaches 1.",
         test="assert factorial(6) == 720"),
    dict(ar=["بترجع رقم فيبوناتشي رقم n", "تحسب فيبوناتشي", "بتحسب متتالية فيبوناتشي", "لحساب fibonacci"],
         en=["returns the nth Fibonacci number", "computes fibonacci", "calculates the fibonacci sequence", "gets the n-th fibonacci number"],
         py='''def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a


print([fibonacci(i) for i in range(10)])
# [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]''',
         ex_ar="كل رقم بفيبوناتشي هو مجموع الرقمين اللي قبله. بنحتفظ بآخر رقمين `a` و `b` وبنحدثهم بكل خطوة.",
         ex_en="Each Fibonacci number is the sum of the previous two. We keep the last two values `a` and `b` and update them each step.",
         js='''function fibonacci(n) {
  let a = 0, b = 1;
  for (let i = 0; i < n; i++) {
    [a, b] = [b, a + b];
  }
  return a;
}

console.log(fibonacci(10)); // 55''',
         test="assert fibonacci(10) == 55 and fibonacci(1) == 1"),
    dict(ar=["بتفحص إذا الرقم أولي", "تتحقق إذا العدد أولي", "بتشوف إذا الرقم prime", "بتعرف إذا الرقم أولي أو لا"],
         en=["checks if a number is prime", "checks whether a number is prime", "returns True if n is prime", "tests if a number is a prime number"],
         py='''def is_prime(n):
    if n < 2:
        return False
    for i in range(2, int(n ** 0.5) + 1):
        if n % i == 0:
            return False
    return True


print(is_prime(7))   # True
print(is_prime(10))  # False''',
         ex_ar="الرقم الأولي ما بينقسم إلا على 1 وعلى حاله. بنجرب القسمة لحد الجذر التربيعي بس، لأنه هيك أسرع.",
         ex_en="A prime is only divisible by 1 and itself. We only test divisors up to the square root, which is faster.",
         js='''function isPrime(n) {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false;
  }
  return true;
}

console.log(isPrime(7)); // true''',
         test="assert is_prime(7) and not is_prime(10) and not is_prime(1) and is_prime(97)"),
    dict(ar=["بترجع كل الأرقام الأولية لحد n", "تطلع الأعداد الأولية الأصغر من n", "بتجيب قائمة الأرقام الأولية"],
         en=["returns all prime numbers up to n", "lists primes up to n", "finds all primes below a number"],
         py='''def primes_up_to(n):
    primes = []
    for num in range(2, n + 1):
        if all(num % p != 0 for p in primes if p * p <= num):
            primes.append(num)
    return primes


print(primes_up_to(30))
# [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]''',
         ex_ar="لكل رقم بنفحص إذا بينقسم على أي رقم أولي لقيناه قبل؛ إذا لا، بنضيفه للقائمة.",
         ex_en="For each number we check whether any previously found prime divides it; if not, it's prime.",
         test="assert primes_up_to(30) == [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]"),
    dict(ar=["بتفحص إذا الرقم زوجي", "تعرف إذا العدد زوجي أو فردي", "بتشوف إذا الرقم even"],
         en=["checks if a number is even", "checks whether a number is even or odd", "returns True if the number is even"],
         py='''def is_even(n):
    return n % 2 == 0


print(is_even(4))  # True
print(is_even(7))  # False''',
         ex_ar="العملية `%` بتعطي باقي القسمة. إذا باقي القسمة على 2 صفر، الرقم زوجي.",
         ex_en="`%` gives the remainder. If the remainder of dividing by 2 is 0, the number is even.",
         js='''function isEven(n) {
  return n % 2 === 0;
}

console.log(isEven(4)); // true''',
         test="assert is_even(4) and not is_even(7)"),
    dict(ar=["بتقلب نص", "تعكس كلمة", "بتقلب string", "بتعكس النص"],
         en=["reverses a string", "reverse a string", "returns a string backwards", "reverses text"],
         py='''def reverse_string(text):
    return text[::-1]


print(reverse_string("hello"))  # olleh''',
         ex_ar="`[::-1]` بتقرأ النص من الآخر للأول، فبترجع النص مقلوب.",
         ex_en="The slice `[::-1]` walks the string backwards, giving the reversed text.",
         js='''function reverseString(text) {
  return text.split("").reverse().join("");
}

console.log(reverseString("hello")); // olleh''',
         test="assert reverse_string('hello') == 'olleh'"),
    dict(ar=["بتفحص إذا الكلمة palindrome", "تتحقق إذا النص بينقرأ نفس الشي من الجهتين", "بتشوف إذا الكلمة متناظرة"],
         en=["checks if a string is a palindrome", "checks whether a word is a palindrome", "returns True if text reads the same backwards"],
         py='''def is_palindrome(text):
    cleaned = text.lower().replace(" ", "")
    return cleaned == cleaned[::-1]


print(is_palindrome("Racecar"))  # True
print(is_palindrome("hello"))    # False''',
         ex_ar="بنشيل المسافات وبنحول لأحرف صغيرة، وبعدين بنقارن النص مع مقلوبه.",
         ex_en="We lowercase and remove spaces, then compare the text with its reverse.",
         js='''function isPalindrome(text) {
  const cleaned = text.toLowerCase().replace(/ /g, "");
  return cleaned === cleaned.split("").reverse().join("");
}

console.log(isPalindrome("Racecar")); // true''',
         test="assert is_palindrome('Racecar') and not is_palindrome('hello')"),
    dict(ar=["بتعد الأحرف المتحركة بنص", "تحسب عدد ال vowels", "بتعد حروف العلة"],
         en=["counts the vowels in a string", "counts vowels", "returns the number of vowels in text"],
         py='''def count_vowels(text):
    return sum(1 for ch in text.lower() if ch in "aeiou")


print(count_vowels("Hello World"))  # 3''',
         ex_ar="بنمر على كل حرف، وإذا كان من `aeiou` بنعده.",
         ex_en="We go over each character and count it if it is one of `aeiou`.",
         js='''function countVowels(text) {
  return [...text.toLowerCase()].filter(ch => "aeiou".includes(ch)).length;
}

console.log(countVowels("Hello World")); // 3''',
         test="assert count_vowels('Hello World') == 3"),
    dict(ar=["بتعد الكلمات بجملة", "تحسب عدد الكلمات في نص", "بتعد كم كلمة في النص"],
         en=["counts the words in a sentence", "counts words in a string", "returns the number of words"],
         py='''def count_words(text):
    return len(text.split())


print(count_words("I love learning Python"))  # 4''',
         ex_ar="`split()` بتقسم النص لكلمات حسب المسافات، و `len` بتعد الكلمات.",
         ex_en="`split()` breaks the text into words on whitespace, and `len` counts them.",
         js='''function countWords(text) {
  return text.trim().split(/\\s+/).length;
}

console.log(countWords("I love learning Python")); // 4''',
         test="assert count_words('I love learning Python') == 4"),
    dict(ar=["بتحسب تكرار كل كلمة بنص", "تعد كم مرة تكررت كل كلمة", "بترجع قاموس بعدد مرات الكلمات"],
         en=["counts how often each word appears", "returns word frequencies", "counts word frequency in a text"],
         py='''def word_frequency(text):
    counts = {}
    for word in text.lower().split():
        counts[word] = counts.get(word, 0) + 1
    return counts


print(word_frequency("the cat and the hat"))
# {'the': 2, 'cat': 1, 'and': 1, 'hat': 1}''',
         ex_ar="بنستعمل قاموس: المفتاح هو الكلمة والقيمة عدد مرات ظهورها. `get(word, 0)` بترجع 0 إذا الكلمة جديدة.",
         ex_en="We use a dictionary mapping each word to its count. `get(word, 0)` returns 0 for new words.",
         test="assert word_frequency('the cat and the hat') == {'the': 2, 'cat': 1, 'and': 1, 'hat': 1}"),
    dict(ar=["بتحسب مجموع قائمة أرقام", "تجمع كل الأرقام في list", "بترجع مجموع عناصر القائمة"],
         en=["sums a list of numbers", "returns the sum of a list", "adds up all numbers in a list"],
         py='''def sum_list(numbers):
    total = 0
    for n in numbers:
        total += n
    return total


print(sum_list([1, 2, 3, 4]))  # 10''',
         ex_ar="بنبلش من صفر وبنضيف كل رقم للمجموع. (ممكن كمان تستعمل `sum(numbers)` الجاهزة.)",
         ex_en="We start at zero and add each number. (You can also use the built-in `sum(numbers)`.)",
         js='''function sumList(numbers) {
  return numbers.reduce((total, n) => total + n, 0);
}

console.log(sumList([1, 2, 3, 4])); // 10''',
         test="assert sum_list([1, 2, 3, 4]) == 10"),
    dict(ar=["بتلاقي أكبر رقم في قائمة", "ترجع أكبر عنصر في list", "بتطلع الماكس من قائمة"],
         en=["finds the largest number in a list", "returns the maximum of a list", "finds the max value in a list"],
         py='''def find_max(numbers):
    largest = numbers[0]
    for n in numbers:
        if n > largest:
            largest = n
    return largest


print(find_max([3, 9, 2, 7]))  # 9''',
         ex_ar="بنفترض أول عنصر هو الأكبر، وبنمر على الباقي وكل ما لقينا أكبر منه بنحدثه.",
         ex_en="We assume the first element is the largest, then update it whenever we see a bigger one.",
         js='''function findMax(numbers) {
  let largest = numbers[0];
  for (const n of numbers) {
    if (n > largest) largest = n;
  }
  return largest;
}

console.log(findMax([3, 9, 2, 7])); // 9''',
         test="assert find_max([3, 9, 2, 7]) == 9"),
    dict(ar=["بتلاقي أصغر رقم في قائمة", "ترجع أصغر عنصر", "بتطلع المين من list"],
         en=["finds the smallest number in a list", "returns the minimum of a list", "finds the min value in a list"],
         py='''def find_min(numbers):
    smallest = numbers[0]
    for n in numbers:
        if n < smallest:
            smallest = n
    return smallest


print(find_min([3, 9, 2, 7]))  # 2''',
         ex_ar="نفس فكرة البحث عن الأكبر، بس بنقارن بـ `<`.",
         ex_en="Same idea as finding the max, but comparing with `<`.",
         test="assert find_min([3, 9, 2, 7]) == 2"),
    dict(ar=["بتحسب المعدل لقائمة أرقام", "تحسب المتوسط الحسابي", "بترجع average لقائمة"],
         en=["calculates the average of a list", "computes the mean of numbers", "returns the average of a list of numbers"],
         py='''def average(numbers):
    if not numbers:
        return 0
    return sum(numbers) / len(numbers)


print(average([10, 20, 30]))  # 20.0''',
         ex_ar="المعدل = المجموع ÷ عدد العناصر. وبنرجع 0 إذا القائمة فاضية عشان ما نقسم على صفر.",
         ex_en="Average = sum / count. We return 0 for an empty list to avoid dividing by zero.",
         js='''function average(numbers) {
  if (numbers.length === 0) return 0;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

console.log(average([10, 20, 30])); // 20''',
         test="assert average([10, 20, 30]) == 20"),
    dict(ar=["بتشيل التكرار من قائمة", "تحذف العناصر المكررة من list", "بترجع قائمة بدون تكرار"],
         en=["removes duplicates from a list", "returns a list without duplicates", "deletes repeated items from a list"],
         py='''def remove_duplicates(items):
    seen = set()
    result = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


print(remove_duplicates([1, 2, 2, 3, 1]))  # [1, 2, 3]''',
         ex_ar="بنستعمل `set` عشان نتذكر شو شفنا، وبنحافظ على ترتيب العناصر الأصلي.",
         ex_en="A `set` remembers what we've already seen, while the result keeps the original order.",
         js='''function removeDuplicates(items) {
  return [...new Set(items)];
}

console.log(removeDuplicates([1, 2, 2, 3, 1])); // [1, 2, 3]''',
         test="assert remove_duplicates([1, 2, 2, 3, 1]) == [1, 2, 3]"),
    dict(ar=["بترجع الأرقام الزوجية من قائمة", "تفلتر الأعداد الزوجية", "بتطلع ال even numbers من list"],
         en=["returns the even numbers from a list", "filters even numbers", "keeps only even numbers in a list"],
         py='''def get_evens(numbers):
    return [n for n in numbers if n % 2 == 0]


print(get_evens([1, 2, 3, 4, 5, 6]))  # [2, 4, 6]''',
         ex_ar="استعملنا list comprehension: بناخد كل `n` إذا كان زوجي.",
         ex_en="This list comprehension keeps every `n` that is even.",
         js='''function getEvens(numbers) {
  return numbers.filter(n => n % 2 === 0);
}

console.log(getEvens([1, 2, 3, 4, 5, 6])); // [2, 4, 6]''',
         test="assert get_evens([1, 2, 3, 4, 5, 6]) == [2, 4, 6]"),
    dict(ar=["بتربّع كل رقم في قائمة", "ترجع مربعات الأرقام", "بتحسب مربع كل عنصر"],
         en=["squares every number in a list", "returns the squares of a list", "squares each element"],
         py='''def square_all(numbers):
    return [n * n for n in numbers]


print(square_all([1, 2, 3, 4]))  # [1, 4, 9, 16]''',
         ex_ar="لكل رقم `n` بنحسب `n * n` وبنحط النتيجة بقائمة جديدة.",
         ex_en="For each `n` we compute `n * n` and collect the results in a new list.",
         js='''function squareAll(numbers) {
  return numbers.map(n => n * n);
}

console.log(squareAll([1, 2, 3, 4])); // [1, 4, 9, 16]''',
         test="assert square_all([1, 2, 3, 4]) == [1, 4, 9, 16]"),
    dict(ar=["بترتب قائمة بطريقة bubble sort", "تعمل bubble sort", "بترتب الأرقام بخوارزمية الفقاعة"],
         en=["sorts a list using bubble sort", "implements bubble sort", "does a bubble sort"],
         py='''def bubble_sort(items):
    items = list(items)
    n = len(items)
    for i in range(n):
        for j in range(n - i - 1):
            if items[j] > items[j + 1]:
                items[j], items[j + 1] = items[j + 1], items[j]
    return items


print(bubble_sort([5, 2, 9, 1]))  # [1, 2, 5, 9]''',
         ex_ar="بكل لفة بنقارن كل عنصرين جنب بعض وبنبدلهم إذا كانوا مش مرتبين، فأكبر عنصر بيطلع للآخر.",
         ex_en="Each pass compares neighbours and swaps them if they're out of order, so the largest value bubbles to the end.",
         js='''function bubbleSort(items) {
  const arr = [...items];
  for (let i = 0; i < arr.length; i++) {
    for (let j = 0; j < arr.length - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
    }
  }
  return arr;
}''',
         test="assert bubble_sort([5, 2, 9, 1]) == [1, 2, 5, 9]"),
    dict(ar=["بترتب قائمة بطريقة merge sort", "تعمل merge sort", "بترتب بخوارزمية الدمج"],
         en=["sorts a list with merge sort", "implements merge sort", "does merge sort"],
         py='''def merge_sort(items):
    if len(items) <= 1:
        return items
    mid = len(items) // 2
    left = merge_sort(items[:mid])
    right = merge_sort(items[mid:])
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    return result + left[i:] + right[j:]


print(merge_sort([8, 3, 5, 1, 9]))  # [1, 3, 5, 8, 9]''',
         ex_ar="بنقسم القائمة لنصين، بنرتب كل نص (recursion)، وبعدين بندمجهم بالترتيب.",
         ex_en="Split the list in half, sort each half recursively, then merge the two sorted halves.",
         test="assert merge_sort([8, 3, 5, 1, 9]) == [1, 3, 5, 8, 9]"),
    dict(ar=["بترتب قائمة بطريقة quick sort", "تعمل quick sort", "بترتب بالفرز السريع"],
         en=["sorts a list with quick sort", "implements quicksort", "does quick sort"],
         py='''def quick_sort(items):
    if len(items) <= 1:
        return items
    pivot = items[0]
    smaller = [x for x in items[1:] if x < pivot]
    larger = [x for x in items[1:] if x >= pivot]
    return quick_sort(smaller) + [pivot] + quick_sort(larger)


print(quick_sort([7, 2, 9, 4]))  # [2, 4, 7, 9]''',
         ex_ar="بنختار عنصر (pivot)، بنحط الأصغر منه على اليسار والأكبر على اليمين، وبنكرر.",
         ex_en="Pick a pivot, put smaller items on the left and larger on the right, then repeat recursively.",
         test="assert quick_sort([7, 2, 9, 4]) == [2, 4, 7, 9]"),
    dict(ar=["بتعمل بحث ثنائي", "تعمل binary search", "بتدور على عنصر بقائمة مرتبة بسرعة"],
         en=["does binary search", "implements binary search", "searches a sorted list using binary search"],
         py='''def binary_search(items, target):
    low, high = 0, len(items) - 1
    while low <= high:
        mid = (low + high) // 2
        if items[mid] == target:
            return mid
        elif items[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1


print(binary_search([1, 3, 5, 7, 9], 7))  # 3''',
         ex_ar="بكل خطوة بنشوف العنصر اللي بالنص وبنستغني عن نص القائمة. بترجع مكان العنصر أو -1 إذا مش موجود.",
         ex_en="Each step checks the middle element and discards half of the list. Returns the index, or -1 if not found.",
         js='''function binarySearch(items, target) {
  let low = 0, high = items.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (items[mid] === target) return mid;
    if (items[mid] < target) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}''',
         test="assert binary_search([1, 3, 5, 7, 9], 7) == 3 and binary_search([1, 3], 4) == -1"),
    dict(ar=["بتحسب القاسم المشترك الأكبر", "تحسب gcd لرقمين", "بتلاقي ال GCD"],
         en=["computes the greatest common divisor", "calculates the gcd of two numbers", "finds the GCD"],
         py='''def gcd(a, b):
    while b:
        a, b = b, a % b
    return a


print(gcd(48, 18))  # 6''',
         ex_ar="خوارزمية إقليدس: بنستبدل `(a, b)` بـ `(b, a % b)` لحد ما `b` يصير صفر.",
         ex_en="Euclid's algorithm: replace `(a, b)` with `(b, a % b)` until `b` is zero.",
         test="assert gcd(48, 18) == 6"),
    dict(ar=["بتحسب مجموع خانات رقم", "تجمع أرقام العدد", "بتحسب مجموع digits"],
         en=["sums the digits of a number", "returns the sum of digits", "adds the digits of an integer"],
         py='''def sum_digits(n):
    return sum(int(d) for d in str(abs(n)))


print(sum_digits(1234))  # 10''',
         ex_ar="بنحول الرقم لنص، وبنحول كل خانة لرقم وبنجمعهم.",
         ex_en="Convert the number to a string, turn each digit back into an int and add them up.",
         test="assert sum_digits(1234) == 10"),
    dict(ar=["بتحول من سيلسيوس لفهرنهايت", "تحول درجة الحرارة من مئوي لفهرنهايت", "بتحول celsius ل fahrenheit"],
         en=["converts celsius to fahrenheit", "converts temperature from C to F"],
         py='''def celsius_to_fahrenheit(c):
    return c * 9 / 5 + 32


print(celsius_to_fahrenheit(100))  # 212.0''',
         ex_ar="المعادلة: `F = C × 9/5 + 32`.",
         ex_en="The formula is `F = C × 9/5 + 32`.",
         js='''function celsiusToFahrenheit(c) {
  return c * 9 / 5 + 32;
}

console.log(celsiusToFahrenheit(100)); // 212''',
         test="assert celsius_to_fahrenheit(100) == 212"),
    dict(ar=["بتحسب مساحة دائرة", "تحسب مساحة الدائرة من نصف القطر", "بتحسب area للدائرة"],
         en=["calculates the area of a circle", "computes circle area from the radius"],
         py='''import math


def circle_area(radius):
    return math.pi * radius ** 2


print(round(circle_area(3), 2))  # 28.27''',
         ex_ar="مساحة الدائرة = π × نق². `math.pi` فيها قيمة π.",
         ex_en="Circle area = π × r². `math.pi` holds the value of π.",
         test="assert abs(circle_area(3) - 28.274) < 0.01"),
    dict(ar=["بتحسب مساحة مستطيل", "تحسب مساحة المستطيل", "بتحسب area لمستطيل"],
         en=["calculates the area of a rectangle", "computes rectangle area"],
         py='''def rectangle_area(width, height):
    return width * height


print(rectangle_area(4, 5))  # 20''',
         ex_ar="مساحة المستطيل = الطول × العرض.",
         ex_en="Rectangle area = width × height.",
         test="assert rectangle_area(4, 5) == 20"),
    dict(ar=["بترجع أكبر رقم من تلات أرقام", "تلاقي الأكبر بين 3 أعداد", "بتقارن تلات أرقام وبترجع الأكبر"],
         en=["returns the largest of three numbers", "finds the max of three numbers"],
         py='''def max_of_three(a, b, c):
    if a >= b and a >= c:
        return a
    elif b >= c:
        return b
    return c


print(max_of_three(4, 9, 2))  # 9''',
         ex_ar="بنقارن الأرقام بـ `if` و `elif`. (أو ببساطة `max(a, b, c)`.)",
         ex_en="We compare with `if`/`elif`. (Or simply use `max(a, b, c)`.)",
         test="assert max_of_three(4, 9, 2) == 9 and max_of_three(9, 1, 3) == 9"),
    dict(ar=["بتفحص إذا السنة كبيسة", "تعرف إذا السنة leap year", "بتتحقق من السنة الكبيسة"],
         en=["checks if a year is a leap year", "returns True for leap years"],
         py='''def is_leap_year(year):
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


print(is_leap_year(2024))  # True
print(is_leap_year(1900))  # False''',
         ex_ar="السنة كبيسة إذا بتنقسم على 4، إلا إذا بتنقسم على 100 وما بتنقسم على 400.",
         ex_en="A year is a leap year if divisible by 4, except centuries not divisible by 400.",
         test="assert is_leap_year(2024) and not is_leap_year(1900) and is_leap_year(2000)"),
    dict(ar=["بتولّد كلمة سر عشوائية", "تعمل password عشوائي", "بتنشئ كلمة مرور قوية"],
         en=["generates a random password", "creates a strong random password"],
         py='''import random
import string


def generate_password(length=12):
    chars = string.ascii_letters + string.digits + string.punctuation
    return "".join(random.choice(chars) for _ in range(length))


print(generate_password())''',
         ex_ar="بنختار حروف وأرقام ورموز عشوائيًا بالطول المطلوب. (للأمان الحقيقي استعمل `secrets` بدل `random`.)",
         ex_en="We randomly pick letters, digits and symbols. (For real security use `secrets` instead of `random`.)",
         test="assert len(generate_password(16)) == 16"),
    dict(ar=["بتتحقق إذا الإيميل صحيح", "تفحص صيغة البريد الإلكتروني", "بتعمل validation للإيميل"],
         en=["validates an email address", "checks if an email is valid"],
         py='''import re


def is_valid_email(email):
    pattern = r"^[\\w.+-]+@[\\w-]+\\.[\\w.]+$"
    return re.match(pattern, email) is not None


print(is_valid_email("ali@example.com"))  # True
print(is_valid_email("not-an-email"))     # False''',
         ex_ar="استعملنا regex: لازم يكون في نص قبل `@`، ودومين فيه نقطة بعدها.",
         ex_en="A regular expression checks for text before `@` and a domain with a dot after it.",
         test="assert is_valid_email('ali@example.com') and not is_valid_email('nope')"),
    dict(ar=["بتقرأ ملف نصي", "تقرأ محتوى ملف", "بتفتح ملف وبتقرأه"],
         en=["reads a text file", "reads the contents of a file", "opens a file and reads it"],
         py='''def read_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


content = read_file("notes.txt")
print(content)''',
         ex_ar="`with open(...)` بتفتح الملف وبتسكره تلقائيًا، و `read()` بترجع كل المحتوى.",
         ex_en="`with open(...)` opens the file and closes it automatically; `read()` returns the whole content.",
         test=None),
    dict(ar=["بتكتب نص بملف", "تحفظ نص في ملف", "بتكتب على ملف"],
         en=["writes text to a file", "saves a string to a file"],
         py='''def write_file(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


write_file("output.txt", "Hello, file!")''',
         ex_ar="الوضع `\"w\"` بيكتب فوق الملف (أو بينشئه). استعمل `\"a\"` إذا بدك تضيف للآخر.",
         ex_en="Mode `\"w\"` overwrites (or creates) the file. Use `\"a\"` to append instead.",
         test=None),
    dict(ar=["بتعد أسطر ملف", "تحسب كم سطر في ملف", "بتعد عدد الأسطر بملف"],
         en=["counts the lines in a file", "returns the number of lines in a file"],
         py='''def count_lines(path):
    with open(path, "r", encoding="utf-8") as f:
        return sum(1 for _ in f)


print(count_lines("notes.txt"))''',
         ex_ar="لما نمر على الملف بحلقة، بناخد سطر سطر، فبنعدهم.",
         ex_en="Iterating over a file yields one line at a time, so we just count them.",
         test=None),
    dict(ar=["بتقرأ ملف JSON", "تحمل بيانات من ملف json", "بتفتح JSON وبترجعه كقاموس"],
         en=["reads a JSON file", "loads data from a json file"],
         py='''import json


def read_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


data = read_json("config.json")
print(data)''',
         ex_ar="`json.load` بتحول محتوى الملف لقاموس أو قائمة ببايثون.",
         ex_en="`json.load` turns the file contents into Python dicts/lists.",
         test=None),
    dict(ar=["بتحفظ بيانات بملف JSON", "تكتب قاموس في ملف json", "بتحفظ dict كـ JSON"],
         en=["saves data to a JSON file", "writes a dictionary to a json file"],
         py='''import json


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


save_json("user.json", {"name": "Ali", "age": 25})''',
         ex_ar="`json.dump` بتكتب البيانات، و `ensure_ascii=False` بتخلي العربي يبين مزبوط.",
         ex_en="`json.dump` writes the data; `indent=2` makes it readable.",
         test=None),
    dict(ar=["بترجع كل الملفات بمجلد", "تعرض الملفات في فولدر", "بتطبع أسماء الملفات بمجلد"],
         en=["lists all files in a folder", "returns the files in a directory"],
         py='''import os


def list_files(folder):
    return [name for name in os.listdir(folder)
            if os.path.isfile(os.path.join(folder, name))]


print(list_files("."))''',
         ex_ar="`os.listdir` بترجع كل الأسماء بالمجلد، و `isfile` بتخلينا ناخد الملفات بس.",
         ex_en="`os.listdir` returns every entry; `isfile` keeps only the files.",
         test=None),
    dict(ar=["بتدمج قاموسين", "تجمع dict مع dict", "بتعمل merge لقاموسين"],
         en=["merges two dictionaries", "combines two dicts"],
         py='''def merge_dicts(a, b):
    result = dict(a)
    result.update(b)
    return result


print(merge_dicts({"x": 1}, {"y": 2}))  # {'x': 1, 'y': 2}''',
         ex_ar="بنعمل نسخة من الأول وبنضيفله عناصر التاني بـ `update`. (أو `a | b` من بايثون 3.9.)",
         ex_en="Copy the first dict and `update` it with the second. (Or `a | b` in Python 3.9+.)",
         js='''function mergeObjects(a, b) {
  return { ...a, ...b };
}''',
         test="assert merge_dicts({'x': 1}, {'y': 2}) == {'x': 1, 'y': 2}"),
    dict(ar=["بترتب قاموس حسب القيم", "تعمل sort لقاموس بالقيمة", "بترتب dict حسب values"],
         en=["sorts a dictionary by value", "sorts a dict by its values"],
         py='''def sort_by_value(d):
    return dict(sorted(d.items(), key=lambda item: item[1]))


print(sort_by_value({"a": 3, "b": 1, "c": 2}))  # {'b': 1, 'c': 2, 'a': 3}''',
         ex_ar="`sorted` مع `key=lambda item: item[1]` بترتب الأزواج حسب القيمة.",
         ex_en="`sorted` with `key=lambda item: item[1]` orders the pairs by their value.",
         test="assert list(sort_by_value({'a': 3, 'b': 1, 'c': 2})) == ['b', 'c', 'a']"),
    dict(ar=["بتعمل flatten لقائمة متداخلة", "تحول قائمة قوائم لقائمة وحدة", "بتفرد nested list"],
         en=["flattens a nested list", "turns a list of lists into one list"],
         py='''def flatten(nested):
    result = []
    for item in nested:
        if isinstance(item, list):
            result.extend(flatten(item))
        else:
            result.append(item)
    return result


print(flatten([1, [2, [3, 4]], 5]))  # [1, 2, 3, 4, 5]''',
         ex_ar="إذا العنصر قائمة، بنفرده بشكل recursive؛ غير هيك بنضيفه مباشرة.",
         ex_en="If an item is a list we flatten it recursively; otherwise we append it.",
         test="assert flatten([1, [2, [3, 4]], 5]) == [1, 2, 3, 4, 5]"),
    dict(ar=["بتحول أول حرف من كل كلمة لكابيتال", "تكبّر أول حرف بكل كلمة", "بتعمل capitalize للكلمات"],
         en=["capitalizes each word", "makes the first letter of every word uppercase"],
         py='''def capitalize_words(text):
    return " ".join(word.capitalize() for word in text.split())


print(capitalize_words("hello world"))  # Hello World''',
         ex_ar="بنقسم النص لكلمات، بنكبر أول حرف بكل كلمة، وبنرجع نجمعهم.",
         ex_en="Split into words, capitalize each one, and join them back together.",
         test="assert capitalize_words('hello world') == 'Hello World'"),
    dict(ar=["بتعد كم مرة حرف موجود بنص", "تحسب تكرار حرف في كلمة", "بتعد ظهور حرف معين"],
         en=["counts how many times a character appears", "counts occurrences of a letter in a string"],
         py='''def count_char(text, char):
    count = 0
    for ch in text:
        if ch == char:
            count += 1
    return count


print(count_char("banana", "a"))  # 3''',
         ex_ar="بنمر على كل حرف وبنزيد العداد إذا طابق. (أو ببساطة `text.count(char)`.)",
         ex_en="We loop over the characters and increment a counter on each match. (Or `text.count(char)`.)",
         test="assert count_char('banana', 'a') == 3"),
    dict(ar=["بتحول رقم لثنائي (binary)", "تحول عدد عشري لثنائي", "بتحول decimal لـ binary"],
         en=["converts a number to binary", "converts decimal to binary"],
         py='''def to_binary(n):
    if n == 0:
        return "0"
    bits = ""
    while n > 0:
        bits = str(n % 2) + bits
        n //= 2
    return bits


print(to_binary(10))  # 1010''',
         ex_ar="بنقسم على 2 بشكل متكرر وبناخد الباقي. (أو `bin(n)[2:]`.)",
         ex_en="Repeatedly divide by 2 and collect the remainders. (Or `bin(n)[2:]`.)",
         test="assert to_binary(10) == '1010' and to_binary(0) == '0'"),
]

# --------------------------------------------------------------------------
# "Program" tasks (not a single function)
# --------------------------------------------------------------------------
PROGRAM_TASKS = [
    dict(ar=["اكتب برنامج بيسأل المستخدم عن اسمه وبيرحب فيه", "بدي كود بياخد اسم المستخدم وبيقله أهلا",
             "اعملي برنامج بيطلب الاسم وبيطبع ترحيب"],
         en=["write a program that asks the user's name and greets them", "code that takes the user's name and says hello",
             "make a program that greets the user by name"],
         py='''name = input("What is your name? ")
print(f"Hello, {name}! Nice to meet you.")''',
         ex_ar="`input` بتاخد نص من المستخدم، و f-string بتحط الاسم جوا الجملة.",
         ex_en="`input` reads text from the user and the f-string inserts the name into the message."),
    dict(ar=["اعملي آلة حاسبة بسيطة", "اكتب برنامج آلة حاسبة", "بدي calculator بالبايثون", "اكتبلي حاسبة بتجمع وبتطرح وبتضرب وبتقسم"],
         en=["make a simple calculator", "write a calculator program", "build a basic calculator in python"],
         py='''def calculator(a, op, b):
    if op == "+":
        return a + b
    elif op == "-":
        return a - b
    elif op == "*":
        return a * b
    elif op == "/":
        return a / b if b != 0 else "Error: division by zero"
    return "Unknown operator"


a = float(input("First number: "))
op = input("Operator (+, -, *, /): ")
b = float(input("Second number: "))
print("Result:", calculator(a, op, b))''',
         ex_ar="البرنامج بياخد رقمين وعملية، والدالة `calculator` بتختار العملية حسب الرمز.",
         ex_en="The program reads two numbers and an operator; `calculator` picks the operation based on the symbol."),
    dict(ar=["اعملي لعبة تخمين رقم", "اكتب لعبة خمن الرقم", "بدي لعبة بتختار رقم عشوائي والمستخدم بيخمن"],
         en=["make a number guessing game", "write a guess the number game", "create a game where the user guesses a random number"],
         py='''import random

secret = random.randint(1, 100)
tries = 0

while True:
    guess = int(input("Guess a number between 1 and 100: "))
    tries += 1
    if guess < secret:
        print("Too low!")
    elif guess > secret:
        print("Too high!")
    else:
        print(f"Correct! You got it in {tries} tries.")
        break''',
         ex_ar="الكمبيوتر بيختار رقم عشوائي، والحلقة بتضل شغالة لحد ما المستخدم يخمن صح، وبتعطيه تلميح أعلى/أقل.",
         ex_en="The computer picks a random number; the loop keeps asking and gives higher/lower hints until the guess is right."),
    dict(ar=["كيف بطبع التاريخ والوقت الحالي", "اكتب كود بيطبع الوقت هلأ", "بدي اعرض تاريخ اليوم بالبايثون"],
         en=["how do I print the current date and time", "show the current time in python", "get today's date"],
         py='''from datetime import datetime

now = datetime.now()
print("Date:", now.strftime("%Y-%m-%d"))
print("Time:", now.strftime("%H:%M:%S"))''',
         ex_ar="`datetime.now()` بترجع الوقت الحالي، و `strftime` بتنسقه زي ما بدك.",
         ex_en="`datetime.now()` returns the current moment and `strftime` formats it."),
    dict(ar=["كيف بعمل طلب HTTP لموقع", "اكتب كود بيجيب بيانات من API", "كيف بعمل request لرابط بالبايثون"],
         en=["how do I make an HTTP request", "fetch data from an API in python", "write code that downloads a web page"],
         py='''import json
from urllib.request import urlopen

with urlopen("https://api.github.com") as response:
    data = json.loads(response.read().decode("utf-8"))

print(data)''',
         ex_ar="`urlopen` من المكتبة القياسية بتجيب محتوى الرابط، و `json.loads` بتحوله لقاموس. (مكتبة `requests` كمان خيار مشهور.)",
         ex_en="`urlopen` from the standard library fetches the URL and `json.loads` parses it. (`requests` is a popular alternative.)",
         js='''fetch("https://api.github.com")
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error(error));'''),
    dict(ar=["كيف بتعامل مع الأخطاء بالبايثون", "اعطيني مثال على try except", "كيف بمنع البرنامج يوقف لما يصير خطأ"],
         en=["how do I handle errors in python", "give me an example of try except", "how to catch exceptions"],
         py='''try:
    number = int(input("Enter a number: "))
    print(10 / number)
except ValueError:
    print("That's not a valid number!")
except ZeroDivisionError:
    print("You can't divide by zero!")
finally:
    print("Done.")''',
         ex_ar="الكود جوا `try` إذا صار فيه خطأ، بنروح للـ `except` المناسب بدل ما يوقف البرنامج. `finally` بتتنفذ دايمًا.",
         ex_en="If code inside `try` raises an error, the matching `except` runs instead of crashing. `finally` always runs.",
         js='''try {
  const data = JSON.parse("{bad json}");
} catch (error) {
  console.log("Something went wrong:", error.message);
} finally {
  console.log("Done.");
}'''),
    dict(ar=["اعملي كلاس حساب بنكي فيه إيداع وسحب", "بدي class BankAccount مع deposit و withdraw", "اكتب كلاس للبنك"],
         en=["create a bank account class with deposit and withdraw", "write a BankAccount class", "make a class for a bank account"],
         py='''class BankAccount:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        if amount > 0:
            self.balance += amount
        return self.balance

    def withdraw(self, amount):
        if amount > self.balance:
            print("Insufficient funds")
            return self.balance
        self.balance -= amount
        return self.balance


account = BankAccount("Ali", 100)
account.deposit(50)
account.withdraw(30)
print(account.balance)  # 120''',
         ex_ar="الكلاس بيخزن صاحب الحساب والرصيد، و `deposit` بتزيد الرصيد، و `withdraw` بتسحب بس إذا في رصيد كافي.",
         ex_en="The class stores the owner and balance; `deposit` adds money and `withdraw` only succeeds if there are enough funds.",
         test="a = BankAccount('x', 100); a.deposit(50); a.withdraw(30); assert a.balance == 120"),
    dict(ar=["اعملي كلاس Stack", "اكتب مكدس (stack) بالبايثون", "بدي تطبيق لل stack"],
         en=["implement a stack class", "write a Stack in python", "create a stack data structure"],
         py='''class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)

    def pop(self):
        if self.is_empty():
            return None
        return self.items.pop()

    def peek(self):
        return self.items[-1] if self.items else None

    def is_empty(self):
        return len(self.items) == 0


s = Stack()
s.push(1)
s.push(2)
print(s.pop())  # 2''',
         ex_ar="الـ Stack بيشتغل بمبدأ آخر واحد بيدخل أول واحد بيطلع (LIFO). `append` بتضيف و `pop` بتشيل من الآخر.",
         ex_en="A stack is Last-In-First-Out (LIFO): `append` pushes and `pop` removes from the end.",
         test="s = Stack(); s.push(1); s.push(2); assert s.pop() == 2 and s.peek() == 1"),
    dict(ar=["اعملي كلاس Queue", "اكتب طابور (queue) بالبايثون", "بدي تطبيق لل queue"],
         en=["implement a queue class", "write a Queue in python", "create a queue data structure"],
         py='''from collections import deque


class Queue:
    def __init__(self):
        self.items = deque()

    def enqueue(self, item):
        self.items.append(item)

    def dequeue(self):
        return self.items.popleft() if self.items else None

    def is_empty(self):
        return len(self.items) == 0


q = Queue()
q.enqueue("a")
q.enqueue("b")
print(q.dequeue())  # a''',
         ex_ar="الـ Queue أول واحد بيدخل أول واحد بيطلع (FIFO). `deque` سريعة بالإضافة والحذف من الطرفين.",
         ex_en="A queue is First-In-First-Out (FIFO). `deque` is fast at adding/removing from both ends.",
         test="q = Queue(); q.enqueue('a'); q.enqueue('b'); assert q.dequeue() == 'a'"),
    dict(ar=["اعملي linked list", "اكتب قائمة مترابطة بالبايثون", "بدي تطبيق لل linked list"],
         en=["implement a linked list", "write a linked list in python", "create a singly linked list"],
         py='''class Node:
    def __init__(self, value):
        self.value = value
        self.next = None


class LinkedList:
    def __init__(self):
        self.head = None

    def append(self, value):
        node = Node(value)
        if self.head is None:
            self.head = node
            return
        current = self.head
        while current.next:
            current = current.next
        current.next = node

    def to_list(self):
        values, current = [], self.head
        while current:
            values.append(current.value)
            current = current.next
        return values


ll = LinkedList()
for v in [1, 2, 3]:
    ll.append(v)
print(ll.to_list())  # [1, 2, 3]''',
         ex_ar="كل `Node` فيها قيمة ومؤشر للعقدة اللي بعدها. `append` بتمشي لآخر عقدة وبتربط الجديدة فيها.",
         ex_en="Each `Node` holds a value and a pointer to the next node. `append` walks to the end and links the new node.",
         test="ll = LinkedList(); [ll.append(v) for v in [1, 2, 3]]; assert ll.to_list() == [1, 2, 3]"),
    dict(ar=["اعطيني مثال على list comprehension", "كيف بستعمل list comprehension", "اشرحلي list comprehension بمثال"],
         en=["give me an example of list comprehension", "how do I use a list comprehension", "show list comprehension"],
         py='''numbers = [1, 2, 3, 4, 5, 6]

squares = [n * n for n in numbers]
evens = [n for n in numbers if n % 2 == 0]

print(squares)  # [1, 4, 9, 16, 25, 36]
print(evens)    # [2, 4, 6]''',
         ex_ar="الصيغة `[expression for item in list if condition]` بتعمل قائمة جديدة بسطر واحد.",
         ex_en="The form `[expression for item in list if condition]` builds a new list in one line."),
    dict(ar=["كيف بستعمل lambda", "اعطيني مثال على lambda", "شو هي lambda بمثال"],
         en=["how do I use lambda", "give me a lambda example", "show me lambda functions"],
         py='''square = lambda x: x * x
print(square(5))  # 25

words = ["banana", "kiwi", "apple"]
print(sorted(words, key=lambda w: len(w)))  # ['kiwi', 'apple', 'banana']''',
         ex_ar="`lambda` هي دالة صغيرة بدون اسم بسطر واحد، وكتير بتنستعمل مع `sorted` و `map` و `filter`.",
         ex_en="`lambda` creates a small anonymous one-line function, often used with `sorted`, `map` and `filter`."),
    dict(ar=["كيف بقرأ ملف CSV", "اكتب كود بيقرأ CSV", "بدي افتح ملف csv بالبايثون"],
         en=["how do I read a CSV file", "read a csv file in python", "write code to load a CSV"],
         py='''import csv

with open("data.csv", newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        print(row)''',
         ex_ar="`csv.DictReader` بيقرأ كل سطر كقاموس، المفاتيح هي أسماء الأعمدة من أول سطر.",
         ex_en="`csv.DictReader` reads each row as a dict keyed by the column names in the header."),
    dict(ar=["اعملي سيرفر ويب بسيط", "كيف بعمل web server بالبايثون", "بدي سيرفر HTTP صغير"],
         en=["make a simple web server", "how do I create a web server in python", "write a tiny HTTP server"],
         py='''from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"Hello from my server!")


HTTPServer(("0.0.0.0", 8000), Handler).serve_forever()''',
         ex_ar="السيرفر بيستقبل طلبات GET على البورت 8000 وبيرد بنص. افتح `http://localhost:8000` بالمتصفح.",
         ex_en="The server answers GET requests on port 8000 with a text message. Open `http://localhost:8000`.",
         js='''const http = require("http");

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello from my server!");
}).listen(8000);'''),
]

# --------------------------------------------------------------------------
# Parametric tasks (numbers / names are copied from the request)
# --------------------------------------------------------------------------
CLASSES = {
    "Person": ["name", "age", "city", "email"],
    "Car": ["brand", "model", "year", "color"],
    "Student": ["name", "grade", "age", "school"],
    "Book": ["title", "author", "pages", "year"],
    "Product": ["name", "price", "quantity", "category"],
    "Employee": ["name", "salary", "position", "age"],
    "Animal": ["name", "species", "age", "weight"],
    "Dog": ["name", "breed", "age", "color"],
    "User": ["username", "email", "password", "age"],
    "Movie": ["title", "director", "year", "rating"],
    "Phone": ["brand", "model", "price", "storage"],
    "Course": ["title", "teacher", "hours", "price"],
    "Laptop": ["brand", "ram", "price", "storage"],
    "Order": ["order_id", "customer", "total", "status"],
    "Game": ["title", "genre", "price", "rating"],
    "House": ["address", "rooms", "price", "city"],
}
FIELD_VALUES = {
    "name": '"Ali"', "age": "25", "city": '"Cairo"', "email": '"ali@example.com"',
    "brand": '"Toyota"', "model": '"Corolla"', "year": "2020", "color": '"red"',
    "grade": "90", "school": '"Al-Nour"', "title": '"Python 101"', "author": '"Sara"',
    "pages": "320", "price": "99.9", "quantity": "3", "category": '"books"',
    "salary": "5000", "position": '"developer"', "species": '"cat"', "weight": "4.5",
    "breed": '"Husky"', "username": '"ali99"', "password": '"secret"', "director": '"Nolan"',
    "rating": "8.5", "storage": "128", "teacher": '"Omar"', "hours": "40", "ram": "16",
    "order_id": "1001", "customer": '"Lina"', "total": "250", "status": '"shipped"',
    "genre": '"puzzle"', "address": '"Main St 5"', "rooms": "4",
}


# Big pools so the model learns to COPY names from the request.
# ("Teacher" and "subject" are deliberately left out — eval_chat.py uses them
#  to test copying of names never seen in training.)
CLASS_POOL = sorted(set(CLASSES) | set("""Bike Truck Plane Ship Train City Country Planet Tree Flower Fruit Shop
Store Bank Hotel Room Ticket Flight Patient Doctor Hospital Library Song Album Artist Player Team Match Recipe
Meal Restaurant Invoice Payment Customer Supplier Item Cart Task Project Event Message Post Comment Account
Device Robot Sensor Camera Server Window Button Shape Point Vector Garden School Classroom Exam Lesson Contact
Wallet Coin Stock Video Photo Note Reminder Alarm Pet Cat Bird Fish Horse Chair Table Computer Keyboard Monitor
Printer Building Office Company Department Manager Driver Passenger Vehicle Engine Battery Club Coach Nurse
Farm Market Tool Lamp Door Car2 Gadget Planet Moon River Mountain Island Bus Taxi Rocket Drone Toy Shirt Shoe
Bag Watch Ring Painting Museum Theater Concert Festival Sport Medal Trophy Card Deck Puzzle Level Quest Hero
Monster Weapon Spell Potion Inventory Order2 Booking Reservation Review Survey Question Answer Quiz Session
Token Profile Settings Theme Color Font Image File Folder Download Upload Request Response Job Worker Queue2""".split()) - {"Car2", "Order2", "Queue2"})
FIELD_POOL = sorted(set(FIELD_VALUES) | set("""id size speed height width length score level owner created_at
description phone country month day capacity duration distance temperature balance points language version
kind label value count url material shape radius x y z start end budget deadline priority location nickname
first_name last_name birthday gender team position code note tags views likes stock discount tax weight_kg
height_cm brand_name screen battery camera memory is_active is_admin last_login""".split()))
NUMERIC_FIELDS = {"age", "year", "price", "pages", "quantity", "salary", "grade", "rating", "storage", "hours",
                  "ram", "order_id", "total", "rooms", "weight", "id", "size", "speed", "height", "width",
                  "length", "score", "level", "month", "day", "capacity", "duration", "distance", "temperature",
                  "balance", "points", "count", "radius", "x", "y", "z", "budget", "priority", "views", "likes",
                  "stock", "discount", "tax", "weight_kg", "height_cm", "battery", "memory", "value", "version"}
BOOL_FIELDS = {"is_active", "is_admin"}
STR_SAMPLES = ["abc", "sample", "demo", "blue", "main", "test", "alpha", "new", "basic", "hello"]


def field_value(rng, f):
    if f in FIELD_VALUES:
        return FIELD_VALUES[f]
    if f in BOOL_FIELDS:
        return rng.choice(["True", "False"])
    if f in NUMERIC_FIELDS:
        return str(rng.randint(1, 500))
    return '"' + rng.choice(STR_SAMPLES) + '"'


def join_ar(items):
    return items[0] if len(items) == 1 else "، ".join(items[:-1]) + " و" + items[-1]


def join_en(items):
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


def gen_class(rng, lang):
    if rng.random() < 0.4:
        cls = rng.choice(list(CLASSES))
        fields = rng.sample(CLASSES[cls], rng.choice([2, 2, 3, 3, 4]))
    else:
        cls = rng.choice(CLASS_POOL)
        fields = rng.sample(FIELD_POOL, rng.choice([1, 2, 2, 3, 3, 4]))
    if lang == "ar":
        req = rng.choice([
            "اعمل كلاس اسمه {c} فيه {f}", "اعملي class {c} فيه {f}", "بدي كلاس {c} عنده {f}",
            "اكتب كلاس {c} بخصائص {f}", "اكتبلي class اسمه {c} فيه الخصائص {f}",
            "انشئ كلاس {c} يحتوي على {f}", "بدي class اسمه {c} وفيه {f}", "كلاس {c} فيه {f}",
            "class {c} مع {f}", "ممكن كلاس {c} عنده {f}؟", "اعمل object اسمه {c} فيه {f}",
            "بدي اعمل كلاس {c} وفيه خصائص {f}", "عرّف كلاس {c} فيه {f}",
        ]).format(c=cls, f=join_ar(fields))
        if rng.random() < 0.2:
            req = typo(rng, req, 0.05)
    else:
        req = rng.choice([
            "create a class {c} with {f}", "Write a class called {c} with {f}",
            "make a {c} class that has {f}", "I need a class named {c} with attributes {f}",
            "Define a {c} class with fields {f}", "build a python class {c} that stores {f}",
            "class {c} with {f}", "a {c} class: {f}", "python class {c} having {f}",
            "can you make a class {c} with {f}?", "{c} class with attributes {f} please",
        ]).format(c=cls, f=join_en(fields))
    var = re.sub(r"(?<!^)(?=[A-Z])", "_", cls).lower()
    args = ", ".join(fields)
    body = "\n".join(f"        self.{f} = {f}" for f in fields)
    rep = ", ".join(f"{f}={{self.{f}}}" for f in fields)
    vals = ", ".join(field_value(rng, f) for f in fields)
    code = f'''class {cls}:
    def __init__(self, {args}):
{body}

    def __str__(self):
        return f"{cls}({rep})"


{var} = {cls}({vals})
print({var})'''
    if lang == "ar":
        ans = (rng.choice(["أكيد! هذا كلاس `{c}`:", "تفضل، هذا الكلاس `{c}`:", "تمام 👍 هيك بيكون الكلاس `{c}`:"]).format(c=cls)
               + "\n\n" + code_block(code) + "\n\n"
               + f"الدالة `__init__` بتنفذ لما ننشئ كائن جديد وبتخزن {join_ar(['`' + f + '`' for f in fields])}. "
               + "و `__str__` بتحدد شكل الكائن لما نطبعه.")
    else:
        ans = (rng.choice(["Sure! Here's the `{c}` class:", "Here is a `{c}` class:", "Here you go, a `{c}` class:"]).format(c=cls)
               + "\n\n" + code_block(code) + "\n\n"
               + f"`__init__` runs when a new object is created and stores {join_en(['`' + f + '`' for f in fields])}. "
               + "`__str__` controls how the object looks when printed.")
    return req, ans, code


def gen_loop(rng, lang):
    kind = rng.choice(["range", "table", "sum", "countdown", "evens"])
    n = rng.choice(list(range(2, 13))) if kind == "table" else rng.randint(5, 100)
    if kind == "range":
        ar = [f"اطبع الأرقام من 1 إلى {n}", f"اكتب كود بيطبع الأرقام من 1 لـ {n}", f"بدي loop بيطبع من 1 ل {n}",
              f"كيف بطبع الأعداد من 1 حتى {n}", f"اعملي حلقة بتطبع 1 لـ {n}"]
        en = [f"print numbers from 1 to {n}", f"write a loop that prints 1 to {n}", f"how do I print the numbers 1 through {n}",
              f"print all numbers from 1 to {n} in python"]
        code = f"for i in range(1, {n} + 1):\n    print(i)"
        ex_ar = f"`range(1, {n} + 1)` بتعطي الأرقام من 1 لـ {n} (الرقم الأخير مش داخل، عشان هيك زدنا 1)."
        ex_en = f"`range(1, {n} + 1)` yields 1 up to {n} (the end is exclusive, so we add 1)."
        js = f"for (let i = 1; i <= {n}; i++) {{\n  console.log(i);\n}}"
    elif kind == "table":
        ar = [f"اطبع جدول الضرب لـ {n}", f"اكتب كود بيطبع جدول ضرب {n}", f"بدي جدول الضرب تبع الرقم {n}", f"اعملي جدول ضرب {n}"]
        en = [f"print the multiplication table of {n}", f"write code for the {n} times table", f"show the multiplication table for {n}"]
        code = f"n = {n}\nfor i in range(1, 11):\n    print(f\"{{n}} x {{i}} = {{n * i}}\")"
        ex_ar = "الحلقة بتمر على الأرقام من 1 لـ 10 وبتطبع حاصل ضربها بالرقم `n`."
        ex_en = "The loop goes from 1 to 10 and prints each product with `n`."
        js = f"const n = {n};\nfor (let i = 1; i <= 10; i++) {{\n  console.log(`${{n}} x ${{i}} = ${{n * i}}`);\n}}"
    elif kind == "sum":
        ar = [f"احسب مجموع الأرقام من 1 إلى {n}", f"اكتب كود بيجمع الأعداد من 1 لـ {n}", f"كيف بحسب مجموع 1 لـ {n}"]
        en = [f"calculate the sum of numbers from 1 to {n}", f"sum all numbers from 1 to {n}", f"add up the numbers 1 to {n}"]
        code = f"total = 0\nfor i in range(1, {n} + 1):\n    total += i\nprint(total)"
        ex_ar = "بنضيف كل رقم للمتغير `total`. (ممكن كمان `sum(range(1, n + 1))`.)"
        ex_en = "Each number is added to `total`. (Or simply `sum(range(1, n + 1))`.)"
        js = f"let total = 0;\nfor (let i = 1; i <= {n}; i++) {{\n  total += i;\n}}\nconsole.log(total);"
    elif kind == "countdown":
        ar = [f"اعمل عد تنازلي من {n}", f"اطبع الأرقام من {n} لـ 1 بالعكس", f"اكتب countdown من {n}"]
        en = [f"make a countdown from {n}", f"print numbers from {n} down to 1", f"count down from {n} to 1"]
        code = f"for i in range({n}, 0, -1):\n    print(i)\nprint(\"Done!\")"
        ex_ar = "`range(start, 0, -1)` بتعد لورا لحد 1."
        ex_en = "`range(start, 0, -1)` counts backwards down to 1."
        js = f"for (let i = {n}; i > 0; i--) {{\n  console.log(i);\n}}"
    else:
        ar = [f"اطبع الأرقام الزوجية لحد {n}", f"اكتب كود بيطبع الأعداد الزوجية من 0 لـ {n}", f"بدي اطبع ال even numbers لحد {n}"]
        en = [f"print even numbers up to {n}", f"print all even numbers from 0 to {n}", f"show the even numbers until {n}"]
        code = f"for i in range(0, {n} + 1, 2):\n    print(i)"
        ex_ar = "الخطوة `2` بـ `range` بتخلينا نقفز من زوجي لزوجي."
        ex_en = "The step `2` in `range` jumps from one even number to the next."
        js = f"for (let i = 0; i <= {n}; i += 2) {{\n  console.log(i);\n}}"
    return ar, en, code, ex_ar, ex_en, js


def gen_values(rng, lang):
    nums = [rng.randint(1, 99) for _ in range(rng.randint(3, 6))]
    s_ar, s_en = "، ".join(map(str, nums)), ", ".join(map(str, nums))
    lst = "[" + ", ".join(map(str, nums)) + "]"
    op = rng.choice(["sum", "max", "min", "avg", "sort", "reverse"])
    table = {
        "sum": (["احسب مجموع الأرقام {s}", "اجمع الأرقام {s}", "شو مجموع {s} بالبايثون"],
                ["calculate the sum of {s}", "add the numbers {s}", "sum {s} in python"],
                "print(sum(numbers))", "`sum` بتجمع كل عناصر القائمة.", "`sum` adds all the items."),
        "max": (["لاقي أكبر رقم بين {s}", "شو أكبر رقم من {s}", "طلعلي الماكس من {s}"],
                ["find the largest of {s}", "get the max of {s}", "which is the biggest number in {s}"],
                "print(max(numbers))", "`max` بترجع أكبر عنصر.", "`max` returns the largest item."),
        "min": (["لاقي أصغر رقم بين {s}", "شو أصغر رقم من {s}"],
                ["find the smallest of {s}", "get the min of {s}"],
                "print(min(numbers))", "`min` بترجع أصغر عنصر.", "`min` returns the smallest item."),
        "avg": (["احسب معدل الأرقام {s}", "شو المتوسط تبع {s}"],
                ["calculate the average of {s}", "find the mean of {s}"],
                "print(sum(numbers) / len(numbers))", "المعدل = المجموع ÷ العدد.", "Average = sum / count."),
        "sort": (["رتب الأرقام {s}", "رتبلي {s} من الأصغر للأكبر"],
                 ["sort the numbers {s}", "sort {s} in ascending order"],
                 "print(sorted(numbers))", "`sorted` بترجع قائمة جديدة مرتبة.", "`sorted` returns a new sorted list."),
        "reverse": (["اعكس ترتيب القائمة {s}", "اقلب القائمة {s}"],
                    ["reverse the list {s}", "reverse the order of {s}"],
                    "print(numbers[::-1])", "`[::-1]` بترجع القائمة بالعكس.", "`[::-1]` gives the list in reverse order."),
    }
    ar, en, line, ex_ar, ex_en = table[op]
    req = rng.choice(ar).format(s=s_ar) if lang == "ar" else rng.choice(en).format(s=s_en)
    code = f"numbers = {lst}\n{line}"
    return req, code, ex_ar, ex_en


# --------------------------------------------------------------------------
# Concepts (Q&A)
# --------------------------------------------------------------------------
CONCEPTS = [
    (["متغير", "variable", "المتغيرات"], ["a variable", "variables"],
     "المتغير هو اسم بنخزن فيه قيمة عشان نستعملها بعدين.",
     "A variable is a name that stores a value so you can use it later.",
     'name = "Ali"\nage = 25\nprint(name, age)'),
    (["قائمة", "list", "الليست"], ["a list", "lists in python"],
     "الـ list هي مجموعة مرتبة من العناصر، ممكن نضيف ونحذف ونعدل عليها.",
     "A list is an ordered, changeable collection of items.",
     'fruits = ["apple", "banana"]\nfruits.append("orange")\nprint(fruits[0])  # apple'),
    (["قاموس", "dictionary", "dict"], ["a dictionary", "a dict"],
     "القاموس (dict) بيخزن البيانات كأزواج مفتاح وقيمة، وبنوصل للقيمة عن طريق المفتاح.",
     "A dictionary stores key-value pairs; you look values up by their key.",
     'person = {"name": "Ali", "age": 25}\nprint(person["name"])  # Ali'),
    (["tuple", "التابل"], ["a tuple", "tuples"],
     "الـ tuple زي القائمة بس ما بنقدر نغير عناصرها بعد ما ننشئها.",
     "A tuple is like a list, but it cannot be changed after it is created.",
     "point = (3, 4)\nx, y = point\nprint(x, y)"),
    (["set", "المجموعة"], ["a set", "sets in python"],
     "الـ set مجموعة عناصر بدون تكرار وبدون ترتيب.",
     "A set is an unordered collection with no duplicate items.",
     "nums = {1, 2, 2, 3}\nprint(nums)  # {1, 2, 3}"),
    (["دالة", "function", "الفنكشن", "الدوال"], ["a function", "functions"],
     "الدالة هي مجموعة أوامر إلها اسم، بنقدر نناديها كل ما بدنا بدل ما نكرر الكود.",
     "A function is a named block of code you can call whenever you need it, instead of repeating code.",
     'def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("Sara"))'),
    (["for loop", "حلقة for", "اللوب"], ["a for loop", "for loops"],
     "حلقة `for` بتكرر الكود لكل عنصر بمجموعة (قائمة، نص، range...).",
     "A `for` loop repeats code once for every item in a sequence (list, string, range...).",
     "for i in range(3):\n    print(i)  # 0, 1, 2"),
    (["while loop", "حلقة while", "الوايل"], ["a while loop", "while loops"],
     "حلقة `while` بتضل تكرر الكود طول ما الشرط صحيح.",
     "A `while` loop keeps repeating as long as its condition is true.",
     "count = 3\nwhile count > 0:\n    print(count)\n    count -= 1"),
    (["if", "الشرط if", "الجمل الشرطية"], ["an if statement", "if else"],
     "جملة `if` بتنفذ كود بس إذا الشرط صحيح، و `else` إذا كان غلط.",
     "An `if` statement runs code only when a condition is true; `else` runs otherwise.",
     'age = 20\nif age >= 18:\n    print("Adult")\nelse:\n    print("Minor")'),
    (["كلاس", "class", "الكلاسات"], ["a class", "classes"],
     "الكلاس هو قالب لإنشاء كائنات (objects)، فيه بيانات (خصائص) ودوال (methods).",
     "A class is a blueprint for creating objects, bundling data (attributes) and behaviour (methods).",
     'class Dog:\n    def __init__(self, name):\n        self.name = name\n\n    def bark(self):\n        return f"{self.name} says woof!"\n\nprint(Dog("Rex").bark())'),
    (["البرمجة الكائنية", "OOP", "object oriented programming"], ["OOP", "object oriented programming"],
     "البرمجة الكائنية (OOP) هي طريقة لتنظيم الكود حول كائنات، وأهم مبادئها: التغليف، الوراثة، وتعدد الأشكال.",
     "Object-oriented programming organises code around objects. Its key ideas are encapsulation, inheritance and polymorphism.",
     'class Animal:\n    def speak(self):\n        return "..."\n\nclass Cat(Animal):\n    def speak(self):\n        return "Meow"\n\nprint(Cat().speak())'),
    (["الوراثة", "inheritance"], ["inheritance"],
     "الوراثة معناها إنه كلاس جديد بياخد كل خصائص ودوال كلاس تاني وبيقدر يضيف أو يعدل عليها.",
     "Inheritance lets a new class reuse everything from an existing class and extend or override it.",
     'class Vehicle:\n    def move(self):\n        return "Moving"\n\nclass Bike(Vehicle):\n    pass\n\nprint(Bike().move())'),
    (["recursion", "الاستدعاء الذاتي", "الريكرجن"], ["recursion"],
     "الـ recursion هو لما الدالة تنادي حالها لحل نسخة أصغر من نفس المشكلة، ولازم يكون في شرط توقف.",
     "Recursion is when a function calls itself on a smaller version of the problem; it needs a stopping condition.",
     "def countdown(n):\n    if n == 0:\n        return\n    print(n)\n    countdown(n - 1)\n\ncountdown(3)"),
    (["API", "ال api"], ["an API", "APIs"],
     "الـ API هي واجهة بتخلي برنامجين يحكوا مع بعض؛ مثلًا تطبيقك بيطلب بيانات من سيرفر وبيرجعله JSON.",
     "An API is an interface that lets programs talk to each other, e.g. your app requests data from a server and gets JSON back.",
     'import json\nfrom urllib.request import urlopen\n\ndata = json.loads(urlopen("https://api.github.com").read())\nprint(data)'),
    (["git", "جيت"], ["git"],
     "Git هو نظام لإدارة نسخ الكود: بيحفظ تاريخ التعديلات وبيخلي أكتر من شخص يشتغلوا على نفس المشروع.",
     "Git is a version control system: it records the history of your code and lets people collaborate.",
     None),
    (["string", "النص", "السترينج"], ["a string", "strings"],
     "الـ string هو نص، بنكتبه بين علامات تنصيص، وفيه دوال كتير زي `upper` و `split`.",
     "A string is text written between quotes, with many useful methods like `upper` and `split`.",
     'text = "hello world"\nprint(text.upper())\nprint(text.split())'),
    (["exception", "الاستثناءات", "الأخطاء"], ["an exception", "exceptions"],
     "الـ exception هو خطأ بيصير وقت التشغيل، وبنقدر نمسكه بـ `try` / `except` عشان البرنامج ما يوقف.",
     "An exception is a runtime error; you can catch it with `try` / `except` so the program doesn't crash.",
     'try:\n    print(1 / 0)\nexcept ZeroDivisionError:\n    print("Cannot divide by zero")'),
    (["module", "المكتبة", "import"], ["a module", "importing modules"],
     "الـ module هو ملف فيه كود جاهز، وبنستعمله بـ `import`.",
     "A module is a file of reusable code; you load it with `import`.",
     "import math\nprint(math.sqrt(16))  # 4.0"),
    (["بايثون", "python", "لغة بايثون"], ["python", "the python language"],
     "بايثون لغة برمجة سهلة القراءة ومشهورة جدًا، بتنستعمل بالمواقع، تحليل البيانات، الذكاء الاصطناعي والأتمتة.",
     "Python is a very popular, readable programming language used for web, data analysis, AI and automation.",
     'print("Hello, World!")'),
    (["جافاسكربت", "javascript", "JS"], ["javascript", "JS"],
     "جافاسكربت هي لغة الويب: بتشتغل بالمتصفح عشان تخلي الصفحات تفاعلية، وكمان على السيرفر مع Node.js.",
     "JavaScript is the language of the web: it runs in the browser to make pages interactive, and on servers with Node.js.",
     None),
]
AR_CONCEPT_Q = ["شو يعني {x}؟", "شو هو {x}", "اشرحلي {x}", "ما هو {x}؟", "شو معنى {x} بالبرمجة",
                "ممكن تشرحلي شو {x}", "عرفني على {x}", "ايش يعني {x}"]
EN_CONCEPT_Q = ["what is {x}?", "What is {x}", "explain {x}", "can you explain {x}?", "what does {x} mean in programming",
                "tell me about {x}", "what are {x}"]

# --------------------------------------------------------------------------
# Small talk + out-of-scope
# --------------------------------------------------------------------------
SMALLTALK = [
    (["مرحبا", "هلا", "أهلا", "السلام عليكم", "مرحبا كيفك", "هاي", "أهلين"],
     ["hi", "hello", "hey", "Hello!", "hi there", "good morning"],
     ["أهلا وسهلا! 👋 أنا مساعدك الخاص للبرمجة. اطلب مني أكتبلك كود أو أشرحلك مفهوم برمجي.",
      "مرحبا! كيف بقدر أساعدك بالبرمجة اليوم؟", "أهلين! 😊 شو بدك نبرمج اليوم؟"],
     ["Hi! 👋 I'm your personal coding assistant. Ask me to write code or explain a programming concept.",
      "Hello! How can I help you with programming today?", "Hey! 😊 What would you like to code today?"]),
    (["مين انت؟", "من أنت", "شو انت", "عرف عن حالك", "انت مين", "شو اسمك"],
     ["who are you?", "what are you", "introduce yourself", "what's your name"],
     ["أنا نموذج ذكاء اصطناعي خاص للبرمجة، مبني ومدرّب من الصفر بالكامل بدون أي نموذج تاني. بقدر أكتب كود بايثون (وشوية جافاسكربت) وأشرح مفاهيم البرمجة."],
     ["I'm a personal AI model for programming, built and trained completely from scratch without using any other model. I can write Python (and some JavaScript) and explain programming concepts."]),
    (["شو بتقدر تعمل؟", "شو بتعرف تعمل", "كيف بتساعدني", "شو خدماتك"],
     ["what can you do?", "how can you help me", "what are you able to do"],
     ["بقدر:\n- أكتب دوال بايثون (حساب، نصوص، قوائم، ترتيب، بحث...)\n- أعمل كلاسات\n- أكتب برامج صغيرة (آلة حاسبة، ألعاب، ملفات، سيرفر)\n- أشرح مفاهيم زي list و dict و class و recursion\n- بعض الأكواد بجافاسكربت\n\nجرب مثلًا: «اكتب دالة بتفحص إذا الرقم أولي»"],
     ["I can:\n- write Python functions (math, strings, lists, sorting, searching...)\n- create classes\n- write small programs (calculator, games, files, a web server)\n- explain concepts like lists, dicts, classes and recursion\n- write some JavaScript too\n\nTry: \"write a function that checks if a number is prime\""]),
    (["شكرا", "يسلمو", "شكرًا جزيلًا", "مشكور", "تسلم"],
     ["thanks", "thank you", "thanks a lot", "thx"],
     ["العفو! 😊 إذا بدك أي شي تاني بالبرمجة أنا هون.", "ولو! بالتوفيق بالبرمجة 💪"],
     ["You're welcome! 😊 Let me know if you need anything else.", "Anytime! Happy coding 💪"]),
    (["كيفك", "كيف حالك", "شو أخبارك"],
     ["how are you", "how are you doing?", "what's up"],
     ["أنا تمام، شكرًا! 😊 جاهز أساعدك بالكود. شو بدك نعمل؟"],
     ["I'm doing great, thanks! 😊 Ready to help with your code. What shall we build?"]),
    (["مين عملك؟", "مين صنعك", "مين برمجك"],
     ["who made you?", "who created you", "who built you"],
     ["أنا نموذج خاص بصاحبي، اتبنيت واتدربت من الصفر على كود بايثون مفتوح المصدر وأمثلة برمجة، بدون الاعتماد على أي نموذج ذكاء اصطناعي تاني."],
     ["I'm a personal model built for my owner, trained from scratch on open-source Python code and programming examples, without relying on any other AI model."]),
    (["مع السلامة", "باي", "يلا باي"],
     ["bye", "goodbye", "see you"],
     ["مع السلامة! 👋 ارجع أي وقت بدك تبرمج."],
     ["Goodbye! 👋 Come back anytime you want to code."]),
]
OUT_OF_SCOPE_AR = ["شو الطقس اليوم؟", "مين ربح كاس العالم", "احكيلي نكتة", "شو عاصمة فرنسا", "شو أخبار السياسة",
                   "اكتبلي قصيدة", "كم الساعة هلأ", "شو أحسن مطعم", "ترجملي هالجملة", "شو رأيك بالحب",
                   "مين أغنى شخص بالعالم", "اعطيني وصفة كبسة", "احكيلي عن التاريخ", "شو سعر الدولار"]
OUT_OF_SCOPE_EN = ["what's the weather today?", "who won the world cup", "tell me a joke", "what is the capital of France",
                   "write me a poem", "what time is it", "best restaurant near me", "translate this sentence",
                   "who is the richest person", "give me a recipe", "what is the price of bitcoin", "tell me about history"]
OOS_AR = ["أنا نموذج متخصص بالبرمجة بس، فما بقدر أجاوب على هاد السؤال 🙏 بس إذا بدك كود أو شرح لمفهوم برمجي، أنا جاهز!",
          "للأسف هاد خارج تخصصي — أنا مدرّب على البرمجة فقط. جرب تسألني مثلًا: «اكتب دالة بترتب قائمة»."]
OOS_EN = ["I'm specialised in programming only, so I can't answer that 🙏 But if you need code or a programming explanation, I'm ready!",
          "Sorry, that's outside my expertise — I was trained for programming only. Try asking: \"write a function that sorts a list\"."]



# --------------------------------------------------------------------------
# Augmentation: keywords, flexible phrasing, noise  (forces the model to read
# the *meaning* of the request instead of memorising template wording)
# --------------------------------------------------------------------------
KEYWORDS = {  # function name -> (arabic keywords, english keywords)
    "add": (["مجموع رقمين", "جمع عددين", "جمع رقمين", "مجموع عددين"], ["sum of two numbers", "add two numbers", "addition", "adding two ints"]),
    "subtract": (["طرح رقمين", "الفرق بين عددين", "طرح"], ["subtraction", "difference of two numbers", "minus"]),
    "multiply": (["ضرب رقمين", "حاصل الضرب", "ضرب عددين"], ["multiplication", "product of two numbers", "multiply"]),
    "divide": (["قسمة رقمين", "القسمة", "قسمة عددين"], ["division", "divide two numbers", "safe division"]),
    "power": (["الأس", "القوة", "رفع لقوة"], ["power", "exponent", "a to the power b"]),
    "factorial": (["المضروب", "العاملي", "factorial", "مضروب العدد"], ["factorial", "n factorial", "factorial of n"]),
    "fibonacci": (["فيبوناتشي", "متتالية فيبوناتشي", "fibonacci"], ["fibonacci", "fib sequence", "nth fibonacci"]),
    "is_prime": (["رقم أولي", "العدد الأولي", "اولي", "prime"], ["prime check", "is prime", "prime number", "primality"]),
    "primes_up_to": (["الأعداد الأولية لحد n", "قائمة الأوليات", "كل الأرقام الأولية"], ["primes up to n", "list of primes", "all prime numbers"]),
    "is_even": (["زوجي أو فردي", "الرقم زوجي", "زوجي"], ["even or odd", "is even", "check even"]),
    "reverse_string": (["قلب نص", "عكس كلمة", "عكس النص", "قلب كلمة"], ["reverse string", "string reversal", "reverse a word", "backwards text"]),
    "is_palindrome": (["palindrome", "كلمة متناظرة", "النص المتناظر"], ["palindrome", "palindrome check", "is palindrome"]),
    "count_vowels": (["الحروف المتحركة", "حروف العلة", "عد vowels"], ["vowels", "count vowels", "vowel counter"]),
    "count_words": (["عدد الكلمات", "عد الكلمات", "كم كلمة"], ["word count", "count words", "number of words"]),
    "word_frequency": (["تكرار الكلمات", "عدد مرات كل كلمة"], ["word frequency", "word counts", "count each word"]),
    "sum_list": (["مجموع قائمة", "مجموع عناصر list", "جمع قائمة أرقام"], ["sum of a list", "list sum", "total of list"]),
    "find_max": (["أكبر رقم في قائمة", "أكبر قيمة", "الماكس", "أكبر عنصر"], ["max of list", "largest number", "biggest element", "maximum value"]),
    "find_min": (["أصغر رقم في قائمة", "أصغر قيمة", "المين"], ["min of list", "smallest number", "minimum value"]),
    "average": (["المعدل", "المتوسط", "average", "معدل العلامات"], ["average", "mean", "avg of numbers"]),
    "remove_duplicates": (["حذف التكرار", "إزالة المكرر", "بدون تكرار"], ["remove duplicates", "dedupe", "unique items"]),
    "get_evens": (["الأرقام الزوجية من قائمة", "فلترة الزوجي"], ["filter evens", "even numbers from list"]),
    "square_all": (["تربيع الأرقام", "مربعات القائمة"], ["square each number", "squares of list"]),
    "bubble_sort": (["bubble sort", "ترتيب الفقاعة", "خوارزمية bubble"], ["bubble sort", "bubblesort"]),
    "merge_sort": (["merge sort", "ترتيب بالدمج", "خوارزمية merge"], ["merge sort", "mergesort"]),
    "quick_sort": (["quick sort", "الفرز السريع", "خوارزمية quick"], ["quick sort", "quicksort"]),
    "binary_search": (["بحث ثنائي", "binary search", "البحث الثنائي"], ["binary search", "bisect search"]),
    "gcd": (["القاسم المشترك الأكبر", "gcd"], ["gcd", "greatest common divisor"]),
    "sum_digits": (["مجموع الخانات", "جمع أرقام العدد"], ["sum of digits", "digit sum"]),
    "celsius_to_fahrenheit": (["سيلسيوس لفهرنهايت", "تحويل درجة الحرارة"], ["celsius to fahrenheit", "temperature conversion"]),
    "circle_area": (["مساحة الدائرة", "مساحة دائرة"], ["circle area", "area of a circle"]),
    "rectangle_area": (["مساحة المستطيل", "مساحة مستطيل"], ["rectangle area", "area of rectangle"]),
    "max_of_three": (["أكبر رقم من تلاتة", "الأكبر بين 3 أرقام"], ["max of three", "largest of 3 numbers"]),
    "is_leap_year": (["سنة كبيسة", "السنة الكبيسة"], ["leap year", "is leap year"]),
    "generate_password": (["كلمة سر عشوائية", "باسورد عشوائي", "توليد كلمة مرور"], ["random password", "password generator"]),
    "is_valid_email": (["التحقق من الإيميل", "صيغة البريد", "validation ايميل"], ["email validation", "validate email", "valid email"]),
    "read_file": (["قراءة ملف", "قراءة ملف نصي"], ["read file", "read a text file"]),
    "write_file": (["الكتابة بملف", "حفظ نص بملف"], ["write file", "write to file"]),
    "count_lines": (["عدد أسطر ملف", "عد الأسطر"], ["count lines", "line count of file"]),
    "read_json": (["قراءة JSON", "تحميل ملف json"], ["read json", "load json"]),
    "save_json": (["حفظ JSON", "كتابة json"], ["save json", "write json"]),
    "list_files": (["الملفات بمجلد", "عرض ملفات فولدر"], ["list files", "files in folder"]),
    "merge_dicts": (["دمج قاموسين", "دمج dict"], ["merge dicts", "combine dictionaries"]),
    "sort_by_value": (["ترتيب قاموس بالقيمة", "ترتيب dict"], ["sort dict by value", "sort dictionary"]),
    "flatten": (["تفريد قائمة متداخلة", "flatten"], ["flatten list", "flatten nested list"]),
    "capitalize_words": (["تكبير أول حرف", "capitalize"], ["capitalize words", "title case"]),
    "count_char": (["تكرار حرف", "عد حرف بنص"], ["count a character", "character occurrences"]),
    "to_binary": (["تحويل لثنائي", "binary للرقم"], ["to binary", "decimal to binary"]),
}
AR_PRE_ANY = ["", "", "اكتب", "اكتبلي", "بدي", "اعطيني", "ممكن", "محتاج", "اريد", "أحتاج", "عطيني", "ابغى",
              "عايز", "ساعدني ب", "كيف بعمل", "شلون اعمل", "بدي كود", "اكتب كود", "كود", "فنكشن", "دالة",
              "ممكن فنكشن", "ممكن كود", "اعملي", "برمجلي", "سويلي", "محتاج كود", "بدي برنامج"]
EN_PRE_ANY = ["", "", "write", "i need", "give me", "can you do", "need code for", "python", "function for", "code for",
              "how to do", "show me", "help me with", "i want", "make", "implement", "create", "a function for",
              "python function:", "write code:", "please code"]
AR_FILL = ["يعني", "مثلا", "بسرعة", "بسيطة", "سهلة", "بليز", "لو سمحت", "ضروري", "يا صاحبي", "رجاءً"]
EN_FILL = ["simple", "quick", "please", "basically", "pls", "real quick", "for me", "easy"]


def typo(rng, text, p=0.08):
    words = text.split(" ")
    out = []
    for w in words:
        if len(w) > 3 and rng.random() < p:
            i = rng.randrange(len(w) - 1)
            op = rng.random()
            if op < 0.4:
                w = w[:i] + w[i + 1:]                      # drop a char
            elif op < 0.7:
                w = w[:i] + w[i + 1] + w[i] + w[i + 2:]    # swap
            else:
                w = w[:i] + w[i] + w[i:]                   # double
        out.append(w)
    return " ".join(out)


def flexible_request(rng, lang, phrases, keywords, js=False):
    """Many different ways of asking for the same thing."""
    mode = rng.random()
    core = rng.choice(keywords) if (keywords and mode < 0.45) else rng.choice(phrases)
    if lang == "ar":
        pre, fill, lang_sfx = AR_PRE_ANY, AR_FILL, (rng.choice(AR_JS) if js else rng.choice(AR_PY_SUFFIX))
        end = rng.choice(AR_END)
    else:
        pre, fill, lang_sfx = EN_PRE_ANY, EN_FILL, (rng.choice(EN_JS) if js else rng.choice(EN_PY_SUFFIX))
        end = rng.choice(EN_END)
    p = rng.choice(pre)
    if rng.random() < 0.25:                  # keyword first, request after
        req = f"{core}{lang_sfx} {p}".strip()
    else:
        req = f"{p} {core}{lang_sfx}".strip()
    if rng.random() < 0.3:
        words = req.split(" ")
        words.insert(rng.randint(0, len(words)), rng.choice(fill))
        req = " ".join(words)
    req = (req + end).strip()
    if rng.random() < 0.3:
        req = typo(rng, req)
    if lang == "en" and rng.random() < 0.3:
        req = req.lower()
    return req


def func_name(task):
    return re.search(r"def (\w+)", task["py"]).group(1)


# --------------------------------------------------------------------------
# Sampling
# --------------------------------------------------------------------------
def _func_request(rng, task, lang, js):
    if lang == "ar":
        return (rng.choice(AR_FUNC) + " " + rng.choice(task["ar"])
                + (rng.choice(AR_JS) if js else rng.choice(AR_PY_SUFFIX)) + rng.choice(AR_END))
    return (rng.choice(EN_FUNC) + " " + rng.choice(task["en"])
            + (rng.choice(EN_JS) if js else rng.choice(EN_PY_SUFFIX)) + rng.choice(EN_END))


def sample_func(rng):
    t = rng.choice(FUNC_TASKS)
    lang = rng.choice(["ar", "en"])
    js = bool(t.get("js")) and rng.random() < 0.2
    if rng.random() < 0.55:
        kw = KEYWORDS.get(func_name(t), ([], []))
        req = flexible_request(rng, lang, t[lang], kw[0] if lang == "ar" else kw[1], js)
    else:
        req = _func_request(rng, t, lang, js)
    code, cl = (t["js"], "javascript") if js else (t["py"], "python")
    if lang == "ar":
        ans = rng.choice(AR_INTRO).format(d=t["ar"][0]) + "\n\n" + code_block(code, cl) + "\n\n" + t["ex_ar"]
    else:
        ans = rng.choice(EN_INTRO).format(d=t["en"][0]) + "\n\n" + code_block(code, cl) + "\n\n" + t["ex_en"]
    return req, ans


def sample_program(rng):
    t = rng.choice(PROGRAM_TASKS)
    lang = rng.choice(["ar", "en"])
    js = bool(t.get("js")) and rng.random() < 0.2
    if lang == "ar":
        req = rng.choice(t["ar"]) + (rng.choice(AR_JS) if js else rng.choice(AR_PY_SUFFIX)) + rng.choice(AR_END)
        intro, ex = rng.choice(AR_INTRO_CODE), t["ex_ar"]
    else:
        req = rng.choice(t["en"]) + (rng.choice(EN_JS) if js else rng.choice(EN_PY_SUFFIX)) + rng.choice(EN_END)
        intro, ex = rng.choice(EN_INTRO_CODE), t["ex_en"]
    if rng.random() < 0.3:
        req = typo(rng, req)
    code, cl = (t["js"], "javascript") if js else (t["py"], "python")
    return req, intro + "\n\n" + code_block(code, cl) + "\n\n" + ex


def sample_class(rng):
    req, ans, _ = gen_class(rng, rng.choice(["ar", "en"]))
    return req, ans


def sample_loop(rng):
    lang = rng.choice(["ar", "en"])
    ar, en, code, ex_ar, ex_en, js_code = gen_loop(rng, lang)
    js = rng.random() < 0.2
    if lang == "ar":
        req = rng.choice(ar) + (rng.choice(AR_JS) if js else rng.choice(AR_PY_SUFFIX)) + rng.choice(AR_END)
        intro, ex = rng.choice(AR_INTRO_CODE), ex_ar
    else:
        req = rng.choice(en) + (rng.choice(EN_JS) if js else rng.choice(EN_PY_SUFFIX)) + rng.choice(EN_END)
        intro, ex = rng.choice(EN_INTRO_CODE), ex_en
    if js:
        return req, intro + "\n\n" + code_block(js_code, "javascript")
    return req, intro + "\n\n" + code_block(code) + "\n\n" + ex


def sample_values(rng):
    lang = rng.choice(["ar", "en"])
    req, code, ex_ar, ex_en = gen_values(rng, lang)
    if lang == "ar":
        return req + rng.choice(AR_END), rng.choice(AR_INTRO_CODE) + "\n\n" + code_block(code) + "\n\n" + ex_ar
    return req + rng.choice(EN_END), rng.choice(EN_INTRO_CODE) + "\n\n" + code_block(code) + "\n\n" + ex_en


def sample_concept(rng):
    ar_names, en_names, ex_ar, ex_en, code = rng.choice(CONCEPTS)
    if rng.random() < 0.5:
        req = rng.choice(AR_CONCEPT_Q).format(x=rng.choice(ar_names))
        ans = ex_ar + ("\n\nمثال:\n\n" + code_block(code) if code else "")
    else:
        req = rng.choice(EN_CONCEPT_Q).format(x=rng.choice(en_names))
        ans = ex_en + ("\n\nExample:\n\n" + code_block(code) if code else "")
    return req, ans


def sample_smalltalk(rng):
    ar_q, en_q, ar_a, en_a = rng.choice(SMALLTALK)
    if rng.random() < 0.5:
        return rng.choice(ar_q), rng.choice(ar_a)
    return rng.choice(en_q), rng.choice(en_a)


def sample_oos(rng):
    if rng.random() < 0.5:
        return rng.choice(OUT_OF_SCOPE_AR), rng.choice(OOS_AR)
    return rng.choice(OUT_OF_SCOPE_EN), rng.choice(OOS_EN)


SAMPLERS = [(sample_func, 0.44), (sample_program, 0.12), (sample_class, 0.13), (sample_loop, 0.09),
            (sample_values, 0.07), (sample_concept, 0.09), (sample_smalltalk, 0.04), (sample_oos, 0.02)]


def generate(n, seed=0):
    rng = random.Random(seed)
    fns, weights = zip(*SAMPLERS)
    out = []
    for _ in range(n):
        fn = rng.choices(fns, weights)[0]
        out.append(fn(rng))
    return out


def verify_code():
    """Execute every Python solution + its test, so the model only learns correct code."""
    import contextlib, io, builtins
    n_ok = 0
    for t in FUNC_TASKS + PROGRAM_TASKS:
        if "input(" in t["py"] or "serve_forever" in t["py"] or "urlopen" in t["py"] or "open(" in t["py"]:
            compile(t["py"], "<task>", "exec")
            continue
        ns = {}
        with contextlib.redirect_stdout(io.StringIO()):
            exec(t["py"], ns)
            if t.get("test"):
                exec(t["test"], ns)
        n_ok += 1
    rng = random.Random(1)
    for _ in range(200):
        _, _, code = gen_class(rng, "en")
        with contextlib.redirect_stdout(io.StringIO()):
            exec(code, {})
        _, _, code, *_ = gen_loop(rng, "en")
        with contextlib.redirect_stdout(io.StringIO()):
            exec(code, {})
    return n_ok


if __name__ == "__main__":
    print("verified", verify_code(), "tasks executed OK")
    for req, ans in generate(6, seed=3):
        print("=" * 60)
        print(fmt_example(req, ans))
