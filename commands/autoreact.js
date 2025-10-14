// commands/autoreact.js (ESM)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'autoreact.json');

const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
};

const loadState = () => {
  try {
    ensureDataDir();
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return !!JSON.parse(raw).enabled;
  } catch {
    return false;
  }
};

const saveState = (val) => {
  try {
    ensureDataDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify({ enabled: !!val }, null, 2));
  } catch {}
};

export const command = 'autoreact';

let enabled = loadState();
let listenerBound = false;

export async function execute(sock, m) {
  const jid = m.key.remoteJid;
  const body =
    m.message?.conversation ||
    m.message?.extendedTextMessage?.text ||
    '';

  const arg = body.trim().split(/\s+/)[1]?.toLowerCase();

  if (!arg) {
    await sock.sendMessage(jid, {
      text: `❄️ *AutoReact* is *${enabled ? 'ON' : 'OFF'}*\nUse: .autoreact on | off`
    });
    return;
  }

  if (arg === 'on' || arg === 'off') {
    enabled = arg === 'on';
    saveState(enabled);
    await sock.sendMessage(jid, {
      text: enabled
        ? '✅ AutoReact enabled globally. I will react ❄️ to all messages.'
        : '🛑 AutoReact disabled.'
    });
  } else {
    await sock.sendMessage(jid, { text: 'Usage: .autoreact on | off' });
  }
}

export function monitor(sock) {
  if (listenerBound) return;
  listenerBound = true;

  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (!enabled) return;

    for (const msg of messages) {
      try {
        if (!msg?.message) continue;

        const jid = msg.key.remoteJid;
        if (!jid || jid === 'status@broadcast') continue;

        // avoid loops / system messages
        if (msg.message.reactionMessage) continue;
        if (msg.message.protocolMessage) continue;

        await sock.sendMessage(jid, {
          react: { text: '❄️', key: msg.key }
        });
      } catch { /* ignore per-message errors */ }
    }
  });
}
