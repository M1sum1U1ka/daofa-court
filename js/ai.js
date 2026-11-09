/* 道法裁判 · AI 接口层
   OpenAI 兼容接口，密钥仅存本地 localStorage。
   提供：自由质询、证据关联性裁定、判决说理、审判者画像点评。 */
(function () {
  "use strict";

  var KEY = "daofa.ai.v1";
  var DEF = { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", apiKey: "" };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var o = raw ? JSON.parse(raw) : null;
      if (!o || typeof o !== "object") return { baseUrl: DEF.baseUrl, model: DEF.model, apiKey: "" };
      return {
        baseUrl: String(o.baseUrl || DEF.baseUrl),
        model: String(o.model || DEF.model),
        apiKey: String(o.apiKey || "")
      };
    } catch (e) {
      return { baseUrl: DEF.baseUrl, model: DEF.model, apiKey: "" };
    }
  }

  function save(o) {
    var next = {
      baseUrl: String((o && o.baseUrl) || DEF.baseUrl).trim() || DEF.baseUrl,
      model: String((o && o.model) || DEF.model).trim() || DEF.model,
      apiKey: String((o && o.apiKey) || "").trim()
    };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  }

  function ready() {
    var st = load();
    return !!(st.baseUrl && st.apiKey);
  }

  function endpoint(baseUrl) {
    var u = String(baseUrl || "").replace(/\s+/g, "").replace(/\/+$/, "");
    if (!/\/chat\/completions$/.test(u)) u += "/chat/completions";
    return u;
  }

  function chat(messages, opts, cb) {
    var st = load();
    var done = false;
    var timer = null;
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;

    function finish(o) {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      cb(o);
    }
    if (!st.apiKey) { finish({ ok: false, error: "还没有填写 API Key" }); return; }

    timer = setTimeout(function () {
      if (ctrl) { try { ctrl.abort(); } catch (e) {} }
      finish({ ok: false, error: "请求超时（30 秒）" });
    }, 30000);

    var body = {
      model: st.model || DEF.model,
      messages: messages,
      temperature: opts && opts.temperature != null ? opts.temperature : 0.7,
      max_tokens: opts && opts.maxTokens ? opts.maxTokens : 700,
      stream: false
    };

    fetch(endpoint(st.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + st.apiKey
      },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      return r.text().then(function (txt) {
        if (!r.ok) {
          var msg = txt;
          try {
            var j = JSON.parse(txt);
            msg = (j.error && (j.error.message || j.error.code)) || txt;
          } catch (e2) {}
          finish({ ok: false, error: "HTTP " + r.status + " · " + String(msg).slice(0, 200) });
          return;
        }
        var data = null;
        try { data = JSON.parse(txt); } catch (e3) {
          finish({ ok: false, error: "接口返回不是合法 JSON" });
          return;
        }
        var c = data && data.choices && data.choices[0];
        var content = (c && ((c.message && c.message.content) || c.text)) || "";
        finish({ ok: true, text: String(content).trim() });
      });
    }).catch(function (err) {
      var m = String((err && err.message) || err);
      if (/Failed to fetch|NetworkError|load failed|aborted/i.test(m)) {
        m = "无法连接接口。可能是地址或密钥有误，或浏览器以 file:// 打开时拦截了跨域请求（改用本地静态服务器访问即可）。";
      }
      finish({ ok: false, error: m });
    });
  }

  function caseFacts(ctx) {
    var lines = [];
    lines.push("案件：" + (ctx.caseTitle || "") + (ctx.cause ? "（" + ctx.cause + "）" : ""));
    lines.push("案情：" + (ctx.brief || ""));
    if (ctx.question) lines.push("争点：" + ctx.question);
    if (ctx.evidence && ctx.evidence.length) {
      lines.push("卷内材料：");
      for (var i = 0; i < ctx.evidence.length; i++) {
        var e = ctx.evidence[i];
        lines.push("- " + e.name + "（" + e.type + "）：" + e.doc);
      }
    }
    if (ctx.cue) lines.push("当前庭审陈述" + (ctx.witness ? "（" + ctx.witness + "）" : "") + "：「" + ctx.cue + "」");
    return lines.join("\n");
  }

  function toneOf(version) {
    return version === "anime"
      ? "本作是二次元法庭推理游戏。人物说话自然、有生活气息，但不要浮夸，不要网络烂梗，不要「哼」「呵呵」这类腔调。"
      : "本作以真实判例为底本，语气克制、写实。不煽情，不喊口号，不写判决书套话。";
  }

  /* 1. 自由质询 / 案情问答 */
  function crossExamine(ctx, history, question, cb) {
    var msgs = [{
      role: "system",
      content:
        "你是中文法庭互动游戏里的「庭审助理」。\n" +
        "只能依据下面给出的卷宗事实回答，不得编造新证据、新人物、新的鉴定结论或新的时间线。\n" +
        "问题超出卷宗范围时，直接说「卷宗里没有这一项」，并指出可以去看哪份材料。\n" +
        "回答 120 字以内，口语、具体，尽量点出依据的材料名称。\n" +
        "不要替玩家做判决，不要讲大道理。\n\n" +
        toneOf(ctx.version) + "\n\n" + caseFacts(ctx)
    }];
    for (var i = 0; i < history.length; i++) {
      var m = history[i];
      if (!m || !m.text) continue;
      msgs.push({ role: m.role === "q" ? "user" : "assistant", content: m.text });
    }
    msgs.push({ role: "user", content: question });
    chat(msgs, { temperature: 0.6, maxTokens: 450 }, cb);
  }

  /* 2. 证据关联性裁定 */
  function relevance(ctx, evd, cb) {
    var msgs = [{
      role: "system",
      content:
        "你是法庭的证据关联性审查助理。判断「材料」能否解释「当前陈述」。\n" +
        "标准：材料的内容是否直接支持、削弱或解释了当前陈述里的关键事实。只要有合理的证明作用就算成立，不要求它是最有力的那一份。\n" +
        "只输出一行 JSON：{\"valid\":true 或 false,\"reason\":\"不超过 40 字的中文理由\"}。不要输出任何其他文字。\n\n" +
        caseFacts(ctx)
    }, {
      role: "user",
      content: "材料：" + evd.name + "（" + evd.type + "）\n内容：" + evd.doc + "\n\n这件材料能否解释当前陈述？"
    }];
    chat(msgs, { temperature: 0.2, maxTokens: 220 }, function (res) {
      if (!res || !res.ok) {
        cb({ valid: false, reason: "", error: (res && res.error) || "核验失败" });
        return;
      }
      var txt = res.text || "";
      var m = txt.match(/\{[\s\S]*\}/);
      var obj = null;
      if (m) { try { obj = JSON.parse(m[0]); } catch (e) {} }
      if (!obj || typeof obj.valid !== "boolean") {
        cb({ valid: /\btrue\b/i.test(txt), reason: "" });
        return;
      }
      cb({ valid: !!obj.valid, reason: String(obj.reason || "").slice(0, 60) });
    });
  }

  /* 3. 判决说理 */
  function reasoning(ctx, cb) {
    var msgs = [{
      role: "system",
      content:
        "你是中文法庭游戏的判决书撰写助理。写一段 200-300 字的判决说理，供当庭宣读。\n" +
        "要求：先交代争点，再说明采信了哪些事实、依据什么理由，最后落到判决结论；不喊口号，不写空话，不分点，一段连续文字。\n" +
        "不要虚构卷宗里没有的证据。"
    }, {
      role: "user",
      content:
        "案件：" + ctx.caseTitle + "\n案情：" + ctx.brief + "\n争点：" + ctx.question +
        "\n玩家的伦理选择：" + (ctx.ethics || "未选择") + (ctx.ethicsDetail ? "（" + ctx.ethicsDetail + "）" : "") +
        "\n庭审误判次数：" + ctx.mistakes +
        "\n判决等级：" + ctx.grade +
        "\n判决结论：" + ctx.verdictTitle + "。" + ctx.verdictText +
        (ctx.lesson ? "\n真实判例要旨：" + ctx.lesson : "") +
        "\n请写出这段说理。"
    }];
    chat(msgs, { temperature: 0.5, maxTokens: 700 }, cb);
  }

  /* 4. 审判者画像点评 */
  function analyze(ctx, cb) {
    var dims = [];
    for (var k in ctx.pct) dims.push(k + " " + ctx.pct[k]);
    var picks = [];
    for (var i = 0; i < ctx.picks.length && i < 14; i++) {
      picks.push("- [" + ctx.picks[i].kind + "] " + ctx.picks[i].caseTitle + "：" + ctx.picks[i].label);
    }
    var msgs = [{
      role: "system",
      content:
        "你是中文法理游戏的点评助理。根据玩家的关键判断，写 180-260 字的分析。\n" +
        "要求：指出他的伦理倾向、一个真实的盲点、以及他与最接近的那位思想家分歧在哪；具体到他做过的选择，不要泛泛而谈；不分点，一段连续文字。"
    }, {
      role: "user",
      content:
        "相似度最高的思想家：" + ctx.thinker + "（" + ctx.school + "）\n判断次数：" + ctx.count +
        "\n维度得分：" + dims.join("，") + "\n关键判断：\n" + picks.join("\n")
    }];
    chat(msgs, { temperature: 0.6, maxTokens: 650 }, cb);
  }

  function test(cb) {
    chat([
      { role: "system", content: "你是连接测试助手。只回复：连接正常。" },
      { role: "user", content: "测试" }
    ], { temperature: 0, maxTokens: 20 }, function (res) {
      if (res && res.ok) cb({ ok: true, text: res.text || "连接正常" });
      else cb({ ok: false, error: (res && res.error) || "未知错误" });
    });
  }

  window.AI = {
    settings: load,
    save: save,
    ready: ready,
    test: test,
    crossExamine: crossExamine,
    relevance: relevance,
    reasoning: reasoning,
    analyze: analyze
  };
})();
