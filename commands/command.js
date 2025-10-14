import { downloadMediaMessage } from '@whiskeysockets/baileys'
import fs from 'fs'
import path from 'path'

// Sticker command
async function stickerCommand(sock, msg) {
    try {
        if (!msg.message?.extendedTextMessage?.contextInfo?.stanzaId) {
            await sock.sendMessage(msg.key.remoteJid, { text: "❌ Reply to an *image* with .sticker" }, { quoted: msg })
            return
        }

        const quotedMsg = msg.message.extendedTextMessage.contextInfo
        const quoted = await sock.loadMessage(msg.key.remoteJid, quotedMsg.stanzaId)

        if (!quoted.message?.imageMessage) {
            await sock.sendMessage(msg.key.remoteJid, { text: "❌ That’s not an image" }, { quoted: msg })
            return
        }

        // download image
        const buffer = await downloadMediaMessage(
            { message: quoted.message },
            'buffer',
            {},
            { logger: sock.logger, reuploadRequest: sock.updateMediaMessage }
        )

        // save image temp
        const tmpFile = path.join(process.cwd(), 'temp.jpg')
        fs.writeFileSync(tmpFile, buffer)

        // send sticker
        await sock.sendMessage(msg.key.remoteJid, {
            sticker: fs.readFileSync(tmpFile)
        }, { quoted: msg })

        fs.unlinkSync(tmpFile) // cleanup temp file
    } catch (err) {
        console.error(err)
        await sock.sendMessage(msg.key.remoteJid, { text: "⚠️ Error making sticker" }, { quoted: msg })
    }
}

export default stickerCommand
