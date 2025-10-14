import { promisify } from 'util';
const sleep = promisify(setTimeout);

export const command = 'hacker';

export async function execute(sock, m) {
    const jid = m.key.remoteJid;
    
    try {
        // Get sender information safely
        const sender = m.sender || m.key.participant || m.key.remoteJid;
        const senderNumber = sender ? sender.split('@')[0] : 'Unknown_Hacker';
        const senderName = senderNumber !== 'Unknown_Hacker' ? senderNumber : 'Anonymous';

        // Hacker-style ASCII art
        const hackerArt = `
╔═══╗░░░░░░░░░░░░░░░░░░░░░
║███║░░░░░░░░░░░░░░░░░░░░░
║███║░░░██████╗░░██████╗░
║███║░░██╔════╝░░╚════██╗
║███║░░██║░░░░░░░░░░░░██╔╝
║███║░░██║░░░░░░░░░░░██╔╝░
║███║░░╚██████╗░░█████╔╝░░
╚═══╝░░░╚═════╝░░╚════╝░░░
`;

        // Send initial hacker message
        await sock.sendMessage(jid, {
            text: `🔓 *INITIATING HACKER MODE* 🔓\n\n${hackerArt}\n*Target Acquired:* @${senderName}\n*System Infiltration in Progress...*`,
            mentions: sender !== 'Unknown_Hacker' ? [sender] : []
        });

        await sleep(1000);

        // Simulate hacking process with real-time typing effect
        const hackingSteps = [
            "🟢 *Bypassing Firewall...*",
            "🟡 *Accessing Mainframe...*", 
            "🔵 *Decrypting Security Protocols...*",
            "🟣 *Injecting Payload...*",
            "🟠 *Establishing Backdoor...*",
            "🔴 *Extracting Data...*"
        ];

        for (const step of hackingSteps) {
            await sock.sendMessage(jid, { text: step });
            await sleep(800 + Math.random() * 700); // Random delay for realism
        }

        await sleep(1500);

        // Fake system information
        const fakeSystemInfo = `
💻 *SYSTEM COMPROMISED* 💻

📡 *IP Address:* 192.168.1.${Math.floor(Math.random() * 255)}
🌐 *Location:* Dark Web Server
🛡️ *Security:* Firewall Bypassed
🔓 *Access Level:* ROOT

📊 *Data Extracted:*
├── WhatsApp Chats: ✅
├── Photos: ✅  
├── Contacts: ✅
├── Location Data: ✅
└── System Files: ✅

⚡ *Vulnerabilities Found:* ${Math.floor(Math.random() * 15) + 5}
🔧 *Security Score:* ${Math.floor(Math.random() * 30)}/100

💀 *Warning:* System security compromised
`;

        await sock.sendMessage(jid, { text: fakeSystemInfo });
        await sleep(2000);

        // Fake personal data (for fun)
        const fakePersonalData = `
📋 *PERSONAL DATA EXFILTRATED* 📋

👤 *User:* @${senderName}
📞 *Number:* +*** **** ****
📧 *Email:* ********@*****.***
📍 *Approximate Location:* ${['Lagos', 'Abuja', 'Kano', 'Port Harcourt', 'Ibadan'][Math.floor(Math.random() * 5)]}

📱 *Device Info:*
├── Model: ${['iPhone', 'Samsung', 'Huawei', 'Tecno', 'Infinix'][Math.floor(Math.random() * 5)]}
├── OS: ${['Android', 'iOS'][Math.floor(Math.random() * 2)]}
└── Security: ${['Weak', 'Moderate', 'Compromised'][Math.floor(Math.random() * 3)]}

🎯 *Hacking Simulation Complete*
😄 *This is just for fun - no real hacking occurred!*
`;

        await sock.sendMessage(jid, { 
            text: fakePersonalData,
            mentions: sender !== 'Unknown_Hacker' ? [sender] : []
        });

        await sleep(1000);

        // Final message with fun options
        await sock.sendMessage(jid, {
            text: `🎮 *HACKER SIMULATION COMPLETE* 🎮

💫 *Options:*
• .hacker - Run again
• .hack <friend> - "Hack" a friend
• .secure - Check your "security"

😄 *Remember:* This is just a fun simulation!
🔒 *Your data is safe with ICEY_MD Bot*

💻 *Powered by ICEY_MD Hacker Module v1.0*`
        });

    } catch (error) {
        console.error('Hacker command error:', error);
        await sock.sendMessage(jid, {
            text: '❌ *HACK FAILED!*\n\nSystem defense mechanisms activated!\n\n💻 *Error:* Firewall detected simulation'
        });
    }
}

export const monitor = (sock) => {
    console.log('💻 Hacker command loaded: .hacker');
};