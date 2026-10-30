# -*- coding: utf-8 -*-
"""
构建高中必背 3600+ 词库。

输入：data/raw/*.json / *.txt
输出：data/words.json  (站点与离线版共用)

字段：
  id         稳定 id（词条小写归一）
  word       展示词形（保留大小写/短语）
  head       学习主词形（短语原样）
  phonetic   音标（美式优先）
  ukphone    英式音标
  pos        词性
  trans      中文释义
  level      core / extended
  unit       教材单元（可选，来自人教版词表）
  rank       词频序号（越小越常用）
  tag        额外标签：phrase / variant
  forms      变体说明（如 arose arisen）

运行：python data/build_words.py
"""
import json
import io
import os
import re
import sys
import collections

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "words.json")

# 常见词形变化后缀（用于识别 “arise arose arisen” 这类条目）
IRREG_ENDINGS = (
    "ed", "ing", "s", "es", "en", "n", "t", "ght", "ught", "ought", "aught",
    "elt", "eep", "t", "d", "rn", "ung", "ung", "st", "ld", "pt", "ft",
)


def load_json(name):
    p = os.path.join(RAW, name)
    with io.open(p, encoding="utf-8") as f:
        return json.load(f)


def load_lines(name):
    p = os.path.join(RAW, name)
    with io.open(p, encoding="utf-8-sig", errors="replace") as f:
        return [l.rstrip("\n") for l in f]


def clean(s):
    if s is None:
        return ""
    s = s.replace("\u00a0", " ")
    s = re.sub(r"[\ue000-\uf8ff]", "", s)      # 源数据里的私有区标记
    s = re.sub(r"\s+", " ", s).strip()
    return s


POS_TOKEN = re.compile(
    r"^(?:n|v|vt|vi|a|ad|adj|adv|prep|pron|conj|num|int|art|aux|modal|mod|abbr)\.?$",
    re.I,
)
# 词性标记后跟中文时，允许词性后不带点
POS_LEAD = re.compile(
    r"^(?:n|v|vt|vi|a|ad|adj|adv|prep|pron|conj|num|int|art|aux|modal|mod|t|d|s)\."
    r"?(?:[ ]*(?:&|/|,)[ ]*(?:n|v|vt|vi|a|ad|adj|adv|prep|pron|conj|num|int|art|aux|modal|mod)\.[ ]*)*"
    r"(?=[\u4e00-\u9fff（(])",
    re.I,
)


def norm_key(name):
    """归一化主键：小写、去括号注释、去变体列表"""
    s = name.strip().lower()
    s = s.replace("（", "(").replace("）", ")")
    s = re.sub(r"\s*=\s*.*$", "", s)          # ballpoint = ballpoint pen
    s = re.sub(r"\s*/\s*.*$", "", s)          # grey / gray -> grey
    s = re.sub(r"\(.*?\)", "", s)             # a (an) -> a
    s = re.sub(r"[^a-z'\- ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


# ---------------------------------------------------------------- 变体识别
def detect_variant(name):
    """
    识别 'arise arose arisen' / 'bad worse worst' 这类「词形变化」条目。
    返回 (基础词, 变体字符串) 或 None。
    """
    n = clean(name)
    if " " not in n:
        return None
    if not re.fullmatch(r"[A-Za-z][A-Za-z'\- ]*", n):
        return None
    parts = n.split(" ")
    if len(parts) < 2 or len(parts) > 4:
        return None
    base = parts[0]
    bl = base.lower()
    # 每个后续词都要像变体：要么以基础词前 3 字母开头，要么以基础词结尾/常见屈折
    hits = 0
    for p in parts[1:]:
        pl = p.lower()
        if pl == bl:
            continue
        if pl.startswith(bl[: max(3, len(bl) - 2)]):
            hits += 1
        elif bl in pl or pl in bl:
            hits += 1
        elif pl.endswith(IRREG_ENDINGS) and len(pl) <= len(bl) + 4:
            hits += 1
    if hits >= len(parts) - 1 and hits > 0:
        return base, " ".join(parts[1:])
    return None


def detect_alias(name):
    """'ballpoint = ballpoint pen' / 'grey / gray' / 'madam/ madame' -> 主词形"""
    n = clean(name)
    if "=" in n:
        left = n.split("=")[0].strip()
        return left or n
    if "/" in n:
        left = n.split("/")[0].strip()
        return left or n
    return n


def is_phrase(name):
    n = clean(name)
    return " " in n or "-" in n


def parse_pos_from_trans(trans):
    """
    从 'n. 原因 vt. 促使' / 'n./ v. 率' / 'n。公共汽车站' 这类原始释义里提取词性。
    返回 (词性字符串, 剩余释义)。仅当开头是词性标记时才剥离。
    """
    s = trans.strip()
    # 'n。' 'v，' 这类全角标点先归一
    s = s.replace("。", ". ").replace("，", ", ")
    toks = s.split(" ")
    pos_tokens = []
    idx = 0
    for tok in toks:
        core = tok.strip(".,&/()（）;；")
        if not core:
            idx += 1
            continue
        pieces = re.findall(r"[A-Za-z]+", core)
        if pieces and all(POS_TOKEN.match(p) for p in pieces):
            pos_tokens.append(core.rstrip("/&,"))
            idx += 1
        else:
            break
    if not pos_tokens:
        return "", s
    rest = " ".join(toks[idx:]).lstrip("，,；;: ")
    rest = re.sub(r"^[&/,\s]+", "", rest)
    return " ".join(pos_tokens), rest


def normalize_pos(pos):
    """词性规范化 + 去重：'a. n. adj.' -> 'adj. n.'"""
    if not pos:
        return ""
    MAP = {
        "a": "adj.", "adj": "adj.", "ad": "adv.", "adv": "adv.",
        "n": "n.", "v": "v.", "vt": "vt.", "vi": "vi.",
        "prep": "prep.", "pron": "pron.", "conj": "conj.", "num": "num.",
        "int": "int.", "art": "art.", "aux": "aux.", "modal": "modal v.",
        "mod": "modal v.", "abbr": "abbr.",
    }
    out = []
    for tok in re.findall(r"[A-Za-z]+", pos):
        t = MAP.get(tok.lower())
        if t and t not in out:
            out.append(t)
    return " ".join(out)


def salvage_gloss(gloss, pos):
    """
    修复源数据里的释义残缺：
    'r；在后；后来prep. 在…之后' -> 去掉孤立字母、剥离句中词性
    """
    g = gloss
    # 孤立字母前缀：'r；' 'y；' 'e；' 'l a.' 'vn.'
    g = re.sub(r"^[a-z]\s*[；;]\s*", "", g)
    g = re.sub(r"^[a-z]\s+(?=[a-z]+\.)", "", g)
    g = re.sub(r"^v(?=[a-z]+\.)", "", g)          # 'vn.' -> 'n.'
    # 't.' 这类单字母残留（源数据里 vt. 被吃掉）
    g = re.sub(r"^[tds]\.\s*(?=[\u4e00-\u9fff])", "", g)
    # 'tinier, tiniest；极小的' 这类屈折说明
    g = re.sub(r"^[a-z]+(?:,\s*[a-z]+)+\s*[；;]\s*", "", g)
    g = re.sub(r"^rope\s+", "", g)               # skipping rope
    g = re.sub(r"^be\s*(?=的)", "", g)            # be的人称形式之一
    # 句中/开头的词性标记：'蓝色 a.蓝色的' -> '蓝色；蓝色的'
    g = re.sub(
        r"(?<=[\u4e00-\u9fff）)])\s*(?:prep|conj|ad|adv|adj|vt|vi|v|n|a|int|pron|num|modal|aux)\.\s*&?\s*",
        "；",
        g,
    )
    g = re.sub(r"^&\s*[；;]\s*", "", g)            # '&；痛' -> '痛'
    g = re.sub(r"^[&/]+\s*", "", g)
    g = re.sub(r"[；;]\s*[；;]+", "；", g)
    # 句中的词性标记：'后来prep. 在' -> '后来；在'
    g = re.sub(
        r"(?<=[\u4e00-\u9fff])(?:prep|conj|ad|adv|adj|vt|vi|v|n|a|int|pron|num|modal|aux)\.[ ]*",
        "；",
        g,
    )
    # 开头紧跟中文的词性标记（含 't.' 'n' 这类不规范的）
    m = POS_LEAD.match(g)
    if m:
        found = re.sub(r"[^A-Za-z. ]", "", m.group(0)).strip()
        g = g[m.end():]
        if not pos:
            pos = found
    else:
        found, rest = parse_pos_from_trans(g)
        if found and rest:
            g = rest
            if not pos:
                pos = found
    # 'modal v.（will的过去时）...' -> 去掉紧跟的 'v.'
    g = re.sub(r"^(?:modal|aux|link)\s+v?\.*\s*", "", g, flags=re.I)
    g = re.sub(r"^(?:modal|aux|link)\s+", "", g, flags=re.I)
    g = re.sub(r"^v\.\s*(?=[\u4e00-\u9fff（(])", "", g)
    g = re.sub(r"\s*[a-z]+\.\s*$", "", g)         # 结尾残留
    return g.strip(";；,.。 "), pos


# ---------------------------------------------------------------- 主构建
def main():
    src = load_json("gk3500_words.json")
    print(f"[1] 读入词表 {len(src)} 条")

    # --- 合并重复词条（同名词性合并释义）
    merged = collections.OrderedDict()
    stats = collections.Counter()

    for item in src:
        raw_name = clean(item.get("name", ""))
        if not raw_name:
            stats["empty_name"] += 1
            continue

        variant = detect_variant(raw_name)
        alias = None
        if variant:
            base, forms = variant
            word = base
            tag = "variant"
        else:
            word = detect_alias(raw_name)
            forms = ""
            tag = "phrase" if is_phrase(word) else ""

        key = norm_key(word)
        if not key:
            stats["bad_key"] += 1
            continue

        us = clean(item.get("usphone", ""))
        uk = clean(item.get("ukphone", ""))
        pos = normalize_pos(clean(item.get("pos", "")))
        meaning = clean(item.get("meaning", ""))
        trans = clean(" ".join(item.get("trans") or []))

        # 释义优先用 meaning（已剥离词性），为空回退 trans
        gloss = meaning or trans
        gloss = re.sub(r"\s*【[^】]*】", "", gloss).strip()  # 去掉【空格符号】之类注释
        gloss, pos = salvage_gloss(gloss, pos)
        pos = normalize_pos(pos)
        gloss = gloss.replace("/", "／").replace("／；", "；").replace("；／", "；")
        gloss = re.sub(r"^[；;，,\s*]+", "", gloss)
        gloss = re.sub(r"[；;]\s*[；;]+", "；", gloss)
        gloss = gloss.strip(";；,.。 ")

        if key in merged:
            m = merged[key]
            stats["merged"] += 1
            # 合并释义（去重、按顺序）
            parts = [p for p in re.split(r"[；;]", m["trans"]) if p.strip()]
            for p in re.split(r"[；;]", gloss):
                p = p.strip()
                if p and p not in parts:
                    parts.append(p)
            m["trans"] = "；".join(parts)
            if not m["phonetic"] and us:
                m["phonetic"] = us
            if not m["ukphone"] and uk:
                m["ukphone"] = uk
            if pos:
                extra = [t for t in pos.split() if t not in m["pos"].split()]
                if extra:
                    m["pos"] = normalize_pos(m["pos"] + " " + " ".join(extra))
            continue

        merged[key] = {
            "id": key,
            "word": word,
            "phonetic": us,
            "ukphone": uk,
            "pos": pos,
            "trans": gloss,
            "forms": forms,
            "tag": tag,
        }

    words = list(merged.values())
    print(f"[2] 合并去重后 {len(words)} 条（合并 {stats['merged']}，丢弃 {stats['empty_name']+stats['bad_key']}）")

    # --- 词频排名
    freq = {}
    try:
        g10k = io.open(os.path.join(RAW, "g10k.txt"), encoding="utf-8").read().split()
        for i, w in enumerate(g10k):
            freq.setdefault(w.strip().lower(), i)
    except Exception as e:
        print("  ! 词频表缺失:", e)

    # 音标缺失时用 lemma 表 / 常见规则兜底 —— 仅记录，不瞎补
    no_phone = [w for w in words if not w["phonetic"] and not w["ukphone"]]
    no_trans = [w for w in words if not w["trans"]]

    # --- 词频/难度分级
    # 注意：短语不能用首词词频（'the Arctic Ocean' 会拿到 'the' 的第 0 名），
    #       只有整条短语在词频表里出现才算数，否则排到单字词之后。
    for w in words:
        key = w["id"]
        if " " in key:
            r = freq.get(key)
            if r is None:
                r = 100000 + len(w["word"])  # 短语默认靠后
        else:
            r = freq.get(key)
            if r is None:
                r = 100000 + len(w["word"])
        w["rank"] = r
        w["level"] = "core" if r <= 4500 else "extended"

    # --- 教材单元（人教版词表，按词形匹配）
    units = {}
    try:
        tb = load_json("wf_words_all.json")
        for x in tb:
            u = clean(x.get("unit", ""))
            if not u:
                continue
            k = norm_key(clean(x.get("word", "")))
            if k and k not in units:
                units[k] = u
    except Exception as e:
        print("  ! 教材词表缺失:", e)

    hit_unit = 0
    for w in words:
        u = units.get(w["id"])
        if not u and " " in w["id"]:
            u = units.get(w["id"].split(" ")[0])
        if u:
            w["unit"] = u
            hit_unit += 1

    # --- 排序：按字母
    words.sort(key=lambda w: (w["id"], w["word"]))

    # --- 统计
    levels = collections.Counter(w["level"] for w in words)
    print(f"[3] 音标缺失 {len(no_phone)} 条；释义缺失 {len(no_trans)} 条")
    print(f"[4] 教材单元命中 {hit_unit}/{len(words)}")
    print(f"[5] core={levels['core']} extended={levels['extended']}")
    print(f"[6] 短语/变体：phrase={sum(1 for w in words if w['tag']=='phrase')} "
          f"variant={sum(1 for w in words if w['tag']=='variant')}")

    payload = {
        "meta": {
            "name": "高中必背3600词",
            "count": len(words),
            "core": levels["core"],
            "extended": levels["extended"],
            "source": "高考3500词表 + 人教版教材单元 + google-10000 词频",
            "version": 1,
        },
        "words": words,
    }

    with io.open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(OUT)
    print(f"[7] 写出 {OUT}  {size/1024:.1f} KB")

    if no_phone:
        print("  音标缺失示例:", [w["word"] for w in no_phone[:15]])
    if no_trans:
        print("  释义缺失示例:", [w["word"] for w in no_trans[:15]])


if __name__ == "__main__":
    main()
