// 한글(HWPX)에서 두부(□)로 깨지는 이모지를 한글 글꼴이 가진 특수문자(KS X 1001 범위)나 글자로 바꾼다.
// 웹 화면은 원문 그대로 두고, HWPX 본문·표·미리보기 텍스트에만 적용한다. (순수 모듈)

// 한글 기본 글꼴에 있는 기호는 그대로 둔다 (Extended_Pictographic 에 속하지만 KS X 1001 에 포함)
const KEEP = new Set([..."©®™↔↕↖↗↘↙☎☏☜☞♠♣♥♡♤♧♨▶◀♩♪♬★☆"]);

// 수정자·연결 문자: 변형 선택자, ZWJ, 피부색, 태그, 둘러싼 키캡
const MODIFIERS = /[︎️‍⃣]|\uD83C[\uDFFB-\uDFFF]|\uDB40[\uDC20-\uDC7F]/g;

const GROUPS = [
  ["√", "✅✔☑✓🆗"],
  ["×", "❌✖❎✗✘🚫⛔"],
  ["○", "⭕⚪🔘"],
  ["●", "🔴🟠🟡🟢🔵🟣🟤⚫"],
  ["■", "🟥🟧🟨🟩🟦🟪🟫⬛"],
  ["□", "⬜🔲🔳"],
  ["◆", "🔶🔷💠"],
  ["◇", "🔸🔹"],
  ["※", "⚠🚨📢📣"],
  ["!", "❗❕"],
  ["?", "❓❔"],
  ["!!", "‼"],
  ["!?", "⁉"],
  ["★", "⭐🌟✨🏆🥇🎖🏅"],
  ["◈", "💡"],
  ["◎", "📌📍🎯"],
  ["▶", "👉⏩⏭🔜"],
  ["◀", "👈⏪⏮🔙"],
  ["→", "➡"],
  ["←", "⬅"],
  ["↑", "⬆"],
  ["↓", "⬇"],
  ["▲", "🔼🔺"],
  ["▼", "🔽🔻"],
  ["↗", "📈"],
  ["↘", "📉"],
  ["▣", "📊📋📑🗂"],
  ["▤", "📝📄📃📰📖📚"],
  ["▦", "📅📆🗓"],
  ["☎", "📞📱☎"],
  ["♥", "❤💖💗💓💕💞💘💝🧡💛💚💙💜🤍🖤🤎💟"],
  ["^^", "😀😃😄😁😆😊🙂😍🥰😘☺🤗😎😉😋😇🤩"],
  ["^^;", "😅"],
  ["ㅋㅋ", "😂🤣😹"],
  ["ㅠㅠ", "😢😭😥😞😔☹🙁😟😿🥺"],
  ["(최고)", "👍💯🔥🙌"],
  ["(별로)", "👎"],
  ["(박수)", "👏"],
  ["(감사)", "🙏"],
  ["(축하)", "🎉🎊🥳🎁"],
  ["(응원)", "💪"],
  ["(고민)", "🤔"],
  ["(놀람)", "😮😲😯😱"],
  ["(불만)", "😡😠🤬😤"],
  ["(메일)", "✉📧📩📨💌"],
  ["(시간)", "⏰⏱⏲🕐🕑🕒🕓🕔🕕🕖🕗🕘🕙🕚🕛⌛⏳"],
];
const MAP = new Map();
for (const [to, chars] of GROUPS) for (const ch of chars) MAP.set(ch, to);

const CIRCLED = ["⓪", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];
const KEYCAP = /([0-9#*])️?⃣/g;
const FLAG = /[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g;
const PICTO = /\p{Extended_Pictographic}/u;

/** 문자열에 HWPX 에서 깨질 수 있는 이모지가 있는가 */
export function hasEmoji(s) {
  for (const ch of String(s ?? "")) if (PICTO.test(ch) && !KEEP.has(ch)) return true;
  return /⃣|[\uD83C][\uDDE6-\uDDFF]/.test(String(s ?? ""));
}

/**
 * 이모지 → 한글에서 표시되는 기호·글자. 대응표에 없는 그림 문자는 지운다.
 * 예) "좋았어요 😊👍" → "좋았어요 ^^(최고)", "✅ 달성" → "√ 달성", "1️⃣ 내용" → "① 내용"
 */
export function toHwpText(s) {
  const src = String(s ?? "");
  if (!hasEmoji(src) && !MODIFIERS.test(src)) return src;
  MODIFIERS.lastIndex = 0;
  let t = src.replace(KEYCAP, (_, d) => (d >= "0" && d <= "9" ? CIRCLED[+d] : d)).replace(/🔟/g, "⑩").replace(FLAG, "");
  t = t.replace(MODIFIERS, "");
  let out = "";
  for (const ch of t) {
    if (KEEP.has(ch)) out += ch;
    else if (MAP.has(ch)) out += MAP.get(ch);
    else if (!PICTO.test(ch)) out += ch;
  }
  // 이모지를 지워 생긴 이중 공백·줄 끝 공백 정리
  return out.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").replace(/^ +| +$/g, "");
}
