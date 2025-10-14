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
  // For multi-session support, use sessions folder
  const sessionsDir = path.join(__dirname, 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
  return path.join(sessionsDir, SESSION_ID);
}

// === NEW: Check if session folder exists and has valid credentials ===
function hasValidSession(sessionFolderPath) {
  if (!fs.existsSync(sessionFolderPath)) {
    console.log(chalk.yellow(`❌ Session folder not found: ${sessionFolderPath}`));
    return false;
  }
  
  try {
    const files = fs.readdirSync(sessionFolderPath);
    console.log(chalk.blue(`📁 Session files: ${files.join(', ')}`));
    
    const hasCreds = files.some(file => file.includes('creds'));
    const hasAppState = files.some(file => file.includes('app-state'));
    const hasAnyFiles = files.length > 0;
    
    if (!hasCreds && !hasAppState && !hasAnyFiles) {
      console.log(chalk.yellow('⚠️ Session folder exists but no credentials found'));
      return false;
    }
    
    // Check if creds file has valid data
    if (hasCreds) {
      const credsFile = files.find(file => file.includes('creds'));
      const credsPath = path.join(sessionFolderPath, credsFile);
      try {
        const credsData = fs.readFileSync(credsPath, 'utf8');
        const creds = JSON.parse(credsData);
        
        if (!creds.noiseKey && !creds.signedIdentityKey && !creds.encKey) {
          console.log(chalk.yellow('⚠️ Session credentials are incomplete'));
          return false;
        }
        
        console.log(chalk.green('✅ Valid session credentials found'));
        return true;
      } catch (parseError) {
        console.log(chalk.yellow('⚠️ Could not parse credentials file'));
        return false;
      }
    }
    
    console.log(chalk.green('✅ Session folder has valid files'));
    return true;
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
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
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
    // Wait before reconnecting
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Restart the bot
    await startBot();
    console.log(chalk.green('✅ Reconnection successful!'));
    reconnectAttempts = 0; // Reset counter on successful reconnect
    isReconnecting = false;
  } catch (error) {
    console.log(chalk.red(`❌ Reconnection attempt ${reconnectAttempts} failed:`), error.message);
    
    // Schedule next reconnection attempt
    setTimeout(() => {
      isReconnecting = false;
      reconnectBot();
    }, 10000); // Wait 10 seconds before next attempt
  }
}

// === MODIFIED: Start bot function with auto-reconnect ===
async function startBot() {
  console.log(chalk.blue('🚀 Starting WhatsApp bot...'));
  
  let sessionFolderPath;
  
  if (AUTO_START) {
    // Auto-start mode: wait for session folder to be available
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
    // Manual mode: use existing session folder
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
    // Additional options for better stability
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

      // Reset reconnect attempts on successful connection
      reconnectAttempts = 0;
      isReconnecting = false;

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
🔹 *Phone:* ${sock.user?.id || 'Unknown'}
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
      const errorMessage = lastDisconnect?.error?.message;
      
      console.log(chalk.yellow('🔌 Disconnect reason:'), reason, errorMessage);
      
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
        
        // Don't attempt to reconnect if logged out
        console.log(chalk.yellow('💡 Session terminated. Please create a new session.'));
        return;
      } 
      
      // For other disconnection reasons, attempt to reconnect
      console.log(chalk.yellow('⚠️ Unexpected disconnect, attempting to reconnect...'));
      
      // Reset connection state before reconnecting
      if (sock.ws) {
        try {
          sock.ws.close();
        } catch (e) {
          // Ignore close errors
        }
      }
      
      // Start reconnection process
      setTimeout(() => {
        reconnectBot();
      }, 3000);
    }
    
    // Handle connecting state
    if (connection === 'connecting') {
      console.log(chalk.blue('🔄 Connecting to WhatsApp...'));
    }
  });

  // Load welcome monitor
  welcomeMonitor(sock);

  // Load commands function
  async function loadCommands() {
    console.log(chalk.blue('📂 Loading commands...'));
    commands.clear(); // Clear existing commands
    
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
          
          // Load monitor if available
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
  
  // 🔥 Make reload available everywhere
  globalThis.reloadCommands = loadCommands;

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

  return sock;
}

// Create commands folder if missing
const commandsDir = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsDir)) {
  fs.mkdirSync(commandsDir, { recursive: true });
  console.log(chalk.blue('📁 Created commands folder'));
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
    console.log(chalk.yellow(`[${SESSION_ID}] 🔄 Auto-restarting in 30 seconds...`));
    setTimeout(() => {
      startBot().catch(console.error);
    }, 30000);
  } else {
    process.exit(1);
  }
});
