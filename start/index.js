import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from '@whiskeysockets/baileys';

import express from 'express';
import cors from 'cors';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Web server setup
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store multiple users and their sessions
const userSessions = new Map();
const activeBotProcesses = new Map();
const PENDING_EXPIRY = 10 * 60 * 1000;

// Statistics tracking
let totalCodesGenerated = 0;
let totalUsers = 0;

// Generate unique session ID
const generateSessionId = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

// Generate session name
const generateSessionName = (sessionId) => {
  return `ICEY_MD_${sessionId.substring(0, 8).toUpperCase()}`;
};

// Update socket stats
function updateSocketStats() {
  const activeSessions = Array.from(userSessions.values()).filter(
    session => Date.now() - session.createdAt < PENDING_EXPIRY
  );

  const stats = {
    totalActiveSessions: activeSessions.length,
    totalUsers: totalUsers,
    codesGenerated: totalCodesGenerated,
    connectedSessions: activeSessions.filter(s => s.isConnected).length,
    activeBots: activeBotProcesses.size
  };
  
  io.emit('statsUpdate', stats);
}

// Clean up expired sessions
const cleanupExpiredSessions = () => {
  const now = Date.now();
  for (const [sessionId, session] of userSessions.entries()) {
    if (now - session.createdAt > PENDING_EXPIRY && !session.isConnected) {
      userSessions.delete(sessionId);
      
      if (activeBotProcesses.has(sessionId)) {
        const process = activeBotProcesses.get(sessionId);
        process.kill();
        activeBotProcesses.delete(sessionId);
      }
      
      console.log(chalk.gray(`🧹 Cleaned up expired session: ${sessionId}`));
    }
  }
  updateSocketStats();
};

setInterval(cleanupExpiredSessions, 60 * 1000);

// ==================== BOT PROCESS KEEP-ALIVE ====================
function keepBotsAlive() {
  console.log(chalk.blue('🤖 Starting bot keep-alive monitor...'));
  
  setInterval(() => {
    const now = Date.now();
    let restarted = 0;
    let checked = 0;
    
    for (const [sessionId, session] of userSessions.entries()) {
      checked++;
      
      // Skip if session is not supposed to have a bot
      if (!session.isConnected || !session.botProcessStarted) continue;
      
      const botProcess = activeBotProcesses.get(sessionId);
      const botUptime = now - session.botStartedAt;
      
      // Case 1: Process is completely dead but session says bot was connected
      if (!botProcess && session.botConnected) {
        console.log(chalk.yellow(`🔄 Restarting dead bot process: ${sessionId}`));
        startBotProcess(sessionId, session.sessionName);
        restarted++;
      }
      // Case 2: Process exists but bot never connected within 2 minutes (stuck)
      else if (botProcess && !session.botConnected && botUptime > 120000) {
        console.log(chalk.yellow(`🔄 Restarting stuck bot process: ${sessionId} (${Math.round(botUptime/1000)}s)`));
        botProcess.kill();
        setTimeout(() => startBotProcess(sessionId, session.sessionName), 2000);
        restarted++;
      }
      // Case 3: Process exists but was connected and now disconnected
      else if (botProcess && session.botConnected === false && session.botWasConnected) {
        console.log(chalk.yellow(`🔄 Restarting disconnected bot: ${sessionId}`));
        botProcess.kill();
        setTimeout(() => startBotProcess(sessionId, session.sessionName), 2000);
        restarted++;
      }
    }
    
    if (restarted > 0) {
      console.log(chalk.green(`✅ Restarted ${restarted}/${checked} bot processes`));
    } else if (checked > 0) {
      console.log(chalk.gray(`📊 Bot monitor: ${checked} bots checked, all healthy`));
    }
  }, 60000); // Check every minute
}

// ==================== UPTIME MONITORING ====================
class UptimeMonitor {
  constructor() {
    this.appUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    this.isMonitoring = false;
  }

  start() {
    if (this.isMonitoring) return;
    
    console.log(chalk.blue(`🔔 Starting uptime monitor for: ${this.appUrl}`));
    
    // Ping immediately
    this.ping();
    
    // Ping every 4 minutes (less than 5-minute timeout)
    this.interval = setInterval(() => this.ping(), 4 * 60 * 1000);
    
    this.isMonitoring = true;
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.isMonitoring = false;
      console.log(chalk.yellow('🔔 Uptime monitor stopped'));
    }
  }

  async ping() {
    try {
      const endpoints = ['/api/health', '/api/stats', '/'];
      
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(`${this.appUrl}${endpoint}`, {
            signal: AbortSignal.timeout(10000) // 10 second timeout
          });
          console.log(chalk.green(`✅ Ping ${endpoint}: ${response.status}`));
        } catch (error) {
          console.log(chalk.yellow(`⚠️ Ping ${endpoint} failed: ${error.message}`));
        }
        
        // Small delay between pings
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.log(chalk.red(`❌ Uptime monitor error: ${error.message}`));
    }
  }
}

// Initialize monitor
const uptimeMonitor = new UptimeMonitor();

// ==================== HEALTH ENDPOINTS ====================
app.get('/api/health', (req, res) => {
  const activeSessions = Array.from(userSessions.values()).filter(
    session => Date.now() - session.createdAt < PENDING_EXPIRY
  );

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    activeSessions: activeSessions.length,
    connectedSessions: activeSessions.filter(s => s.isConnected).length,
    activeBots: activeBotProcesses.size,
    totalUsers: totalUsers,
    codesGenerated: totalCodesGenerated
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Icey-MD Bot Server is running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Function to export credentials as session string
function exportSessionString(creds) {
  try {
    const sessionData = {
      clientID: creds.clientID,
      serverToken: creds.serverToken,
      clientToken: creds.clientToken,
      encKey: creds.encKey ? creds.encKey.toString('base64') : null,
      macKey: creds.macKey ? creds.macKey.toString('base64') : null,
      pairingCode: creds.pairingCode,
      me: creds.me,
      account: creds.account,
      registration: creds.registration,
    };
    
    return Buffer.from(JSON.stringify(sessionData)).toString('base64');
  } catch (error) {
    console.error('Error exporting session string:', error);
    return null;
  }
}

// Create a proper minimal logger
const createMinimalLogger = () => {
  const noop = () => {};
  const logger = {
    level: 'silent',
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => logger
  };
  return logger;
};

// Get correct paths for your folder structure
function getBotFolderPath() {
  return path.join(__dirname, '..');
}

function getSessionsFolderPath() {
  const botFolder = getBotFolderPath();
  return path.join(botFolder, 'sessions');
}

// Function to copy session to bot folder
function copySessionToBotFolder(sessionId, sessionName) {
  try {
    const sourceDir = path.join(__dirname, `auth_info_${sessionId}`);
    const targetDir = path.join(getSessionsFolderPath(), sessionId);
    
    console.log(chalk.blue(`📁 Copying session from ${sourceDir} to ${targetDir}`));
    
    // Check if source exists
    if (!fs.existsSync(sourceDir)) {
      console.log(chalk.red(`❌ Source session folder not found: ${sourceDir}`));
      return false;
    }

    // Ensure target directory exists
    if (!fs.existsSync(path.dirname(targetDir))) {
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    }
    
    // Remove existing target directory
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    
    // Copy all files from source to target
    copyFolderRecursiveSync(sourceDir, targetDir);
    console.log(chalk.green(`✅ Session copied to bot folder: ${targetDir}`));
    return true;
    
  } catch (error) {
    console.error(chalk.red(`❌ Error copying session to bot folder: ${error.message}`));
    return false;
  }
}

// Recursive folder copy function
function copyFolderRecursiveSync(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const files = fs.readdirSync(source);
  
  for (const file of files) {
    const sourcePath = path.join(source, file);
    const targetPath = path.join(target, file);
    
    const stat = fs.statSync(sourcePath);
    
    if (stat.isDirectory()) {
      copyFolderRecursiveSync(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

// Start bot process for a session
async function startBotProcess(sessionId, sessionName) {
  try {
    console.log(chalk.blue(`🚀 Starting bot process for session: ${sessionId}`));

    // Copy session to bot folder first
    const sessionCopied = copySessionToBotFolder(sessionId, sessionName);
    if (!sessionCopied) {
      throw new Error('Failed to copy session to bot folder');
    }

    // Get bot folder path
    const botFolder = getBotFolderPath();
    if (!fs.existsSync(botFolder)) {
      throw new Error('icey-md-bot folder not found');
    }

    // Check if bot index.js exists
    const botIndex = path.join(botFolder, 'index.js');
    if (!fs.existsSync(botIndex)) {
      throw new Error('icey-md-bot/index.js not found');
    }

    console.log(chalk.blue(`🤖 Starting bot from: ${botIndex}`));

    // Start the bot process
    const botProcess = spawn('node', ['index.js'], {
      cwd: botFolder,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SESSION_ID: sessionId,
        SESSION_NAME: sessionName,
        AUTO_START: 'true',
        NODE_ENV: 'production'
      }
    });

    // Store the process
    activeBotProcesses.set(sessionId, botProcess);

    // Update session status
    const session = userSessions.get(sessionId);
    if (session) {
      session.botProcessStarted = true;
      session.botStartedAt = Date.now();
      session.botConnected = false;
      // Track if bot was ever connected
      if (!session.botWasConnected) {
        session.botWasConnected = false;
      }
    }

    // Handle process output
    botProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(chalk.cyan(`[Bot ${sessionId}] ${output}`));
        
        // Check for successful connection messages
        if (output.includes('Connected') || output.includes('CONNECTION SUCCESSFUL') || output.includes('ready')) {
          if (session) {
            session.botConnected = true;
            session.botWasConnected = true; // Mark as previously connected
          }
          updateSocketStats();
          
          // Notify frontend
          io.emit('botStatusUpdate', {
            sessionId: sessionId,
            status: 'connected',
            message: 'Bot is now active and running'
          });
        }
      }
    });

    botProcess.stderr.on('data', (data) => {
      const error = data.toString().trim();
      if (error && !error.includes('DeprecationWarning')) {
        console.log(chalk.red(`[Bot ${sessionId} ERROR] ${error}`));
      }
    });

    botProcess.on('close', (code) => {
      console.log(chalk.yellow(`[Bot ${sessionId}] Process exited with code: ${code}`));
      
      // Remove from active processes
      activeBotProcesses.delete(sessionId);
      
      // Update session status
      const session = userSessions.get(sessionId);
      if (session) {
        session.botConnected = false;
        session.botProcessStarted = false;
      }

      updateSocketStats();

      // Notify frontend
      io.emit('botStatusUpdate', {
        sessionId: sessionId,
        status: 'disconnected',
        message: 'Bot process stopped'
      });

      // Auto-restart for unexpected exits
      if (code !== 0 && session && session.isConnected) {
        console.log(chalk.blue(`🔄 Auto-restarting bot for ${sessionId} in 10 seconds...`));
        setTimeout(() => startBotProcess(sessionId, session.sessionName), 10000);
      }
    });

    botProcess.on('error', (error) => {
      console.error(chalk.red(`[Bot ${sessionId} Process Error] ${error.message}`));
    });

    console.log(chalk.green(`✅ Bot process started for session: ${sessionId} (PID: ${botProcess.pid})`));
    updateSocketStats();

    // Set timeout to check if bot started successfully
    setTimeout(() => {
      if (session && !session.botConnected) {
        console.log(chalk.yellow(`⚠️ Bot ${sessionId} still not connected after 30 seconds`));
      }
    }, 30000);

  } catch (error) {
    console.error(chalk.red(`❌ Failed to start bot process for ${sessionId}:`), error);
    
    // Remove from active processes on error
    activeBotProcesses.delete(sessionId);
    
    // Update session status
    const session = userSessions.get(sessionId);
    if (session) {
      session.botConnected = false;
      session.botProcessStarted = false;
    }
    
    updateSocketStats();
  }
}

// ==================== AUTO-START EXISTING SESSIONS ====================
async function autoStartExistingSessions() {
  console.log(chalk.blue('🔍 Scanning for existing sessions to auto-start...'));
  
  const sessionsDir = getSessionsFolderPath();
  if (!fs.existsSync(sessionsDir)) {
    console.log(chalk.yellow('📁 No sessions directory found'));
    return;
  }
  
  try {
    const sessionFolders = fs.readdirSync(sessionsDir).filter(folder => {
      const folderPath = path.join(sessionsDir, folder);
      return fs.statSync(folderPath).isDirectory();
    });
    
    console.log(chalk.blue(`📁 Found ${sessionFolders.length} existing session folders`));
    
    for (const sessionId of sessionFolders) {
      try {
        const sessionFolder = path.join(sessionsDir, sessionId);
        const credsFile = path.join(sessionFolder, 'creds.json');
        
        if (fs.existsSync(credsFile)) {
          console.log(chalk.blue(`🔄 Auto-starting existing session: ${sessionId}`));
          
          // Create session entry if it doesn't exist
          if (!userSessions.has(sessionId)) {
            userSessions.set(sessionId, {
              number: 'auto-started',
              sessionId,
              sessionName: generateSessionName(sessionId),
              createdAt: Date.now(),
              isProcessed: true,
              pairingCode: null,
              codeGeneratedAt: null,
              sessionString: null,
              isConnected: true, // Mark as connected since we have session data
              botConnected: false,
              botProcessStarted: false,
              botWasConnected: true, // Assume it was connected before
              status: 'auto_started',
              authDir: sessionFolder,
              connectionAttempts: 0,
              maxConnectionAttempts: 3
            });
          }
          
          // Start bot process for this session
          await startBotProcess(sessionId, generateSessionName(sessionId));
        }
      } catch (error) {
        console.error(chalk.red(`❌ Failed to auto-start session ${sessionId}:`), error);
      }
    }
    
    console.log(chalk.green(`✅ Auto-started ${sessionFolders.length} existing sessions`));
  } catch (error) {
    console.error(chalk.red('❌ Error scanning sessions directory:'), error);
  }
}

// API endpoint to receive number from webpage
app.post('/api/number', async (req, res) => {
  const { number } = req.body;
  
  if (!number) {
    return res.status(400).json({ error: 'Number is required' });
  }

  // Rate limiting
  const now = Date.now();
  const recentSession = Array.from(userSessions.values()).find(
    session => session.number === number && (now - session.createdAt) < 2 * 60 * 1000
  );

  if (recentSession) {
    return res.status(429).json({ 
      error: 'Please wait 2 minutes before requesting a new code for the same number' 
    });
  }

  const sessionId = generateSessionId();
  const sessionName = generateSessionName(sessionId);
  
  totalUsers++;
  userSessions.set(sessionId, {
    number: number.trim(),
    sessionId,
    sessionName,
    createdAt: Date.now(),
    isProcessed: false,
    pairingCode: null,
    codeGeneratedAt: null,
    sessionString: null,
    isConnected: false,
    botConnected: false,
    botProcessStarted: false,
    botWasConnected: false,
    status: 'waiting',
    authDir: path.join(__dirname, `auth_info_${sessionId}`),
    connectionAttempts: 0,
    maxConnectionAttempts: 3
  });

  console.log(chalk.green(`📱 New request from session ${sessionId}: ${number}`));
  console.log(chalk.blue(`🏷️ Session Name: ${sessionName}`));
  
  // Start pairing process
  startWhatsAppConnection(sessionId);
  
  res.json({ 
    success: true, 
    message: 'Number received successfully',
    sessionId,
    sessionName
  });
});

// API endpoint to get pairing code
app.get('/api/pairing-code/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = userSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  if (session.pairingCode) {
    return res.json({ 
      code: session.pairingCode, 
      available: true, 
      sessionId,
      sessionName: session.sessionName,
      isConnected: session.isConnected,
      sessionString: session.sessionString,
      botConnected: session.botConnected,
      botProcessStarted: session.botProcessStarted
    });
  }

  // Wait for pairing code with timeout
  const waitForCode = () => {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const currentSession = userSessions.get(sessionId);
        if (!currentSession) {
          clearInterval(checkInterval);
          resolve({ error: 'Session expired' });
        } else if (currentSession.pairingCode) {
          clearInterval(checkInterval);
          resolve({ 
            code: currentSession.pairingCode, 
            available: true,
            sessionName: currentSession.sessionName,
            isConnected: currentSession.isConnected,
            sessionString: currentSession.sessionString,
            botConnected: currentSession.botConnected,
            botProcessStarted: currentSession.botProcessStarted
          });
        } else if (currentSession.status === 'error') {
          clearInterval(checkInterval);
          resolve({ error: 'Failed to generate pairing code' });
        }
      }, 1000);
    });
  };

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve({ timeout: true }), 60000);
  });

  const result = await Promise.race([waitForCode(), timeoutPromise]);
  
  if (result.timeout) {
    res.json({ available: false, message: 'No code available yet' });
  } else if (result.error) {
    res.status(404).json({ error: result.error });
  } else {
    res.json({ ...result, sessionId });
  }
});

// API endpoint to check session status
app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = userSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    number: session.number,
    sessionName: session.sessionName,
    createdAt: session.createdAt,
    hasPairingCode: !!session.pairingCode,
    isProcessed: session.isProcessed,
    isConnected: session.isConnected,
    botConnected: session.botConnected,
    botProcessStarted: session.botProcessStarted,
    hasSessionString: !!session.sessionString,
    status: session.status,
    authDir: session.authDir,
    age: Date.now() - session.createdAt
  });
});

// API endpoint to get statistics
app.get('/api/stats', (req, res) => {
  const activeSessions = Array.from(userSessions.values()).filter(
    session => Date.now() - session.createdAt < PENDING_EXPIRY
  );

  res.json({
    totalActiveSessions: activeSessions.length,
    totalUsers: totalUsers,
    codesGenerated: totalCodesGenerated,
    connectedSessions: activeSessions.filter(s => s.isConnected).length,
    activeBots: activeBotProcesses.size,
    rateLimitTimeout: '120s'
  });
});

// API endpoint to get active bots
app.get('/api/active-bots', (req, res) => {
  const bots = Array.from(activeBotProcesses.entries()).map(([sessionId, process]) => ({
    sessionId,
    pid: process.pid,
    startedAt: userSessions.get(sessionId)?.botStartedAt || Date.now(),
    uptime: Math.floor((Date.now() - (userSessions.get(sessionId)?.botStartedAt || Date.now())) / 1000),
    connected: userSessions.get(sessionId)?.botConnected || false
  }));

  res.json({
    totalBots: activeBotProcesses.size,
    bots: bots
  });
});

// API endpoint to stop a bot
app.post('/api/stop-bot/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (activeBotProcesses.has(sessionId)) {
    const process = activeBotProcesses.get(sessionId);
    process.kill();
    activeBotProcesses.delete(sessionId);
    
    const session = userSessions.get(sessionId);
    if (session) {
      session.botConnected = false;
      session.botProcessStarted = false;
    }
    
    updateSocketStats();
    
    res.json({ success: true, message: `Bot stopped for session: ${sessionId}` });
  } else {
    res.status(404).json({ error: 'Bot process not found' });
  }
});

// API endpoint: download zipped auth_info folder
app.get('/api/auth-folder/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const authDir = path.join(__dirname, `auth_info_${sessionId}`);

  if (!fs.existsSync(authDir)) {
    return res.status(404).json({ error: 'Auth folder not found' });
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename=auth_info_${sessionId}.zip`);

  const archive = archiver("zip");
  archive.directory(authDir, false);
  archive.pipe(res);
  archive.finalize();
});

// FIXED: WhatsApp connection with proper 515 error handling
async function startWhatsAppConnection(sessionId) {
  const session = userSessions.get(sessionId);
  if (!session) return;

  session.status = 'processing';
  console.log(chalk.blue(`🚀 Starting WhatsApp connection for ${sessionId}`));

  try {
    const authDir = path.join(__dirname, `auth_info_${sessionId}`);
    session.authDir = authDir;
    
    // Clean up any existing auth directory
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log(chalk.blue(`📁 Using auth directory: ${authDir}`));

    const minimalLogger = createMinimalLogger();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['Ubuntu', 'Chrome', '20.04'],
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      logger: minimalLogger,
      retryRequestDelayMs: 250,
      maxRetries: 10,
      syncFullHistory: false,
      linkPreviewImageThumbnailWidth: 192,
      generateHighQualityLinkPreview: true,
      shouldIgnoreJid: jid => jid.endsWith('@broadcast'),
      // Additional options for better stability
      markOnlineOnConnect: false,
      emitOwnPresenceUpdate: false,
      defaultQueryTimeoutMs: 60000,
    });

    sock.ev.on('creds.update', saveCreds);

    let isConnected = false;
    let isPaired = false;
    let restartRequired = false;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      console.log(chalk.yellow(`🔌 Connection update: ${connection}`));
      
      if (connection === 'open') {
        console.log(chalk.green('✅ Connected to WhatsApp!'));
        isConnected = true;
        
        if (sock.authState.creds.registered) {
          console.log(chalk.green('🔐 Successfully registered!'));
          isPaired = true;
          
          const sessionString = exportSessionString(sock.authState.creds);
          if (sessionString) {
            session.sessionString = sessionString;
            session.isConnected = true;
            session.status = 'completed';
            console.log(chalk.green(`💫 Session string exported`));
            
            // Start bot process
            await startBotProcess(sessionId, session.sessionName);
          }

          updateSocketStats();

          // Send welcome message
          try {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (sock.ws && sock.ws.readyState === sock.ws.OPEN) {
              // Send session ID first
              await sock.sendMessage(sock.user.id, {
                text: `🎉 *WhatsApp Connected Successfully!*\n\n🤖 Your bot is starting...\n🆔 Session: ${sessionId}\n🏷️ Name: ${session.sessionName}\n\n⏳ Please wait for bot initialization...`
              });
              
              console.log(chalk.green('📤 Welcome message sent'));
            }
          } catch (e) {
            console.error('Failed to send welcome message:', e);
          }

          // For 515 error handling - don't disconnect immediately
          console.log(chalk.blue('🔄 Keeping connection alive for pairing completion...'));
          
          // Wait longer before disconnecting to ensure pairing is complete
          setTimeout(() => {
            try {
              console.log(chalk.yellow('🔌 Safely disconnecting pairing socket...'));
              if (sock.ws) {
                sock.ws.close();
              }
            } catch (e) {
              console.error('Error disconnecting:', e);
            }
          }, 8000); // Increased to 8 seconds
        }
      }
      
      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message;
        
        console.log(chalk.yellow(`🔌 Pairing disconnected: ${reason} - ${errorMessage}`));
        
        if (reason === 515) {
          console.log(chalk.blue('🔄 515 Error: Restart required after pairing - this is normal'));
          restartRequired = true;
          
          // Don't mark as error - this is expected behavior
          if (isPaired) {
            console.log(chalk.green('✅ Pairing was successful before restart'));
            // Session is already marked as completed, no need to change status
          } else {
            console.log(chalk.yellow('⚠️ Pairing may not have completed before restart'));
            // Try to restart the connection
            setTimeout(() => {
              restartConnectionAfterPairing(sessionId, authDir);
            }, 3000);
          }
          
        } else if (reason === 401) {
          console.log(chalk.red('❌ Unauthorized - pairing code may be invalid or expired'));
          session.status = 'error';
          session.error = 'Pairing code invalid or expired. Please request a new code.';
          updateSocketStats();
          
        } else if (reason === 429) {
          console.log(chalk.red('❌ Rate limited - too many attempts'));
          session.status = 'error';
          session.error = 'Too many attempts. Please wait before trying again.';
          updateSocketStats();
          
        } else if (reason === DisconnectReason.loggedOut) {
          console.log(chalk.red('❌ Logged out from WhatsApp'));
          session.status = 'error';
          session.error = 'Logged out from WhatsApp. Please try again.';
          updateSocketStats();
          
        } else if (reason === 400) {
          console.log(chalk.red('❌ Bad request - invalid parameters'));
          session.status = 'error';
          session.error = 'Invalid request. Please check your number and try again.';
          updateSocketStats();
          
        } else {
          console.log(chalk.yellow(`⚠️ Unknown disconnect reason: ${reason}`));
          // For other errors, try to reconnect
          session.connectionAttempts = (session.connectionAttempts || 0) + 1;
          
          if (session.connectionAttempts < session.maxConnectionAttempts) {
            console.log(chalk.blue(`🔄 Reconnecting... (attempt ${session.connectionAttempts}/${session.maxConnectionAttempts})`));
            setTimeout(() => {
              startWhatsAppConnection(sessionId);
            }, 5000);
          } else {
            console.log(chalk.red('❌ Max connection attempts reached'));
            session.status = 'error';
            session.error = 'Failed to connect after multiple attempts. Please try again.';
            updateSocketStats();
          }
        }
      }
      
      // Handle connecting state
      if (connection === 'connecting') {
        console.log(chalk.blue('🔄 Connecting to WhatsApp...'));
      }
      
      // Handle QR code if generated (fallback)
      if (qr) {
        console.log(chalk.blue('📱 QR Code generated (fallback)'));
      }
    });

    // Wait for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Request pairing code with better error handling
    console.log(chalk.blue(`🔐 Requesting pairing code for ${session.number}`));
    
    try {
      const code = await sock.requestPairingCode(session.number);
      session.pairingCode = code;
      session.codeGeneratedAt = Date.now();
      totalCodesGenerated++;
      
      console.log(chalk.magenta(`🔑 Pairing Code: ${code}`));
      console.log(chalk.blue('⏳ Waiting for user to connect...'));
      console.log(chalk.yellow('💡 Instructions: Open WhatsApp → Linked Devices → Link a Device → Link with Phone Number'));
      console.log(chalk.yellow('💡 Note: After scanning, wait for "WhatsApp Connected Successfully" message'));

      updateSocketStats();

      // Wait for pairing to complete with better handling
      let pairingWaitTime = 0;
      const maxPairingTime = 300000; // 5 minutes
      
      while (pairingWaitTime < maxPairingTime) {
        if (isPaired || restartRequired) {
          console.log(chalk.green('✅ Pairing process completed!'));
          break;
        }
        
        if (session.status === 'error') {
          console.log(chalk.red('❌ Session error detected, stopping wait'));
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        pairingWaitTime += 2000;
        
        // Show progress every 30 seconds
        if (pairingWaitTime % 30000 === 0) {
          console.log(chalk.blue(`⏰ Still waiting for pairing... (${pairingWaitTime/1000}s)`));
        }
      }

      if (!isPaired && !restartRequired && session.status !== 'error') {
        console.log(chalk.yellow('⏰ Pairing timeout reached'));
        session.status = 'timeout';
        session.error = 'Pairing timeout. Please try again with a new code.';
      }

      updateSocketStats();

    } catch (error) {
      console.error(chalk.red('❌ Failed to get pairing code:'), error);
      
      let errorMessage = 'Failed to get pairing code';
      if (error.message.includes('rate limit')) {
        errorMessage = 'Rate limited. Please wait before requesting another code.';
      } else if (error.message.includes('invalid')) {
        errorMessage = 'Invalid phone number format. Please check your number.';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Request timeout. Please try again.';
      }
      
      session.status = 'error';
      session.pairingCode = 'ERROR';
      session.error = errorMessage;
      updateSocketStats();
    }

  } catch (error) {
    console.error(chalk.red(`❌ Error in pairing process: ${error.message}`));
    session.status = 'error';
    session.pairingCode = 'ERROR';
    session.error = `Connection error: ${error.message}`;
    updateSocketStats();
    
    const authDir = path.join(__dirname, `auth_info_${sessionId}`);
    if (fs.existsSync(authDir)) {
      try {
        fs.rmSync(authDir, { recursive: true, force: true });
      } catch (e) {
        console.error('Error cleaning up auth directory:', e);
      }
    }
  }
}

// FIXED: Restart connection after pairing for 515 error
async function restartConnectionAfterPairing(sessionId, authDir) {
  const session = userSessions.get(sessionId);
  if (!session) return;

  console.log(chalk.blue(`🔄 Creating new connection after pairing for ${sessionId}`));

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const minimalLogger = createMinimalLogger();

    const newSock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['Ubuntu', 'Chrome', '20.04'],
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      logger: minimalLogger,
      markOnlineOnConnect: false,
      emitOwnPresenceUpdate: false
    });

    newSock.ev.on('creds.update', saveCreds);

    newSock.ev.on('connection.update', async (update) => {
      const { connection } = update;
      
      console.log(chalk.yellow(`🔄 Restart connection update: ${connection}`));
      
      if (connection === 'open') {
        console.log(chalk.green('✅ Restart connection successful after pairing!'));
        
        if (newSock.authState.creds.registered) {
          console.log(chalk.green('🔐 Successfully authenticated after restart!'));
          
          // Export session string if not already done
          if (!session.sessionString) {
            const sessionString = exportSessionString(newSock.authState.creds);
            if (sessionString) {
              session.sessionString = sessionString;
              session.isConnected = true;
              session.status = 'completed';
              console.log(chalk.green(`💫 Session string exported after restart`));
              
              // Start bot process
              await startBotProcess(sessionId, session.sessionName);
            }
          }
          
          // Send confirmation message
          try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (newSock.ws && newSock.ws.readyState === newSock.ws.OPEN) {
              await newSock.sendMessage(newSock.user.id, {
                text: `🔄 *Connection Restarted Successfully!*\n\n✅ Your session is now fully activated\n🆔 Session: ${sessionId}\n🏷️ Name: ${session.sessionName}\n\n🤖 Bot should be starting shortly...`
              });
              console.log(chalk.green('📤 Restart confirmation sent'));
            }
          } catch (e) {
            console.error('Failed to send restart message:', e);
          }
          
          // Close connection after confirmation
          setTimeout(() => {
            try {
              console.log(chalk.yellow('🔌 Closing restart connection...'));
              if (newSock.ws) {
                newSock.ws.close();
              }
            } catch (e) {
              console.error('Error closing restart connection:', e);
            }
          }, 5000);
        }
      }
    });

  } catch (error) {
    console.error(chalk.red('❌ Error in restart connection:'), error);
    // Even if restart fails, the session might still be valid
    if (!session.isConnected) {
      session.status = 'error';
      session.error = 'Failed to restart connection after pairing';
    }
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(chalk.blue(`🔌 Socket connected: ${socket.id}`));
  updateSocketStats();
  
  socket.on('disconnect', () => {
    console.log(chalk.yellow(`🔌 Socket disconnected: ${socket.id}`));
  });
});

// Ensure bot folder structure exists
function ensureBotFolderStructure() {
  const botFolder = getBotFolderPath();
  const sessionsFolder = getSessionsFolderPath();
  
  console.log(chalk.blue(`📁 Bot folder: ${botFolder}`));
  console.log(chalk.blue(`📁 Sessions folder: ${sessionsFolder}`));
  
  if (!fs.existsSync(botFolder)) {
    console.log(chalk.red(`❌ ERROR: icey-md-bot folder not found at: ${botFolder}`));
    return false;
  }
  
  if (!fs.existsSync(sessionsFolder)) {
    console.log(chalk.blue('📁 Creating sessions folder...'));
    fs.mkdirSync(sessionsFolder, { recursive: true });
  }
  
  const botIndex = path.join(botFolder, 'index.js');
  if (!fs.existsSync(botIndex)) {
    console.log(chalk.red(`❌ ERROR: Bot index.js not found at: ${botIndex}`));
    return false;
  } else {
    console.log(chalk.green(`✅ Bot index.js found: ${botIndex}`));
  }
  
  return true;
}

// ==================== START SERVER WITH ALL MONITORS ====================
server.listen(PORT, async () => {
  console.log(chalk.green(`🚀 Icey_MD Multi-Session Server started!`));
  console.log(chalk.blue(`🌐 Web interface: http://localhost:${PORT}`));
  console.log(chalk.blue(`🔌 Socket.io server running`));
  console.log(chalk.blue(`🤖 Multi-user bot system ready`));
  console.log(chalk.yellow(`💡 515 error handling: Enabled (automatic restart after pairing)`));
  
  const structureOk = ensureBotFolderStructure();
  if (!structureOk) {
    console.log(chalk.red('❌ Please check your folder structure and try again'));
  }
  
  // ==================== START ALL MONITORS ====================
  // Auto-start existing sessions first
  await autoStartExistingSessions();
  
  // Start bot keep-alive monitor
  keepBotsAlive();
  
  // Start uptime monitor (only on Render)
  if (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) {
    console.log(chalk.blue('🚀 Render environment detected - starting uptime monitor'));
    setTimeout(() => uptimeMonitor.start(), 30000);
  }
  
  console.log(chalk.green('✅ All monitors started successfully!'));
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  // Stop uptime monitor
  uptimeMonitor.stop();
  
  for (const [sessionId, process] of activeBotProcesses.entries()) {
    try {
      process.kill();
      console.log(chalk.yellow(`Stopped bot process: ${sessionId}`));
    } catch (error) {
      console.error(`Error stopping bot ${sessionId}:`, error);
    }
  }
  
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught Exception:'), error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Unhandled Rejection at:'), promise, 'reason:', reason);
});
