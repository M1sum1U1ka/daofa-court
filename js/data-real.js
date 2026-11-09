/* 道法裁判 · 真实卷宗版 —— 五案数据（公共设定） */
window.DATA_REAL = {
  id: "real",
  meta: {
    kicker: "THE CASE FILES",
    title: "真实卷宗",
    subtitle: "五起判例，五次重审",
    lead: "以真实姓名、真实判决为底本。每一庭结束后，会给出该案的真实裁判结果与后续法治进程。",
    note: "除已公开的当事人外，人物均为化名；庭审对白为教学性重演，不构成法律意见。",
    bg: "img/real/bg-archive.jpg",
    courtVideo: "img/real/video/court.mp4"
  },
  cast: {
    judge:     { name: "审判长", role: "合议庭", img: "img/real/seat/judge-1.jpg" },
    prosecutor:{ name: "公诉人", role: "控方",   img: "img/real/seat/prosecutor-1.jpg" },
    defense:   { name: "辩护人", role: "辩方",   img: "img/real/seat/defense-1.jpg" },
    defendant: { name: "被告人", role: "当事人", img: "img/real/seat/defendant-1.jpg" },
    witnessF:  { name: "证人",   role: "出庭作证", img: "img/real/ch-witness-f.jpg" },
    witnessM:  { name: "证人",   role: "出庭作证", img: "img/real/ch-witness-m.jpg" }
  },
  /* 角色立绘前缀：同一人物在不同案件的席位上复用同一张脸 */
  looks: {
    "审判长":     "img/real/seat/judge",
    "公诉人":     "img/real/seat/prosecutor",
    "辩护人":     "img/real/seat/defense",
    "被告人":     "img/real/seat/defendant",
    "段某":       "img/real/cast/elder-man",
    "杨某":       "img/real/cast/middle-man",
    "物业值班员": { base: "img/real/cast/middle-woman-b", ems: 1 },
    "周某":       "img/real/cast/young-woman-a",
    "苏银霞":     "img/real/cast/middle-woman",
    "赵某":       "img/real/cast/rough-man-a",
    "于欢":       "img/real/cast/young-man",
    "杜某":       "img/real/cast/rough-man-b",
    "处警民警":   { base: "img/real/cast/middle-man-b", ems: 1 },
    "刘鑫":       "img/real/cast/young-woman-a",
    "刘暖曦":     "img/real/cast/young-woman-a",
    "江歌":       "img/real/cast/young-woman-b",
    "林某":       { base: "img/real/cast/middle-woman-c", ems: 1 },
    "彭宇":       { base: "img/real/cast/young-man-b", ems: 1 },
    "徐寿兰":     "img/real/cast/elder-woman",
    "陈二春":     { base: "img/real/cast/middle-man-c", ems: 1 },
    "药家鑫":     "img/real/cast/student-man",
    "张妙":       { base: "img/real/cast/young-woman-c", ems: 1 },
    "冯某":       { base: "img/real/cast/middle-man-d", ems: 1 },
    "药家鑫的父亲": { base: "img/real/cast/kin-father-yao", ems: 1 },
    "张妙的丈夫":   { base: "img/real/cast/kin-husband-zhang", ems: 1 },
    "张妙的父亲":   { base: "img/real/cast/kin-father-zhang", ems: 1 },
    "药家鑫的同学": { base: "img/real/cast/kin-classmate-yao", ems: 1 }
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
