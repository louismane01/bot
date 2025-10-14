export const command = 'link';

export async function execute(sock, m) {
  try {
    const sessionId = process.env.SESSION_ID || 'unknown';
    const sessionName = process.env.SESSION_NAME || 'default_session';
    const pairLink = 'https://bot-dght.onrender.com/';
    const imageUrl = 'https://files.catbox.moe/yh7cfa.jpg';

    const response = `
┌───────────────────────────
│   🧊 *ICEY-MD PAIRING SYSTEM* 🧊
├───────────────────────────
│
│   ✨ *Ready to Connect Your WhatsApp!* ✨
│
│   📱 *SESSION INFORMATION*
│   ├─ 🆔 ID: ${sessionId}
│   ├─ 🏷️ Name: ${sessionName}
│   └─ 🔋 Status: ✅ Active & Ready
│
│   🔗 *QUICK PAIRING*
│   Click below to start pairing:
│   🌐 ${pairLink}
│
│   ⚡ *SYSTEM FEATURES*
│   ├─ 🔄 Multi-device support
│   ├─ 🕒 24/7 online
│   ├─ 🔁 Auto-reconnect
│   └─ 🚀 Fast & reliable
│
│   📋 *GETTING STARTED*
│   1. 📲 Visit the link above
│   2. 🔢 Enter your phone number  
│   3. 🔐 Get pairing code
│   4. ✅ Link in WhatsApp
│
│   🎯 *Powered by Icey-MD Technology*
└───────────────────────────
    `.trim();

    // Send message with image and caption
    await sock.sendMessage(m.key.remoteJid, {
      image: { url: imageUrl },
      caption: response
    });

    console.log(`✅ Link command executed for session: ${sessionId}`);

  } catch (err) {
    console.error("Link command error:", err);
    
    // Enhanced fallback response
    const fallbackResponse = `
┌───────────────────────────
│   🧊 *ICEY-MD PAIRING SYSTEM* 🧊
├───────────────────────────
│
│   🔗 *PAIR YOUR DEVICE*
│   🌐 ${pairLink}
│
│   📱 Session: ${sessionId}
│   🏷️ Name: ${sessionName}
│   💫 Powered by Icey-MD
└───────────────────────────
    `.trim();
    
    await sock.sendMessage(m.key.remoteJid, { 
      text: fallbackResponse 
    });
  }
}

export const monitor = () => {
  console.log("✅ ICEY link command loaded");
};
