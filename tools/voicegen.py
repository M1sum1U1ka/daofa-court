# -*- coding: utf-8 -*-
"""道法裁判 · 全量人物配音生成
用法：python tools/voicegen.py [--version real|anime|all] [--workers 8] [--limit N]
读取 tools/voice-lines.json，输出 audio/voice/{version}/{key}.mp3 与 manifest.json。
"""
import argparse, asyncio, json, os, re, sys, time
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LINES = os.path.join(ROOT, "tools", "voice-lines.json")

V = "zh-CN-"
# (voice, rate, pitch) —— 按性别、年龄、身份分配，保证同场不同人音色可辨
MAP = {
    "real": {
        "旁白":         ("zh-CN-YunjianNeural", "-10%", "-14Hz"),
        "审判长":       ("zh-CN-YunyangNeural", "-6%", "-12Hz"),
        "公诉人":       ("zh-CN-XiaoxiaoNeural", "-2%", "-6Hz"),
        "辩护人":       ("zh-CN-YunjianNeural", "-4%", "-6Hz"),
        "段某":         ("zh-CN-YunyangNeural", "-14%", "+4Hz"),
        "杨某":         ("zh-CN-YunxiNeural", "-2%", "-4Hz"),
        "物业值班员":   ("zh-CN-liaoning-XiaobeiNeural", "+2%", "-2Hz"),
        "周某":         ("zh-CN-XiaoyiNeural", "0%", "+2Hz"),
        "刘暖曦":       ("zh-CN-XiaoyiNeural", "-4%", "-4Hz"),
        "刘鑫":         ("zh-CN-XiaoyiNeural", "-4%", "-4Hz"),
        "江歌":         ("zh-CN-XiaoxiaoNeural", "-2%", "+6Hz"),
        "苏银霞":       ("zh-CN-liaoning-XiaobeiNeural", "-8%", "-6Hz"),
        "于欢":         ("zh-CN-YunxiNeural", "-6%", "-8Hz"),
        "赵某":         ("zh-CN-YunjianNeural", "-4%", "+2Hz"),
        "处警民警":     ("zh-CN-YunyangNeural", "-2%", "+2Hz"),
        "林某":         ("zh-CN-shaanxi-XiaoniNeural", "-2%", "0Hz"),
        "徐寿兰":       ("zh-CN-liaoning-XiaobeiNeural", "-12%", "+4Hz"),
        "彭宇":         ("zh-CN-YunxiNeural", "0%", "+4Hz"),
        "陈二春":       ("zh-CN-YunjianNeural", "-6%", "-2Hz"),
        "药家鑫":       ("zh-CN-YunxiNeural", "+2%", "-10Hz"),
        "张妙":         ("zh-CN-XiaoyiNeural", "-4%", "+4Hz"),
        "药家鑫的父亲": ("zh-CN-YunyangNeural", "-8%", "-6Hz"),
        "张妙的丈夫":   ("zh-CN-YunjianNeural", "-2%", "-4Hz"),
        "张妙的父亲":   ("zh-CN-YunyangNeural", "-12%", "+2Hz"),
        "药家鑫的同学": ("zh-CN-XiaoxiaoNeural", "+2%", "+8Hz"),
        "证人":         ("zh-CN-YunxiNeural", "-2%", "+2Hz"),
    },
    "anime": {
        "旁白":         ("zh-CN-YunjianNeural", "-8%", "-16Hz"),
        "林青":         ("zh-CN-XiaoxiaoNeural", "-4%", "-10Hz"),
        "王磊":         ("zh-CN-YunyangNeural", "-2%", "-8Hz"),
        "陈曦":         ("zh-CN-shaanxi-XiaoniNeural", "-2%", "-6Hz"),
        "段大爷":       ("zh-CN-YunyangNeural", "-14%", "+6Hz"),
        "杨知远":       ("zh-CN-YunxiNeural", "-4%", "-6Hz"),
        "物业值班员":   ("zh-CN-liaoning-XiaobeiNeural", "+2%", "0Hz"),
        "周珂":         ("zh-CN-XiaoyiNeural", "+2%", "+4Hz"),
        "苏琴":         ("zh-CN-liaoning-XiaobeiNeural", "-6%", "-8Hz"),
        "李念":         ("zh-CN-YunxiNeural", "-2%", "-4Hz"),
        "杜某":         ("zh-CN-YunjianNeural", "0%", "-2Hz"),
        "民警":         ("zh-CN-YunyangNeural", "-4%", "+4Hz"),
        "赵大山":       ("zh-CN-YunjianNeural", "-6%", "+6Hz"),
        "沈嘉":         ("zh-CN-XiaoyiNeural", "-6%", "-2Hz"),
        "苏晚":         ("zh-CN-XiaoxiaoNeural", "+2%", "+10Hz"),
        "林晓":         ("zh-CN-shaanxi-XiaoniNeural", "-4%", "+4Hz"),
        "苏女士":       ("zh-CN-liaoning-XiaobeiNeural", "-10%", "-4Hz"),
        "彭真":         ("zh-CN-YunxiNeural", "+2%", "+2Hz"),
        "徐奶奶":       ("zh-CN-liaoning-XiaobeiNeural", "-14%", "+6Hz"),
        "老周":         ("zh-CN-YunjianNeural", "-8%", "-8Hz"),
        "宋启":         ("zh-CN-YunxiNeural", "+1%", "-12Hz"),
        "张苇":         ("zh-CN-XiaoyiNeural", "0%", "-6Hz"),
        "证人":         ("zh-CN-YunxiNeural", "-2%", "+2Hz"),
    },
}

SP_FALLBACK = {
    "narr": "旁白", "judge": "审判长",
    "prosecutor": "公诉人", "defense": "辩护人",
    "defendant": "被告人", "witnessM": "证人", "witnessF": "证人",
}

PAREN = re.compile(r"[\uff08(][^\uff09)]*[\uff09)]")

def clean(t):
    t = PAREN.sub("", t)
    t = t.replace("\u2026\u2026", "\uff0c").replace("...", "\uff0c")
    t = t.replace("\u2014\u2014", "\uff0c")
    t = re.sub(r"\s+", "", t)
    return t.strip("\uff0c\u3002\uff1b\uff1a\u3001 ")

def voice_of(version, name, sp):
    m = MAP.get(version, {})
    if name in m:
        return m[name]
    key = SP_FALLBACK.get(sp)
    if key and key in m:
        return m[key]
    return ("zh-CN-YunxiNeural", "0%", "+0Hz") if sp == "witnessM" else ("zh-CN-XiaoyiNeural", "0%", "+0Hz")

async def synth_one(item, sem, stats, progress):
    key, name, text, voice, rate, pitch, path = item
    if not rate or not rate.startswith(('+', '-')):
        rate = '+' + (rate or '0%')
    if not pitch or not pitch.startswith(('+', '-')):
        pitch = '+' + (pitch or '0Hz')
    if os.path.exists(path) and os.path.getsize(path) > 1100:
        stats["skip"] += 1
        return True
    total = len(text)
    async with sem:
        for attempt in range(4):
            try:
                t0 = time.time()
                com = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, volume="+0%")
                await com.save(path)
                size = os.path.getsize(path) if os.path.exists(path) else 0
                if size > 1100:
                    stats["ok"] += 1
                    stats["chars"] += total
                    progress()
                    return True
                raise RuntimeError("empty audio %d bytes" % size)
            except Exception as e:
                if attempt == 3:
                    stats["fail"] += 1
                    stats["errors"].append("%s %s %s" % (key, name, str(e)[:120]))
                    progress()
                    return False
                await asyncio.sleep(1.2 * (attempt + 1))
    return False

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default="all")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    with open(LINES, "r", encoding="utf-8") as f:
        data = json.load(f)
    versions = ["real", "anime"] if args.version == "all" else [args.version]
    grand = 0
    for ver in versions:
        outdir = os.path.join(ROOT, "audio", "voice", ver)
        os.makedirs(outdir, exist_ok=True)
        items, seen = [], set()
        for ln in data[ver]:
            key = ln["key"]
            if key in seen:
                continue
            seen.add(key)
            text = clean(ln["text"])
            if not text:
                continue
            voice, rate, pitch = voice_of(ver, ln["name"], ln.get("sp", ""))
            items.append((key, ln["name"], text, voice, rate, pitch, os.path.join(outdir, key + ".mp3")))
        if args.limit:
            items = items[: args.limit]
        print("[%s] 待生成 %d 条，并发 %d" % (ver, len(items), args.workers))
        stats = {"ok": 0, "skip": 0, "fail": 0, "chars": 0, "errors": []}
        done = [0]
        def progress():
            done[0] += 1
            if done[0] % 25 == 0 or done[0] == len(items):
                print("  %d/%d  ok=%d skip=%d fail=%d  %.0f字" % (
                    done[0], len(items), stats["ok"], stats["skip"], stats["fail"], stats["chars"]), flush=True)
        async def run():
            sem = asyncio.Semaphore(args.workers)
            await asyncio.gather(*[synth_one(it, sem, stats, progress) for it in items])
        t0 = time.time()
        asyncio.run(run())
        man = {}
        for key, name, text, voice, rate, pitch, path in items:
            if os.path.exists(path) and os.path.getsize(path) > 1100:
                man[key] = 1
        with open(os.path.join(outdir, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(man, f, ensure_ascii=False, separators=(",", ":"))
        print("[%s] 完成 %d 条，用时 %.1f 分钟，失败 %d" % (ver, len(man), (time.time()-t0)/60, stats["fail"]))
        for e in stats["errors"][:20]:
            print("  FAIL " + e)
        grand += len(man)
    print("总计 %d 条" % grand)

if __name__ == "__main__":
    main()
