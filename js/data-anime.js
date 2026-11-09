/* 道法裁判 · 二次元法庭版 —— 五案数据（公共设定）
   全部为架空城邦寓言，不对应真实案件；每一庭讨论一个经典伦理问题。 */
window.DATA_ANIME = {
  id: "anime",
  meta: {
    kicker: "THE ANIME COURT",
    title: "二次元法庭",
    subtitle: "五场架空审判，五次伦理极限",
    lead: "架空城邦，真实伦理。审判长林青、公诉人王磊、辩护人陈曦，将在五个不存在的案件里，审理那些一直存在的人性难题。",
    note: "本版人物、城邦与案件均为虚构，不对应任何真实案件；每一庭讨论一个经典伦理问题。",
    bg: "img/anime/bg-court.jpg",
    courtVideo: "img/anime/video/court.mp4"
  },
  cast: {
    judge:     { name: "林青", role: "审判长",   img: "img/anime/seat/judge-1.jpg" },
    prosecutor:{ name: "王磊", role: "公诉人",   img: "img/anime/seat/prosecutor-1.jpg" },
    defense:   { name: "陈曦", role: "辩护人",   img: "img/anime/seat/defense-1.jpg" },
    defendant: { name: "被告人", role: "当事人", img: "img/anime/seat/defendant-1.jpg" },
    witnessF:  { name: "证人",   role: "出庭作证", img: "img/anime/ch-witness-f.jpg" },
    witnessM:  { name: "证人",   role: "出庭作证", img: "img/anime/ch-witness-m.jpg" }
  },
  /* 角色立绘前缀：每个案件的三位当事人各用一张独立立绘 */
  looks: {
    "林青":       "img/anime/seat/judge",
    "王磊":       "img/anime/seat/prosecutor",
    "陈曦":       "img/anime/seat/defense",
    "被告人":     "img/anime/seat/defendant",
    "鲁恩":       "img/anime/cast/middle-man",
    "白鸦":       "img/anime/cast/middle-woman",
    "阿澈":       "img/anime/cast/young-man",
    "沈雾":       { base: "img/anime/cast/middle-woman-b", ems: 1 },
    "叶迟":       { base: "img/anime/cast/young-man-b", ems: 1 },
    "金先生":     "img/anime/cast/rough-man-a",
    "羊七":       "img/anime/cast/rough-man-b",
    "赫拉":       { base: "img/anime/cast/middle-woman-c", ems: 1 },
    "洛恩":       { base: "img/anime/cast/middle-man-b", ems: 1 },
    "言澈":       "img/anime/cast/student-man",
    "铁面":       { base: "img/anime/cast/middle-man-c", ems: 1 },
    "瑟拉":       "img/anime/cast/young-woman-a",
    "无名者":     { base: "img/anime/cast/middle-man-d", ems: 1 },
    "灰":         "img/anime/cast/elder-man",
    "零":         { base: "img/anime/cast/young-woman-c", ems: 1 }
  },
  thinkers: [
    { id: "kant",        name: "康德",       tag: "义务论",     line: "行为的对错，不看结果，看它能否被普遍化。" },
    { id: "mill",        name: "密尔",       tag: "自由功利",   line: "自由的边界是不伤害他人，功利要落在每一个具体的人身上。" },
    { id: "bentham",     name: "边沁",       tag: "功利主义",   line: "把判决当作一条将被千万次引用的规则来算总账。" },
    { id: "aristotle",   name: "亚里士多德", tag: "德性伦理",   line: "德性是两恶之间的中道，看的是具体处境里的实践智慧。" },
    { id: "rawls",       name: "罗尔斯",     tag: "契约正义",   line: "不知道自己是哪一方时，你愿意接受这条规则吗？" },
    { id: "beccaria",    name: "贝卡里亚",   tag: "刑罚人道",   line: "刑罚的力量来自确定与克制，而不是残酷。" },
    { id: "confucius",   name: "孔子",       tag: "德治与仁",   line: "道之以德，齐之以礼，有耻且格。" },
    { id: "hanfei",      name: "韩非",       tag: "法家刑名",   line: "法不阿贵，绳不挠曲。人情替代不了制度。" },
    { id: "mengzi",      name: "孟子",       tag: "仁政性善",   line: "恻隐之心，人皆有之。政者，正也。" },
    { id: "xunzi",       name: "荀子",       tag: "礼法教化",   line: "人之性恶，其善者伪也。礼者，法之大分。" },
    { id: "laozi",       name: "老子",       tag: "无为自然",   line: "法令滋彰，盗贼多有。为无为，则无不治。" },
    { id: "wangyangming",name: "王阳明",     tag: "知行良知",   line: "知是行之始，行是知之成。良知之外，更无知。" },
    { id: "socrates",    name: "苏格拉底",   tag: "诘问德性",   line: "未经省察的人生不值得过。德性即知识。" },
    { id: "plato",       name: "柏拉图",     tag: "理想正义",   line: "正义就是每个人做自己分内的事，城邦各安其位。" },
    { id: "aquinas",     name: "阿奎那",     tag: "自然法",     line: "恶法非法；自然法是理性受造物对永恒法的分有。" },
    { id: "hobbes",      name: "霍布斯",     tag: "秩序契约",   line: "人对人是狼。没有公共权力，就没有正义。" },
    { id: "locke",       name: "洛克",       tag: "自然权利",   line: "生命、自由、财产，是先于国家而存在的权利。" },
    { id: "nietzsche",   name: "尼采",       tag: "价值重估",   line: "不做道德的奴隶，做价值的创造者。" },
    { id: "gilligan",    name: "吉利根",     tag: "关怀伦理",   line: "道德不是抽象规则，而是具体关系里的关怀与回应。" },
    { id: "nozick",      name: "诺齐克",     tag: "自由至上",   line: "个人是目的，不是他人的资源。最小国家，最宽自由。" }
  ],
  cases: []
};
