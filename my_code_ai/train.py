"""
Train the code model from scratch (random init — no pretrained weights).

    python train.py --preset cpu-small   # runs on a laptop CPU
    python train.py --preset gpu-base    # if you have an NVIDIA GPU

Training resumes automatically from checkpoints/ckpt.pt if it exists.
"""
import argparse
import json
import math
import os
import time

import numpy as np
import torch

from model import CodeGPT, ModelConfig
from tokenizer import BPETokenizer

HERE = os.path.dirname(os.path.abspath(__file__))

PRESETS = {
    # ~4M params - trains in about an hour on 2 CPU cores
    "cpu-small": dict(n_layer=4, n_head=4, n_embd=256, block_size=256,
                      batch_size=16, lr=1.5e-3, max_iters=3000, warmup=100),
    # ~25M params - a few hours on a consumer GPU
    "gpu-base": dict(n_layer=8, n_head=8, n_embd=512, block_size=512,
                     batch_size=32, lr=6e-4, max_iters=30000, warmup=1000),
    # ~120M params - serious training, needs a good GPU and lots of code
    "gpu-large": dict(n_layer=12, n_head=12, n_embd=768, block_size=1024,
                      batch_size=32, lr=3e-4, max_iters=100000, warmup=2000),
}


def get_batch(data, block_size, batch_size, device):
    ix = torch.randint(len(data) - block_size - 1, (batch_size,))
    x = torch.stack([torch.from_numpy(data[i:i + block_size].astype(np.int64)) for i in ix])
    y = torch.stack([torch.from_numpy(data[i + 1:i + 1 + block_size].astype(np.int64)) for i in ix])
    return x.to(device), y.to(device)


@torch.no_grad()
def estimate_loss(model, data, block_size, batch_size, device, iters=20):
    model.eval()
    losses = [model(*get_batch(data, block_size, batch_size, device))[1].item()
              for _ in range(iters)]
    model.train()
    return float(np.mean(losses))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", default="cpu-small", choices=PRESETS)
    ap.add_argument("--data", default=os.path.join(HERE, "data"))
    ap.add_argument("--out", default=os.path.join(HERE, "checkpoints"))
    ap.add_argument("--max_iters", type=int, default=None)
    ap.add_argument("--max_minutes", type=float, default=None,
                    help="stop (and save) after this many minutes")
    ap.add_argument("--eval_every", type=int, default=250)
    ap.add_argument("--threads", type=int, default=os.cpu_count())
    ap.add_argument("--no_resume", action="store_true")
    args = ap.parse_args()

    P = dict(PRESETS[args.preset])
    if args.max_iters:
        P["max_iters"] = args.max_iters
    device = "cuda" if torch.cuda.is_available() else "cpu"
    torch.set_num_threads(args.threads)
    torch.manual_seed(1337)

    tok = BPETokenizer.load(os.path.join(args.data, "tokenizer.json"))
    train = np.memmap(os.path.join(args.data, "train.bin"), dtype=np.uint16, mode="r")
    val = np.memmap(os.path.join(args.data, "val.bin"), dtype=np.uint16, mode="r")
    print(f"device={device}  train={len(train):,} tok  val={len(val):,} tok")

    cfg = ModelConfig(vocab_size=tok.vocab_size, block_size=P["block_size"],
                      n_layer=P["n_layer"], n_head=P["n_head"], n_embd=P["n_embd"])
    model = CodeGPT(cfg).to(device)
    print(f"model: {model.num_params() / 1e6:.2f}M parameters (random init)")

    decay = [p for n, p in model.named_parameters() if p.dim() >= 2]
    no_decay = [p for n, p in model.named_parameters() if p.dim() < 2]
    opt = torch.optim.AdamW([{"params": decay, "weight_decay": 0.1},
                             {"params": no_decay, "weight_decay": 0.0}],
                            lr=P["lr"], betas=(0.9, 0.95))

    os.makedirs(args.out, exist_ok=True)
    ckpt_path = os.path.join(args.out, "ckpt.pt")
    it, best_val, history = 0, float("inf"), []
    if os.path.exists(ckpt_path) and not args.no_resume:
        ck = torch.load(ckpt_path, map_location=device)
        model.load_state_dict(ck["model"])
        opt.load_state_dict(ck["optimizer"])
        it, best_val, history = ck["iter"], ck["best_val"], ck.get("history", [])
        print(f"resumed from iter {it}")

    def lr_at(i):
        if i < P["warmup"]:
            return P["lr"] * (i + 1) / P["warmup"]
        r = min(1.0, (i - P["warmup"]) / max(1, P["max_iters"] - P["warmup"]))
        return P["lr"] * (0.1 + 0.9 * 0.5 * (1 + math.cos(math.pi * r)))

    def save(val_loss):
        torch.save({"model": model.state_dict(), "optimizer": opt.state_dict(),
                    "config": cfg.to_dict(), "iter": it, "best_val": best_val,
                    "history": history, "val_loss": val_loss}, ckpt_path)
        # small inference-only file (fp16 weights, no optimizer state)
        torch.save({"model": {k: v.half() for k, v in model.state_dict().items()},
                    "config": cfg.to_dict(), "iter": it, "val_loss": val_loss},
                   os.path.join(args.out, "model.pt"))
        with open(os.path.join(args.out, "history.json"), "w") as f:
            json.dump(history, f, indent=1)

    t_start = time.time()
    t0 = time.time()
    model.train()
    while it < P["max_iters"]:
        for g in opt.param_groups:
            g["lr"] = lr_at(it)
        x, y = get_batch(train, cfg.block_size, P["batch_size"], device)
        _, loss = model(x, y)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        it += 1

        if it % 25 == 0:
            dt = time.time() - t0
            tps = 25 * P["batch_size"] * cfg.block_size / dt
            print(f"iter {it:5d} | loss {loss.item():.3f} | lr {lr_at(it):.2e} | "
                  f"{tps:,.0f} tok/s", flush=True)
            t0 = time.time()

        out_of_time = args.max_minutes and (time.time() - t_start) / 60 > args.max_minutes
        if it % args.eval_every == 0 or it == P["max_iters"] or out_of_time:
            vl = estimate_loss(model, val, cfg.block_size, P["batch_size"], device)
            history.append({"iter": it, "train_loss": round(loss.item(), 4),
                            "val_loss": round(vl, 4)})
            best_val = min(best_val, vl)
            print(f"==> eval iter {it}: val loss {vl:.3f} (ppl {math.exp(vl):.1f})", flush=True)
            save(vl)
            if out_of_time:
                print("time budget reached, stopping.")
                break
    print("done.")


if __name__ == "__main__":
    main()
