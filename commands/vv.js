import { downloadMediaMessage } from '@whiskeysockets/baileys';

let ownerId = null;

export const command = 'vv';

export async function execute(sock, msg) {
  try {
    const jid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const args = text.split(' ');
    
    // Set owner if not set
    if (!ownerId) {
      ownerId = sock.user.id;
      console.log(`👑 Owner set to: ${ownerId}`);
    }

    const quoted = msg.message?.extendedTextMessage?.contextInfo;

    if (!quoted?.quotedMessage) {
      return sock.sendMessage(jid, {
        text: '❗ Reply to a view-once image, video, or voice note using `.vv`.\n\nOptions:\n• `.vv` - Send to my DM (private)\n• `.vv private` - Send to my DM\n• `.vv public` - Send to this chat',
        quoted: msg,
      });
    }

    const v1 = quoted.quotedMessage.viewOnceMessage;
    const v2 = quoted.quotedMessage.viewOnceMessageV2;
    const v2Extension = quoted.quotedMessage.viewOnceMessageV2Extension;
    const raw = v1?.message || v2?.message || v2Extension?.message || quoted.quotedMessage;

    const key = Object.keys(raw)[0];

    // Check for supported media types: image, video, AND audio
    if (key !== 'imageMessage' && key !== 'videoMessage' && key !== 'audioMessage') {
      return sock.sendMessage(jid, {
        text: '❌ Unsupported media type. Only view-once images, videos, and voice notes are supported.',
        quoted: msg,
      });
    }

    const media = raw[key];
    const buffer = await downloadMediaMessage(
      { message: { [key]: media } },
      'buffer'
    );

    // Get sender info for caption
    const senderName = msg.pushName || 'Unknown';
    const timestamp = new Date().toLocaleString();
    
    // Determine media type and prepare message
    let mediaMessage = {};
    let mediaType = '';
    
    if (key === 'imageMessage') {
      mediaMessage = { image: buffer };
      mediaType = 'Image';
    } else if (key === 'videoMessage') {
      mediaMessage = { video: buffer };
      mediaType = 'Video';
    } else if (key === 'audioMessage') {
      mediaMessage = { 
        audio: buffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true // Make it appear as a voice note
      };
      mediaType = 'Voice Note';
    }

    // Create caption without URLs to avoid link preview issues
    const caption = `🎯 View Once ${mediaType} Saved\n\n👤 From: ${senderName}\n📞 Number: ${sender.replace('@s.whatsapp.net', '')}\n⏰ Time: ${timestamp}\n💬 Chat: ${jid.replace('@g.us', '').replace('@s.whatsapp.net', '')}`;

    // Determine destination based on command
    const mode = args[1] ? args[1].toLowerCase() : 'private';
    let destination = null;
    let responseMessage = '';

    if (mode === 'public') {
      // Send to current chat
      destination = jid;
      responseMessage = `✅ View-once ${mediaType.toLowerCase()} has been saved and sent to this chat.`;
      
      // Send media to current chat
      await sock.sendMessage(destination, mediaMessage);
      await sock.sendMessage(destination, { 
        text: caption,
        linkPreview: false
      });
      
    } else {
      // Send to owner's DM (private mode)
      destination = ownerId;
      responseMessage = `✅ View-once ${mediaType.toLowerCase()} has been saved and sent to the bot owner.`;
      
      // Send to owner's DM
      await sock.sendMessage(destination, mediaMessage);
      await sock.sendMessage(destination, { 
        text: caption,
        linkPreview: false
      });
    }

    // Confirm to user
    await sock.sendMessage(jid, {
      text: responseMessage,
      quoted: msg,
    });

    console.log(`✅ View-once ${mediaType.toLowerCase()} saved from ${sender} and sent to ${mode === 'public' ? 'current chat' : 'owner DM'}`);

  } catch (err) {
    console.error('❌ VV command error:', err);
    return sock.sendMessage(msg.key.remoteJid, {
      text: '⚠️ Could not retrieve view-once media. It may have already been viewed, expired, or there might be a processing error.',
      quoted: msg,
    });
  }
}

// Monitor to set owner when bot starts
export const monitor = (sock) => {
  ownerId = sock.user.id;
  console.log(`👑 VV Command - Owner set to: ${ownerId}`);
};