// commands/antidelete.js
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Persistent storage file
const STORAGE_FILE = path.join(__dirname, 'antidelete_settings.json');

// Load settings from file
function loadSettings() {
    try {
        if (fs.existsSync(STORAGE_FILE)) {
            const data = fs.readFileSync(STORAGE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading anti-delete settings:', error);
    }
    return { antiDeleteChat: false, antiDeleteStatus: false };
}

// Save settings to file
function saveSettings(settings) {
    try {
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('Error saving anti-delete settings:', error);
    }
}

// Initialize settings with persistence
let settings = loadSettings();
let antiDeleteChat = settings.antiDeleteChat || false;
let antiDeleteStatus = settings.antiDeleteStatus || false;

const messageCache = new Map();

export const command = "antidelete";

export async function execute(sock, m) {
    const jid = m.key.remoteJid;
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || "";
    const args = text.split(" ");

    if (args.length < 2) {
        const chatStatus = antiDeleteChat ? "🟢 ON" : "🔴 OFF";
        const statusStatus = antiDeleteStatus ? "🟢 ON" : "🔴 OFF";
        
        await sock.sendMessage(jid, {
            text: `⚙️ *ANTI-DELETE SETTINGS*\n\n📨 Chat Anti-Delete: ${chatStatus}\n📊 Status Anti-Delete: ${statusStatus}\n\nUsage:\n• .antidelete chat on - Enable for chats\n• .antidelete chat off - Disable for chats\n• .antidelete status on - Enable for status\n• .antidelete status off - Disable for status\n• .antidelete all on - Enable both\n• .antidelete all off - Disable both`
        });
        return;
    }

    const subCommand = args[1].toLowerCase();
    const action = args[2]?.toLowerCase();

    if (!action || (action !== "on" && action !== "off")) {
        await sock.sendMessage(jid, { 
            text: "❌ Use: .antidelete chat on/off OR .antidelete status on/off" 
        });
        return;
    }

    let updated = false;

    if (subCommand === "chat") {
        antiDeleteChat = action === "on";
        updated = true;
        await sock.sendMessage(jid, {
            text: action === "on" 
                ? "✅ *CHAT ANTI-DELETE ENABLED*\n\nI will now capture all deleted messages in chats."
                : "❌ *CHAT ANTI-DELETE DISABLED*\n\nChat message deletion capture is now off."
        });
    } else if (subCommand === "status") {
        antiDeleteStatus = action === "on";
        updated = true;
        await sock.sendMessage(jid, {
            text: action === "on" 
                ? "✅ *STATUS ANTI-DELETE ENABLED*\n\nI will now capture all deleted status updates."
                : "❌ *STATUS ANTI-DELETE DISABLED*\n\nStatus deletion capture is now off."
        });
    } else if (subCommand === "all") {
        antiDeleteChat = action === "on";
        antiDeleteStatus = action === "on";
        updated = true;
        await sock.sendMessage(jid, {
            text: action === "on" 
                ? "✅ *ALL ANTI-DELETE ENABLED*\n\nI will now capture all deleted messages and status updates."
                : "❌ *ALL ANTI-DELETE DISABLED*\n\nAll deletion capture is now off."
        });
    } else {
        await sock.sendMessage(jid, { 
            text: "❌ Use: .antidelete chat on/off OR .antidelete status on/off OR .antidelete all on/off" 
        });
    }

    // Save settings if updated
    if (updated) {
        saveSettings({
            antiDeleteChat,
            antiDeleteStatus
        });
    }
}

export const monitor = (sock) => {
    console.log("🔍 Anti-delete monitor loaded (Chat & Status)");

    // Cache all incoming messages and status updates
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;

        for (const m of messages) {
            try {
                if (!m.message) continue;
                if (m.key.fromMe) continue;

                const key = m.key;
                const jid = key.remoteJid;
                
                // Check if this is a status update
                const isStatus = jid === "status@broadcast";
                
                // Only cache if the corresponding anti-delete is enabled
                if ((isStatus && !antiDeleteStatus) || (!isStatus && !antiDeleteChat)) {
                    continue;
                }

                let mediaBuffer = null;
                let messageText = "";
                let messageType = Object.keys(m.message)[0];

                // Extract text from different message types
                if (m.message.conversation) {
                    messageText = m.message.conversation;
                } else if (m.message.extendedTextMessage?.text) {
                    messageText = m.message.extendedTextMessage.text;
                } else if (m.message.imageMessage?.caption) {
                    messageText = m.message.imageMessage.caption;
                } else if (m.message.videoMessage?.caption) {
                    messageText = m.message.videoMessage.caption;
                } else if (m.message.documentMessage?.caption) {
                    messageText = m.message.documentMessage.caption;
                }

                // Download media for cache
                if (["imageMessage", "videoMessage", "audioMessage", "stickerMessage", "documentMessage"].includes(messageType)) {
                    try {
                        mediaBuffer = await downloadMediaMessage(m, "buffer", {}, { 
                            logger: { level: 'silent' }
                        });
                    } catch (e) {
                        console.error("⚠️ Failed to download media:", e.message);
                    }
                }

                // Get sender info with better name resolution
                let senderName = m.pushName || "Unknown";
                let chatName = "Unknown";
                
                // Try to get better names
                try {
                    if (isStatus) {
                        chatName = "Status Update";
                        // For status, try to get the actual sender's name
                        if (key.participant) {
                            const contact = await sock.getContact(key.participant);
                            senderName = contact?.name || contact?.pushName || senderName;
                        }
                    } else if (jid.endsWith("@g.us")) {
                        // For groups, get group name and sender name
                        const groupMetadata = await sock.groupMetadata(jid).catch(() => null);
                        chatName = groupMetadata?.subject || "Group Chat";
                        
                        if (key.participant) {
                            const contact = await sock.getContact(key.participant);
                            senderName = contact?.name || contact?.pushName || senderName;
                        }
                    } else {
                        // For private chats, get contact name
                        const contact = await sock.getContact(jid);
                        chatName = contact?.name || contact?.pushName || "Private Chat";
                        senderName = chatName;
                    }
                } catch (error) {
                    console.error("Error getting contact info:", error);
                }

                messageCache.set(key.id, {
                    message: m.message,
                    jid,
                    sender: key.participant || jid,
                    timestamp: new Date(),
                    pushName: senderName,
                    chatName: chatName,
                    buffer: mediaBuffer,
                    type: messageType,
                    text: messageText,
                    isStatus: isStatus,
                    key: key
                });

                console.log(`💾 Cached ${isStatus ? 'status' : 'message'} ${key.id} from ${senderName} in ${chatName}`);

            } catch (error) {
                console.error("Error caching message:", error);
            }
        }
    });

    // Handle message deletions
    sock.ev.on("messages.update", async (updates) => {
        for (const update of updates) {
            try {
                if (!update.key) continue;
                
                const isDeletion =
                    update.update?.message === null ||
                    (update.update && Object.keys(update.update).length === 0) ||
                    update.messageStubType === 8;

                if (isDeletion) {
                    const cached = messageCache.get(update.key.id);
                    if (cached) {
                        // Check if the corresponding anti-delete is enabled
                        if ((cached.isStatus && antiDeleteStatus) || (!cached.isStatus && antiDeleteChat)) {
                            await handleDeletedMessage(sock, cached);
                        }
                        messageCache.delete(update.key.id);
                    }
                }
            } catch (error) {
                console.error("Error handling message update:", error);
            }
        }
    });

    // Also handle messages.delete
    sock.ev.on("messages.delete", async (item) => {
        if (!item.keys) return;

        for (const key of item.keys) {
            try {
                const cached = messageCache.get(key.id);
                if (cached) {
                    // Check if the corresponding anti-delete is enabled
                    if ((cached.isStatus && antiDeleteStatus) || (!cached.isStatus && antiDeleteChat)) {
                        await handleDeletedMessage(sock, cached);
                    }
                    messageCache.delete(key.id);
                }
            } catch (error) {
                console.error("Error handling messages.delete:", error);
            }
        }
    });
};

async function handleDeletedMessage(sock, cached) {
    try {
        const { jid, sender, timestamp, pushName, chatName, buffer, type, text, isStatus, key } = cached;

        const messageType = type.replace('Message', '');
        const timeString = timestamp.toLocaleTimeString();

        // Create clean alert message without message type
        let alert = `🚨 *${isStatus ? 'DELETED STATUS' : 'DELETED MESSAGE'}* 🚨

👤 *From:* ${pushName}
💬 *In:* ${chatName}
⏰ *Time:* ${timeString}`;

        // Add content
        if (text && text.trim()) {
            alert += `\n📝 *Message:* ${text}`;
        } else if (type === "imageMessage") {
            alert += `\n📷 *Message:* Image`;
        } else if (type === "videoMessage") {
            alert += `\n🎥 *Message:* Video`;
        } else if (type === "audioMessage") {
            alert += `\n🎵 *Message:* Voice Note`;
        } else if (type === "stickerMessage") {
            alert += `\n🖼️ *Message:* Sticker`;
        } else if (type === "documentMessage") {
            alert += `\n📄 *Message:* Document`;
        } else {
            alert += `\n📝 *Message:* [Media Content]`;
        }

        alert += `\n\n_This message was deleted by the sender_`;

        // Send media with caption if available
        if (buffer) {
            let mediaType;
            
            if (type === "imageMessage") {
                mediaType = "image";
            } else if (type === "videoMessage") {
                mediaType = "video";
            } else if (type === "audioMessage") {
                mediaType = "audio";
            } else if (type === "stickerMessage") {
                mediaType = "sticker";
            } else if (type === "documentMessage") {
                mediaType = "document";
            }

            // For media types that support captions
            if (mediaType === "image" || mediaType === "video" || mediaType === "document") {
                try {
                    await sock.sendMessage(sock.user.id, { 
                        [mediaType]: buffer,
                        caption: alert
                    });
                    console.log(`✅ Sent deleted ${mediaType} alert from ${pushName}`);
                } catch (error) {
                    console.error(`Failed to send ${mediaType} with caption:`, error);
                    // Fallback: send alert first, then media
                    await sock.sendMessage(sock.user.id, { text: alert });
                    await sock.sendMessage(sock.user.id, { [mediaType]: buffer });
                }
            } else {
                // For audio and stickers (no caption support)
                await sock.sendMessage(sock.user.id, { text: alert });
                await sock.sendMessage(sock.user.id, { [mediaType]: buffer });
            }
        } else {
            // No media buffer - send text alert only
            await sock.sendMessage(sock.user.id, { text: alert });
            
            // Try to recover media if it's a status
            if (isStatus && !buffer) {
                try {
                    const lastTryBuffer = await downloadMediaMessage(
                        { key, message: cached.message }, 
                        "buffer", 
                        {}, 
                        { logger: { level: 'silent' } }
                    );
                    if (lastTryBuffer) {
                        let mediaType = type.replace('Message', '').toLowerCase();
                        await sock.sendMessage(sock.user.id, { 
                            [mediaType]: lastTryBuffer 
                        });
                    }
                } catch (e) {
                    // Ignore recovery errors
                }
            }
        }

        console.log(`✅ Sent deletion alert from ${pushName} in ${chatName}`);

    } catch (error) {
        console.error("Error sending deletion alert:", error);
    }
}

// Export for testing
export const getSettings = () => ({ antiDeleteChat, antiDeleteStatus });
