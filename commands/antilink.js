// commands/antilink.js
const antiLinkSettings = new Map();

export const command = 'antilink';

export async function execute(sock, m) {
    const jid = m.key.remoteJid;
    const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
    const args = text.split(' ');
    
    // Check if this is a group chat
    if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, {
            text: '❌ *This command can only be used in groups!*'
        });
        return;
    }
    
    // Check if user has permission (admin)
    const participant = m.key.participant || m.key.remoteJid;
    const groupMetadata = await sock.groupMetadata(jid);
    const isAdmin = groupMetadata.participants.find(p => p.id === participant)?.admin;
    
    if (!isAdmin) {
        await sock.sendMessage(jid, {
            text: '❌ *Permission Denied!*\n\nOnly group admins can use this command.'
        });
        return;
    }

    if (args.length < 2) {
        const status = antiLinkSettings.get(jid) ? '🟢 ON' : '🔴 OFF';
        await sock.sendMessage(jid, {
            text: `⚙️ *ANTI-LINK SETTINGS*\n\nCurrent status: ${status}\n\nUsage:\n• .antilink on - Enable link blocking\n• .antilink off - Disable link blocking\n\n🔒 I will delete messages containing links when enabled.`
        });
        return;
    }

    const action = args[1].toLowerCase();

    if (action === 'on') {
        antiLinkSettings.set(jid, true);
        await sock.sendMessage(jid, {
            text: '✅ *ANTI-LINK ENABLED*\n\nI will now delete messages containing links in this group.'
        });
        console.log(`✅ Anti-link enabled for group: ${jid}`);
    } else if (action === 'off') {
        antiLinkSettings.set(jid, false);
        await sock.sendMessage(jid, {
            text: '❌ *ANTI-LINK DISABLED*\n\nLink messages will no longer be deleted.'
        });
        console.log(`❌ Anti-link disabled for group: ${jid}`);
    } else {
        await sock.sendMessage(jid, {
            text: '❌ Use: .antilink on/off'
        });
    }
}

// Monitor function to detect and delete links
export const monitor = (sock) => {
    console.log('🔗 Anti-link monitor loaded');

    // Listen for messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        
        for (const m of messages) {
            try {
                if (!m.message) continue;
                
                const jid = m.key.remoteJid;
                const sender = m.key.participant || m.key.remoteJid;
                
                // Only process group messages
                if (!jid.endsWith('@g.us')) continue;
                
                // Check if anti-link is enabled for this group
                if (!antiLinkSettings.get(jid)) continue;
                
                // Skip messages from admins and bots
                const groupMetadata = await sock.groupMetadata(jid);
                const senderParticipant = groupMetadata.participants.find(p => p.id === sender);
                if (senderParticipant?.admin || sender.includes('@s.whatsapp.net')) {
                    continue;
                }
                
                // Extract message text
                const msg = m.message;
                let text = '';
                
                if (msg.conversation) text = msg.conversation;
                else if (msg.extendedTextMessage?.text) text = msg.extendedTextMessage.text;
                else if (msg.imageMessage?.caption) text = msg.imageMessage.caption;
                else if (msg.videoMessage?.caption) text = msg.videoMessage.caption;
                else if (msg.documentMessage?.caption) text = msg.documentMessage.caption;
                
                // Check for URLs/links
                if (containsLink(text)) {
                    // Delete the message
                    await sock.sendMessage(jid, {
                        delete: m.key
                    });
                    
                    // Warn the user
                    const senderName = m.pushName || sender.split('@')[0];
                    await sock.sendMessage(jid, {
                        text: `⚠️ *LINK REMOVED*\n\n@${sender.split('@')[0]} - Link sharing is not allowed in this group.`,
                        mentions: [sender]
                    });
                    
                    console.log(`🔗 Deleted link message from ${sender} in ${jid}`);
                }
                
            } catch (error) {
                console.error('Anti-link error:', error);
            }
        }
    });
};

// Function to detect links/URLs
function containsLink(text) {
    if (!text) return false;
    
    const linkPatterns = [
        /https?:\/\/[^\s]+/gi, // http/https links
        /www\.[^\s]+/gi,       // www links
        /\.com[^\s]*/gi,       // .com domains
        /\.org[^\s]*/gi,       // .org domains
        /\.net[^\s]*/gi,       // .net domains
        /\.io[^\s]*/gi,        // .io domains
        /\.me[^\s]*/gi,        // .me domains
        /t\.me[^\s]*/gi,       // telegram links
        /youtu\.be[^\s]*/gi,   // youtube short links
        /youtube\.com[^\s]*/gi, // youtube links
        /whatsapp\.com[^\s]*/gi, // whatsapp links
        /instagram\.com[^\s]*/gi, // instagram links
        /facebook\.com[^\s]*/gi,  // facebook links
        /twitter\.com[^\s]*/gi,   // twitter links
        /x\.com[^\s]*/gi,         // x.com links
        /discord\.gg[^\s]*/gi,    // discord invites
    ];
    
    return linkPatterns.some(pattern => pattern.test(text));
}

// Whitelist specific domains (optional)
const whitelistedDomains = [
    'github.com',
    'git.io',
    'pastebin.com',
    'imgur.com',
    'i.imgur.com'
];

// Optional: Add command to whitelist domains
export const whitelistCommand = 'antilink-whitelist';

export async function whitelistExecute(sock, m) {
    const jid = m.key.remoteJid;
    
    if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, { text: '❌ This command can only be used in groups!' });
        return;
    }
    
    await sock.sendMessage(jid, {
        text: `📋 *Whitelisted Domains:*\n\n${whitelistedDomains.join('\n')}\n\nThese domains are allowed even when anti-link is enabled.`
    });
}