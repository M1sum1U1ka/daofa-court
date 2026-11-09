/* 道法裁判 · 二次元法庭版 —— 五案数据（公共设定）
   架空人物，情节取材于公开判例，案件原型在每庭结束后说明。 */
window.DATA_ANIME = {
  id: "anime",
  meta: {
    kicker: "THE ANIME COURT",
    title: "二次元法庭",
    subtitle: "五场庭审，五次重演",
    lead: "架空人物，真实法理。审判长林青、公诉人王磊、辩护人陈曦，将在五个改编自真实判例的案件中重开庭审。",
    note: "本版人物与对白均为虚构，案件取材于公开判例；不构成法律意见。",
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
  /* 角色立绘前缀：同一人物在不同案件的席位上复用同一张脸 */
  looks: {
    "林青":       "img/anime/seat/judge",
    "王磊":       "img/anime/seat/prosecutor",
    "陈曦":       "img/anime/seat/defense",
    "被告人":     "img/anime/seat/defendant",
    "段大爷":     "img/anime/cast/elder-man",
    "杨知远":     "img/anime/cast/middle-man",
    "物业值班员": { base: "img/anime/cast/middle-woman-b", ems: 1 },
    "周珂":       "img/anime/cast/young-woman-a",
    "苏琴":       "img/anime/cast/middle-woman",
    "杜某":       "img/anime/cast/rough-man-b",
    "李念":       "img/anime/cast/young-man",
    "民警":       { base: "img/anime/cast/middle-man-b", ems: 1 },
    "赵大山":     "img/anime/cast/rough-man-a",
    "沈嘉":       { base: "img/anime/cast/young-woman-c", ems: 1 },
    "苏晚":       "img/anime/cast/young-woman-b",
    "林晓":       { base: "img/anime/cast/middle-woman-c", ems: 1 },
    "苏女士":     "img/anime/cast/middle-woman",
    "彭真":       { base: "img/anime/cast/young-man-b", ems: 1 },
    "徐奶奶":     "img/anime/cast/elder-woman",
    "老周":       { base: "img/anime/cast/middle-man-c", ems: 1 },
    "宋启":       "img/anime/cast/student-man",
    "张苇":       { base: "img/anime/cast/young-woman-d", ems: 1 },
    "冯某":       { base: "img/anime/cast/middle-man-d", ems: 1 }
  },
  thinkers: [
    { id: "kant",      name: "康德",     tag: "义务论",     line: "行为的对错，不看结果，看它能否被普遍化。" },
    { id: "mill",      name: "密尔",     tag: "自由功利",   line: "自由的边界是不伤害他人，功利要落在每一个具体的人身上。" },
    { id: "bentham",   name: "边沁",     tag: "功利主义",   line: "把判决当作一条将被千万次引用的规则来算总账。" },
    { id: "aristotle", name: "亚里士多德", tag: "德性伦理", line: "德性是两恶之间的中道，看的是具体处境里的实践智慧。" },
    { id: "rawls",     name: "罗尔斯",   tag: "契约正义",   line: "不知道自己是哪一方时，你愿意接受这条规则吗？" },
    { id: "beccaria",  name: "贝卡里亚", tag: "刑罚人道",   line: "刑罚的力量来自确定与克制，而不是残酷。" },
    { id: "confucius", name: "孔子",     tag: "德治与仁",   line: "道之以德，齐之以礼，有耻且格。" },
    { id: "hanfei",    name: "韩非",     tag: "法家刑名",   line: "法不阿贵，绳不挠曲。人情替代不了制度。" }
  ],
  cases: []
};
