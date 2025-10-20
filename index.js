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
  const sessionsDir = path.join(__dirname, 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
  return path.join(sessionsDir, SESSION_ID);
}

// === IMPROVED: Session validation function ===
function hasValidSession(sessionFolderPath) {
  if (!fs.existsSync(sessionFolderPath)) {
    console.log(chalk.yellow(`❌ Session folder not found: ${sessionFolderPath}`));
    return false;
  }
  
  try {
    const files = fs.readdirSync(sessionFolderPath);
    if (files.length === 0) {
      console.log(chalk.yellow('⚠️ Session folder is empty'));
      return false;
    }
    
    console.log(chalk.blue(`📁 Session files: ${files.join(', ')}`));
    
    // Check for creds.json
    const credsFile = path.join(sessionFolderPath, 'creds.json');
    if (fs.existsSync(credsFile)) {
      try {
        const credsData = fs.readFileSync(credsFile, 'utf8');
        const creds = JSON.parse(credsData);
        
        const hasValidCreds = (
          creds && 
          (
            creds.noiseKey || 
            creds.signedIdentityKey || 
            creds.encKey || 
            creds.me ||
            creds.registration ||
            creds.clientID
          )
        );
        
        if (hasValidCreds) {
          console.log(chalk.green('✅ Valid session credentials found'));
          return true;
        } else {
          console.log(chalk.yellow('⚠️ Session credentials are incomplete'));
          return false;
        }
      } catch (parseError) {
        console.log(chalk.yellow('⚠️ Could not parse credentials file'));
        return false;
      }
    }
    
    // Check for app-state files
    const appStateFiles = files.filter(file => file.startsWith('app-state-sync'));
    if (appStateFiles.length > 0) {
      console.log(chalk.green('✅ App state files found'));
      return true;
    }
    
    // Check for any other session files
    const hasSessionFiles = files.some(file => 
      file.includes('pre-key') || 
      file.includes('session') || 
      file.includes('sender-key') ||
      file.includes('storage')
    );
    
    if (hasSessionFiles) {
      console.log(chalk.green('✅ Session files found'));
      return true;
    }
    
    console.log(chalk.yellow('⚠️ No valid session files found'));
    return false;
    
  } catch (error) {
    console.log(chalk.red('❌ Error checking session validity:'), error.message);
    return false;
  }
}

// === NEW: Wait for session folder to be available ===
async function waitForSessionFolder(maxAttempts = 30) {
  console.log(chalk.blue('🔍 Waiting for session folder...'));
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const sessionFolderPath = getSessionFolderPath();
    
    if (hasValidSession(sessionFolderPath)) {
      console.log(chalk.green(`✅ Valid session folder found after ${attempt} attempts`));
      return sessionFolderPath;
    }
    
    console.log(chalk.yellow(`⏳ Waiting for valid session folder... (${attempt}/${maxAttempts})`));
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error('Valid session folder not available after maximum attempts');
}

// === NEW: Auto-reconnect function ===
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let isReconnecting = false;
let currentSock = null;

async function reconnectBot() {
  if (isReconnecting) {
    console.log(chalk.yellow('🔄 Reconnection already in progress...'));
    return;
  }
  
  isReconnecting = true;
  reconnectAttempts++;
  
  if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    console.log(chalk.red(`❌ Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached`));
    console.log(chalk.blue('💡 The bot will stay offline. Restart the server to try again.'));
    isReconnecting = false;
    return;
  }
  
  console.log(chalk.yellow(`🔄 Attempting to reconnect... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`));
  
  try {
    await new Promise(resolve => setTimeout(resolve, 5000));
    await startBot();
    console.log(chalk.green('✅ Reconnection successful!'));
    reconnectAttempts = 0;
    isReconnecting = false;
  } catch (error) {
    console.log(chalk.red(`❌ Reconnection attempt ${reconnectAttempts} failed:`), error.message);
    setTimeout(() => {
      isReconnecting = false;
      reconnectBot();
    }, 10000);
  }
}

// === MODIFIED: Start bot function with improved session handling ===
async function startBot() {
  console.log(chalk.blue('🚀 Starting WhatsApp bot...'));
  
  let sessionFolderPath;
  
  if (AUTO_START) {
    console.log(chalk.blue('⚡ Auto-start mode enabled'));
    try {
      sessionFolderPath = await waitForSessionFolder();
    } catch (error) {
      console.log(chalk.red('❌ Failed to get session folder:'), error.message);
      
      if (AUTO_START) {
        console.log(chalk.yellow('🔄 Will retry to get session folder in 30 seconds...'));
        setTimeout(() => startBot(), 30000);
        return;
      } else {
        throw error;
      }
    }
  } else {
    sessionFolderPath = getSessionFolderPath();
    if (!hasValidSession(sessionFolderPath)) {
      console.log(chalk.red('❌ No valid session folder available'));
      throw new Error('No valid session folder available');
    }
  }

  console.log(chalk.green(`📁 Using session folder: ${sessionFolderPath}`));

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
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
    retryRequestDelayMs: 250,
    maxRetries: 10,
    emitOwnPresenceUpdate: false
  });

  currentSock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    
    console.log(chalk.yellow('📡 Connection update:'), connection);
    
    if (connection === 'open') {
      console.log(chalk.green('✅ Connected to WhatsApp server!'));
      console.log(chalk.blue(`👤 User: ${sock.user?.name || 'Unknown'}`));
      console.log(chalk.blue(`🆔 Session: ${SESSION_ID}`));
      console.log(chalk.blue(`📞 Phone: ${sock.user?.id || 'Unknown'}`));

      reconnectAttempts = 0;
      isReconnecting = false;

      globalThis.botOwner = sock.user.id;
      console.log(chalk.blue('👑 Bot owner set to:'), globalThis.botOwner);

      await loadCommands();

      const welcomeCaption = `
✨ *CONNECTION SUCCESSFUL* ✨

👋 Hello! Your WhatsApp bot is now connected and ready.

🔹 *Session ID:* ${SESSION_ID}
🔹 *Session Name:* ${SESSION_NAME}
🔹 *User:* ${sock.user?.name || 'Unknown'}
🔹 *Phone:* ${sock.user?.id || 'Unknown'}
🔹 *Commands Loaded:* ${commands.size}

🚀 Enjoy using your WhatsApp bot!

💫 Powered by *Icey_MD Multi-Session System*
`;

      loadScheduledMessages(sock);

      try {
        const imagePath = "./media/icey.jpg";
        if (fs.existsSync(imagePath)) {
          await sock.sendMessage(sock.user.id, {
            image: { url: imagePath },
            caption: welcomeCaption
          });
          console.log(chalk.green('✅ Welcome message with image sent!'));
        } else {
          await sock.sendMessage(sock.user.id, { text: welcomeCaption });
          console.log(chalk.green('✅ Welcome message sent!'));
        }
      } catch (e) {
        console.error('Failed to send welcome message:', e);
        console.log(chalk.green('✅ Bot connected successfully!'));
      }
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message;
      
      console.log(chalk.yellow('🔌 Disconnect reason:'), reason, errorMessage);
      
      if (reason === DisconnectReason.loggedOut) {
        console.log(chalk.red('❌ Logged out from WhatsApp.'));
        console.log(chalk.blue('💡 The user may have logged out from Linked Devices'));
        
        try {
          if (fs.existsSync(sessionFolderPath)) {
            fs.rmSync(sessionFolderPath, { recursive: true, force: true });
            console.log(chalk.green('🧹 Cleaned up session folder after logout'));
          }
        } catch (cleanupError) {
          console.error('Error cleaning up session folder:', cleanupError);
        }
        
        console.log(chalk.yellow('💡 Session terminated. Please create a new session.'));
        return;
      } 
      
      console.log(chalk.yellow('⚠️ Unexpected disconnect, attempting to reconnect...'));
      
      if (sock.ws) {
        try {
          sock.ws.close();
        } catch (e) {
          // Ignore close errors
        }
      }
      
      setTimeout(() => {
        reconnectBot();
      }, 3000);
    }
    
    if (connection === 'connecting') {
      console.log(chalk.blue('🔄 Connecting to WhatsApp...'));
    }
  });

  welcomeMonitor(sock);

  async function loadCommands() {
    console.log(chalk.blue('📂 Loading commands...'));
    commands.clear();
    
    const commandsDir = path.join(__dirname, 'commands');
    
    if (fs.existsSync(commandsDir)) {
      const commandFiles = fs.readdirSync(commandsDir).filter(file => 
        file.endsWith('.js')
      );
      
      for (let file of commandFiles) {
        try {
          const cmdModule = await import(`./commands/${file}`);
          
          if (cmdModule.command && cmdModule.execute) {
            commands.set(cmdModule.command, cmdModule.execute);
            console.log(chalk.green(`✅ Loaded command: .${cmdModule.command}`));
          }
          
          if (cmdModule.monitor) {
            cmdModule.monitor(sock);
            console.log(chalk.blue(`👀 Loaded monitor for: ${file}`));
          }
        } catch (error) {
          console.error(chalk.red(`❌ Error loading command ${file}:`), error);
        }
      }
    }
    console.log(chalk.green(`✅ Total commands loaded: ${commands.size}`));
  }
  
  globalThis.reloadCommands = loadCommands;

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

        if (text && text.startsWith('.')) {
          const cmdName = text.slice(1).split(' ')[0].toLowerCase();
          const sender = m.key.participant || m.key.remoteJid;
          console.log(chalk.blue(`[${SESSION_ID}] Command: .${cmdName} from ${sender}`));
        }

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

  return sock;
}

// Create necessary directories
const commandsDir = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsDir)) {
  fs.mkdirSync(commandsDir, { recursive: true });
  console.log(chalk.blue('📁 Created commands folder'));
}

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
  
  if (AUTO_START) {
    console.log(chalk.yellow(`[${SESSION_ID}] 🔄 Auto-restarting in 30 seconds...`));
    setTimeout(() => {
      startBot().catch(console.error);
    }, 30000);
  } else {
    process.exit(1);
  }
});
