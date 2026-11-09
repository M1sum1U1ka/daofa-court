/* 道法裁判 · 玩法引擎
   纯原生 JS，无构建、无模块，file:// 双击可直接运行

   案件数据结构
   case = {
     id, no, title, subtitle, tag, cause, brief, question,
     bg, reconBg,
     scenes: { court, lobby, factory, ... },     // 场景背景，按剧情段落切换
     recon: [ { sp, who, role, t, sc } ],        // sc 为该段场景，缺省继承上一段
     evidence: [ { id, name, type, doc, from, keys } ],  // keys 需在剧情中逐字出现后才可出示
     nodes: [ {                                  // 关键节点：只能在这里出示证据
        sp, who, role, cue, press, answer, answers,
        break: [ { sp, who, t } ],
        branch: { q, options: [ { label, detail, tags } ] }
     } ],
     closing: [ { sp, t } ],
     ethics: { question, options: [ { label, detail, tags, verdict } ] },
     verdicts: { S:{grade,title,text,line}, A:{...}, C:{...} },
     truth: { title, paragraphs: [], lesson },
     consult: { kant, mill, rawls }
   }
*/

(function () {
  "use strict";

  var VERSIONS = { real: window.DATA_REAL, anime: window.DATA_ANIME };
  if (!VERSIONS.real || !VERSIONS.anime) return;

  var app = document.getElementById("app");
  var toastEl = document.getElementById("toast");
  var SAVE_KEY = "daofa.save.v1";

  var S = null;
  var view = "landing";   // landing | hub | trial | ethics | verdict | profile
  var bgmName = "";
  var tracks = {};
  var toastTimer = null;

  /* ================= 基础 ================= */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  }

  function newTrack(name) {
    var a = new Audio();
    a.preload = "auto";
    a.loop = true;
    a.volume = 0.24;
    a.oncanplay = function () {
      if (this.pendingPause) { this.pendingPause = false; this.pause(); }
    };
    a.src = "audio/" + name + ".wav";
    tracks[name] = a;
    return a;
  }

  function playBGM(name) {
    var same = bgmName === name;
    bgmName = name;
    if (!same) {
      for (var k in tracks) {
        var el = tracks[k];
        if (!el || k === name) continue;
        if (el.readyState >= 3) el.pause();
        else if (!el.paused) el.pendingPause = true;
      }
    }
    var a = tracks[name] || newTrack(name);
    if (!a.paused) return;
    var p = a.play();
    if (p && p.catch) p.catch(function () {});
  }

  function rank(g) { return g === "S" ? 3 : g === "A" ? 2 : g === "C" ? 1 : 0; }
  function worse(a, b) { return rank(a) <= rank(b) ? a : b; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ================= 人物配音 =================
     线路音由 tools/voicegen.py 预生成，文件名 = FNV-1a(显示名 + \\u0001 + 台词)。
     清单 audio/voice/{version}/manifest.json 存在才播放；缺失时静默降级。 */
  var voiceEl = null;
  var voiceOn = true;
  try { voiceOn = localStorage.getItem("daofa.voice.v1") !== "0"; } catch (e) {}
  var voiceMans = {};

  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      /* 16777619 = 2^24+2^8+2^7+2^4+2^1+1，移位相乘保证 32 位精确，与 tools/export-voice.js 一致 */
      h = (h + ((h << 1) >>> 0) + ((h << 4) >>> 0) + ((h << 7) >>> 0) + ((h << 8) >>> 0) + ((h << 24) >>> 0)) >>> 0;
    }
    return ("0000000" + h.toString(16)).slice(-8);
  }

  function loadVoiceMan(version) {
    if (voiceMans[version] !== undefined) return;
    voiceMans[version] = null;
    try {
      fetch("audio/voice/" + version + "/manifest.json", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (o) { voiceMans[version] = o && typeof o === "object" ? o : null; })
        .catch(function () {});
    } catch (e) {}
  }

  function stopVoice() {
    if (voiceEl) {
      try { voiceEl.pause(); } catch (e) {}
      voiceEl = null;
    }
    var bg = tracks[bgmName];
    if (bg) bg.volume = 0.24;
  }

  function speak(ln, info) {
    if (!ln || !ln.t || !S) return;
    var name = info ? info.name : "旁白";
    var key = fnv(name + "\u0001" + ln.t);
    if (S.lastVoiceKey === key) return;
    S.lastVoiceKey = key;
    stopVoice();
    if (!voiceOn) return;
    var man = voiceMans[S.version];
    if (!man || !man[key]) return;
    var a = new Audio("audio/voice/" + S.version + "/" + key + ".mp3");
    a.volume = 0.95;
    a.onended = function () {
      var bg = tracks[bgmName];
      if (bg) bg.volume = 0.24;
    };
    voiceEl = a;
    var bg = tracks[bgmName];
    if (bg) bg.volume = 0.07;
    var p = a.play();
    if (p && p.catch) p.catch(function () {});
  }

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      var o = raw ? JSON.parse(raw) : null;
      return o && typeof o === "object" ? o : {};
    } catch (e) { return {}; }
  }
  function saveStore(s) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function bestGrade(version, caseId) {
    var s = loadSave();
    return (s[version] && s[version][caseId]) || "";
  }
  function saveProgress(version, caseId, grade) {
    var s = loadSave();
    s[version] = s[version] || {};
    if (rank(grade) > rank(s[version][caseId])) s[version][caseId] = grade;
    saveStore(s);
  }
  function savePick(version, key, data) {
    var s = loadSave();
    s.picks = s.picks || {};
    s.picks[version] = s.picks[version] || {};
    s.picks[version][key] = data;
    saveStore(s);
  }
  function loadPicks(version) {
    var s = loadSave();
    return (s.picks && s.picks[version]) || {};
  }

  /* ================= 入口 ================= */
  function renderLanding() {
    view = "landing";
    S = null;
    stopVoice();
    closeCaseOpening();
    clearBg();
    document.body.dataset.version = "";
    var title = "道法裁判", ch = "";
    for (var i = 0; i < title.length; i++) ch += '<span style="--i:' + i + '">' + title.charAt(i) + '</span>';
    var dust = "";
    for (var d = 0; d < 16; d++) {
      dust += '<i style="left:' + ((d * 37 + 11) % 100) + '%;top:' + ((d * 61 + 7) % 100) + '%;' +
        '--dur:' + (14 + (d % 6) * 4) + 's;--delay:-' + (d % 12) + 's;--sz:' + (1 + (d % 3)) + 'px;' +
        '--op:' + (0.16 + (d % 4) * 0.09).toFixed(2) + '"></i>';
    }
    app.innerHTML =
      '<div class="title-screen">' +
        '<div class="ts-bg">' +
          '<div class="ts-half ts-real" style="background-image:url(\'' + esc(VERSIONS.real.meta.bg) + '\')"></div>' +
          '<div class="ts-half ts-anime" style="background-image:url(\'' + esc(VERSIONS.anime.meta.bg) + '\')"></div>' +
          '<div class="ts-scrim"></div>' +
          '<div class="ts-grain"></div>' +
          '<div class="ts-dust" aria-hidden="true">' + dust + '</div>' +
        '</div>' +
        '<div class="ts-content">' +
          '<div class="ts-topline">' +
            '<div class="ts-kicker"><i></i>CASE RE-TRIAL<span>·</span>五案重审</div>' +
            '<div class="ts-edition">全五案 · 重审卷</div>' +
          '</div>' +
          '<div class="ts-title-row">' +
            '<h1 class="ts-title">' + ch + '</h1>' +
            '<div class="ts-seal"><span>重审</span></div>' +
          '</div>' +
          '<div class="ts-rule"><i></i></div>' +
          '<div class="ts-sub-row">' +
            '<p class="ts-sub">真实卷宗 · 架空法庭 · 各自成卷</p>' +
            '<div class="ts-ornament" aria-hidden="true"><i></i><b>◆</b><i></i></div>' +
          '</div>' +
          '<div class="ts-gates">' +
            gateHTML("real", VERSIONS.real) +
            gateHTML("anime", VERSIONS.anime) +
          '</div>' +
          aiBandHTML() +
          '<div class="ts-foot">' +
            '真实卷宗以公开判例为底本；二次元法庭为完全架空的城邦寓言，不对应任何真实案件。两版进度各自独立。<br>' +
            '每案先看场景复原，再开庭质证；还原里只入卷一小部分材料，其余在庭审追问中依次引出。五案结束后生成你的伦理画像。' +
          '</div>' +
        '</div>' +
      '</div>';
    playBGM("title");
  }

  /* 标题页的 AI 能力说明：让玩家一眼知道 AI 在游戏里干什么 */
  function aiBandHTML() {
    var ready = window.AI && window.AI.ready();
    var model = "glm-5.3-flash";
    try {
      var st = window.AI && window.AI.settings ? window.AI.settings() : null;
      if (st && st.model) model = st.model;
    } catch (e) {}
    return '<section class="ts-ai">' +
      '<div class="ts-ai-head">' +
        '<span class="ts-ai-tag">AI 法庭助理</span>' +
        '<span class="ts-ai-state' + (ready ? " on" : "") + '">' +
          (ready ? "已连接 · " + esc(model) : "未配置 · 不接入也能完整通关") + '</span>' +
      '</div>' +
      '<div class="ts-ai-grid">' +
        '<div class="ts-ai-item"><b>质询</b><span>按卷宗事实回答你的追问，不编造</span></div>' +
        '<div class="ts-ai-item"><b>证据裁定</b><span>预设之外的材料，由它判断是否切题</span></div>' +
        '<div class="ts-ai-item"><b>判决说理</b><span>结案后按你的判断与误判数生成说理</span></div>' +
        '<div class="ts-ai-item"><b>审判者点评</b><span>读完你的全部选择，指出伦理倾向</span></div>' +
      '</div>' +
      '<button class="ts-ai-btn" data-act="aiSettings">' +
        (ready ? "AI 接口设置" : "配置 AI 接口 →") + '</button>' +
    '</section>';
  }

  function gateHTML(id, V) {
    var done = 0;
    for (var i = 0; i < V.cases.length; i++) if (bestGrade(id, V.cases[i].id)) done++;
    return '<button class="gate" data-version="' + id + '" style="--cover:url(\'' + esc(V.meta.bg) + '\')">' +
      '<span class="gate-index" aria-hidden="true">' + (id === "real" ? "壹" : "贰") + '</span>' +
      '<div class="gate-body">' +
        '<div class="gate-kicker">' + esc(V.meta.kicker) + '</div>' +
        '<h2 class="gate-title">' + esc(V.meta.title) + '</h2>' +
        '<p class="gate-lead">' + esc(V.meta.lead) + '</p>' +
        '<div class="gate-foot">' +
          '<span>' + V.cases.length + ' 起判例 · 已通审 ' + done + '</span>' +
          '<span class="gate-go">进入 →</span>' +
        '</div>' +
      '</div>' +
    '</button>';
  }

  /* ================= 目录 ================= */
  function openHub(version) {
    if (!VERSIONS[version]) return;
    S = { version: version, V: VERSIONS[version] };
    view = "hub";
    stopVoice();
    loadVoiceMan(version);
    closeCaseOpening();
    clearBg();
    document.body.dataset.version = version;
    renderHub();
    playBGM("title");
  }

  function renderHub() {
    var V = S.V, done = 0, cards = "";
    for (var i = 0; i < V.cases.length; i++) {
      var c = V.cases[i];
      var g = bestGrade(S.version, c.id);
      if (g) done++;
      cards += '<button class="case-card" data-case="' + c.id + '">' +
        '<div class="case-no">' + esc(c.no) + '</div>' +
        '<div class="case-main">' +
          '<h3 class="case-name">' + esc(c.title) + '</h3>' +
          '<p class="case-sub">' + esc(c.subtitle) + '</p>' +
          '<p class="case-brief">' + esc(c.brief) + '</p>' +
        '</div>' +
        '<div class="case-tags">' +
          '<span class="chip">' + esc(c.tag) + '</span>' +
          '<span class="grade-badge ' + (g ? "grade-" + g : "") + '">' + (g || "—") + '</span>' +
        '</div>' +
      '</button>';
    }
    var picks = loadPicks(S.version);
    var picked = 0;
    for (var k in picks) picked++;
    var pct = Math.round(done / V.cases.length * 100);
    app.innerHTML =
      '<div class="hub">' +
        '<div class="hub-head">' +
          '<button class="link-back" data-act="landing">← 换一种画风</button>' +
          '<div class="hub-title">' +
            '<div class="kicker">' + esc(V.meta.kicker) + '</div>' +
            '<h1>' + esc(V.meta.title) + '</h1>' +
            '<p class="hub-lead">' + esc(V.meta.lead) + '</p>' +
          '</div>' +
          '<div class="hub-side">' +
            '<div class="hub-count">已通审 ' + done + ' / ' + V.cases.length + '</div>' +
            '<div class="hub-progress"><span>审结进度</span><div class="hub-progress-track"><i style="width:' + pct + '%"></i></div></div>' +
            (picked ? '<button class="btn profile-btn" data-act="profile">审判者画像 · ' + picked + ' 次判断</button>' : '') +
          '</div>' +
        '</div>' +
        '<p class="hub-note">' + esc(V.meta.note) + '</p>' +
        '<div class="hub-ai">' +
          '<b>AI 法庭助理</b>' +
          '<span>质询 · 证据关联裁定 · 判决说理 · 审判者点评</span>' +
          '<button class="btn" data-act="aiSettings">' +
            (window.AI && window.AI.ready() ? "接口设置" : "配置接口") + '</button>' +
        '</div>' +
        '<div class="case-list">' + cards + '</div>' +
        '<div class="hub-foot">' +
          '流程：案件场景还原 → 法庭调查 → 关键节点出示证据 → 判断与追问 → 结案陈词 → 伦理抉择 → 判决与真实判例。<br>' +
          '证据只能在关键节点出示。出示不当，审判长会要求你重新出示——每一次误判都会被记录。' +
        '</div>' +
      '</div>';
  }

  /* ================= 开庭 ================= */
  /* 进案前预热图片：立绘、背景、场景，避免对话中途闪白 */
  function preloadCase(c) {
    var V = S.V, list = [], seen = {}, k, i;
    function add(u) {
      if (!u || seen[u] || !/\.(jpg|png|webp)$/i.test(u)) return;
      seen[u] = 1; list.push(u);
    }
    add(V.meta.bg);
    add(c.bg); add(c.reconBg);
    if (c.scenes) for (k in c.scenes) add(c.scenes[k]);
    for (k in V.cast) add(V.cast[k].img);
    var names = {};
    var seq = (c.recon || []).concat(c.intro || [], c.closing || []);
    for (i = 0; i < seq.length; i++) if (seq[i].who) names[seq[i].who] = 1;
    for (i = 0; i < (c.nodes || []).length; i++) {
      var n = c.nodes[i];
      if (n.who) names[n.who] = 1;
      if (n.break) for (var j = 0; j < n.break.length; j++) if (n.break[j].who) names[n.break[j].who] = 1;
    }
    for (var nm in names) {
      var look = V.looks && V.looks[nm], base = "", maxEm = 4;
      if (typeof look === "string") base = look;
      else if (look && look.base) { base = look.base; maxEm = look.ems || 1; }
      for (i = 1; base && i <= maxEm; i++) add(base + "-" + i + ".jpg");
    }
    for (i = 0; i < list.length; i++) { var im = new Image(); im.src = list[i]; }
  }

  function startCase(caseId) {
    var V = S.V, version = S.version, c = null, idx = 0;
    for (var i = 0; i < V.cases.length; i++) {
      if (V.cases[i].id === caseId) { c = V.cases[i]; idx = i; }
    }
    if (!c) return;

    /* 证据门禁：带 keys 的证据先在剧情中被提到，才可以在庭上出示 */
    var ev = {};
    for (var j = 0; j < c.evidence.length; j++) {
      var e0 = c.evidence[j];
      ev[e0.id] = !(e0.keys && e0.keys.length);
    }

    S = {
      version: version, V: V, c: c, idx: idx,
      phase: "recon",
      ev: ev, evHits: {},
      reconEv: 0,
      asked: {}, consulted: {},
      node: 0, mistakes: 0,
      lines: [], li: 0, onDone: null,
      tmode: "lines",
      present: false, drawer: null,
      branchOpen: false, branchPick: null,
      grade: "", opt: null,
      lastPortrait: null,
      lastImg: null,
      lastBase: "",
      lastLi: -1,
      scene: "",
      bgShown: "",
      aiChat: [], aiDraft: "", aiBusy: false,
      lineKind: "line",
      skim: false,
      lastVoiceKey: ""
    };
    view = "trial";
    playBGM("court");
    loadVoiceMan(version);
    preloadCase(c);
    playLines(c.recon, startOpening, "recon");
    playCaseOpening(c);
  }

  /* ================= 案件开场动画 ================= */
  var openingTimer = null;
  function closeCaseOpening() {
    clearTimeout(openingTimer);
    var el = document.getElementById("caseOpen");
    if (el) { el.classList.remove("on"); el.innerHTML = ""; }
  }
  function playCaseOpening(c) {
    var el = document.getElementById("caseOpen");
    if (!el) return;
    closeCaseOpening();
    var vid = S && S.V && S.V.meta ? S.V.meta.courtVideo : "";
    el.innerHTML =
      (vid ? '<video class="co-video" src="' + esc(vid) + '" poster="' + esc(c.bg || (S && S.V ? S.V.meta.bg : "")) + '" muted autoplay loop playsinline preload="auto"></video>' : "") +
      '<div class="co-shade"></div>' +
      '<div class="co-panel">' +
        '<div class="co-seal" aria-hidden="true">重审</div>' +
        '<div class="co-no">开场动画<span>·</span>' + esc(c.no) + '<span>·</span>' + esc(c.cause || "重审") + '</div>' +
        '<h2 class="co-title">' + esc(c.title) + '</h2>' +
        '<p class="co-sub">' + esc(c.subtitle || "") + '</p>' +
        '<div class="co-line"></div>' +
        '<p class="co-question">' + esc(c.question || "") + '</p>' +
        '<div class="co-tip">点击跳过 ▾</div>' +
        '<div class="co-progress" aria-hidden="true"><i></i></div>' +
      '</div>';
    el.classList.add("on");
    var v = el.querySelector("video.co-video");
    if (v) { var pp = v.play(); if (pp && pp.catch) pp.catch(function () {}); }
    var closed = false;
    function done() {
      if (closed) return;
      closed = true;
      closeCaseOpening();
    }
    el.onclick = done;
    openingTimer = setTimeout(done, 5600);
  }

  /* ================= 证据在剧情中引出 ================= */
  function unlockEvidence(id) {
    var list = S.c.evidence;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== id) continue;
      if (S.ev[id]) return null;
      S.ev[id] = true;
      return list[i];
    }
    return null;
  }

  function scanEvidence(ln) {
    if (!ln || !S || !S.c) return;
    var got = [];
    var isRecon = S.phase === "recon";
    /* 场景复原只放一小部分材料：整段还原最多入卷 2 份，
       其余留到庭审里随证言细节一份一份引出 */
    var reconLeft = isRecon ? 2 - (S.reconEv || 0) : 0;
    if (isRecon && reconLeft <= 0) return;

    if (ln.ev) {
      var arr = Object.prototype.toString.call(ln.ev) === "[object Array]" ? ln.ev : [ln.ev];
      for (var a = 0; a < arr.length; a++) {
        if (isRecon && reconLeft <= 0) break;
        var h = unlockEvidence(arr[a]);
        if (h) {
          got.push(h);
          if (isRecon) { S.reconEv = (S.reconEv || 0) + 1; reconLeft--; }
        }
      }
    }

    var text = ln.t || "";
    var hits = [];
    for (var i = 0; i < S.c.evidence.length; i++) {
      var e = S.c.evidence[i];
      if (S.ev[e.id] || !e.keys || !e.keys.length) continue;
      var seen = S.evHits[e.id] || (S.evHits[e.id] = {});
      var q;
      for (var j = 0; j < e.keys.length; j++) {
        var kw = e.keys[j];
        if (!kw) continue;
        if (text.indexOf(kw) >= 0) seen[kw] = true;
      }
      var n = 0;
      for (q in seen) n++;
      if (n >= Math.min(2, e.keys.length)) hits.push(e.id);
    }
    /* 每句话最多引出一份，庭审里慢慢展开，不一次性刷满 */
    var allow = isRecon ? Math.min(1, reconLeft) : 1;
    for (var k = 0; k < hits.length && k < allow; k++) {
      var hh = unlockEvidence(hits[k]);
      if (hh) {
        got.push(hh);
        if (isRecon) S.reconEv = (S.reconEv || 0) + 1;
      }
    }
    if (got.length) popEvidence(got);
  }

  function unlockAllEvidence() {
    var extra = [];
    for (var i = 0; i < S.c.evidence.length; i++) {
      var e = S.c.evidence[i];
      if (S.ev[e.id]) continue;
      S.ev[e.id] = true;
      extra.push(e);
    }
    return extra;
  }

  /* 收集到证据时的醒目提示 */
  var evPopTimer = null;
  function popEvidence(items) {
    var box = document.getElementById("evPop");
    if (!box || !items.length) return;
    var html = "";
    var max = Math.min(items.length, 3);
    for (var i = 0; i < max; i++) {
      html += '<div class="ev-pop-item">' +
        '<span class="ev-pop-k">证据入卷</span>' +
        '<b>' + esc(items[i].name) + '</b>' +
        '<em>' + esc(items[i].type || "") + '</em>' +
      '</div>';
    }
    if (items.length > max) html += '<div class="ev-pop-more">另有 ' + (items.length - max) + ' 份材料入卷</div>';
    box.innerHTML = html;
    box.classList.add("show");
    clearTimeout(evPopTimer);
    evPopTimer = setTimeout(function () { box.classList.remove("show"); }, 2600);
  }

  /* ================= 场景 ================= */
  function currentScene() {
    if (!S || !S.c) return { img: "", court: true };
    if (S.phase === "recon") {
      var ln = S.lines[S.li];
      if (ln && ln.sc) S.scene = ln.sc;
      if (!S.scene && S.c.recon && S.c.recon[0] && S.c.recon[0].sc) S.scene = S.c.recon[0].sc;
      var img = (S.c.scenes && S.c.scenes[S.scene]) || S.c.reconBg || S.c.bg;
      return { img: img, court: false };
    }
    var court = (S.c.scenes && S.c.scenes.court) || S.c.bg;
    return { img: court, court: true };
  }

  function updateBg(img, court) {
    var layer = document.getElementById("bgLayer");
    if (!layer || !img) return;
    layer.classList.add("on");
    layer.classList.toggle("is-court", !!court);

    var vid = S && S.V && S.V.meta ? S.V.meta.courtVideo : "";
    var v = layer.querySelector("video.bg-video");
    if (court && vid) {
      if (!v) {
        v = document.createElement("video");
        v.className = "bg-video";
        v.muted = true;
        v.loop = true;
        v.autoplay = true;
        v.setAttribute("muted", "");
        v.setAttribute("playsinline", "");
        v.preload = "auto";
        layer.appendChild(v);
      }
      if (v.getAttribute("data-src") !== vid) {
        v.setAttribute("data-src", vid);
        v.src = vid;
        v.load();
        var pp = v.play();
        if (pp && pp.catch) pp.catch(function () {});
      }
      v.classList.add("on");
    } else if (v) {
      v.classList.remove("on");
      v.pause();
    }

    if (S && S.bgShown === img) return;
    var imgs = layer.querySelectorAll(".bg-img");
    var exists = false, k;
    for (k = 0; k < imgs.length; k++) {
      if (imgs[k].getAttribute("data-src") === img) exists = true;
      else {
        (function (el) {
          el.classList.add("out");
          setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 900);
        })(imgs[k]);
      }
    }
    if (!exists) {
      var d = document.createElement("div");
      d.className = "bg-img";
      d.setAttribute("data-src", img);
      d.style.backgroundImage = "url('" + img + "')";
      /* 场景图缺失时退回卷宗封面，避免整屏空黑 */
      var probe = new Image();
      probe.onerror = function () {
        if (!S || !S.V) return;
        var alt = S.V.meta.bg;
        if (alt === img) alt = (S.c && S.c.reconBg) || "";
        if (alt && alt !== img) d.style.backgroundImage = "url('" + alt + "')";
      };
      probe.src = img;
      layer.appendChild(d);
    }
    if (S) S.bgShown = img;
  }

  function clearBg() {
    var layer = document.getElementById("bgLayer");
    if (!layer) return;
    layer.classList.remove("on");
    var v = layer.querySelector("video.bg-video");
    if (v) v.pause();
    if (S) S.bgShown = "";
  }

  function roleLabel(sp) {
    var cs = S.V.cast[sp];
    if (cs) return cs.role;
    if (sp === "witnessF" || sp === "witnessM") return "证人";
    return "";
  }

  /* 表情差分：1 平静 / 2 强硬 / 3 哀伤 / 4 温和 */
  var EM_NUM = { neutral: 1, stern: 2, sad: 3, soft: 4 };

  function pickEmotion(ln, kind) {
    if (!ln) return "neutral";
    if (ln.em && EM_NUM[ln.em]) return ln.em;
    var t = ln.t || "";
    if (/低声|沉默|哽咽|哭|怕|疼|对不起|遗|救护车|报警录音|没有呼吸/.test(t)) return "sad";
    if (/别怕|谢谢|人没事|没关系|消消气|好意/.test(t)) return "soft";
    if (/急促|拍门|快开门|喊|吼|别碰|凭什么|碍着|管我|滚/.test(t)) return "stern";
    if (kind === "cue") return "stern";
    if (kind === "press") return "sad";
    if (kind === "break") return "sad";
    if (kind === "closing") return "stern";
    if (kind === "intro") return "neutral";
    return "neutral";
  }

  function speakerInfo(sp, who, role, em) {
    if (!sp || sp === "narr") return null;
    if (sp === "witness") sp = "witnessF";
    var cs = S.V.cast[sp];
    if (!cs) return null;
    var name = who || cs.name;
    var img = cs.img || "", fb = cs.img || "", base = "";
    var look = S.V.looks && S.V.looks[name];
    var emotion = em && EM_NUM[em] ? em : "neutral";
    var maxEm = 4;
    if (typeof look === "string") base = look;
    else if (look && look.base) { base = look.base; maxEm = look.ems || 1; }
    if (base) img = base + "-" + Math.min(EM_NUM[emotion], maxEm) + ".jpg";
    return {
      name: name,
      role: role || cs.role,
      img: img,
      fb: fb,
      base: base,
      cls: sp,
      em: base ? emotion : ""
    };
  }

  function lineSpeaker(ln) {
    if (!ln) return null;
    var em = ln.em || pickEmotion(ln, S.lineKind);
    return speakerInfo(ln.sp, ln.who, ln.role, em);
  }

  function currentSpeaker() {
    if (S.phase === "nodes" && S.tmode === "statement") {
      var n = S.c.nodes[S.node];
      return n ? speakerInfo(n.sp, n.who, n.role, n.em || pickEmotion({ t: n.cue }, "cue")) : null;
    }
    if (S.branchOpen) return speakerInfo("judge");
    var ln = S.lines[S.li];
    return lineSpeaker(ln);
  }

  function hudHTML() {
    var isRecon = S.phase === "recon";
    return '<header class="hud">' +
      '<button class="hud-btn" data-act="hub">← 目录</button>' +
      '<div class="hud-case"><span class="hud-no">' + esc(S.c.no) + '</span>' +
        '<span class="hud-name">' + esc(S.c.title) + '</span></div>' +
      (isRecon
        ? '<span class="hud-phase">案件还原</span>' +
          '<button class="hud-btn" data-act="skipRecon">跳过还原 →</button>'
        : '<span class="hud-phase">法庭审理</span>' +
          '<span class="hud-miss">误判 × ' + S.mistakes + '</span>') +
      '<button class="hud-btn" data-act="evidence">证据 ' + evCount() + '</button>' +
      '<button class="hud-btn" data-act="consult">求教</button>' +
      '<button class="hud-btn" data-act="ai">AI 质询</button>' +
      '<button class="hud-btn hud-voice" data-act="voice" title="人物配音开关">' + (voiceOn ? "声" : "静") + '</button>' +
      '<button class="hud-btn hud-ai-cfg" data-act="aiSettings">⚙</button>' +
    '</header>';
  }

  function evCount() {
    var n = 0;
    for (var k in S.ev) if (S.ev[k]) n++;
    return n;
  }

  function portraitHTML(info, talking) {
    if (!info || !info.img) {
      S.lastPortrait = null;
      S.lastImg = null;
      S.lastBase = "";
      return "";
    }
    var who = info.cls + "|" + info.name;
    var sameWho = S.lastPortrait === who;
    var prevImg = S.lastImg;
    var faceChange = sameWho && prevImg && prevImg !== info.img;
    /* 整张照片直接展示：不裁切、不跟随鼠标、不做头身分层；
       表情切换只在整张图上做一次极短的淡入，不叠旧图，避免脸和脖子重影 */
    S.lastPortrait = who;
    S.lastImg = info.img;
    S.lastBase = info.base || "";
    var lookAttr = ' data-look="' + esc(info.base || "") + '" data-fb="' + esc(info.fb || "") + '"';
    return '<figure class="portrait portrait--' + info.cls + (sameWho ? " same" : "") + (faceChange ? " swap" : "") + '">' +
      '<div class="portrait-body">' +
        '<div class="p-wrap">' +
          '<div class="p-face p-live"><img src="' + esc(info.img) + '"' + lookAttr + ' alt="' + esc(info.name) + '"></div>' +
        '</div>' +
        '<span class="p-sheen" aria-hidden="true"></span>' +
      '</div>' +
      '<figcaption class="portrait-cap"><b>' + esc(info.name) + '</b><span>' + esc(info.role) + '</span></figcaption>' +
    '</figure>';
  }

  function dialogHTML() {
    if (S.phase === "nodes" && S.tmode === "statement") return nodeHTML();
    var ln = S.lines[S.li];
    if (!ln) return '<p class="line narr">……</p>';
    var info = lineSpeaker(ln);
    var head = info
      ? '<div class="speaker"><b>' + esc(info.name) + '</b><span>' + esc(info.role) + '</span></div>'
      : "";
    var cls = ln.sp === "narr" ? "line narr" : "line";
    return head + '<p class="' + cls + '">' + esc(ln.t) + '</p>' +
      '<div class="advance">点击继续 ▾</div>';
  }

  function nodeHTML() {
    var n = S.c.nodes[S.node];
    if (!n) return "";
    var info = speakerInfo(n.sp, n.who, n.role);
    var head = info
      ? '<div class="speaker"><b>' + esc(info.name) + '</b><span>' + esc(info.role) + '</span></div>'
      : "";
    var tip = n.talk ? '<span class="node-tip talk">继续听审</span>' : '<span class="node-tip">此处必须出示证据</span>';
    var actions = n.talk
      ? (n.press ? '<button class="btn" data-act="pressNode">追问</button>' : '') +
        '<button class="btn" data-act="ai">AI 质询</button>' +
        '<button class="btn btn-primary" data-act="talkNext">继续 →</button>'
      : (n.press ? '<button class="btn" data-act="pressNode">追问</button>' : '') +
        '<button class="btn" data-act="ai">AI 质询</button>' +
        '<button class="btn btn-primary" data-act="present">出示证据</button>';
    return '<div class="node-head"><span class="dot"></span>关键节点 ' + (S.node + 1) + ' / ' + S.c.nodes.length + tip + '</div>' +
      head +
      '<p class="testi-text">' + esc(n.cue) + '</p>' +
      '<div class="actions">' + actions + '</div>';
  }

  function renderTrial() {
    var info = currentSpeaker();
    var cls = S.version === "real" ? "trial v-real" : "trial v-anime";
    var sc = currentScene();
    updateBg(sc.img, sc.court);
    var talking = S.lastLi !== S.li || S.tmode === "statement";
    S.lastLi = S.li;
    if (!S.branchOpen && !S.drawer) {
      if (S.phase === "nodes" && S.tmode === "statement") {
        var nn = S.c.nodes[S.node];
        if (nn) speak({ t: nn.cue }, info);
      } else if (S.lines && S.lines[S.li]) {
        speak(S.lines[S.li], info);
      }
    }
    var html = '<div class="' + cls + (S.phase === "recon" ? " is-recon" : "") + '">' +
      '<div class="trial-veil"></div>' +
      '<div class="trial-mark" aria-hidden="true"><b>' + esc(S.c.no) + '</b><span>' + esc(S.c.title) + '</span></div>' +
      hudHTML() +
      '<div class="stage">' + portraitHTML(info, talking) + '</div>' +
      '<div class="dialog"><div class="dialog-inner">' + dialogHTML() + '</div></div>' +
    '</div>';
    if (S.drawer === "evidence") html += evidenceDrawerHTML();
    if (S.drawer === "consult") html += consultDrawerHTML();
    if (S.drawer === "ai") html += aiDrawerHTML();
    if (S.branchOpen) html += branchHTML();
    app.innerHTML = html;
  }

  /* ================= 对话推进 ================= */
  function playLines(lines, onDone, kind) {
    S.lines = lines || [];
    S.li = 0;
    S.lastLi = -1;
    S.onDone = onDone || null;
    S.lineKind = kind || "line";
    S.tmode = "lines";
    S.branchOpen = false;
    scanEvidence(S.lines[0]);
    renderTrial();
  }

  function advance() {
    if (!S || view !== "trial" || S.drawer || S.branchOpen) return;
    if (!S.lines || !S.lines.length) return;
    if (S.li < S.lines.length - 1) {
      S.li++;
      scanEvidence(S.lines[S.li]);
      renderTrial();
      return;
    }
    var cb = S.onDone;
    S.lines = [];
    S.onDone = null;
    if (cb) cb(); else renderTrial();
  }

  function skipRecon() {
    if (!S || S.phase !== "recon") return;
    S.lines = [];
    S.onDone = null;
    startOpening();
  }

  /* ================= 庭审阶段 ================= */
  function startOpening() {
    S.phase = "opening";
    playLines(S.c.intro, startNodes, "intro");
  }

  function startNodes() {
    S.phase = "nodes";
    S.tmode = "statement";
    S.node = 0;
    playBGM("tense");
    enterNode();
  }

  /* 进入节点时，若该节点要用的材料还没在剧情里出现，
     由书记员当庭从卷宗里抽出来，保证庭审能继续，也不一次给太多 */
  function ensureNodeEvidence(n) {
    if (!n) return;
    var ids = [];
    if (n.answer) ids.push(n.answer);
    if (n.answers) for (var i = 0; i < n.answers.length; i++) ids.push(n.answers[i]);
    for (var j = 0; j < ids.length; j++) {
      if (S.ev[ids[j]]) continue;
      var e = null;
      for (var k = 0; k < S.c.evidence.length; k++) if (S.c.evidence[k].id === ids[j]) e = S.c.evidence[k];
      if (!e) continue;
      S.ev[e.id] = true;
      popEvidence([e]);
      break;
    }
  }

  /* 每个节点随证言再调取一份尚未入卷的材料：
     挂在节点过渡对白的最后一句上，材料跟着这句话一起出现 */
  function nodePreLines(n) {
    var pre = (n && n.pre ? n.pre : []).slice();
    var extra = null;
    for (var i = 0; i < S.c.evidence.length; i++) {
      if (!S.ev[S.c.evidence[i].id]) { extra = S.c.evidence[i]; break; }
    }
    if (extra) {
      if (pre.length) {
        var last = pre[pre.length - 1], copy = {}, k;
        for (k in last) copy[k] = last[k];
        copy.ev = copy.ev ? [].concat(copy.ev, extra.id) : extra.id;
        pre[pre.length - 1] = copy;
      } else {
        S.ev[extra.id] = true;
        setTimeout(function () { popEvidence([extra]); }, 60);
      }
    }
    return pre;
  }

  /* 进入节点：先播过渡对白（pre），再亮出需要质证的陈述 */
  function enterNode() {
    var n = S.c.nodes[S.node];
    if (!n) { startClosing(); return; }
    var pre = nodePreLines(n);
    if (pre.length) {
      S.tmode = "lines";
      playLines(pre, function () {
        ensureNodeEvidence(n);
        S.tmode = "statement";
        renderTrial();
      }, "pre");
      return;
    }
    ensureNodeEvidence(n);
    S.tmode = "statement";
    renderTrial();
  }

  function pressNode() {
    var n = S.c.nodes[S.node];
    if (!n || !n.press) return;
    var info = speakerInfo(n.sp, n.who, n.role);
    S.tmode = "lines";
    playLines([{ sp: n.sp, who: info ? info.name : n.who, role: info ? info.role : n.role, t: n.press }], function () {
      S.tmode = "statement";
      renderTrial();
    }, "press");
  }

  function openEvidence(present) {
    S.present = !!present;
    S.drawer = "evidence";
    renderTrial();
  }

  function closeDrawer() {
    S.drawer = null;
    S.present = false;
    renderTrial();
  }

  function acceptedIds(n) {
    if (n.answers && n.answers.length) return n.answers;
    return n.answer ? [n.answer] : [];
  }

  function aiCaseContext(node) {
    var c = S.c, evs = [];
    for (var i = 0; i < c.evidence.length; i++) {
      var e = c.evidence[i];
      evs.push({ id: e.id, name: e.name, type: e.type, doc: e.doc });
    }
    return {
      version: S.version,
      caseTitle: c.title,
      brief: c.brief,
      question: c.question,
      cause: c.cause,
      evidence: evs,
      cue: node ? node.cue : "",
      witness: node ? (node.who || "") : "",
      scene: S.phase === "recon" ? "案件还原" : "法庭调查"
    };
  }

  function acceptEvidence(evd, viaAi) {
    var n = S.c.nodes[S.node];
    S.drawer = null;
    S.present = false;
    S.tmode = "lines";
    toast((viaAi ? "AI 认定关联成立 · " : "证据成立 · ") + evd.name);
    playLines(n.break || [{ sp: "judge", t: "这份材料可以说明问题。本庭采纳。" }], afterBreak, "break");
  }

  function rejectEvidence(n, aiReason) {
    S.mistakes++;
    S.drawer = null;
    S.present = false;
    S.tmode = "lines";
    var lines = [
      { sp: "judge", t: "这件物品好像无法说明问题。请你重新出示。" },
      { sp: "judge", t: n.afterWrong || "本庭再提醒一次：要看的是它与这句话之间的关系，不是它有多重要。" }
    ];
    if (aiReason) lines.push({ sp: "judge", t: aiReason });
    playLines(lines, function () {
      S.tmode = "statement";
      renderTrial();
    }, "break");
  }

  function pickEvidence(id) {
    if (!S.present) return;
    if (!S.ev[id]) {
      toast("这份材料还没在庭上出现，暂时不能出示");
      return;
    }
    var n = S.c.nodes[S.node];
    if (!n) return;
    var evd = null;
    for (var i = 0; i < S.c.evidence.length; i++) if (S.c.evidence[i].id === id) evd = S.c.evidence[i];
    if (!evd) return;

    if (acceptedIds(n).indexOf(id) >= 0) {
      acceptEvidence(evd);
      return;
    }

    /* 静态答案之外：交给 AI 判断这件材料与当前陈述有没有关联 */
    if (window.AI && window.AI.ready()) {
      var caseId = S.c.id, nodeIdx = S.node;
      S.drawer = null;
      S.present = false;
      S.tmode = "lines";
      playLines([{ sp: "judge", t: "稍等。本庭正在核验这件材料与当前陈述的关联。" }], null, "break");
      window.AI.relevance(aiCaseContext(n), evd, function (res) {
        if (!S || !S.c || S.c.id !== caseId || S.node !== nodeIdx) return;
        if (res && res.valid) {
          acceptEvidence(evd, true);
        } else {
          rejectEvidence(n, res && res.reason ? "助理意见：" + res.reason : "");
        }
      });
      return;
    }

    rejectEvidence(n);
  }

  function afterBreak() {
    var n = S.c.nodes[S.node];
    if (n && n.branch && n.branch.options && n.branch.options.length) {
      S.branchOpen = true;
      S.tmode = "lines";
      renderTrial();
      return;
    }
    nextNode();
  }

  function branchHTML() {
    var n = S.c.nodes[S.node];
    var opts = "";
    for (var i = 0; i < n.branch.options.length; i++) {
      var o = n.branch.options[i];
      opts += '<button class="eth-option" data-branch="' + i + '">' +
        '<span class="eth-key">' + "ABCDE".charAt(i) + '</span>' +
        '<div class="eth-body">' +
          '<div class="eth-name">' + esc(o.label) + '</div>' +
          '<p class="eth-detail">' + esc(o.detail || "") + '</p>' +
        '</div>' +
      '</button>';
    }
    return '<div class="branch-screen"><div class="branch-inner">' +
      '<div class="kicker">庭审判断 · ' + esc(S.c.no) + '</div>' +
      '<h2 class="ethics-title">' + esc(n.branch.q) + '</h2>' +
      '<p class="ethics-sub">这一判断会被记入结案后的审判者画像。</p>' +
      '<div class="eth-list">' + opts + '</div>' +
    '</div></div>';
  }

  function chooseBranch(i) {
    var n = S.c.nodes[S.node];
    var o = n.branch.options[i];
    if (!o) return;
    savePick(S.version, S.c.id + ":n" + S.node, {
      tags: o.tags || {},
      label: o.label,
      caseTitle: S.c.title,
      kind: "判断"
    });
    S.branchPick = o.label;
    S.branchOpen = false;
    nextNode();
  }

  function nextNode() {
    S.branchPick = null;
    S.node++;
    if (S.node < S.c.nodes.length) {
      enterNode();
      return;
    }
    startClosing();
  }

  function startClosing() {
    S.phase = "closing";
    S.tmode = "lines";
    playLines(S.c.closing, function () {
      /* 结案前把剩余材料归档，卷宗完整 */
      unlockAllEvidence();
      view = "ethics";
      renderEthics();
      playBGM("tender");
    }, "closing");
  }

  function evidenceDrawerHTML() {
    var cards = "", shown = 0;
    for (var i = 0; i < S.c.evidence.length; i++) {
      var e = S.c.evidence[i];
      if (!S.ev[e.id]) continue;
      shown++;
      var media = "";
      if (e.media && e.media.src && e.media.type === "image") {
        media = '<span class="ev-media-wrap">' +
          '<img class="ev-media" src="' + esc(e.media.src) + '" alt="' + esc(e.media.caption || e.name) + '" loading="lazy">' +
          '<em class="ev-media-tag">' + esc(e.media.caption || "AI 还原") + '</em>' +
        '</span>';
      }
      cards += '<button class="ev-card" data-ev="' + e.id + '">' +
        '<div class="ev-type">' + esc(e.type) + '</div>' +
        '<div class="ev-name">' + esc(e.name) + '</div>' +
        media +
        '<p class="ev-doc">' + esc(e.doc) + '</p>' +
        (e.from ? '<p class="ev-from">来源：' + esc(e.from) + '</p>' : '') +
      '</button>';
    }
    if (!shown) {
      cards = '<div class="ev-empty">' +
        '<b>证据卷还是空的</b>' +
        '<p>你一开始什么都不知道。继续听案情，关键材料会在对话中自然出现，并自动入卷。</p>' +
      '</div>';
    }
    var aiNote = window.AI && window.AI.ready()
      ? "预设答案之外的材料，会交给 AI 助理裁定是否切题。"
      : "";
    var note = S.present
      ? "选择一件能够解释当前这句话的证据。只要指向同一个事实，多件材料都可能成立；出示无关材料才会被记为误判。" + aiNote
      : "这里只列出已经入卷的材料。还没在庭审里出现过的，不会显示。证据只能在关键节点出示。";
    return '<div class="drawer' + (S.version === "real" ? " v-real" : "") + '" data-drawer="1">' +
      '<div class="drawer-mask" data-act="close"></div>' +
      '<div class="drawer-panel">' +
        '<div class="drawer-head"><h2 class="drawer-title">证据卷 · ' + shown + ' 份</h2>' +
          '<button class="drawer-close" data-act="close">关闭 ×</button></div>' +
        '<p class="drawer-note">' + note + '</p>' +
        '<div class="ev-grid">' + cards + '</div>' +
      '</div>' +
    '</div>';
  }

  /* ================= AI 助理 ================= */
  function aiDrawerHTML() {
    var n = S.phase === "nodes" ? S.c.nodes[S.node] : null;
    var who = n && n.who ? n.who : (S.phase === "recon" ? "案件还原" : "庭审");
    var log = "";
    for (var i = 0; i < S.aiChat.length; i++) {
      var m = S.aiChat[i];
      if (m.role === "q") {
        log += '<div class="ai-msg ai-q"><span class="ai-who">你</span><p>' + esc(m.text) + '</p></div>';
      } else {
        log += '<div class="ai-msg ai-a"><span class="ai-who">助理</span>' +
          (m.pending ? '<p class="ai-typing">正在查阅卷宗…</p>' : '<p>' + esc(m.text) + '</p>') + '</div>';
      }
    }
    if (!log) log = '<p class="ai-empty">我可以按卷宗回答你的追问，也可以判断你手里的材料切不切题。结案后会按你的判断写一段说理，并读一读你的全部选择。</p>';
    var quick = [
      "这句话和哪份证据能对上？",
      "证人有没有前后矛盾的地方？",
      "对方最有力的反驳会是什么？"
    ];
    var chips = "";
    for (var q = 0; q < quick.length; q++) {
      chips += '<button class="ai-chip" data-aiq="' + esc(quick[q]) + '">' + esc(quick[q]) + '</button>';
    }
    var ready = window.AI && window.AI.ready();
    var abilities = '<div class="ai-abilities">' +
      '<span>① 追问卷宗</span><span>② 证据关联裁定</span><span>③ 结案说理</span><span>④ 审判者点评</span>' +
    '</div>';
    var need = ready ? "" : '<div class="ai-need">' +
      '<b>还没有接入 AI</b>' +
      '<p>接入后，助理能在这里按卷宗回答你的追问；你出示预设之外的材料时，由它判断是否切题；结案页还能生成判决说理与审判者点评。不接入也可以完整通关。</p>' +
      '<button class="btn btn-primary" data-act="aiSettings">配置 AI 接口</button>' +
    '</div>';
    return '<div class="drawer' + (S.version === "real" ? " v-real" : "") + '" data-drawer="1">' +
      '<div class="drawer-mask" data-act="close"></div>' +
      '<div class="drawer-panel ai-panel">' +
        '<div class="drawer-head"><h2 class="drawer-title">AI 法庭助理</h2>' +
          '<button class="drawer-close" data-act="aiSettings">接口设置</button>' +
          '<button class="drawer-close" data-act="close">关闭 ×</button></div>' +
        abilities +
        '<p class="drawer-note">当前语境：' + esc(who) + '。' +
          (ready ? '助理会以卷宗内的事实作答。' : '未配置接口。') + '</p>' +
        need +
        '<div class="ai-log">' + log + '</div>' +
        '<div class="ai-quick">' + chips + '</div>' +
        '<div class="ai-input-row">' +
          '<textarea id="aiInput" rows="2" placeholder="自由质询，例如：那天你为什么没有还嘴？">' + esc(S.aiDraft || "") + '</textarea>' +
          '<button class="btn btn-primary" data-act="aiSend">发送</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function aiSend(text) {
    if (!S) return;
    if (!(window.AI && window.AI.ready())) {
      toast("先配置 AI 接口");
      openAiSettings();
      return;
    }
    if (S.aiBusy) { toast("助理还在回答上一个问题"); return; }
    var q = text;
    if (q == null) {
      var ta = document.getElementById("aiInput");
      q = ta ? (ta.value || "").trim() : "";
    }
    if (!q) return;
    S.aiBusy = true;
    S.aiDraft = "";
    var history = S.aiChat.slice();
    S.aiChat.push({ role: "q", text: q });
    S.aiChat.push({ role: "a", text: "", pending: true });
    var chatRef = S.aiChat;
    renderTrial();
    scrollAiLog();
    var ctx = aiCaseContext(S.phase === "nodes" ? S.c.nodes[S.node] : null);
    window.AI.crossExamine(ctx, history, q, function (res) {
      if (!S || S.aiChat !== chatRef) return;
      S.aiBusy = false;
      var last = S.aiChat[S.aiChat.length - 1];
      if (last) {
        last.pending = false;
        last.text = (res && res.text) || (res && res.error) || "助理没有回应。";
      }
      renderTrial();
      scrollAiLog();
    });
  }

  function scrollAiLog() {
    setTimeout(function () {
      var el = document.querySelector(".ai-log");
      if (el) el.scrollTop = el.scrollHeight;
    }, 30);
  }

  function openAiSettings() {
    var box = document.getElementById("aiModal");
    if (!box) return;
    var st = window.AI ? window.AI.settings() : { baseUrl: "", model: "", apiKey: "" };
    box.innerHTML = '<div class="ai-modal-mask" data-aimodal="close"></div>' +
      '<div class="ai-modal-panel">' +
        '<div class="drawer-head"><h2 class="drawer-title">AI 接口设置</h2>' +
          '<button class="drawer-close" data-aimodal="close">关闭 ×</button></div>' +
        '<p class="drawer-note">默认已内置智谱 glm-5.3-flash 接口，可直接使用；也可换成任意 OpenAI 兼容接口（DeepSeek、通义、Kimi、本地 Ollama 等）。密钥只存在本机浏览器里。</p>' +
        '<label class="ai-field"><span>接口地址</span><input id="aiBase" value="' + esc(st.baseUrl) + '" placeholder="https://api.deepseek.com/v1"></label>' +
        '<label class="ai-field"><span>模型</span><input id="aiModel" value="' + esc(st.model) + '" placeholder="deepseek-chat"></label>' +
        '<label class="ai-field"><span>API Key</span><input id="aiKey" type="password" value="' + esc(st.apiKey) + '" placeholder="sk-..."></label>' +
        '<div class="ai-modal-actions">' +
          '<button class="btn" data-aimodal="test">测试连接</button>' +
          '<button class="btn btn-primary" data-aimodal="save">保存</button>' +
        '</div>' +
        '<p class="ai-test" id="aiTestMsg"></p>' +
      '</div>';
    box.classList.add("on");
    setTimeout(function () {
      var b = document.getElementById("aiBase");
      if (b) b.focus();
    }, 40);
  }

  function closeAiSettings() {
    var box = document.getElementById("aiModal");
    if (!box) return;
    box.classList.remove("on");
    box.innerHTML = "";
  }

  function readAiForm() {
    var b = document.getElementById("aiBase");
    var m = document.getElementById("aiModel");
    var k = document.getElementById("aiKey");
    return { baseUrl: b ? b.value : "", model: m ? m.value : "", apiKey: k ? k.value : "" };
  }

  function saveAiSettings() {
    if (window.AI) window.AI.save(readAiForm());
    toast("AI 接口已保存");
    closeAiSettings();
    if (S) { S.aiDraft = ""; }
  }

  function testAiSettings() {
    if (!window.AI) return;
    var msg = document.getElementById("aiTestMsg");
    if (msg) msg.textContent = "正在连接……";
    window.AI.save(readAiForm());
    window.AI.test(function (res) {
      var el = document.getElementById("aiTestMsg");
      if (!el) return;
      el.textContent = res && res.ok ? "连接成功：" + (res.text || "OK") : "连接失败：" + ((res && res.error) || "未知错误");
    });
    if (S && view === "trial") renderTrial();
  }

  function aiVerdictReason() {
    var box = document.getElementById("aiReasonBody");
    if (!box || !S) return;
    if (!(window.AI && window.AI.ready())) {
      toast("先在右上角配置 AI 接口");
      openAiSettings();
      return;
    }
    box.innerHTML = '<p class="ai-loading">助理正在整理说理…</p>';
    var c = S.c, v = c.verdicts[S.grade] || c.verdicts.C;
    window.AI.reasoning({
      caseTitle: c.title, brief: c.brief, question: c.question,
      grade: S.grade,
      ethics: S.opt ? S.opt.label : "",
      ethicsDetail: S.opt ? S.opt.detail : "",
      mistakes: S.mistakes,
      verdictTitle: v.title, verdictText: v.text,
      lesson: c.truth ? c.truth.lesson : ""
    }, function (res) {
      var el = document.getElementById("aiReasonBody");
      if (!el) return;
      el.innerHTML = res && res.text
        ? '<p class="ai-para">' + esc(res.text) + '</p>'
        : '<p class="ai-para ai-err">' + esc((res && res.error) || "生成失败，请检查接口设置。") + '</p>';
    });
  }

  function aiProfileAnalysis() {
    var box = document.getElementById("aiProfileBody");
    if (!box || !S) return;
    if (!(window.AI && window.AI.ready())) {
      toast("先在右上角配置 AI 接口");
      openAiSettings();
      return;
    }
    box.innerHTML = '<p class="ai-loading">助理正在读你的判断记录…</p>';
    var pd = profileData(S.version);
    if (!pd) { box.innerHTML = '<p class="ai-para">还没有足够的判断记录。</p>'; return; }
    window.AI.analyze({
      thinker: pd.best.arch.name,
      school: pd.best.arch.school,
      count: pd.count,
      pct: pd.pct,
      picks: pd.picks
    }, function (res) {
      var el = document.getElementById("aiProfileBody");
      if (!el) return;
      el.innerHTML = res && res.text
        ? '<p class="ai-para">' + esc(res.text) + '</p>'
        : '<p class="ai-para ai-err">' + esc((res && res.error) || "生成失败，请检查接口设置。") + '</p>';
    });
  }

  function consultDrawerHTML() {
    var cards = "";
    for (var i = 0; i < S.V.thinkers.length; i++) {
      var t = S.V.thinkers[i];
      var line = (S.c.consult && S.c.consult[t.id]) || "";
      cards += '<div class="consult-card">' +
        '<div><span class="consult-name">' + esc(t.name) + '</span>' +
          '<span class="consult-tag">' + esc(t.tag) + '</span></div>' +
        '<p class="consult-line">' + esc(t.line) + '</p>' +
        (line && line !== t.line ? '<p class="consult-line consult-case">' + esc(line) + '</p>' : '') +
      '</div>';
    }
    var n = S.V.thinkers.length;
    return '<div class="drawer' + (S.version === "real" ? " v-real" : "") + '" data-drawer="1">' +
      '<div class="drawer-mask" data-act="close"></div>' +
      '<div class="drawer-panel">' +
        '<div class="drawer-head"><h2 class="drawer-title">评议席 · ' + n + ' 位哲人</h2>' +
          '<button class="drawer-close" data-act="close">关闭 ×</button></div>' +
        '<p class="drawer-note">求教不改变任何结果，只提供 ' + n + ' 种看问题的方式。同一份卷宗，不同的眼睛。</p>' +
        '<div class="consult-grid">' + cards + '</div>' +
      '</div>' +
    '</div>';
  }

  /* ================= 伦理与判决 ================= */
  function renderEthics() {
    var c = S.c;
    clearBg();
    var opts = "";
    for (var i = 0; i < c.ethics.options.length; i++) {
      var o = c.ethics.options[i];
      opts += '<button class="eth-option" data-eth="' + i + '">' +
        '<span class="eth-key">' + "ABCDE".charAt(i) + '</span>' +
        '<div class="eth-body">' +
          '<div class="eth-name">' + esc(o.label) + '</div>' +
          '<p class="eth-detail">' + esc(o.detail) + '</p>' +
        '</div>' +
      '</button>';
    }
    var acc = S.mistakes <= 1 ? "证据链完整" : S.mistakes <= 4 ? "有少量误判" : "误判较多";
    app.innerHTML = '<div class="ethics-screen"><div class="ethics-inner">' +
      '<div class="kicker">伦理抉择 · ' + esc(c.no) + '</div>' +
      '<h2 class="ethics-title">' + esc(c.ethics.question) + '</h2>' +
      '<p class="ethics-sub">本庭误判 <b>' + S.mistakes + '</b> 次（' + acc + '）。误判越少，判决越接近你主张的立场；误判过多，判决会被折损。</p>' +
      '<div class="eth-list">' + opts + '</div>' +
      '<p class="ethics-hint">选择会同时计入审判者画像。每案的真实裁判结果，在判决后给出。</p>' +
    '</div></div>';
  }

  function chooseEthics(i) {
    var opt = S.c.ethics.options[i];
    if (!opt) return;
    var allowed = S.mistakes <= 1 ? "S" : S.mistakes <= 4 ? "A" : "C";
    S.grade = worse(opt.verdict, allowed);
    S.opt = opt;
    savePick(S.version, S.c.id + ":eth", {
      tags: opt.tags || {},
      label: opt.label,
      caseTitle: S.c.title,
      kind: "抉择"
    });
    saveProgress(S.version, S.c.id, S.grade);
    view = "verdict";
    renderVerdict();
    playBGM("verdict");
  }

  function renderVerdict() {
    var c = S.c;
    clearBg();
    var v = c.verdicts[S.grade] || c.verdicts.C;
    var t = c.truth;
    var paras = "";
    for (var i = 0; i < t.paragraphs.length; i++) {
      paras += '<p class="truth-p">' + esc(t.paragraphs[i]) + '</p>';
    }
    var next = S.V.cases[S.idx + 1];
    var picks = loadPicks(S.version), picked = 0;
    for (var k in picks) picked++;
    app.innerHTML = '<div class="verdict-screen v-' + S.version + '"><div class="verdict-inner">' +
      '<div class="verdict-card">' +
        '<div class="stamp ' + S.grade + '">' + S.grade + '</div>' +
        '<div>' +
          '<div class="verdict-kicker">判决 · ' + esc(c.no) + ' · ' + esc(c.tag) + '</div>' +
          '<h2 class="verdict-title">' + esc(v.title) + '</h2>' +
          '<p class="verdict-text">' + esc(v.text) + '</p>' +
          '<p class="verdict-line">' + esc(v.line) + '</p>' +
          '<p class="verdict-meta">本案误判 ' + S.mistakes + ' 次' + (S.mistakes > 1 ? '；判决按折损后等级下达。' : '；证据链完整。') + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="truth-card">' +
        '<h3 class="truth-title">' + esc(t.title) + '</h3>' +
        paras +
        '<div class="lesson">' + esc(t.lesson) + '</div>' +
      '</div>' +
      '<div class="ai-card">' +
        '<div class="ai-card-head"><span class="ai-card-title">AI · 判决说理</span>' +
          '<button class="btn" data-act="aiReason">生成说理</button></div>' +
        '<div class="ai-card-body" id="aiReasonBody"><p class="ai-para ai-dim">让助理结合本案卷宗与你刚才的伦理选择，写一份可以当庭宣读的说理。需要先在右上角配置 AI 接口。</p></div>' +
      '</div>' +
      '<div class="verdict-actions">' +
        '<button class="btn" data-act="retry">重审本庭</button>' +
        '<button class="btn" data-act="hub">返回目录</button>' +
        '<button class="btn" data-act="aiSettings">AI 接口</button>' +
        '<button class="btn" data-act="profile">审判者画像（' + picked + ' 次判断）</button>' +
        (next
          ? '<button class="btn btn-primary" data-act="nextcase">下一庭 · ' + esc(next.title) + ' →</button>'
          : '<button class="btn btn-primary" data-act="profile">五庭已毕 · 查看审判者画像</button>') +
      '</div>' +
    '</div></div>';
  }

  /* ================= 审判者画像 ================= */
  var DIMS = [
    { k: "proc", label: "程序" },
    { k: "right", label: "权利" },
    { k: "effect", label: "后果" },
    { k: "virtue", label: "德性" },
    { k: "order", label: "秩序" },
    { k: "mercy", label: "人道" }
  ];

  var ARCHETYPES = [
    { id: "kant", name: "康德", school: "义务论", quote: "要只按照你同时愿意它成为普遍法则的准则去行动。",
      vec: { proc: .95, right: .9, effect: .05, virtue: .5, order: .3, mercy: .4 },
      desc: "你判断一件事，先看它是否正当，再看结果。规则能否被普遍化、人是否被当作目的本身，是你的第一顺位。" },
    { id: "mill", name: "密尔", school: "自由功利主义", quote: "人类自由的适当边界，是不伤害他人。",
      vec: { effect: .8, right: .85, proc: .6, virtue: .35, order: .25, mercy: .45 },
      desc: "你关心后果，但更关心个人不被多数人压过。你在结果与自由之间寻找那条不伤害他人的界线。" },
    { id: "bentham", name: "边沁", school: "功利主义", quote: "最大多数人的最大幸福。",
      vec: { effect: .98, order: .8, proc: .45, right: .2, virtue: .2, mercy: .3 },
      desc: "你习惯算总账：这条规则会让社会的痛苦增加还是减少。你看重实效，愿意为此接受某种程度的秩序代价。" },
    { id: "aristotle", name: "亚里士多德", school: "德性伦理", quote: "德性是两恶之间的中道。",
      vec: { virtue: .95, mercy: .65, order: .5, right: .45, proc: .35, effect: .3 },
      desc: "你关心一个人应当成为什么样的人，而不只是他做了什么事。你更愿意用实践智慧去衡量具体处境，而非套用抽象规则。" },
    { id: "rawls", name: "罗尔斯", school: "契约正义论", quote: "无知之幕之后，你会选择哪条规则？",
      vec: { right: .9, proc: .85, mercy: .55, virtue: .45, effect: .35, order: .4 },
      desc: "你习惯把自己放到最不利的位置上去检验规则。程序与权利的公平，比结果的好坏更能说服你。" },
    { id: "beccaria", name: "贝卡里亚", school: "刑罚人道主义", quote: "刑罚的威慑力来自确定，而非残酷。",
      vec: { mercy: .92, proc: .8, right: .7, effect: .35, order: .45, virtue: .4 },
      desc: "你反对以痛苦回应痛苦。你相信刑罚的正当性来自明确、必要与克制，而不是它足够严厉。" },
    { id: "confucius", name: "孔子", school: "德治与仁", quote: "道之以德，齐之以礼，有耻且格。",
      vec: { virtue: .92, order: .82, mercy: .7, right: .35, proc: .28, effect: .3 },
      desc: "你相信规则之外还有人心。你希望用教化与体面来维系秩序，让判决承担起引导风俗的责任。" },
    { id: "hanfei", name: "韩非", school: "法家刑名", quote: "法不阿贵，绳不挠曲。",
      vec: { order: .95, proc: .82, effect: .55, right: .15, virtue: .2, mercy: .12 },
      desc: "你重视规则的确定与执行的彻底。你不太相信人情可以替代制度，认为模糊的善意往往制造更大的不公。" },
    { id: "mengzi", name: "孟子", school: "仁政与性善", quote: "恻隐之心，仁之端也。",
      vec: { virtue: .9, mercy: .88, order: .55, right: .5, proc: .3, effect: .28 },
      desc: "你相信人心里那一点不忍，是制度最后的底线。你愿意把判决写成一份教化，而不是一纸冷冰冰的处分。" },
    { id: "xunzi", name: "荀子", school: "礼法教化", quote: "礼者，法之大分，类之纲纪也。",
      vec: { order: .9, virtue: .72, proc: .62, right: .35, mercy: .3, effect: .38 },
      desc: "你不相信人性天然向善，也不相信单靠刑罚就够。你更看重礼制、教化与可执行的规矩如何一起把人扶正。" },
    { id: "laozi", name: "老子", school: "无为与自然", quote: "法令滋彰，盗贼多有。",
      vec: { mercy: .72, virtue: .62, right: .6, order: .22, proc: .28, effect: .22 },
      desc: "你警惕过度治理。你认为许多纠纷是被繁密的规则与好胜心制造出来的，最好的判决常常是少做一点。" },
    { id: "wangyangming", name: "王阳明", school: "知行与良知", quote: "知是行之始，行是知之成。",
      vec: { virtue: .96, mercy: .62, proc: .4, right: .45, order: .38, effect: .3 },
      desc: "你看重一个人心里那点良知有没有落到行动上。说得再对，做不到，在你这里都不算数。" },
    { id: "socrates", name: "苏格拉底", school: "诘问与德性", quote: "未经省察的人生不值得过。",
      vec: { virtue: .9, proc: .82, right: .55, mercy: .45, order: .35, effect: .25 },
      desc: "你不急着给答案，先追问定义：什么叫过错，什么叫公正，谁有资格下这个判断。你相信清醒的追问本身就是德性。" },
    { id: "plato", name: "柏拉图", school: "理想正义", quote: "正义就是每个人做自己分内的事。",
      vec: { virtue: .84, order: .8, proc: .5, right: .4, mercy: .4, effect: .3 },
      desc: "你关心城邦的整体秩序与灵魂的等级。你愿意让最有德性的人承担判断的责任，也要求他们配得上这份权力。" },
    { id: "aquinas", name: "阿奎那", school: "自然法", quote: "恶法非法。",
      vec: { order: .84, virtue: .74, proc: .7, mercy: .5, right: .42, effect: .3 },
      desc: "你相信在人间法律之上还有一层更高的理性秩序。违背它的命令也许有效，却不配被称为法。" },
    { id: "hobbes", name: "霍布斯", school: "秩序契约", quote: "人对人是狼。",
      vec: { order: .98, proc: .64, effect: .4, right: .2, virtue: .24, mercy: .15 },
      desc: "你首先关心秩序能不能立住。没有公共权力，权利只是一句空话；你愿意为安全付出相当的自由代价。" },
    { id: "locke", name: "洛克", school: "自然权利", quote: "生命、自由、财产，先于国家而存在。",
      vec: { right: .96, proc: .7, mercy: .45, virtue: .42, order: .3, effect: .35 },
      desc: "你把个人的生命与自由放在制度之前。政府可以治理，但不能拿走它本来就没有资格拿走的东西。" },
    { id: "nietzsche", name: "尼采", school: "价值重估", quote: "不做道德的奴隶，做价值的创造者。",
      vec: { virtue: .64, effect: .58, right: .55, order: .2, proc: .24, mercy: .2 },
      desc: "你怀疑那些被说成天经地义的道德，究竟是谁的利益。你更在意一个人有没有力量承担自己选择的价值。" },
    { id: "gilligan", name: "吉利根", school: "关怀伦理", quote: "道德是具体关系里的回应。",
      vec: { mercy: .95, virtue: .7, right: .55, proc: .3, order: .28, effect: .25 },
      desc: "你不满足于抽象规则，先问谁被留下了、谁在承受、关系有没有被修补。你相信关怀本身就是一种正义。" },
    { id: "nozick", name: "诺齐克", school: "自由至上主义", quote: "个人是目的，不是他人的资源。",
      vec: { right: .98, effect: .5, proc: .6, order: .2, virtue: .24, mercy: .25 },
      desc: "你极警惕以集体之名拿走个人的东西。只要取得与转让是正当的，再分配在你这里就需要极强的理由。" }
  ];

  function profileData(version) {
    var picks = loadPicks(version);
    var sum = {}, keys = [], total = 0, count = 0;
    for (var i = 0; i < DIMS.length; i++) sum[DIMS[i].k] = 0;
    for (var key in picks) {
      var p = picks[key];
      if (!p || !p.tags) continue;
      count++;
      keys.push({ key: key, label: p.label, caseTitle: p.caseTitle, kind: p.kind });
      for (var d in p.tags) {
        if (sum[d] == null) continue;
        sum[d] += p.tags[d];
        total += p.tags[d];
      }
    }
    if (!count || !total) return null;
    var pct = {};
    for (var j = 0; j < DIMS.length; j++) {
      var k = DIMS[j].k;
      pct[k] = Math.round((sum[k] / total) * 1000) / 10;
    }
    var best = null, second = null;
    for (var a = 0; a < ARCHETYPES.length; a++) {
      var arch = ARCHETYPES[a];
      var sim = cosine(pct, arch.vec);
      if (!best || sim > best.sim) { second = best; best = { arch: arch, sim: sim }; }
      else if (!second || sim > second.sim) { second = { arch: arch, sim: sim }; }
    }
    return { sum: sum, pct: pct, count: count, picks: keys, best: best, second: second };
  }

  function cosine(pct, vec) {
    var dot = 0, na = 0, nb = 0;
    for (var i = 0; i < DIMS.length; i++) {
      var k = DIMS[i].k;
      var a = (pct[k] || 0) / 100;
      var b = vec[k] || 0;
      dot += a * b; na += a * a; nb += b * b;
    }
    if (!na || !nb) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  function coordsOf(pct) {
    var x = pct.effect * 1.0 + pct.order * 0.45 - pct.proc * 0.85 - pct.right * 0.55;
    var y = pct.order * 1.0 + pct.virtue * 0.35 - pct.right * 0.85 - pct.proc * 0.15;
    return { x: clamp(x / 180, -1, 1), y: clamp(y / 180, -1, 1) };
  }

  function radarSVG(pct) {
    var cx = 190, cy = 190, R = 118;
    var rings = "", axes = "", labels = "", pts = [], archPts = [];
    for (var r = 1; r <= 4; r++) {
      rings += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R * r / 4).toFixed(1) + '" fill="none" stroke="currentColor" stroke-opacity=".14" />';
    }
    for (var i = 0; i < DIMS.length; i++) {
      var ang = -Math.PI / 2 + i * Math.PI * 2 / DIMS.length;
      var x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R;
      axes += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="currentColor" stroke-opacity=".16" />';
      var lx = cx + Math.cos(ang) * (R + 26), ly = cy + Math.sin(ang) * (R + 26);
      labels += '<text x="' + lx.toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '" text-anchor="middle" class="chart-label">' + DIMS[i].label + '</text>';
      var v = (pct[DIMS[i].k] || 0) / 100;
      var v2 = (profileDataState.best.arch.vec[DIMS[i].k] || 0);
      pts.push((cx + Math.cos(ang) * R * v).toFixed(1) + ',' + (cy + Math.sin(ang) * R * v).toFixed(1));
      archPts.push((cx + Math.cos(ang) * R * v2).toFixed(1) + ',' + (cy + Math.sin(ang) * R * v2).toFixed(1));
    }
    return '<svg class="radar" viewBox="0 0 380 380" role="img" aria-label="伦理倾向雷达图">' +
      rings + axes + labels +
      '<polygon points="' + archPts.join(" ") + '" fill="none" stroke="#8f9bb3" stroke-dasharray="4 4" stroke-opacity=".65" />' +
      '<polygon points="' + pts.join(" ") + '" fill="rgba(201,167,101,.26)" stroke="#c9a765" stroke-width="2" />' +
      pts.map(function (p) {
        var xy = p.split(",");
        return '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="3.2" fill="#c9a765" />';
      }).join("") +
    '</svg>';
  }

  var profileDataState = { best: null };

  function coordSVG(pct) {
    var w = 380, h = 380, pad = 40;
    var cx = w / 2, cy = h / 2, half = (w - pad * 2) / 2;
    var out = '<svg class="coord" viewBox="0 0 380 380" role="img" aria-label="伦理坐标图">' +
      '<rect x="' + pad + '" y="' + pad + '" width="' + (w - pad * 2) + '" height="' + (h - pad * 2) +
        '" fill="none" stroke="currentColor" stroke-opacity=".18" />' +
      '<line x1="' + pad + '" y1="' + cy + '" x2="' + (w - pad) + '" y2="' + cy + '" stroke="currentColor" stroke-opacity=".22" />' +
      '<line x1="' + cx + '" y1="' + pad + '" x2="' + cx + '" y2="' + (h - pad) + '" stroke="currentColor" stroke-opacity=".22" />' +
      '<text x="' + (pad - 4) + '" y="' + (cy - 8) + '" class="chart-label" text-anchor="start">义务论</text>' +
      '<text x="' + (w - pad + 4) + '" y="' + (cy - 8) + '" class="chart-label" text-anchor="end">结果论</text>' +
      '<text x="' + (cx + 6) + '" y="' + (pad + 10) + '" class="chart-label" text-anchor="start">集体秩序</text>' +
      '<text x="' + (cx + 6) + '" y="' + (h - pad - 2) + '" class="chart-label" text-anchor="start">个体权利</text>';

    var pc = coordsOf(pct);
    /* 二十个派系全画点，只标注离玩家最近的十个，避免坐标图变成一团字 */
    var ranking = [];
    for (var m = 0; m < ARCHETYPES.length; m++) {
      var cc = coordsOf(ARCHETYPES[m].vec);
      var dx = cc.x - pc.x, dy = cc.y - pc.y;
      ranking.push({ id: ARCHETYPES[m].id, d: dx * dx + dy * dy });
    }
    ranking.sort(function (a, b) { return a.d - b.d; });
    var labelSet = {};
    for (var k = 0; k < ranking.length && k < 10; k++) labelSet[ranking[k].id] = 1;
    if (profileDataState.best) labelSet[profileDataState.best.arch.id] = 1;

    for (var i = 0; i < ARCHETYPES.length; i++) {
      var a = ARCHETYPES[i];
      var c = coordsOf(a.vec);
      var x = cx + c.x * half, y = cy - c.y * half;
      out += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.4" fill="#8f9bb3" fill-opacity=".85" />';
      if (labelSet[a.id]) {
        out += '<text x="' + (x + 6).toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" class="chart-label small">' + a.name + '</text>';
      }
    }
    var px = cx + pc.x * half, py = cy - pc.y * half;
    out += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="9" fill="rgba(201,167,101,.28)" />' +
      '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="4.6" fill="#c9a765" />' +
      '<text x="' + (px + 10).toFixed(1) + '" y="' + (py + 5).toFixed(1) + '" class="chart-label player">你</text>' +
    '</svg>';
    return out;
  }

  function renderProfile() {
    var version = S && S.version ? S.version : (document.body.dataset.version || "real");
    S = S || { version: version, V: VERSIONS[version] };
    var pd = profileData(version);
    view = "profile";
    clearBg();
    document.body.dataset.version = version;
    if (!pd) {
      app.innerHTML = '<div class="profile-screen"><div class="profile-inner">' +
        '<button class="link-back" data-act="hub">← 返回目录</button>' +
        '<h1 class="profile-title">审判者画像</h1>' +
        '<p class="profile-lead">还没有足够的选择。至少完成一庭，或在该庭的关键节点作出判断。</p>' +
      '</div></div>';
      return;
    }
    profileDataState.best = pd.best;
    var best = pd.best.arch;
    var second = pd.second ? pd.second.arch : null;
    var dims = "";
    for (var i = 0; i < DIMS.length; i++) {
      var d = DIMS[i], v = pd.pct[d.k] || 0;
      dims += '<div class="dim-row"><span class="dim-name">' + d.label + '</span>' +
        '<span class="dim-track"><i style="width:' + v.toFixed(1) + '%"></i></span>' +
        '<b class="dim-num">' + v.toFixed(0) + '</b></div>';
    }
    var pickList = "";
    for (var j = 0; j < pd.picks.length; j++) {
      var p = pd.picks[j];
      pickList += '<li><span class="pk-case">' + esc(p.caseTitle) + '</span>' +
        '<span class="pk-kind">' + esc(p.kind) + '</span>' +
        '<span class="pk-label">' + esc(p.label) + '</span></li>';
    }
    var topDims = topDimensions(pd.pct, 2);
    var analysis = analysisText(pd, best, second, topDims);
    app.innerHTML = '<div class="profile-screen"><div class="profile-inner">' +
      '<button class="link-back" data-act="hub">← 返回目录</button>' +
      '<div class="kicker">审判者画像 · ' + esc(S.V.meta.title) + '</div>' +
      '<h1 class="profile-title">你更接近 ' + esc(best.name) + '</h1>' +
      '<p class="profile-lead">伦理派别：<b>' + esc(best.school) + '</b> · 基于 ' + pd.count + ' 次关键判断' +
        (second ? ' · 次接近：' + esc(second.name) + '（' + esc(second.school) + '）' : '') + '</p>' +
      '<div class="profile-quote">「' + esc(best.quote) + '」</div>' +
      '<div class="charts">' +
        '<div class="chart-card"><h3 class="chart-title">伦理倾向雷达</h3>' + radarSVG(pd.pct) +
          '<p class="chart-note">实线为你，虚线为 ' + esc(best.name) + ' 的理想型。</p></div>' +
        '<div class="chart-card"><h3 class="chart-title">伦理坐标</h3>' + coordSVG(pd.pct) +
          '<p class="chart-note">横轴义务论—结果论，纵轴个体权利—集体秩序。</p></div>' +
      '</div>' +
      '<div class="profile-grid">' +
        '<div class="profile-block"><h3 class="chart-title">维度分布</h3>' + dims + '</div>' +
        '<div class="profile-block"><h3 class="chart-title">分析</h3>' +
          '<p class="profile-p">' + analysis[0] + '</p>' +
          '<p class="profile-p">' + analysis[1] + '</p>' +
          '<p class="profile-p">' + analysis[2] + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="profile-block"><h3 class="chart-title">你的关键判断</h3>' +
        '<ul class="pick-list">' + pickList + '</ul></div>' +
      '<div class="ai-card">' +
        '<div class="ai-card-head"><span class="ai-card-title">AI · 审判者点评</span>' +
          '<button class="btn" data-act="aiProfile">让助理读一读</button></div>' +
        '<div class="ai-card-body" id="aiProfileBody"><p class="ai-para ai-dim">助理会结合你的判断记录，指出你的伦理倾向、可能的盲点，以及你和最接近的那位思想家真正的分歧在哪里。</p></div>' +
      '</div>' +
      '<div class="verdict-actions">' +
        '<button class="btn btn-primary" data-act="hub">返回目录</button>' +
        '<button class="btn" data-act="aiSettings">AI 接口</button>' +
      '</div>' +
    '</div></div>';
    playBGM("verdict");
  }

  function topDimensions(pct, n) {
    var arr = DIMS.slice().sort(function (a, b) { return (pct[b.k] || 0) - (pct[a.k] || 0); });
    return arr.slice(0, n);
  }

  function analysisText(pd, best, second, topDims) {
    var a = topDims[0], b = topDims[1];
    var low = DIMS.slice().sort(function (x, y) { return (pd.pct[x.k] || 0) - (pd.pct[y.k] || 0); })[0];
    var p1 = "在你的 " + pd.count + " 次判断里，" + a.label + "与" + b.label + "两个维度最突出，" + low.label + "维度相对靠后。这说明你更倾向于用" +
      dimPhrase(a.k) + "的方式处理纠纷，而不是" + dimPhrase(low.k) + "。";
    var p2 = "这与" + best.name + "的" + best.school + "最接近。" + best.desc +
      (second ? "你身上也有" + second.name + "的影子：当案件的具体处境比抽象规则更重要时，你会向那一侧移动。" : "");
    var p3 = "可能的盲点：" + blindSpot(low.k) + " 如果把五案当作同一套规则的五次试验，你最需要回答的问题是——你愿意让所有人都在同样的情形下，按你这次的选择被对待吗？";
    return [p1, p2, p3];
  }

  function dimPhrase(k) {
    return ({
      proc: "程序与规则",
      right: "权利与边界",
      effect: "后果与实效",
      virtue: "德性与处境",
      order: "秩序与确定",
      mercy: "克制与人道"
    })[k] || k;
  }

  function blindSpot(k) {
    return ({
      proc: "程序感较弱时，容易让同情或直觉替代举证。",
      right: "对个体权利的重量估计不足时，容易让多数人的意见压过少数人的边界。",
      effect: "较少计算后果时，可能忽略一条判决会被复制到多少类似案件上。",
      virtue: "较少考察行为人品性时，可能把结构性的问题归咎于个人。",
      order: "对秩序与确定性关注不足时，规则可能因个案而被反复改写。",
      mercy: "克制不足时，容易把『依法』当作『从重』的同义词。"
    })[k] || "";
  }

  /* ================= 交互 ================= */
  function handleAct(act) {
    if (act === "aiSettings") { openAiSettings(); return; }
    if (act === "aiReason") { aiVerdictReason(); return; }
    if (act === "aiProfile") { aiProfileAnalysis(); return; }
    if (!S) {
      if (act === "landing") renderLanding();
      return;
    }
    if (act === "ai") {
      if (view === "trial") { S.drawer = "ai"; renderTrial(); scrollAiLog(); }
      else openAiSettings();
      return;
    }
    if (act === "aiSend") { aiSend(); return; }
    if (act === "landing") { renderLanding(); return; }
    if (act === "hub") { openHub(S.version); return; }
    if (act === "evidence") { openEvidence(false); return; }
    if (act === "consult") { S.drawer = "consult"; renderTrial(); return; }
    if (act === "close") { closeDrawer(); return; }
    if (act === "pressNode") { pressNode(); return; }
    if (act === "talkNext") {
      var tn = S.c.nodes[S.node];
      if (tn && tn.branch && tn.branch.options && tn.branch.options.length) {
        S.branchOpen = true;
        S.tmode = "lines";
        renderTrial();
      } else nextNode();
      return;
    }
    if (act === "voice") {
      voiceOn = !voiceOn;
      try { localStorage.setItem("daofa.voice.v1", voiceOn ? "1" : "0"); } catch (e2) {}
      if (!voiceOn) stopVoice();
      renderTrial();
      toast(voiceOn ? "人物配音已开启" : "人物配音已关闭");
      return;
    }
    if (act === "present") { openEvidence(true); return; }
    if (act === "skipRecon") { skipRecon(); return; }
    if (act === "retry") { startCase(S.c.id); return; }
    if (act === "profile") { renderProfile(); return; }
    if (act === "nextcase") {
      var nx = S.V.cases[S.idx + 1];
      if (nx) startCase(nx.id);
      return;
    }
  }

  app.addEventListener("click", function (e) {
    var t = e.target;
    var ver = t.closest("button[data-version]");
    if (ver) { openHub(ver.getAttribute("data-version")); return; }

    var cs = t.closest("[data-case]");
    if (cs) { startCase(cs.getAttribute("data-case")); return; }

    var eth = t.closest("[data-eth]");
    if (eth) { chooseEthics(parseInt(eth.getAttribute("data-eth"), 10)); return; }

    var br = t.closest("[data-branch]");
    if (br) { chooseBranch(parseInt(br.getAttribute("data-branch"), 10)); return; }

    var ev = t.closest("[data-ev]");
    if (ev) {
      if (S && S.present) pickEvidence(ev.getAttribute("data-ev"));
      return;
    }

    var aiq = t.closest("[data-aiq]");
    if (aiq) { aiSend(aiq.getAttribute("data-aiq")); return; }

    var act = t.closest("[data-act]");
    if (act) { handleAct(act.getAttribute("data-act")); return; }

    if (view === "trial" && S && !S.drawer && !S.branchOpen) {
      if (S.phase === "nodes" && S.tmode === "statement") return;
      advance();
    }
  });

  document.addEventListener("keydown", function (e) {
    var ae = document.activeElement;
    if (ae && ae.id === "aiInput" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      aiSend();
      return;
    }
    if (e.key === "Escape") {
      var box = document.getElementById("aiModal");
      if (box && box.classList.contains("on")) { closeAiSettings(); return; }
      if (S && S.drawer) { closeDrawer(); return; }
    }
    if (!S || view !== "trial") return;
    if (e.key === " " || e.key === "Enter") {
      if (S.drawer || S.branchOpen) return;
      if (S.phase === "nodes" && S.tmode === "statement") return;
      e.preventDefault();
      advance();
    }
  });

  var aiModalEl = document.getElementById("aiModal");
  if (aiModalEl) {
    aiModalEl.addEventListener("click", function (e) {
      var am = e.target.closest("[data-aimodal]");
      if (!am) return;
      var mode = am.getAttribute("data-aimodal");
      if (mode === "save") saveAiSettings();
      else if (mode === "test") testAiSettings();
      else closeAiSettings();
    });
  }

  /* ================= 图片兜底 =================
     表情差分缺失 → 退回基础表情 → 退回角色席位图 → 显示卷宗占位，绝不出现破图 */
  document.addEventListener("error", function (e) {
    var el = e.target;
    if (!el || !el.tagName || el.tagName !== "IMG") return;
    var src = el.getAttribute("src") || "";
    var base = el.getAttribute("data-look") || "";
    var fb = el.getAttribute("data-fb") || "";
    if (base && src.indexOf(base + "-") === 0 && !/-1\.jpg$/.test(src)) {
      el.setAttribute("src", base + "-1.jpg");
      return;
    }
    if (fb && src !== fb) {
      el.removeAttribute("data-look");
      el.setAttribute("src", fb);
      return;
    }
    el.style.visibility = "hidden";
    var p = el.closest ? el.closest(".portrait") : null;
    if (p) p.classList.add("img-dead");
  }, true);

  /* ================= 启动 ================= */
  loadVoiceMan("real");
  loadVoiceMan("anime");
  renderLanding();
})();
