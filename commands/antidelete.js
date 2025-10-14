// commands/antidelete.js
import { downloadMediaMessage } from "@whiskeysockets/baileys";

const messageCache = new Map();
let antiDeleteChat = false;
let antiDeleteStatus = false;

export const command = "antidelete";

export async function execute(sock, m) {
    const jid = m.key.remoteJid;
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || "";
    const args = text.split(" ");

    if (args.length < 2) {
        const chatStatus = antiDeleteChat ? "🟢 ON" : "🔴 OFF";
        const statusStatus = antiDeleteStatus ? "🟢 ON" : "🔴 OFF";
        
        await sock.sendMessage(jid, {
            text: `⚙️ *ANTI-DELETE SETTINGS*\n\n📨 Chat Anti-Delete: ${chatStatus}\n📊 Status Anti-Delete: ${statusStatus}\n\nUsage:\n• .antidelete chat on - Enable for chats\n• .antidelete chat off - Disable for chats\n• .antidelete status on - Enable for status\n• .antidelete status off - Disable for status\n• .antidelete all on - Enable both\n• .antidelete all off - Disable both\n\n📨 Captures: text, images, videos, audios, stickers, documents`
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

    if (subCommand === "chat") {
        antiDeleteChat = action === "on";
        await sock.sendMessage(jid, {
            text: action === "on" 
                ? "✅ *CHAT ANTI-DELETE ENABLED*\n\nI will now capture all deleted messages in chats."
                : "❌ *CHAT ANTI-DELETE DISABLED*\n\nChat message deletion capture is now off."
        });
    } else if (subCommand === "status") {
        antiDeleteStatus = action === "on";
        await sock.sendMessage(jid, {
            text: action === "on" 
                ? "✅ *STATUS ANTI-DELETE ENABLED*\n\nI will now capture all deleted status updates."
                : "❌ *STATUS ANTI-DELETE DISABLED*\n\nStatus deletion capture is now off."
        });
    } else if (subCommand === "all") {
        antiDeleteChat = action === "on";
        antiDeleteStatus = action === "on";
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

                // Force download media for status even if not viewed
                if (["imageMessage", "videoMessage", "audioMessage", "stickerMessage", "documentMessage"].includes(messageType)) {
                    try {
                        // For status messages, we need to ensure media is downloaded properly
                        if (isStatus) {
                            // Force download by modifying the message structure if needed
                            const messageCopy = JSON.parse(JSON.stringify(m));
                            
                            // Ensure status media is accessible
                            if (messageCopy.message[messageType]) {
                                messageCopy.message[messageType].url = messageCopy.message[messageType].url || "";
                            }
                            
                            mediaBuffer = await downloadMediaMessage(messageCopy, "buffer", {}, { 
                                logger: { level: 'silent' }
                            });
                        } else {
                            mediaBuffer = await downloadMediaMessage(m, "buffer", {}, { 
                                logger: { level: 'silent' }
                            });
                        }
                    } catch (e) {
                        console.error("⚠️ Failed to download media:", e.message);
                        // Try alternative download method for status
                        if (isStatus) {
                            try {
                                mediaBuffer = await downloadStatusMedia(sock, m, messageType);
                            } catch (error2) {
                                console.error("⚠️ Alternative download also failed:", error2.message);
                            }
                        }
                    }
                }

                messageCache.set(key.id, {
                    message: m.message,
                    jid,
                    sender: key.participant || jid,
                    timestamp: new Date(),
                    pushName: m.pushName || "Unknown",
                    buffer: mediaBuffer,
                    type: messageType,
                    text: messageText,
                    isStatus: isStatus,
                    key: key
                });

                console.log(`💾 Cached ${isStatus ? 'status' : 'message'} ${key.id} (${messageType}) from ${isStatus ? 'status' : jid} - Media: ${mediaBuffer ? '✅' : '❌'}`);
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

// Alternative function to download status media
async function downloadStatusMedia(sock, m, messageType) {
    try {
        const message = m.message[messageType];
        if (!message) return null;

        // Try to get direct media URL and download
        const mediaUrl = message.url;
        if (!mediaUrl) return null;

        // Use axios or other HTTP client to download the media
        const response = await sock.fetchRequest(mediaUrl, {
            method: 'GET',
            headers: {
                'Origin': 'https://web.whatsapp.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        return Buffer.from(await response.arrayBuffer());
    } catch (error) {
        console.error("Alternative status media download failed:", error);
        return null;
    }
}

async function handleDeletedMessage(sock, cached) {
    try {
        const { jid, sender, timestamp, pushName, buffer, type, text, isStatus, key } = cached;

        const senderName = pushName || sender.split("@")[0];
        const chatType = isStatus ? "Status" : (jid.endsWith("@g.us") ? "Group" : "DM");
        const messageType = type.replace('Message', '');

        // Create comprehensive alert message
        let alert = `
🚨 *${isStatus ? 'DELETED STATUS' : 'DELETED MESSAGE'} ALERT* 🚨

👤 *From:* ${senderName}
💬 *Chat Type:* ${chatType}
⏰ *Time:* ${timestamp.toLocaleString()}
📝 *Message Type:* ${messageType}
        `.trim();

        // Add content description
        if (text) {
            alert += `\n📄 *Content:* ${text}`;
        } else {
            alert += `\n📄 *Content:* [${messageType.toUpperCase()} MEDIA]`;
        }

        alert += `\n\n_Message was deleted by the sender_`;

        // If we have media buffer, send it with alert as caption
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
                    console.log(`✅ Sent ${mediaType} with caption alert`);
                } catch (error) {
                    console.error(`Failed to send ${mediaType} with caption, sending separately:`, error);
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
            // No media buffer - try to extract info from original message
            let fallbackContent = "";
            
            if (cached.message?.imageMessage) {
                fallbackContent = "📷 Image (media not downloaded)";
            } else if (cached.message?.videoMessage) {
                fallbackContent = "🎥 Video (media not downloaded)";
            } else if (cached.message?.audioMessage) {
                fallbackContent = "🎵 Voice Note (media not downloaded)";
            } else if (cached.message?.stickerMessage) {
                fallbackContent = "🖼️ Sticker (media not downloaded)";
            } else if (cached.message?.documentMessage) {
                fallbackContent = "📄 Document (media not downloaded)";
            }
            
            if (fallbackContent) {
                alert = alert.replace("📄 *Content:*", `📄 *Content:* ${fallbackContent}`);
            }
            
            await sock.sendMessage(sock.user.id, { text: alert });
            
            // Try last-minute media download for status
            if (isStatus && !buffer) {
                try {
                    const lastTryBuffer = await downloadMediaMessage({ key, message: cached.message }, "buffer", {}, { 
                        logger: { level: 'silent' }
                    });
                    if (lastTryBuffer) {
                        let mediaType = type.replace('Message', '').toLowerCase();
                        await sock.sendMessage(sock.user.id, { 
                            [mediaType]: lastTryBuffer,
                            caption: `📎 Recovered ${mediaType} media`
                        });
                    }
                } catch (e) {
                    console.error("Last-minute media recovery failed:", e.message);
                }
            }
        }

        console.log(`✅ Sent deletion alert for ${type} from ${senderName}`);

    } catch (error) {
        console.error("Error sending deletion alert:", error);
    }
}
