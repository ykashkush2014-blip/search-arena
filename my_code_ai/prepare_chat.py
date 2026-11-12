"""
Build the chat (instruction) dataset and extend the tokenizer with
Arabic / chat vocabulary — all from scratch, no other model involved.

    python prepare_chat.py --n_train 60000
"""
import argparse
import os
import pickle

from chat_data import generate, fmt_example, verify_code
from tokenizer import BPETokenizer

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n_train", type=int, default=60000)
    ap.add_argument("--n_val", type=int, default=1000)
    ap.add_argument("--vocab_size", type=int, default=6144)
    ap.add_argument("--data", default=os.path.join(HERE, "data"))
    args = ap.parse_args()

    print("verifying all reference solutions ...", verify_code(), "OK")
    train = generate(args.n_train, seed=0)
    val = generate(args.n_val, seed=999)

    base = BPETokenizer.load(os.path.join(args.data, "tokenizer.json"))
    sample = "\n".join(fmt_example(q, a) for q, a in train[:20000]).replace("<|endoftext|>", "\n")
    print(f"extending tokenizer {base.vocab_size} -> {args.vocab_size} on chat data ...")
    tok = BPETokenizer.train(sample, vocab_size=args.vocab_size, base=base, verbose=False)
    tok.save(os.path.join(args.data, "chat_tokenizer.json"))
    new = [tok.decode([i]) for i in range(256 + len(base.merges), 256 + len(tok.merges))]
    print("examples of new tokens:", new[:5], new[200:205], new[-5:])

    def encode(pairs):
        out = []
        for q, a in pairs:
            full = fmt_example(q, a)
            prompt_len = len(tok.encode(full[: len(full) - len(a.strip()) - len("<|endoftext|>")]))
            out.append((tok.encode(full), prompt_len))
        return out

    enc = {"train": encode(train), "val": encode(val)}
    lens = sorted(len(x) for x, _ in enc["train"])
    print(f"train examples: {len(lens)}, tokens: {sum(lens):,}, "
          f"median len {lens[len(lens)//2]}, p99 {lens[int(len(lens)*.99)]}, max {lens[-1]}")
    ar = [q for q, _ in train[:2000] if any('\u0600' <= c <= '\u06FF' for c in q)]
    print("Arabic request example tokens:", len(base.encode(ar[0])), "->", len(tok.encode(ar[0])), repr(ar[0]))
    with open(os.path.join(args.data, "chat.pkl"), "wb") as f:
        pickle.dump(enc, f)


if __name__ == "__main__":
    main()
