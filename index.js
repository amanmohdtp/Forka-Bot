import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason
} from '@whiskeysockets/baileys';
import pino from 'pino';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer } from 'http';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, 'auth_info');
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

const config = {
  botName: process.env.BOT_NAME || 'Forka',
  ownerName: process.env.OWNER_NAME || 'Owner',
  prefix: process.env.PREFIX || '.',
  ownerNumber: process.env.OWNER_NUMBER || '',
  pairingNumber: process.env.PAIRING_NUMBER || '',
  port: process.env.PORT || 3000,
  debug: process.env.DEBUG === 'true' || false,
  version: '2.1.0'
};

let botState = {
  isConnected: false,
  pairingCodeSent: false,
  startTime: Date.now(),
  sock: null
};

async function startBot() {
  console.log(chalk.cyan('[START] Initializing bot...'));
  
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    logger: config.debug ? pino({ level: 'debug' }) : pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    getMessage: async () => undefined,
    markOnlineOnConnect: true,
    syncFullHistory: false,
    retryRequestDelayMs: 1000,
    maxMsgRetryCount: 3,
    defaultQueryTimeoutMs: 60000
  });

  botState.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr && !botState.pairingCodeSent) {
      console.log(chalk.yellow('🔄 Generating Pair Code'));
    }

    if (connection === 'connecting' && !state.creds.registered && !botState.pairingCodeSent) {
      const pairingNumber = config.pairingNumber.replace(/[^0-9]/g, '');
      
      if (!pairingNumber) {
        console.log(chalk.red('❌ ERROR: PAIRING_NUMBER is missing or invalid in .env'));
        console.log(chalk.yellow('   Add to .env: PAIRING_NUMBER=1234567890\n'));
        process.exit(1);
      }

      setTimeout(async () => {
        try {
          console.log(chalk.cyan(`📲 Requesting pairing code for +${pairingNumber}...`));
          
          const code = await sock.requestPairingCode(pairingNumber);
          botState.pairingCodeSent = true;
          
          console.log(chalk.green('\n' + '═'.repeat(50)));
          console.log(chalk.green.bold('  📱 PAIRING CODE: ') + chalk.yellow.bold(code));
          console.log(chalk.green('═'.repeat(50)));
          console.log(chalk.cyan('\n📖 How to use:'));
          console.log(chalk.white('  1. Open WhatsApp → Settings → Linked Devices'));
          console.log(chalk.white('  2. Tap "Link a Device"'));
          console.log(chalk.white('  3. Tap "Link with phone number instead"'));
          console.log(chalk.white(`  4. Enter code: `) + chalk.yellow.bold(code));
          console.log(chalk.cyan('  5. Wait for connection...\n'));
        } catch (err) {
          botState.pairingCodeSent = false;
          console.error(chalk.red('❌ Pairing failed:'), err.message);
          console.log(chalk.yellow('⏳ Retrying in 10 seconds...\n'));
          setTimeout(() => startBot(), 10000);
        }
      }, 5000); // Increased to 5 seconds for better stability
    }

    if (connection === 'close') {
      botState.isConnected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      
      if (code === DisconnectReason.loggedOut) {
        console.log(chalk.red('\n❌ LOGGED OUT - Clearing session...'));
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        } catch (err) {
          console.error(chalk.red('Failed to clear auth:'), err.message);
        }
        console.log(chalk.yellow('Please restart the bot to generate a new pairing code\n'));
        process.exit(0);
      } else {
        console.log(chalk.yellow(`🔄 Connection lost (Code: ${code || 'Unknown'}). Reconnecting in 5s...`));
        botState.pairingCodeSent = false;
        setTimeout(() => startBot(), 5000);
      }
    } else if (connection === 'open') {
      botState.isConnected = true;
      botState.pairingCodeSent = false;
      
      console.log(chalk.green('\n' + '═'.repeat(60)));
      console.log(chalk.green.bold(`  ✅ ${config.botName.toUpperCase()} IS ONLINE!`));
      console.log(chalk.green('═'.repeat(60)));
      console.log(chalk.white(`  📱 Number: +${sock.user.id.split(':')[0]}`));
      console.log(chalk.white(`  👤 Name: ${sock.user.name || 'Not Set'}`));
      console.log(chalk.white(`  🔧 Prefix: ${config.prefix}`));
      console.log(chalk.white(`  ⏰ Time: ${new Date().toLocaleString()}`));
      console.log(chalk.green('═'.repeat(60) + '\n'));

      setTimeout(async () => {
        try { 
          await sendWelcomeMessage(sock); 
        } catch (err) {
          console.error(chalk.red('Welcome message failed:'), err.message);
        }
      }, 2000);
    }
  });

  setupMessageHandler(sock);
  return sock;
}

async function sendWelcomeMessage(sock) {
  if (!sock?.user?.id) return;
  
  const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
  const ownerJid = config.ownerNumber 
    ? config.ownerNumber.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
    : botNumber;

  const welcomeText = 
    `╔════════════════════════════╗\n` +
    `║     ${config.botName.toUpperCase()} BOT ONLINE     ║\n` +
    `╚════════════════════════════╝\n\n` +
    `✨ *Status:* Active & Ready\n` +
    `📱 *Number:* +${botNumber.split('@')[0]}\n` +
    `🔧 *Prefix:* ${config.prefix}\n` +
    `👑 *Owner:* ${config.ownerName} (+${config.ownerNumber || 'Not set'})\n` +
    `🕒 *Started:* ${new Date(botState.startTime).toLocaleString()}\n` +
    `📦 *Version:* ${config.version}\n\n` +
    `Type *${config.prefix}menu* to see all commands! 🚀`;

  try {
    await sock.sendMessage(ownerJid, { text: welcomeText });
    console.log(chalk.cyan(`✓ Welcome message sent to ${ownerJid.split('@')[0]}\n`));
  } catch (err) {
    console.error(chalk.red('✗ Failed to send welcome message:'), err.message);
  }
}

async function setupMessageHandler(sock) {
  try {
    const { handleMessage } = await import('./handler.js');
    
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      const msg = messages[0];
      if (!msg?.message) return;
      if (msg.key.fromMe) return;
      
      try {
        await handleMessage(sock, msg, { ...config, startTime: botState.startTime });
      } catch (err) {
        console.error(chalk.red('[HANDLER ERROR]'), err.message);
        if (config.debug) console.error(err.stack);
      }
    });
    
    console.log(chalk.green('✓ Message handler loaded\n'));
  } catch (err) {
    console.error(chalk.red('❌ Failed to load handler.js:'), err.message);
    process.exit(1);
  }
}

function startHealthCheck() {
  if (process.env.KEEP_ALIVE !== 'true') return;
  
  createServer((req, res) => {
    const status = {
      status: botState.isConnected ? 'online' : 'offline',
      bot: config.botName,
      uptime: Math.floor((Date.now() - botState.startTime) / 1000),
      connected: botState.isConnected
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
  }).listen(config.port, () => {
    console.log(chalk.green(`✓ Health check server on port ${config.port}\n`));
  });
}

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n⏹️  Shutting down gracefully...'));
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error(chalk.red('⚠️  Unhandled Rejection:'), err.message);
  if (config.debug) console.error(err.stack);
});

process.on('uncaughtException', (err) => {
  console.error(chalk.red('⚠️  Uncaught Exception:'), err.message);
  if (config.debug) console.error(err.stack);
});

// Startup
console.clear();
console.log(chalk.cyan.bold(`
╔════════════════════════════╗
║    ${config.botName.toUpperCase()} BOT STARTING...    ║
╚════════════════════════════╝
`));

console.log(chalk.white('📋 Configuration:'));
console.log(chalk.white(`├─ Bot Name: ${config.botName}`));
console.log(chalk.white(`├─ Prefix: ${config.prefix}`));
console.log(chalk.white(`├─ Owner: ${config.ownerName}`));
console.log(chalk.white(`├─ Pairing Number: ${config.pairingNumber || 'Not Set'}`));
console.log(chalk.white(`└─ Debug Mode: ${config.debug ? 'ON' : 'OFF'}\n`));

const hasAuth = fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
if (hasAuth) {
  console.log(chalk.green('✓ Session found, connecting...\n'));
} else {
  if (!config.pairingNumber) {
    console.log(chalk.red('❌ No session & no PAIRING_NUMBER set!'));
    console.log(chalk.yellow('   Add to .env: PAIRING_NUMBER=1234567890\n'));
    process.exit(1);
  }
  console.log(chalk.yellow('⚠️  No session found, pairing mode enabled\n'));
}

startBot().catch(err => {
  console.error(chalk.red('❌ Startup failed:'), err.message);
  process.exit(1);
});

startHealthCheck();
