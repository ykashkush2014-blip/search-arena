"""
Build the training corpus + train the tokenizer from scratch.

Usage:
    python prepare_data.py --src /path/to/code [/another/path ...] \
        --ext .py .js .ts --max_mb 30 --vocab_size 4096

Default sources: the Python standard library and installed packages on this
machine (real, human-written open-source code). Point --src at your own
projects to make the model learn YOUR coding style.
"""
import argparse
import os
import random
import sys
import sysconfig
import time

import numpy as np

from tokenizer import BPETokenizer, EOT

HERE = os.path.dirname(os.path.abspath(__file__))


def default_sources():
    srcs = [sysconfig.get_paths()["stdlib"]]
    purelib = sysconfig.get_paths()["purelib"]
    if os.path.isdir(purelib):
        srcs.append(purelib)
    return srcs


SKIP_DIRS = {"__pycache__", ".git", "node_modules", "nvidia", "triton",
             ".venv", "venv", "build", "dist", "site-packages-skip"}


def collect_files(srcs, exts, max_file_kb=150):
    files = []
    for src in srcs:
        for root, dirs, names in os.walk(src):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.endswith(".dist-info")]
            for n in names:
                if os.path.splitext(n)[1] in exts:
                    p = os.path.join(root, n)
                    try:
                        if 200 < os.path.getsize(p) < max_file_kb * 1024:
                            files.append(p)
                    except OSError:
                        pass
    return sorted(set(files))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", nargs="*", default=None)
    ap.add_argument("--ext", nargs="*", default=[".py"])
    ap.add_argument("--max_mb", type=float, default=30.0)
    ap.add_argument("--vocab_size", type=int, default=4096)
    ap.add_argument("--tok_sample_mb", type=float, default=4.0,
                    help="how much text to learn BPE merges from")
    ap.add_argument("--out", default=os.path.join(HERE, "data"))
    ap.add_argument("--seed", type=int, default=1337)
    args = ap.parse_args()

    random.seed(args.seed)
    os.makedirs(args.out, exist_ok=True)
    srcs = args.src or default_sources()
    print("Sources:", *srcs, sep="\n  ")

    files = collect_files(srcs, set(args.ext))
    random.shuffle(files)
    print(f"Found {len(files)} candidate files")

    docs, total = [], 0
    for p in files:
        try:
            with open(p, encoding="utf-8") as f:
                t = f.read()
        except (UnicodeDecodeError, OSError):
            continue
        t = t.replace("\r\n", "\n").replace("\t", "    ")
        if EOT in t:
            continue
        docs.append(t)
        total += len(t)
        if total > args.max_mb * 1e6:
            break
    print(f"Using {len(docs)} files, {total / 1e6:.1f} MB of code")

    # ---- tokenizer
    t0 = time.time()
    sample, s = [], 0
    for d in docs:
        sample.append(d)
        s += len(d)
        if s > args.tok_sample_mb * 1e6:
            break
    print(f"Training BPE tokenizer (vocab={args.vocab_size}) on {s / 1e6:.1f} MB ...")
    tok = BPETokenizer.train("\n".join(sample), vocab_size=args.vocab_size)
    tok.save(os.path.join(args.out, "tokenizer.json"))
    print(f"Tokenizer done in {time.time() - t0:.0f}s, vocab={tok.vocab_size}")

    # ---- encode
    t0 = time.time()
    n_val = max(1, len(docs) // 50)
    splits = {"val": docs[:n_val], "train": docs[n_val:]}
    for name, ds in splits.items():
        ids = []
        for i, d in enumerate(ds):
            ids.extend(tok.encode(d, allow_special=False))
            ids.append(tok.eot_id)
            if (i + 1) % 1000 == 0:
                print(f"  {name}: encoded {i + 1}/{len(ds)} files, {len(ids):,} tokens")
        arr = np.array(ids, dtype=np.uint16)
        arr.tofile(os.path.join(args.out, f"{name}.bin"))
        print(f"{name}: {len(arr):,} tokens")
    print(f"Encoding done in {time.time() - t0:.0f}s  "
          f"(~{total / max(1, len(arr) + 1):.1f} chars/token on val)")


if __name__ == "__main__":
    sys.exit(main())
