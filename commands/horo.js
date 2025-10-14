// commands/horo.js
// .horo <sign>   -> get today's horoscope for the given zodiac sign
// .horo me <dob> -> compute zodiac from date of birth (DOB) and show horoscope
// Examples:
//   .horo aries
//   .horo me 1996-04-15
//   .horo me 15/04/1996

export const command = "horo";

const SIGNS = [
  { id: "aries", name: "Aries", range: "Mar 21 – Apr 19" },
  { id: "taurus", name: "Taurus", range: "Apr 20 – May 20" },
  { id: "gemini", name: "Gemini", range: "May 21 – Jun 20" },
  { id: "cancer", name: "Cancer", range: "Jun 21 – Jul 22" },
  { id: "leo", name: "Leo", range: "Jul 23 – Aug 22" },
  { id: "virgo", name: "Virgo", range: "Aug 23 – Sep 22" },
  { id: "libra", name: "Libra", range: "Sep 23 – Oct 22" },
  { id: "scorpio", name: "Scorpio", range: "Oct 23 – Nov 21" },
  { id: "sagittarius", name: "Sagittarius", range: "Nov 22 – Dec 21" },
  { id: "capricorn", name: "Capricorn", range: "Dec 22 – Jan 19" },
  { id: "aquarius", name: "Aquarius", range: "Jan 20 – Feb 18" },
  { id: "pisces", name: "Pisces", range: "Feb 19 – Mar 20" }
];

// Some phrase pools to compose a horoscope — keep neutral, positive, actionable
const PHRASES = {
  intros: [
    "Today brings a gentle nudge toward new possibilities.",
    "This is a day for clarity and small courageous steps.",
    "Expect a calm of mind that invites thoughtful choices.",
    "A surprising bit of energy may shift how you see things.",
    "You might find a simple pleasure unexpectedly uplifting."
  ],
  themes: [
    "relationships need patient listening",
    "creative work will flow if you start small",
    "a practical change will bring relief",
    "curiosity will open an interesting door",
    "finances benefit from clear planning"
  ],
  advice: [
    "Take five minutes to write down one next step.",
    "Share a genuine compliment — it will land well.",
    "Avoid rushing decisions; gather one more fact first.",
    "Try a brief walk to reset your perspective.",
    "Say 'no' once today if it protects your time."
  ],
  mood: [
    "optimistic",
    "thoughtful",
    "playful",
    "steady",
    "focused"
  ],
  actions: [
    "call someone you appreciate",
    "finish one small task you've been postponing",
    "make a short plan for tomorrow",
    "treat yourself to a good cup of coffee/tea",
    "note three things you're thankful for"
  ]
};

// deterministic seeded RNG so same sign+date => same horoscope for a day
function seededRandom(seed) {
  // simple xorshift32
  let x = seed >>> 0 || 123456789;
  return function() {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967295;
  };
}

function hashToSeed(str) {
  // djb2
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h = h & 0xffffffff;
  }
  return h >>> 0;
}

function choose(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function formatNumbers(nums) {
  return nums.join(", ");
}

function generateHoroscopeFor(signId, dateStr) {
  const key = `${signId}|${dateStr}`;
  const seed = hashToSeed(key);
  const rnd = seededRandom(seed);

  const intro = choose(rnd, PHRASES.intros);
  const theme = choose(rnd, PHRASES.themes);
  const adv = choose(rnd, PHRASES.advice);
  const mood = choose(rnd, PHRASES.mood);
  const action = choose(rnd, PHRASES.actions);

  // lucky numbers: generate 3 numbers 1-99 deterministic
  const nums = [
    Math.floor(rnd() * 99) + 1,
    Math.floor(rnd() * 99) + 1,
    Math.floor(rnd() * 99) + 1
  ];

  const short = `${intro} Today, ${theme}. You’ll feel ${mood}. ${adv}`;
  const full = `🔮 *${signId.toUpperCase()}* — ${short}

✨ *Mood:* ${mood}
📝 *Tip:* ${adv}
🎯 *Action:* Try to ${action}.
🔢 *Lucky numbers:* ${formatNumbers(nums)}
📅 *Date:* ${dateStr}
`;

  return full;
}

function signFromDob(dob) {
  // dob: Date object
  const d = dob.getUTCDate();
  const m = dob.getUTCMonth() + 1; // 1..12

  // based on typical western zodiac ranges
  if ((m == 3 && d >= 21) || (m == 4 && d <= 19)) return "aries";
  if ((m == 4 && d >= 20) || (m == 5 && d <= 20)) return "taurus";
  if ((m == 5 && d >= 21) || (m == 6 && d <= 20)) return "gemini";
  if ((m == 6 && d >= 21) || (m == 7 && d <= 22)) return "cancer";
  if ((m == 7 && d >= 23) || (m == 8 && d <= 22)) return "leo";
  if ((m == 8 && d >= 23) || (m == 9 && d <= 22)) return "virgo";
  if ((m == 9 && d >= 23) || (m == 10 && d <= 22)) return "libra";
  if ((m == 10 && d >= 23) || (m == 11 && d <= 21)) return "scorpio";
  if ((m == 11 && d >= 22) || (m == 12 && d <= 21)) return "sagittarius";
  if ((m == 12 && d >= 22) || (m == 1 && d <= 19)) return "capricorn";
  if ((m == 1 && d >= 20) || (m == 2 && d <= 18)) return "aquarius";
  if ((m == 2 && d >= 19) || (m == 3 && d <= 20)) return "pisces";
  return null;
}

function findSignByNameOrAlias(name) {
  if (!name) return null;
  const low = name.trim().toLowerCase();
  // accept common aliases, first 3 letters, full name
  for (const s of SIGNS) {
    if (s.id === low) return s;
    if (s.name.toLowerCase() === low) return s;
    if (s.name.toLowerCase().startsWith(low)) return s;
    if (low.length >= 3 && s.id.startsWith(low)) return s;
  }
  return null;
}

// parse date strings like YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
function parseDob(input) {
  if (!input) return null;
  input = input.trim();
  // try ISO
  let d = null;
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    d = new Date(Date.UTC(+iso[1], +iso[2]-1, +iso[3]));
    if (!isNaN(d)) return d;
  }
  // try DD/MM/YYYY or DD-MM-YYYY
  const dm = input.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dm) {
    d = new Date(Date.UTC(+dm[3], +dm[2]-1, +dm[1]));
    if (!isNaN(d)) return d;
  }
  // try MM/DD/YYYY
  const md = input.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (md) {
    d = new Date(Date.UTC(+md[3], +md[1]-1, +md[2]));
    if (!isNaN(d)) return d;
  }
  return null;
}

export async function execute(sock, m) {
  try {
    const jid = m.key.remoteJid;
    const raw = m.message?.conversation || m.message?.extendedTextMessage?.text || "";
    const parts = raw.trim().split(/\s+/).filter(Boolean);

    if (parts.length < 2) {
      // show help + available signs
      const list = SIGNS.map(s => `• ${s.name} (${s.id}) — ${s.range}`).join("\n");
      const help = `🔮 *Horoscope* 🔮

Usage:
.horo <sign>   — get today's horoscope for the sign (e.g. .horo aries)
.horo me <dob> — compute sign from DOB and show horoscope (e.g. .horo me 1996-04-15)

Available signs:
${list}

`;
      await sock.sendMessage(jid, { text: help });
      return;
    }

    // second token could be 'me' or a sign
    const arg = parts[1].toLowerCase();

    let sign = null;

    if (arg === "me") {
      const dobStr = parts.slice(2).join(" ");
      if (!dobStr) {
        await sock.sendMessage(jid, { text: "❗ Please provide your date of birth. Example: `.horo me 1996-04-15` or `.horo me 15/04/1996`" });
        return;
      }
      const dob = parseDob(dobStr);
      if (!dob) {
        await sock.sendMessage(jid, { text: "❌ Could not parse DOB. Use YYYY-MM-DD or DD/MM/YYYY." });
        return;
      }
      const signId = signFromDob(dob);
      sign = findSignByNameOrAlias(signId);
      if (!sign) {
        await sock.sendMessage(jid, { text: "❌ Could not determine zodiac sign from that date." });
        return;
      }
    } else {
      sign = findSignByNameOrAlias(arg);
      if (!sign) {
        await sock.sendMessage(jid, { text: `❌ Unknown sign: "${arg}". Try one of: ${SIGNS.map(s=>s.id).join(", ")}` });
        return;
      }
    }

    // generate daily horoscope for this sign
    const today = new Date();
    // use UTC date as canonical day
    const y = today.getUTCFullYear();
    const mo = String(today.getUTCMonth()+1).padStart(2,"0");
    const d = String(today.getUTCDate()).padStart(2,"0");
    const dateStr = `${y}-${mo}-${d}`;

    const horoscopeText = generateHoroscopeFor(sign.id, dateStr);

    const header = `🔮 *${sign.name}* (${sign.range})\n`;
    const footer = `\n✨ That’s your short reading for ${dateStr}. Take what fits, leave what doesn’t.`;

    await sock.sendMessage(jid, { text: header + horoscopeText + footer });

  } catch (err) {
    console.error("Horo command error:", err);
    await sock.sendMessage(m.key.remoteJid, { text: "⚠️ Something went wrong while generating the horoscope." });
  }
}
