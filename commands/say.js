import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import gTTS from 'gtts';

const unlinkAsync = promisify(fs.unlink);

// Say command - Convert text to speech and send as voice note
export const command = 'say';

export async function execute(sock, m) {
    const jid = m.key.remoteJid;
    const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
    
    // Extract text from command
    const sayText = text.replace('.say', '').trim();
    
    if (!sayText) {
        await sock.sendMessage(jid, {
            text: '❌ *Please provide text to convert to speech!*\n\nUsage: .say <text>\nExample: .say what is my name'
        });
        return;
    }

    // Get sender information
    const sender = m.sender || m.key.participant || m.key.remoteJid;
    const senderNumber = sender ? sender.split('@')[0] : 'User';

    try {
        // Send processing message
        await sock.sendMessage(jid, {
            text: `🗣️ *Converting to speech:*\n"${sayText}"\n\nPlease wait...`
        });

        // Create temp directory if it doesn't exist
        const tempDir = './temp/voice';
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const timestamp = Date.now();
        const outputFile = path.join(tempDir, `voice_${timestamp}.mp3`);

        // Convert text to speech using gTTS
        await new Promise((resolve, reject) => {
            try {
                const gtts = new gTTS(sayText, 'en');
                gtts.save(outputFile, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });

        // Check if file was created
        if (!fs.existsSync(outputFile)) {
            throw new Error('Failed to create audio file');
        }

        // Read the audio file
        const audioBuffer = fs.readFileSync(outputFile);

        // Send as voice note
        await sock.sendMessage(jid, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            ptt: true, // Push to talk (voice note)
        });

        // Send confirmation message
        await sock.sendMessage(jid, {
            text: `✅ *Text-to-Speech Sent!*\n\n📝 *Text:* "${sayText}"\n🎤 *Requested by:* @${senderNumber}`,
            mentions: sender ? [sender] : []
        });

        console.log(`✅ Text-to-speech sent: "${sayText}"`);

        // Clean up temp file after 5 seconds
        setTimeout(async () => {
            try {
                if (fs.existsSync(outputFile)) {
                    await unlinkAsync(outputFile);
                    console.log(`🧹 Cleaned up: ${outputFile}`);
                }
            } catch (cleanupError) {
                console.error('Cleanup error:', cleanupError);
            }
        }, 5000);

    } catch (error) {
        console.error('Say command error:', error);
        
        // Fallback: Send as text if audio conversion fails
        await sock.sendMessage(jid, {
            text: `❌ *Could not convert to speech:*\n\n"${sayText}"\n\n*Error:* ${error.message}\n\nSending as text message instead.`
        });
    }
}

// Name command - Say the user's name
export const nameCommand = 'myname';

export async function nameExecute(sock, m) {
    const jid = m.key.remoteJid;
    
    // Get sender information
    const sender = m.sender || m.key.participant || m.key.remoteJid;
    const senderNumber = sender ? sender.split('@')[0] : 'User';

    try {
        await sock.sendMessage(jid, {
            text: `🔍 *Checking your name...*\n\nPlease wait...`
        });

        const tempDir = './temp/voice';
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const timestamp = Date.now();
        const outputFile = path.join(tempDir, `name_${timestamp}.mp3`);

        // Create message with user's number
        const nameMessage = `Your WhatsApp number is ${Array.from(senderNumber).join(' ')}`;

        // Convert to speech
        await new Promise((resolve, reject) => {
            try {
                const gtts = new gTTS(nameMessage, 'en');
                gtts.save(outputFile, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });

        if (!fs.existsSync(outputFile)) {
            throw new Error('Failed to create audio file');
        }

        const audioBuffer = fs.readFileSync(outputFile);

        // Send as voice note
        await sock.sendMessage(jid, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            ptt: true,
        });

        await sock.sendMessage(jid, {
            text: `✅ *Name revealed!*\n\n📞 *Your number:* ${senderNumber}\n🎤 *Requested by:* @${senderNumber}`,
            mentions: sender ? [sender] : []
        });

        // Clean up
        setTimeout(async () => {
            try {
                if (fs.existsSync(outputFile)) await unlinkAsync(outputFile);
            } catch (e) {}
        }, 5000);

    } catch (error) {
        console.error('Name command error:', error);
        await sock.sendMessage(jid, {
            text: `❌ *Could not process your name:*\n\n*Error:* ${error.message}\n\nYour number: ${senderNumber}`
        });
    }
}

// Monitor function
export const monitor = (sock) => {
    console.log('🗣️  TTS commands loaded: .say, .myname');
};