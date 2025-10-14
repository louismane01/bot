// commands/help.js
export const command = 'help';

export async function execute(sock, m) {
    const jid = m.key.remoteJid;
    
    const gradientHelp = `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
           🧊 ICEY MD 🧊        
         Premium WhatsApp Bot      
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

🔸 *Prefix:* [ . ]

🎧 *MUSIC & MEDIA*
   ├─ 🎵 .play <song/url>
   └─ 👁️ .vv - View once converter

🔒 *PRIVACY*
   ├─ 🚨 .antidelete [on/off]
   └─ 🌍 .public - Access control

⏰ *AUTOMATION*
   ├─ 📝 .msg |@| |time| |text|
   ├─ 📑 .listschedule
   └─ 🗑️ .cancelschedule <id>

👑 *ADMIN TOOLS*
   ├─ 🆕 .gc-create <name> <numbers>
   ├─ ❌ .gc-delete
   ├─ 📈 .groupinfo
   ├─ 📩 .invite @user
   ├─ 🚷 .kick @user
   ├─ ⬆️ .promote @user
   ├─ ⬇️ .demote @user
   └─ ➕ .add @user

💼 *ACCOUNT MANAGER (AZA)*
   ├─ 💾 .setaza - Store account details
   ├─ 📋 .aza - View account information
   └─ 🗑️ .delaza - Remove account data

⚡ *SYSTEM*
   ├─ 🏓 .ping - Check bot response
   ├─ 🚀 .speed - Test bot speed
   └─ 👥 .adduser - Add authorized user

❓ *ASSISTANCE*
   └─ ❓ .help - Show this menu

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
         ⚡ PERFORMANCE ⚡          
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

• Response: < 0.3s 
• Uptime: 100%
• Memory: Efficient 
• Reliability: High

✨ _Powered by Advanced Technology_
    `.trim();

    try {
        await sock.sendMessage(jid, { 
            text: gradientHelp,
            contextInfo: {
                mentionedJid: [m.sender],
                forwardingScore: 999,
                isForwarded: true
            }
        });
    } catch (error) {
        console.error('Help command error:', error);
        // Fallback simple help message
        await sock.sendMessage(jid, {
            text: `🧊 *ICEY MD BOT HELP* 🧊\n\n*Prefix:* .\n\n*Commands:* .play, .antidelete, .msg, .gc-create, .gc-delete, .groupinfo, .invite, .kick, .promote, .demote, .add, .setaza, .aza, .delaza, .ping, .speed, .adduser, .vv, .public, .listschedule, .cancelschedule\n\nUse . before each command!`
        });
    }
}

export const monitor = (sock) => {
    console.log('✅ Help command loaded successfully');
};