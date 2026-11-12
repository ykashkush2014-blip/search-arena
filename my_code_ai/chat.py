"""
Talk to your own programming AI (Arabic or English).

    python chat.py                       # interactive
    python chat.py "اكتب دالة بتقلب نص"   # one question
"""
import os
import sys

import torch

from chat_data import fmt_prompt
from model import CodeGPT, ModelConfig
from tokenizer import BPETokenizer

HERE = os.path.dirname(os.path.abspath(__file__))


def load_chat(ckpt=None, device="cpu"):
    ckpt = ckpt or os.path.join(HERE, "checkpoints", "chat_model.pt")
    ck = torch.load(ckpt, map_location=device)
    tok = BPETokenizer.load(os.path.join(HERE, "data", ck.get("tokenizer", "chat_tokenizer.json")))
    model = CodeGPT(ModelConfig(**ck["config"]))
    model.load_state_dict({k: v.float() for k, v in ck["model"].items()})
    model.to(device).eval()
    return model, tok, ck


def answer(model, tok, message, max_new_tokens=300, temperature=0.0, top_k=20, stream=None):
    """Generate the assistant reply. temperature=0 -> deterministic (best for code)."""
    ids = tok.encode(fmt_prompt(message), allow_special=False)
    room = model.cfg.block_size - 8
    ids = ids[-room:]
    x = torch.tensor([ids], dtype=torch.long)
    out, printed = [], ""
    for t in model.generate(x, max_new_tokens=max_new_tokens, temperature=temperature,
                            top_k=top_k, top_p=1.0, repetition_penalty=1.0,
                            stop_ids=[tok.eot_id]):
        out.append(t)
        text = tok.decode(out)
        if "<|user|>" in text:            # safety: never invent the user's next turn
            text = text.split("<|user|>")[0]
            break
        if stream and not text.endswith("\ufffd"):
            stream(text[len(printed):])
            printed = text
    return tok.decode(out).split("<|user|>")[0].strip()


def main():
    torch.set_num_threads(os.cpu_count())
    model, tok, ck = load_chat()
    print(f"[my_code_ai chat] {model.num_params() / 1e6:.1f}M params · built from scratch", file=sys.stderr)
    w = lambda s: (sys.stdout.write(s), sys.stdout.flush())
    if len(sys.argv) > 1:
        answer(model, tok, " ".join(sys.argv[1:]), stream=w)
        print()
        return
    print("اكتب سؤالك (عربي أو English). Ctrl+C للخروج.\n")
    while True:
        try:
            msg = input("👤 > ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if msg:
            sys.stdout.write("🤖 ")
            answer(model, tok, msg, stream=w)
            print("\n")


if __name__ == "__main__":
    main()
