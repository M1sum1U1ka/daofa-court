/* 导出全部可播放台词 → tools/voice-lines.json
   运行：node tools/export-voice.js
   说明：key 与 js/engine.js 中的 fnv(name + "\u0001" + t) 完全一致。 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
global.window = global;
const ctx = vm.createContext(global);

const FILES = [
  "js/data-real.js",
  "js/real/r1.js", "js/real/r2.js", "js/real/r3.js", "js/real/r4.js", "js/real/r5.js",
  "js/data-anime.js",
  "js/anime/a1.js", "js/anime/a2.js", "js/anime/a3.js", "js/anime/a4.js", "js/anime/a5.js"
];
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
}

function fnv(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) >>> 0) + ((h << 4) >>> 0) + ((h << 7) >>> 0) + ((h << 8) >>> 0) + ((h << 24) >>> 0)) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

function collect(version, D) {
  const out = [];
  const stats = {};
  const seen = new Set();

  function castName(sp) {
    if (!sp || sp === "narr") return "旁白";
    if (sp === "witness") sp = "witnessF";
    const cs = D.cast[sp];
    return cs ? cs.name : sp;
  }
  function nameOf(sp, who) {
    if (!sp || sp === "narr") return "旁白";
    return who || castName(sp);
  }
  function add(sp, who, t, caseId, where, role) {
    if (!t || typeof t !== "string") return;
    t = t.trim();
    if (!t) return;
    const name = nameOf(sp, who);
    const key = fnv(name + "\u0001" + t);
    const k = name + "|" + t;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ key, name, sp: sp || "narr", text: t, caseId, where, role: role || "" });
    stats[name] = (stats[name] || 0) + 1;
  }

  for (const c of D.cases) {
    (c.recon || []).forEach(function (ln) { add(ln.sp, ln.who, ln.t, c.id, "recon", ln.role); });
    (c.intro || []).forEach(function (ln) { add(ln.sp, ln.who, ln.t, c.id, "intro", ln.role); });
    (c.nodes || []).forEach(function (n) {
      (n.pre || []).forEach(function (ln) { add(ln.sp, ln.who, ln.t, c.id, "pre", ln.role); });
      add(n.sp, n.who, n.cue, c.id, "cue", n.role);
      add(n.sp, n.who, n.press, c.id, "press", n.role);
      (n.break || []).forEach(function (ln) { add(ln.sp, ln.who, ln.t, c.id, "break", ln.role); });
    });
    (c.closing || []).forEach(function (ln) { add(ln.sp, ln.who, ln.t, c.id, "closing", ln.role); });
  }
  return { lines: out, stats };
}

const real = collect("real", window.DATA_REAL);
const anime = collect("anime", window.DATA_ANIME);

const payload = {
  generatedAt: new Date().toISOString(),
  real: real.lines,
  anime: anime.lines
};
fs.writeFileSync(path.join(root, "tools", "voice-lines.json"), JSON.stringify(payload, null, 1), "utf8");

function report(tag, r) {
  console.log("[" + tag + "] 台词 " + r.lines.length + " 条，说话人 " + Object.keys(r.stats).length + " 位");
  Object.keys(r.stats).sort(function (a, b) { return r.stats[b] - r.stats[a]; })
    .forEach(function (n) { console.log("  " + n + "  " + r.stats[n]); });
}
report("real", real);
report("anime", anime);
