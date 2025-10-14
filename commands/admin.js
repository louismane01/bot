import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const command = 'restart';

export async function execute(sock, m) {
    const jid = m.key.remoteJid;
    
    try {
        // Send processing message
        await sock.sendMessage(jid, {
            text: '🔄 *Reloading commands...*\n\nPlease wait while I refresh all commands...'
        });

        // Check if reloadCommands function exists
        if (typeof globalThis.reloadCommands !== 'function') {
            await sock.sendMessage(jid, {
                text: '❌ *Error!*\n\nReload function not found.'
            });
            return;
        }

        // Reload commands
        const newCommands = await globalThis.reloadCommands();
        
        // Get command count
        const commandCount = newCommands?.size || 'unknown';

        // Send success message
        await sock.sendMessage(jid, {
            text: `✅ *Commands Reloaded Successfully!*\n\n📂 *Commands loaded:* ${commandCount}\n🔄 *Status:* All commands refreshed\n⏰ *Time:* ${new Date().toLocaleTimeString()}\n\n✨ *New commands are now available!*`
        });

        console.log(`✅ Commands reloaded, total commands: ${commandCount}`);

    } catch (error) {
        console.error('Restart command error:', error);
        
        await sock.sendMessage(jid, {
            text: `❌ *Reload Failed!*\n\nError: ${error.message}\n\nPlease check the console for details.`
        });
    }
}

// Update your other commands to be public too
export const listCommand = 'commands';

export async function listExecute(sock, m) {
    const jid = m.key.remoteJid;
    
    try {
        // Get commands from global scope or wherever you store them
        const commands = globalThis.commands || new Map();
        const commandList = Array.from(commands.keys());
        
        if (commandList.length === 0) {
            await sock.sendMessage(jid, {
                text: '❌ *No commands loaded!*\n\nUse .restart to reload commands.'
            });
            return;
        }

        // Format command list
        let commandsText = `📋 *LOADED COMMANDS* 📋\n\n`;
        commandsText += `Total: ${commandList.length} commands\n\n`;
        
        // Group commands by category
        const categories = {
            'Music': commandList.filter(cmd => ['play', 'music', 'stop', 'skip'].includes(cmd)),
            'Admin': commandList.filter(cmd => ['restart', 'ban', 'kick', 'promote'].includes(cmd)),
            'Fun': commandList.filter(cmd => ['meme', 'joke', 'quote', 'fact'].includes(cmd)),
            'Utility': commandList.filter(cmd => ['weather', 'time', 'calc', 'translate'].includes(cmd)),
            'Other': commandList.filter(cmd => !['play', 'music', 'stop', 'skip', 'restart', 'ban', 'kick', 'promote', 'meme', 'joke', 'quote', 'fact', 'weather', 'time', 'calc', 'translate'].includes(cmd))
        };

        // Add commands by category
        for (const [category, cmds] of Object.entries(categories)) {
            if (cmds.length > 0) {
                commandsText += `🎯 *${category}:*\n`;
                commandsText += `• .${cmds.join('\n• .')}\n\n`;
            }
        }

        commandsText += `💡 *Use .help <command> for more info*`;

        await sock.sendMessage(jid, {
            text: commandsText
        });

    } catch (error) {
        console.error('Commands list error:', error);
        await sock.sendMessage(jid, {
            text: '❌ *Failed to list commands!*'
        });
    }
}

export const statusCommand = 'status';

export async function statusExecute(sock, m) {
    const jid = m.key.remoteJid;
    
    try {
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        
        const memoryUsage = process.memoryUsage();
        const usedMemory = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
        const totalMemory = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);
        
        const commands = globalThis.commands || new Map();
        
        const statusMessage = `
🟢 *BOT STATUS* 🟢

⏰ *Uptime:* ${hours}h ${minutes}m ${seconds}s
💾 *Memory:* ${usedMemory}MB / ${totalMemory}MB
📦 *Commands:* ${commands.size} loaded
🚀 *Node.js:* ${process.version}

🌐 *Connection:* Active
🛡️ *Version:* v2.0.0
📊 *Performance:* Stable

🔧 *Last Reload:* ${new Date().toLocaleTimeString()}
👥 *Servicing:* Multiple chats
⚡ *Status:* Operational

💫 *ICEY_MD Bot - Running Smoothly*
`;

        await sock.sendMessage(jid, {
            text: statusMessage
        });

    } catch (error) {
        console.error('Status command error:', error);
        await sock.sendMessage(jid, {
            text: '❌ *Failed to get status!*'
        });
    }
}

export const monitor = (sock) => {
    console.log('🔄 Public admin commands loaded: .restart, .commands, .status');
};