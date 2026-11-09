/* 数据自检：结构、表情、证据解锁、伦理选项、哲人评议 */
const path = require("path");
global.window = {};
const root = path.join(__dirname, "..");
require(path.join(root, "js/data-real.js"));
require(path.join(root, "js/data-anime.js"));
for (let i = 1; i <= 5; i++) require(path.join(root, "js/real/r" + i + ".js"));
for (let i = 1; i <= 5; i++) require(path.join(root, "js/anime/a" + i + ".js"));

const SP = ["judge", "prosecutor", "defense", "defendant", "witnessF", "witnessM", "narr"];
const EM = ["neutral", "stern", "sad", "soft"];
const DIMS = ["proc", "right", "effect", "virtue", "order", "mercy"];
/* 评议席必须覆盖的八位核心哲人；其余扩展哲人允许用通用评语回退 */
const CORE_THINKERS = ["kant", "mill", "rawls", "bentham", "aristotle", "beccaria", "confucius", "hanfei"];
let errors = 0, warns = 0;
const TITLES = new Set();
function err(m) { errors++; console.log("  [ERR] " + m); }
function warn(m) { warns++; console.log("  [WARN] " + m); }

function texts(c) {
  const out = [];
  (c.recon || []).forEach(l => out.push(l.t || ""));
  (c.intro || []).forEach(l => out.push(l.t || ""));
  (c.closing || []).forEach(l => out.push(l.t || ""));
  (c.nodes || []).forEach(n => {
    (n.pre || []).forEach(l => out.push(l.t || ""));
    out.push(n.cue || "");
    out.push(n.press || "");
    (n.break || []).forEach(l => out.push(l.t || ""));
    if (n.branch) {
      (n.branch.options || []).forEach(o => { out.push(o.label || ""); out.push(o.detail || ""); });
    }
  });
  return out;
}

function checkVersion(V) {
  console.log("\n== " + V.id + " · " + V.cases.length + " 案 ==");
  if (!Array.isArray(V.thinkers) || V.thinkers.length < 8) err(V.id + " thinkers=" + (V.thinkers || []).length);
  const tid = new Set();
  (V.thinkers || []).forEach(function (t) {
    if (!t.id || !t.name || !t.tag || !t.line) err(V.id + " thinker 字段不全 " + JSON.stringify(t));
    if (tid.has(t.id)) err(V.id + " thinker id 重复 " + t.id);
    tid.add(t.id);
  });
  const looks = V.looks || {};
  V.cases.forEach(c => {
    const tag = (c.id || "?") + " " + c.title;
    console.log("- " + tag);
    if (TITLES.has(c.title)) err(tag + " 标题重复");
    TITLES.add(c.title);
    if (!(c.nodes || []).length) err(tag + " 无节点");
    const evidNodes = (c.nodes || []).filter(n => !n.talk);
    const talkNodes = (c.nodes || []).filter(n => n.talk);
    if (c.nodes.length < 4) err(tag + " 节点过少 " + c.nodes.length);
    if (evidNodes.length !== 3) err(tag + " 证据节点 " + evidNodes.length);
    if (!talkNodes.length) warn(tag + " 无过渡节点");
    const allText = texts(c).join("\n");
    c.evidence.forEach(e => {
      let hit = 0;
      (e.keys || []).forEach(k => { if (k && allText.indexOf(k) >= 0) hit++; });
      const need = Math.min(2, (e.keys || []).length);
      if (hit < need) err(tag + " 证据未解锁 " + e.id + " (" + hit + "/" + need + ")");
    });
    c.nodes.forEach((n, ni) => {
      const nt = tag + " #" + (ni + 1);
      if (!SP.includes(n.sp)) err(nt + " sp=" + n.sp);
      if (n.who && !looks[n.who]) err(nt + " who未登记 " + n.who);
      if (n.em && !EM.includes(n.em)) err(nt + " em=" + n.em);
      if (n.talk && (n.answer || n.answers)) warn(nt + " talk 节点仍有答案");
      if (!n.talk && !(n.answer || (n.answers && n.answers.length))) err(nt + " 无答案");
      (n.pre || []).forEach((l, li) => {
        if (!SP.includes(l.sp)) err(nt + " pre" + li + " sp=" + l.sp);
        if (l.who && !looks[l.who]) err(nt + " pre" + li + " who未登记 " + l.who);
        if (l.em && !EM.includes(l.em)) err(nt + " pre" + li + " em=" + l.em);
      });
      (n.break || []).forEach((l, li) => {
        if (!SP.includes(l.sp)) err(nt + " break" + li + " sp=" + l.sp);
        if (l.who && !looks[l.who]) err(nt + " break" + li + " who未登记 " + l.who);
      });
      if (!n.branch) err(nt + " 无 branch");
      else {
        if (n.branch.options.length < 5) err(nt + " 选项 " + n.branch.options.length);
        n.branch.options.forEach((o, oi) => {
          Object.keys(o.tags || {}).forEach(k => {
            if (!DIMS.includes(k)) err(nt + " opt" + oi + " tag=" + k);
            if (!(o.tags[k] >= 1 && o.tags[k] <= 2)) err(nt + " opt" + oi + " " + k + "=" + o.tags[k]);
          });
        });
      }
    });
    (c.ethics.options || []).forEach((o, oi) => {
      Object.keys(o.tags || {}).forEach(k => {
        if (!DIMS.includes(k)) err(tag + " ethics" + oi + " tag=" + k);
      });
    });
    if ((c.ethics.options || []).length < 5) err(tag + " ethics 选项 " + c.ethics.options.length);
    CORE_THINKERS.forEach(k => { if (!c.consult || !c.consult[k]) err(tag + " consult 缺 " + k); });
    (c.consult ? Object.keys(c.consult) : []).forEach(k => { if (!tid.has(k)) warn(tag + " consult 多余键 " + k); });
  });
}

checkVersion(window.DATA_REAL);
checkVersion(window.DATA_ANIME);
console.log("\n结果：errors=" + errors + " warnings=" + warns);
process.exit(errors ? 1 : 0);
