// commands/tagall.js
export const command = 'tagall';

export async function execute(sock, m) {
    const jid = m.key.remoteJid;

    // Only works in groups
    if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, { text: "❌ This command only works in groups." });
        return;
    }

    // Get group participants
    const metadata = await sock.groupMetadata(jid);
    const participants = metadata.participants.map(p => p.id);

    let text = "👥 *Tagging Everyone:*\n\n";
    text += metadata.participants
        .map((p, i) => `${i + 1}. @${p.id.split('@')[0]}`)
        .join("\n");

    await sock.sendMessage(jid, {
        text,
        mentions: participants
    });
}
