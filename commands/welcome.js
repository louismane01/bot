// commands/welcome.js
const welcomeSettings = new Map();
const goodbyeSettings = new Map();

// Main welcome command
export const command = 'welcome';

export async function execute(sock, m) {
    const jid = m.key.remoteJid;
    const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
    const args = text.split(' ');
    
    if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, { text: '❌ This command can only be used in groups!' });
        return;
    }
    
    // Check if user is admin
    const participant = m.key.participant || m.key.remoteJid;
    const groupMetadata = await sock.groupMetadata(jid);
    const isAdmin = groupMetadata.participants.find(p => p.id === participant)?.admin;
    
    if (!isAdmin) {
        await sock.sendMessage(jid, { text: '❌ Only admins can use this command!' });
        return;
    }

    if (args.length < 2) {
        const welcomeStatus = welcomeSettings.get(jid) ? '🟢 ON' : '🔴 OFF';
        const goodbyeStatus = goodbyeSettings.get(jid) ? '🟢 ON' : '🔴 OFF';
        
        await sock.sendMessage(jid, {
            text: `🎉 *WELCOME & GOODBYE SETTINGS*\n\nWelcome Messages: ${welcomeStatus}\nGoodbye Messages: ${goodbyeStatus}\n\nUsage:\n• .welcome on/off - Welcome messages\n• .goodbye on/off - Goodbye messages\n• .welcomesettings - Show current settings`
        });
        return;
    }

    const action = args[1].toLowerCase();
    
    if (action === 'on') {
        welcomeSettings.set(jid, true);
        await sock.sendMessage(jid, { text: '✅ Welcome messages enabled!' });
    } else if (action === 'off') {
        welcomeSettings.set(jid, false);
        await sock.sendMessage(jid, { text: '❌ Welcome messages disabled!' });
    } else {
        await sock.sendMessage(jid, { text: '❌ Use: .welcome on/off' });
    }
}

// Goodbye command
export const goodbyeCommand = 'goodbye';

export async function goodbyeExecute(sock, m) {
    const jid = m.key.remoteJid;
    const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
    const args = text.split(' ');
    
    if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, { text: '❌ This command can only be used in groups!' });
        return;
    }
    
    // Check if user is admin
    const participant = m.key.participant || m.key.remoteJid;
    const groupMetadata = await sock.groupMetadata(jid);
    const isAdmin = groupMetadata.participants.find(p => p.id === participant)?.admin;
    
    if (!isAdmin) {
        await sock.sendMessage(jid, { text: '❌ Only admins can use this command!' });
        return;
    }

    if (args.length < 2) {
        const status = goodbyeSettings.get(jid) ? '🟢 ON' : '🔴 OFF';
        await sock.sendMessage(jid, {
            text: `👋 *GOODBYE SETTINGS*\n\nCurrent status: ${status}\n\nUsage:\n• .goodbye on - Enable goodbye messages\n• .goodbye off - Disable goodbye messages`
        });
        return;
    }

    const action = args[1].toLowerCase();
    
    if (action === 'on') {
        goodbyeSettings.set(jid, true);
        await sock.sendMessage(jid, { text: '✅ Goodbye messages enabled!' });
    } else if (action === 'off') {
        goodbyeSettings.set(jid, false);
        await sock.sendMessage(jid, { text: '❌ Goodbye messages disabled!' });
    } else {
        await sock.sendMessage(jid, { text: '❌ Use: .goodbye on/off' });
    }
}

// Settings command
export const settingsCommand = 'welcomesettings';

export async function settingsExecute(sock, m) {
    const jid = m.key.remoteJid;
    
    if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, { text: '❌ This command can only be used in groups!' });
        return;
    }
    
    const welcomeStatus = welcomeSettings.get(jid) ? '🟢 ON' : '🔴 OFF';
    const goodbyeStatus = goodbyeSettings.get(jid) ? '🟢 ON' : '🔴 OFF';
    
    await sock.sendMessage(jid, {
        text: `⚙️ *WELCOME/GOODBYE SETTINGS*\n\nWelcome Messages: ${welcomeStatus}\nGoodbye Messages: ${goodbyeStatus}\n\nGroup: ${jid}`
    });
}

// Monitor function for group participants update
export const monitor = (sock) => {
    console.log('🎉 Welcome/Goodbye monitor loaded');

    sock.ev.on('group-participants.update', async (update) => {
        try {
            const { id, participants, action } = update;
            
            if (action === 'add' && welcomeSettings.get(id)) {
                for (const user of participants) {
                    await sendWelcomeMessage(sock, id, user);
                }
            }
            
            if (action === 'remove' && goodbyeSettings.get(id)) {
                for (const user of participants) {
                    await sendGoodbyeMessage(sock, id, user);
                }
            }
            
        } catch (error) {
            console.error('Welcome/Goodbye error:', error);
        }
    });
};

async function sendWelcomeMessage(sock, groupJid, userJid) {
    try {
        const groupMetadata = await sock.groupMetadata(groupJid);
        const userNumber = userJid.split('@')[0];
        const timestamp = new Date().toLocaleString();
        
        // Try to get pushName (display name)
        let userName = userNumber;
        try {
            // This might not work for all users, but we try
            userName = userJid.split('@')[0];
        } catch (e) {
            console.log('Could not get username for:', userJid);
        }
        
        const welcomeMessage = `
🎉 *WELCOME TO THE GROUP!* 🎉

👤 *New Member:* @${userNumber}
📞 *Number:* ${userNumber}
👥 *Total Members:* ${groupMetadata.participants.length}
⏰ *Joined:* ${timestamp}
🏠 *Group:* ${groupMetadata.subject}

🌟 Welcome aboard! Please read the group rules and enjoy your stay!
        `.trim();

        await sock.sendMessage(groupJid, {
            text: welcomeMessage,
            mentions: [userJid]
        });
        
        console.log(`✅ Welcome message sent for ${userJid} in ${groupJid}`);
        
    } catch (error) {
        console.error('Welcome message error:', error);
        // Fallback simple welcome
        try {
            await sock.sendMessage(groupJid, {
                text: `🎉 Welcome @${userJid.split('@')[0]} to the group! 👋`,
                mentions: [userJid]
            });
        } catch (fallbackError) {
            console.error('Fallback welcome also failed:', fallbackError);
        }
    }
}

async function sendGoodbyeMessage(sock, groupJid, userJid) {
    try {
        const groupMetadata = await sock.groupMetadata(groupJid);
        const userNumber = userJid.split('@')[0];
        const timestamp = new Date().toLocaleString();
        
        const goodbyeMessage = `
👋 *GOODBYE!* 👋

👤 *Member Left:* @${userNumber}
📞 *Number:* ${userNumber}
👥 *Remaining Members:* ${groupMetadata.participants.length}
⏰ *Left:* ${timestamp}
🏠 *Group:* ${groupMetadata.subject}

😢 We'll miss you! Hope to see you again soon!
        `.trim();

        await sock.sendMessage(groupJid, {
            text: goodbyeMessage,
            mentions: [userJid]
        });
        
        console.log(`✅ Goodbye message sent for ${userJid} in ${groupJid}`);
        
    } catch (error) {
        console.error('Goodbye message error:', error);
        // Fallback simple goodbye
        try {
            await sock.sendMessage(groupJid, {
                text: `👋 Goodbye @${userJid.split('@')[0]}! We'll miss you! 😢`,
                mentions: [userJid]
            });
        } catch (fallbackError) {
            console.error('Fallback goodbye also failed:', fallbackError);
        }
    }
}