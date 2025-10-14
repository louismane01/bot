import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const command = 'owner';

export async function execute(sock, m) {
    const jid = m.key.remoteJid;
    
    try {
        // Your specific number
        const ownerNumber = '2347014196262';
        const botImagePath = path.join(__dirname, '../media/icey.jpg');
        const imageExists = fs.existsSync(botImagePath);
        
        // Modern box design with your number
        const ownerInfo = `
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
█                         █
█    🚀 ICEY_MD OWNER     █
█                         █
█▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█

► 👑 Name: ICEY_MD Developer
► 📞 Contact: +2347014196262
► ⚡ Status: Active & Powerful
► 💻 Skills: JS • Bots • Innovation

► 🏆 Achievements:
  • Created ICEY_MD Bot
  • 50+ Powerful Features
  • 1000+ Satisfied Users
  • Continuous Updates

► 💬 Message:
  "Thanks for using my bot!
   Please respect the service!"

▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀

✨ ICEY_MD Bot v2.0 ✨
`;

        if (imageExists) {
            await sock.sendMessage(jid, {
                image: { url: botImagePath },
                caption: ownerInfo
            });
        } else {
            await sock.sendMessage(jid, { text: ownerInfo });
            
            // Optional: Send a message about the missing image
            await sock.sendMessage(jid, {
                text: '💡 *Pro Tip:* Add your bot image at media/icey.jpg for a cooler display!'
            });
        }
        
        // Cool follow-up message
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await sock.sendMessage(jid, {
            text: `🎯 *Want to support the bot?*\n\nUse commands responsibly and tell your friends about ICEY_MD Bot! 🌟`
        });

    } catch (error) {
        console.error('Owner command error:', error);
        await sock.sendMessage(jid, {
            text: '❌ Could not load owner info'
        });
    }
}

export const monitor = (sock) => {
    console.log('👑 Custom owner command loaded: .owner');
};
