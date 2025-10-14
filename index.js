import { 
    execute as groupinfoExecute, 
    setRulesExecute, 
    clearRulesExecute, 
    rulesExecute 
} from './commands/groupinfo.js';

import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from '@whiskeysockets/baileys';

import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

import { 
    execute as msgExecute, 
    loadScheduledMessages, 
    listExecute as listScheduleExecute,
    cancelExecute as cancelScheduleExecute,
    listCommand as listScheduleCommand,
    cancelCommand as cancelScheduleCommand
} from './commands/msg-command.js';

import { 
    execute as welcomeExecute, 
    goodbyeExecute, 
    settingsExecute,
    monitor as welcomeMonitor,
    goodbyeCommand,
    settingsCommand
} from './commands/welcome.js';

import axios from 'axios';
import AdmZip from 'adm-zip';

import { startAutoUpdateChecker } from "./commands/update.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Commands will be loaded from external folder
const commands = new Map();

// === NEW: Get session info from environment (for multi-session support) ===
const SESSION_ID = process.env.SESSION_ID || 'default';
const SESSION_NAME = process.env.SESSION_NAME || 'default_session';
const AUTO_START = process.env.AUTO_START === 'true';

console.log(chalk.blue('🚀 Starting Icey_MD Bot'));
console.log(chalk.blue(`📁 Session ID: ${SESSION_ID}`));
console.log(chalk.blue(`🏷️ Session Name: ${SESSION_NAME}`));
console.log(chalk.blue(`⚡ Auto Start: ${AUTO_START}`));

// === MODIFIED: Function to get session folder path ===
function getSessionFolderPath() {
  // For multi-session support, use sessions folder
  const sessionsDir = path.join(__dirname, 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
  return path.join(sessionsDir, SESSION_ID);
}

// === MODIFIED: fetchAndExtractAuth function for multi-session ===
async function fetchAndExtractAuth() {
  const sessionFolderPath = getSessionFolderPath();
  
  // Check if session folder already exists
  if (fs.existsSync(sessionFolderPath)) {
    console.log(chalk.green(`✅ Using existing session folder: ${sessionFolderPath}`));
    return sessionFolderPath;
  }
  
  const url = `${process.env.SERVER_URL || 'https://iceymd.onrender.com/api/auth-folder'}/${SESSION_NAME}`;
  console.log(chalk.blue(`🔄 Fetching session folder from: ${url}`));

  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const zip = new AdmZip(response.data);
    zip.extractAllTo(sessionFolderPath, true);
    console.log(chalk.green(`✅ Session folder extracted: ${sessionFolderPath}`));
    return sessionFolderPath;
  } catch (err) {
    console.error(chalk.red('❌ Failed to fetch or extract session folder:'), err.message);
    
    // If auto-start mode, don't exit - wait for session to be available
    if (AUTO_START) {
      console.log(chalk.yellow('⏳ Session folder not available yet, waiting...'));
      return null;
    } else {
      process.exit(1);
    }
  }
}

// === NEW: Wait for session folder to be available ===
async function waitForSessionFolder(maxAttempts = 30) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const sessionFolderPath = getSessionFolderPath();
    
    if (fs.existsSync(sessionFolderPath)) {
      console.log(chalk.green(`✅ Session folder found after ${attempt} attempts`));
      return sessionFolderPath;
    }
    
    console.log(chalk.yellow(`⏳ Waiting for session folder... (${attempt}/${maxAttempts})`));
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  }
  
  throw new Error('Session folder not available after maximum attempts');
}

async function startBot() {
  console.log(chalk.blue('🚀 Starting WhatsApp bot...'));
  
  let sessionFolderPath;
  
  if (AUTO_START) {
    // Auto-start mode: wait for session folder to be available
    console.log(chalk.blue('⚡ Auto-start mode enabled'));
    sessionFolderPath = await waitForSessionFolder();
  } else {
    // Manual mode: try to fetch session folder
    sessionFolderPath = await fetchAndExtractAuth();
    if (!sessionFolderPath) {
      console.log(chalk.red('❌ No session folder available'));
      return;
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolderPath);

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['Icey_MD', 'Bot', '1.0.0'],
    shouldIgnoreJid: () => false,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    
    console.log(chalk.yellow('📡 Connection update:'), connection);
    
    if (connection === 'open') {
      console.log(chalk.green('✅ Connected to WhatsApp server!'));
      console.log(chalk.blue(`👤 User: ${sock.user?.name || 'Unknown'}`));
      console.log(chalk.blue(`🆔 Session: ${SESSION_ID}`));

      // Update autochecker
      startAutoUpdateChecker(sock);

      // Store bot owner automatically (the bot itself)
      globalThis.botOwner = sock.user.id;
      console.log(chalk.blue('👑 Bot owner set to:'), globalThis.botOwner);

      // Now load commands after successful connection
      await loadCommands();

      const welcomeCaption = `
✨ *CONNECTION SUCCESSFUL* ✨

👋 Hello! Your WhatsApp bot is now connected and ready.

🔹 *Session ID:* ${SESSION_ID}
🔹 *Session Name:* ${SESSION_NAME}
🔹 *User:* ${sock.user?.name || 'Unknown'}
🔹 *Commands Loaded:* ${commands.size}

🚀 Enjoy using your WhatsApp bot!

💫 Powered by *Icey_MD Multi-Session System*
`;

      // Load scheduled messages
      loadScheduledMessages(sock);

      try {
        // Try to send welcome message with image
        const imagePath = "./media/icey.jpg";
        if (fs.existsSync(imagePath)) {
          await sock.sendMessage(sock.user.id, {
            image: { url: imagePath },
            caption: welcomeCaption
          });
          console.log(chalk.green('✅ Welcome message with image sent!'));
        } else {
          // Fallback to text-only welcome message
          await sock.sendMessage(sock.user.id, { text: welcomeCaption });
          console.log(chalk.green('✅ Welcome message sent!'));
        }
      } catch (e) {
        console.error('Failed to send welcome message:', e);
        // Final fallback - just log it
        console.log(chalk.green('✅ Bot connected successfully!'));
      }
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log(chalk.yellow('🔌 Disconnect reason:'), reason);
      
      if (reason === DisconnectReason.loggedOut) {
        console.log(chalk.red('❌ Logged out from WhatsApp.'));
        console.log(chalk.blue('💡 The user may have logged out from Linked Devices'));
        
        // Clean up session folder on logout
        try {
          if (fs.existsSync(sessionFolderPath)) {
            fs.rmSync(sessionFolderPath, { recursive: true, force: true });
            console.log(chalk.green('🧹 Cleaned up session folder after logout'));
          }
        } catch (cleanupError) {
          console.error('Error cleaning up session folder:', cleanupError);
        }
        
      } else if (reason !== 400) { // Don't restart for intentional logout
        console.log(chalk.yellow('⚠️ Unexpected disconnect, reconnecting...'));
        setTimeout(() => startBot(), 5000);
      }
    }
    
    // Request pairing code if not registered (should not happen in multi-session mode)
    if (connection === 'connecting' && !sock.authState.creds.registered) {
      console.log(chalk.blue('🔐 Authentication required...'));
      
      // In multi-session mode, this should not happen as sessions are pre-authenticated
      console.log(chalk.yellow('⚠️ Session not registered - this should not happen in multi-session mode'));
    }
  });

  welcomeMonitor(sock);

  // Load commands function
  async function loadCommands() {
    console.log(chalk.blue('📂 Loading commands...'));
    const commandsDir = path.join(__dirname, 'commands');
    
    if (fs.existsSync(commandsDir)) {
      for (let file of fs.readdirSync(commandsDir)) {
        if (file.endsWith('.js') && file !== 'update.js') { // Skip update.js to avoid double loading
          try {
            const cmdModule = await import(`./commands/${file}`);
            
            if (cmdModule.command && cmdModule.execute) {
              commands.set(cmdModule.command, cmdModule.execute);
              console.log(chalk.green(`✅ Loaded command: .${cmdModule.command}`));
            }
            
            if (cmdModule.monitor) {
              cmdModule.monitor(sock);
            }
          } catch (error) {
            console.error(chalk.red(`❌ Error loading command ${file}:`), error);
          }
        }
      }
    }
    console.log(chalk.green(`✅ Total commands loaded: ${commands.size}`));
  }
  
  // 🔥 Make reload available everywhere
  globalThis.reloadCommands = loadCommands;

  // ✅ ADD THIS MISSING EVENT HANDLER FOR MESSAGE UPDATES (DELETIONS)
  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      try {
        if (!update.key) continue;
        
        // Check if this is a message deletion
        const isDeletion = 
          update.update?.message === null ||
          (update.update && Object.keys(update.update).length === 0) ||
          update.messageStubType === 8; // 8 = message deletion
        
        if (isDeletion) {
          console.log(chalk.yellow(`🗑️ Message deletion detected: ${update.key.id}`));
          
          // You can add custom deletion handling logic here
          // For example, if you want to notify when messages are deleted:
          /*
          await sock.sendMessage(sock.user.id, {
            text: `🗑️ Message was deleted\nID: ${update.key.id}\nChat: ${update.key.remoteJid}\nSession: ${SESSION_ID}`
          });
          */
        }
      } catch (error) {
        console.error('Error handling message update:', error);
      }
    }
  });

  // Also handle bulk deletions
  sock.ev.on('messages.delete', async (item) => {
    if (item.keys) {
      console.log(chalk.yellow(`🗑️ Bulk deletion detected: ${item.keys.length} messages`));
      
      // You can add custom bulk deletion handling here
      /*
      for (const key of item.keys) {
        await sock.sendMessage(sock.user.id, {
          text: `🗑️ Message deleted in bulk\nID: ${key.id}\nChat: ${key.remoteJid}\nSession: ${SESSION_ID}`
        });
      }
      */
    }
  });

  // Message processing handler
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
      try {
        if (!m.message) continue;
        
        const jid = m.key.remoteJid;
        const msg = m.message;
        let text = '';
        if (msg.conversation) text = msg.conversation;
        else if (msg.extendedTextMessage?.text) text = msg.extendedTextMessage.text;
        else if (msg.imageMessage?.caption) text = msg.imageMessage.caption;
        else if (msg.videoMessage?.caption) text = msg.videoMessage.caption;
        else if (msg.documentMessage?.caption) text = msg.documentMessage.caption;

        // Add session info to command logging
        if (text && text.startsWith('.')) {
          const cmdName = text.slice(1).split(' ')[0].toLowerCase();
          const sender = m.key.participant || m.key.remoteJid;
          console.log(chalk.blue(`[${SESSION_ID}] Command: .${cmdName} from ${sender}`));
        }

        // Direct commands
        if (text.startsWith('.welcome')) return await welcomeExecute(sock, m);
        if (text.startsWith('.goodbye')) return await goodbyeExecute(sock, m);
        if (text.startsWith('.welcomesettings')) return await settingsExecute(sock, m);
        if (text.startsWith('.groupinfo')) return await groupinfoExecute(sock, m);
        if (text.startsWith('.setrules')) return await setRulesExecute(sock, m);
        if (text.startsWith('.clearrules')) return await clearRulesExecute(sock, m);
        if (text.startsWith('.rules')) return await rulesExecute(sock, m);

        if (!text || !text.startsWith('.')) continue;

        const cmdName = text.slice(1).split(' ')[0].toLowerCase();

        if (text.startsWith('.msg ')) return await msgExecute(sock, m);
        if (text.startsWith('.' + listScheduleCommand)) return await listScheduleExecute(sock, m);
        if (text.startsWith('.' + cancelScheduleCommand)) return await cancelScheduleExecute(sock, m);
        
        if (commands.has(cmdName)) {
          const sender = m.key.participant || m.key.remoteJid;
          
          let publicModule;
          try {
            publicModule = await import('./commands/public.js');
          } catch (e) {
            console.error('❌ Could not load public module:', e);
          }
          
          const isPublic = publicModule?.isPublicMode ? publicModule.isPublicMode() : true;
          const isOwner = publicModule?.isOwner ? publicModule.isOwner(sender) : false;
          const isPublicCommand = publicModule && cmdName === 'public';
          
          if (isPublic || isOwner || isPublicCommand) {
            try {
              await commands.get(cmdName)(sock, m);
              console.log(chalk.green(`[${SESSION_ID}] ✅ Executed command: .${cmdName}`));
            } catch (e) {
              console.error(`[${SESSION_ID}] ❌ Command error:`, e);
            }
          } else {
            const privateResponse = `
🔒 *BOT IS IN PRIVATE MODE*

This bot is currently in private mode.
Only the owner can use commands.

👑 Contact the owner for access.

📝 Session: ${SESSION_ID}
    `;
            await sock.sendMessage(jid, { text: privateResponse });
            console.log(chalk.yellow(`[${SESSION_ID}] 🔒 Command blocked: .${cmdName} from ${sender}`));
          }
        } else {
          console.log(chalk.gray(`[${SESSION_ID}] ❓ Unknown command ignored: .${cmdName}`));
        }
        
      } catch (err) {
        console.error(`[${SESSION_ID}] Error processing message:`, err);
      }
    }
  });

  // === NEW: Handle group participants update ===
  sock.ev.on('group-participants.update', async (update) => {
    try {
      console.log(chalk.blue(`[${SESSION_ID}] 👥 Group participants update in ${update.id}`));
      
      // You can add group participant handling logic here
      // For example, welcome new members or log leaves
      
    } catch (error) {
      console.error(`[${SESSION_ID}] Error handling group participants update:`, error);
    }
  });

  // === NEW: Handle presence updates ===
  sock.ev.on('presence.update', async (update) => {
    // Optional: Handle presence updates (user online/offline status)
    // console.log(chalk.gray(`[${SESSION_ID}] Presence update: ${update.id}`));
  });
}

// Create commands folder if missing
const commandsDir = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsDir)) {
  fs.mkdirSync(commandsDir, { recursive: true });
  console.log(chalk.blue('📁 Created commands folder'));
  
  const exampleCommand = `// Example command structure
export const command = 'test';
export const execute = async (sock, m) => {
  const jid = m.key.remoteJid;
  const sessionId = process.env.SESSION_ID || 'unknown';
  await sock.sendMessage(jid, { 
    text: 'This is a test command! Session: ' + sessionId 
  });
};
export const monitor = (sock) => {
  console.log('Test monitor loaded for session:', process.env.SESSION_ID);
};
`;
  
  fs.writeFileSync(path.join(commandsDir, 'test.js'), exampleCommand);
  console.log(chalk.blue('📝 Created example command: test.js'));
}

// Create sessions directory for multi-session support
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
  console.log(chalk.blue('📁 Created sessions folder for multi-user support'));
}

// Error handlers
process.on('uncaughtException', (error) => {
  console.error(`[${SESSION_ID}] Uncaught Exception:`, error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${SESSION_ID}] Unhandled Rejection at:`, promise, 'reason:', reason);
});

// ✅ Fix for process signals
process.on('SIGINT', () => {
  console.log(`\n[${SESSION_ID}] 🛑 Caught Ctrl+C, shutting down...`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(`\n[${SESSION_ID}] 🛑 Process terminated, shutting down...`);
  process.exit(0);
});

// Start bot
startBot().catch(error => {
  console.error(`[${SESSION_ID}] ❌ Bot startup failed:`, error);
  
  // In auto-start mode, try to restart after delay
  if (AUTO_START) {
    console.log(chalk.yellow(`[${SESSION_ID}] 🔄 Auto-restarting in 10 seconds...`));
    setTimeout(() => {
      startBot().catch(console.error);
    }, 10000);
  } else {
    process.exit(1);
  }
});