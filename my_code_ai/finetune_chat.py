"""
Turn the from-scratch code model into a chat assistant (instruction tuning).

Starts from YOUR base model (checkpoints/model.pt), grows its vocabulary with the
new Arabic/chat tokens, then trains on the generated chat dataset. Loss is
computed only on the assistant's answers. A slice of raw code is mixed in so it
keeps its general Python knowledge.

    python finetune_chat.py --max_minutes 40
"""
import argparse
import json
import math
import os
import pickle
import time

import numpy as np
import torch

from model import CodeGPT, ModelConfig
from tokenizer import BPETokenizer

HERE = os.path.dirname(os.path.abspath(__file__))


def grow_vocab(model, base_tok, new_tok):
    """Copy old embeddings; init each new merge token as the mean of its parts."""
    old = model.tok_emb.weight.data
    n_merges_old = len(base_tok.merges)
    V = new_tok.vocab_size
    W = torch.empty(V, old.size(1))
    W[: 256 + n_merges_old] = old[: 256 + n_merges_old]
    for (a, b), idx in new_tok.merges.items():
        if idx >= 256 + n_merges_old:
            W[idx] = 0.5 * (W[a] + W[b])
    W[new_tok.eot_id] = old[base_tok.eot_id]
    model.cfg.vocab_size = V
    model.tok_emb = torch.nn.Embedding(V, old.size(1))
    model.tok_emb.weight.data.copy_(W)
    model.head = torch.nn.Linear(old.size(1), V, bias=False)
    model.head.weight = model.tok_emb.weight


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.path.join(HERE, "checkpoints", "model.pt"))
    ap.add_argument("--data", default=os.path.join(HERE, "data"))
    ap.add_argument("--out", default=os.path.join(HERE, "checkpoints"))
    ap.add_argument("--block_size", type=int, default=320)
    ap.add_argument("--tokens_per_step", type=int, default=4096)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--max_iters", type=int, default=3000)
    ap.add_argument("--max_minutes", type=float, default=None)
    ap.add_argument("--code_mix", type=float, default=0.15)
    ap.add_argument("--eval_every", type=int, default=200)
    args = ap.parse_args()
    torch.set_num_threads(os.cpu_count())
    torch.manual_seed(0)
    rng = np.random.default_rng(0)

    base_tok = BPETokenizer.load(os.path.join(args.data, "tokenizer.json"))
    tok = BPETokenizer.load(os.path.join(args.data, "chat_tokenizer.json"))
    with open(os.path.join(args.data, "chat.pkl"), "rb") as f:
        enc = pickle.load(f)
    train = sorted(enc["train"], key=lambda x: len(x[0]))
    val = enc["val"]
    code = np.memmap(os.path.join(args.data, "train.bin"), dtype=np.uint16, mode="r")
    print(f"chat examples: {len(train)} train / {len(val)} val; vocab {base_tok.vocab_size} -> {tok.vocab_size}")

    ck = torch.load(args.base, map_location="cpu")
    cfg = ModelConfig(**ck["config"])
    model = CodeGPT(cfg)
    model.load_state_dict({k: v.float() for k, v in ck["model"].items()})
    grow_vocab(model, base_tok, tok)
    # longer context: RoPE just needs a bigger cache
    from model import rope_cache
    model.cfg.block_size = args.block_size
    cos, sin = rope_cache(args.block_size, cfg.n_embd // cfg.n_head, "cpu")
    model.rope_cos, model.rope_sin = cos, sin
    print(f"model: {model.num_params() / 1e6:.2f}M params, initialised from base (iter {ck['iter']})")

    def make_batch(examples):
        L = min(args.block_size + 1, max(len(x) for x, _ in examples))
        X = torch.zeros(len(examples), L - 1, dtype=torch.long)
        Y = torch.full((len(examples), L - 1), -100, dtype=torch.long)
        for i, (ids, plen) in enumerate(examples):
            ids = ids[:L]
            t = torch.tensor(ids)
            X[i, : len(ids) - 1] = t[:-1]
            y = t[1:].clone()
            y[: max(0, plen - 1)] = -100  # don't learn to predict the user prompt
            Y[i, : len(ids) - 1] = y
        return X, Y

    def chat_batch():
        j = int(rng.integers(len(train)))
        L = len(train[j][0])
        bs = max(4, args.tokens_per_step // max(L, 1))
        lo = max(0, min(j - bs // 2, len(train) - bs))
        return make_batch(train[lo: lo + bs])

    def code_batch():
        T, bs = 256, args.tokens_per_step // 256
        ix = rng.integers(0, len(code) - T - 1, bs)
        a = np.stack([code[i: i + T + 1].astype(np.int64) for i in ix])
        a[a == base_tok.eot_id] = tok.eot_id
        t = torch.from_numpy(a)
        return t[:, :-1], t[:, 1:]

    def loss_fn(X, Y):
        logits, _ = model(X)
        return torch.nn.functional.cross_entropy(
            logits.reshape(-1, logits.size(-1)), Y.reshape(-1), ignore_index=-100)

    @torch.no_grad()
    def evaluate():
        model.eval()
        ls = []
        for k in range(0, 256, 32):
            X, Y = make_batch(val[k:k + 32])
            ls.append(loss_fn(X, Y).item())
        model.train()
        return float(np.mean(ls))

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, betas=(0.9, 0.95), weight_decay=0.05)
    warm = 100

    def lr_at(i):
        if i < warm:
            return args.lr * (i + 1) / warm
        r = min(1.0, (i - warm) / max(1, args.max_iters - warm))
        return args.lr * (0.05 + 0.95 * 0.5 * (1 + math.cos(math.pi * r)))

    history = []
    os.makedirs(args.out, exist_ok=True)

    def save(it, vl):
        cfgd = model.cfg.to_dict()
        torch.save({"model": {k: v.half() for k, v in model.state_dict().items()},
                    "config": cfgd, "iter": it, "val_loss": vl, "kind": "chat",
                    "tokenizer": "chat_tokenizer.json"},
                   os.path.join(args.out, "chat_model.pt"))
        with open(os.path.join(args.out, "chat_history.json"), "w") as f:
            json.dump(history, f, indent=1)

    print(f"initial chat val loss: {evaluate():.3f}")
    t_start = t0 = time.time()
    model.train()
    it = 0
    while it < args.max_iters:
        for g in opt.param_groups:
            g["lr"] = lr_at(it)
        X, Y = code_batch() if rng.random() < args.code_mix else chat_batch()
        loss = loss_fn(X, Y)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        it += 1
        if it % 25 == 0:
            print(f"iter {it:5d} | loss {loss.item():.3f} | lr {lr_at(it):.2e} | "
                  f"{(time.time() - t0) / 25:.2f}s/it", flush=True)
            t0 = time.time()
        out_of_time = args.max_minutes and (time.time() - t_start) / 60 > args.max_minutes
        if it % args.eval_every == 0 or it == args.max_iters or out_of_time:
            vl = evaluate()
            history.append({"iter": it, "train_loss": round(loss.item(), 4), "val_loss": round(vl, 4)})
            print(f"==> eval iter {it}: chat val loss {vl:.3f}", flush=True)
            save(it, vl)
            if out_of_time:
                print("time budget reached.")
                break
    print("done.")


if __name__ == "__main__":
    main()
