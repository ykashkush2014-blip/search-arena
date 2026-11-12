"""
Complete code with your own model from the command line.

    python generate.py "def fibonacci(n):"
    python generate.py --file my_script.py --tokens 150
    python generate.py            # interactive mode
"""
import argparse
import os
import sys

import torch

from model import CodeGPT, ModelConfig
from tokenizer import BPETokenizer

HERE = os.path.dirname(os.path.abspath(__file__))


def load(ckpt=None, tok_path=None, device="cpu"):
    ckpt = ckpt or os.path.join(HERE, "checkpoints", "model.pt")
    tok_path = tok_path or os.path.join(HERE, "data", "tokenizer.json")
    tok = BPETokenizer.load(tok_path)
    ck = torch.load(ckpt, map_location=device)
    model = CodeGPT(ModelConfig(**ck["config"]))
    model.load_state_dict({k: v.float() for k, v in ck["model"].items()})
    model.to(device).eval()
    return model, tok, ck


def complete(model, tok, prompt, max_new_tokens=200, temperature=0.7, top_k=40,
             top_p=0.95, repetition_penalty=1.1, stream=None):
    ids = tok.encode(prompt.replace("\t", "    "), allow_special=False) or [tok.eot_id]
    x = torch.tensor([ids], dtype=torch.long)
    out_ids, printed = [], ""
    for t in model.generate(x, max_new_tokens, temperature, top_k, top_p,
                            repetition_penalty, stop_ids=[tok.eot_id]):
        out_ids.append(t)
        text = tok.decode(out_ids)
        if stream and not text.endswith("\ufffd"):
            stream(text[len(printed):])
            printed = text
    return tok.decode(out_ids)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt", nargs="?")
    ap.add_argument("--file")
    ap.add_argument("--tokens", type=int, default=200)
    ap.add_argument("--temperature", type=float, default=0.7)
    ap.add_argument("--top_k", type=int, default=40)
    ap.add_argument("--ckpt")
    args = ap.parse_args()
    torch.set_num_threads(os.cpu_count())

    model, tok, ck = load(args.ckpt)
    print(f"[my_code_ai] {model.num_params() / 1e6:.1f}M params, trained {ck['iter']} iters, "
          f"val loss {ck['val_loss']:.3f}", file=sys.stderr)

    def run(prompt):
        sys.stdout.write(prompt)
        complete(model, tok, prompt, args.tokens, args.temperature, args.top_k,
                 stream=lambda s: (sys.stdout.write(s), sys.stdout.flush()))
        print("\n" + "-" * 60)

    if args.file:
        run(open(args.file).read())
    elif args.prompt:
        run(args.prompt.replace("\\n", "\n"))
    else:
        print("Interactive mode. Type code, finish with an empty line. Ctrl+C to quit.")
        while True:
            lines = []
            try:
                while True:
                    l = input("... " if lines else ">>> ")
                    if not l and lines:
                        break
                    lines.append(l)
            except (EOFError, KeyboardInterrupt):
                print()
                return
            run("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
