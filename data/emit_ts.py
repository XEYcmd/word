# -*- coding: utf-8 -*-
"""把 data/words.json 转成 src/data/words.ts（前端静态引入）。"""
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "words.json")
DST = os.path.join(ROOT, "src", "data", "words.ts")

HEADER = """import type { WordBank } from '../types'

// 词库由 data/build_words.py 生成，请勿手工编辑。
// 重新生成：python data/build_words.py && python data/emit_ts.py
export const WORD_BANK: WordBank = """

FOOTER = """ as WordBank
"""


def main():
    with io.open(SRC, encoding="utf-8") as f:
        payload = f.read()
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    with io.open(DST, "w", encoding="utf-8", newline="\n") as f:
        f.write(HEADER + payload + FOOTER)
    print(f"写出 {DST}  {os.path.getsize(DST)/1024:.1f} KB")


if __name__ == "__main__":
    main()
