// commands/adduser.js - Safe version
export const command = 'adduser';

export async function execute(sock, m) {
    const jid = m.key.remoteJid;
    
    await sock.sendMessage(jid, {
        text: `🔧 Adduser command is currently being updated.\nPlease try again later.`
    });
}

export const monitor = null; // No monitor function
