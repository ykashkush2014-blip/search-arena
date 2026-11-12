"""
Byte-level BPE tokenizer written from scratch.

No pretrained vocabulary is used: the merges are learned directly from YOUR
training corpus by `train_tokenizer.py`.
"""
import heapq
import json
import re
from collections import Counter, defaultdict

# Pre-tokenization pattern tuned for source code: identifiers, numbers,
# runs of punctuation, and whitespace (indentation is kept as its own chunks).
SPLIT_PATTERN = re.compile(
    r"""'s|'t|'re|'ve|'m|'ll|'d| ?[A-Za-z_][A-Za-z_0-9]*| ?\d{1,3}| ?[^\sA-Za-z_\d]+|\n+|[ \t]+(?=\S)|[ \t]+|\s+"""
)

EOT = "<|endoftext|>"


class BPETokenizer:
    def __init__(self, merges=None, special_tokens=None):
        self.merges = {}  # (id_a, id_b) -> new_id
        self.vocab = {i: bytes([i]) for i in range(256)}
        self.special = {}
        self._cache = {}
        if merges:
            for a, b in merges:
                self._add_merge(a, b)
        for tok in special_tokens or [EOT]:
            self.special[tok] = len(self.vocab)
            self.vocab[len(self.vocab)] = tok.encode("utf-8")
        self.inv_special = {v: k for k, v in self.special.items()}

    # ------------------------------------------------------------------ build
    def _add_merge(self, a, b):
        new_id = 256 + len(self.merges)
        self.merges[(a, b)] = new_id
        self.vocab[new_id] = self.vocab[a] + self.vocab[b]
        return new_id

    @property
    def vocab_size(self):
        return len(self.vocab)

    @property
    def eot_id(self):
        return self.special[EOT]

    @classmethod
    def train(cls, text, vocab_size=4096, verbose=True):
        """Learn BPE merges from raw text (incremental algorithm + heap)."""
        num_merges = vocab_size - 256 - 1  # -1 for <|endoftext|>
        chunk_counts = Counter(SPLIT_PATTERN.findall(text))
        words = [list(c.encode("utf-8")) for c in chunk_counts]
        counts = list(chunk_counts.values())

        pair_counts = defaultdict(int)
        where = defaultdict(set)
        for wi, w in enumerate(words):
            c = counts[wi]
            for p in zip(w, w[1:]):
                pair_counts[p] += c
                where[p].add(wi)

        heap = [(-c, p) for p, c in pair_counts.items()]
        heapq.heapify(heap)
        tok = cls(special_tokens=[])
        tok.special = {}

        for step in range(num_merges):
            best = None
            while heap:
                negc, p = heapq.heappop(heap)
                if pair_counts.get(p, 0) == -negc and -negc > 0:
                    best = p
                    break
            if best is None:
                break
            new_id = tok._add_merge(*best)
            changed = set()
            for wi in list(where[best]):
                w = words[wi]
                c = counts[wi]
                # remove old pairs
                for p in zip(w, w[1:]):
                    pair_counts[p] -= c
                    changed.add(p)
                # merge
                out, i = [], 0
                while i < len(w):
                    if i < len(w) - 1 and w[i] == best[0] and w[i + 1] == best[1]:
                        out.append(new_id)
                        i += 2
                    else:
                        out.append(w[i])
                        i += 1
                words[wi] = out
                for p in zip(out, out[1:]):
                    pair_counts[p] += c
                    where[p].add(wi)
                    changed.add(p)
            del where[best]
            pair_counts.pop(best, None)
            for p in changed:
                c = pair_counts.get(p, 0)
                if c > 0:
                    heapq.heappush(heap, (-c, p))
                else:
                    pair_counts.pop(p, None)
            if verbose and (step + 1) % 500 == 0:
                print(f"  merge {step + 1}/{num_merges}: {tok.vocab[new_id]!r}")

        merges = list(tok.merges.keys())
        return cls(merges=merges, special_tokens=[EOT])

    # ---------------------------------------------------------------- encode
    def _encode_chunk(self, chunk):
        cached = self._cache.get(chunk)
        if cached is not None:
            return cached
        ids = list(chunk.encode("utf-8"))
        while len(ids) >= 2:
            # find the pair with the lowest merge rank
            best, best_rank = None, None
            for p in zip(ids, ids[1:]):
                r = self.merges.get(p)
                if r is not None and (best_rank is None or r < best_rank):
                    best, best_rank = p, r
            if best is None:
                break
            out, i = [], 0
            while i < len(ids):
                if i < len(ids) - 1 and ids[i] == best[0] and ids[i + 1] == best[1]:
                    out.append(best_rank)
                    i += 2
                else:
                    out.append(ids[i])
                    i += 1
            ids = out
        if len(self._cache) < 500_000:
            self._cache[chunk] = ids
        return ids

    def encode(self, text, allow_special=True):
        ids = []
        parts = text.split(EOT) if allow_special else [text]
        for k, part in enumerate(parts):
            if k > 0:
                ids.append(self.eot_id)
            for chunk in SPLIT_PATTERN.findall(part):
                ids.extend(self._encode_chunk(chunk))
        return ids

    def decode(self, ids):
        out = b"".join(self.vocab[i] for i in ids if i in self.vocab)
        return out.decode("utf-8", errors="replace")

    # ------------------------------------------------------------------- io
    def save(self, path):
        with open(path, "w") as f:
            json.dump({"merges": [list(p) for p in self.merges.keys()],
                       "special_tokens": list(self.special.keys())}, f)

    @classmethod
    def load(cls, path):
        with open(path) as f:
            d = json.load(f)
        return cls(merges=[tuple(p) for p in d["merges"]],
                   special_tokens=d["special_tokens"])
