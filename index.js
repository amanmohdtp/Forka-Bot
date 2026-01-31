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
import { handleMessage } from './handler.js';

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
  version: '2.1.0'
};

let botState = {
  isConnected: false,
  startTime: Date.now(),
  sock: null
};

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    getMessage: async () => undefined,
    markOnlineOnConnect: true,
    syncFullHistory: false
  });

  botState.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (connection === 'connecting' && !state.creds.registered) {
      const pairingNumber = config.pairingNumber.replace(/[^0-9]/g, '');
      
      if (!pairingNumber) {
        console.log(chalk.red('❌ PAIRING_NUMBER missing in .env'));
        process.exit(1);
      }

      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(pairingNumber);
          console.log(chalk.green('\n' + '═'.repeat(50)));
          console.log(chalk.green.bold('  📱 PAIRING CODE: ') + chalk.yellow.bold(code));
          console.log(chalk.green('═'.repeat(50) + '\n'));
        } catch (err) {
          console.error(chalk.red('Pairing failed:'), err.message);
          setTimeout(() => startBot(), 10000);
        }
      }, 3000);
    }

    if (connection === 'close') {
      botState.isConnected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      
      if (code === DisconnectReason.loggedOut) {
        console.log(chalk.red('\n❌ LOGGED OUT'));
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        process.exit(0);
      } else {
        console.log(chalk.yellow(`🔄 Reconnecting...`));
        setTimeout(() => startBot(), 5000);
      }
    } else if (connection === 'open') {
      botState.isConnected = true;
      
      console.log(chalk.green('\n' + '═'.repeat(60)));
      console.log(chalk.green.bold(`  ✅ ${config.botName.toUpperCase()} ONLINE!`));
      console.log(chalk.green('═'.repeat(60)));
      console.log(chalk.white(`  📱 Number: +${sock.user.id.split(':')[0]}`));
      console.log(chalk.white(`  🔧 Prefix: ${config.prefix}`));
      console.log(chalk.green('═'.repeat(60) + '\n'));

      // Send welcome message with image
      setTimeout(() => sendWelcomeMessage(sock), 5000);
    }
  });

  // Message handler
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    
    const msg = messages[0];
    if (!msg?.message) return;
    if (msg.key.fromMe) return;
    
    try {
      await handleMessage(sock, msg, config);
    } catch (err) {
      console.error(chalk.red('[ERROR]'), err.message);
    }
  });

  return sock;
}

async function sendWelcomeMessage(sock) {
  if (!sock?.user?.id) return;
  
  const botNumber = sock.user.id.split(':')[0];
  const ownerJid = config.ownerNumber 
    ? config.ownerNumber.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
    : botNumber + '@s.whatsapp.net';

  const menuImage = 'https://cdn.jsdelivr.net/gh/amanmohdtp/database@06959cbdefa02cea2c711cd7924982913e1fadcd/menu.png';

  const text = 
    `╔════════════════════════════╗\n` +
    `║     ${config.botName.toUpperCase()} BOT ONLINE     ║\n` +
    `╚════════════════════════════╝\n\n` +
    `✨ *Status:* Active & Ready\n` +
    `📱 *Number:* +${botNumber}\n` +
    `🔧 *Prefix:* ${config.prefix}\n` +
    `👑 *Owner:* +${config.ownerNumber || 'Not set'}\n` +
    `📦 *Version:* ${config.version}\n\n` +
    `Type *${config.prefix}menu* to see all commands! 🚀`;

  try {
    await sock.sendMessage(ownerJid, {
      image: { url: menuImage },
      caption: text
    });
    console.log(chalk.cyan(`✓ Welcome sent to ${ownerJid.split('@')[0]}\n`));
  } catch (err) {
    console.error(chalk.red('Welcome failed:'), err.message);
  }
}

// Health check
if (process.env.KEEP_ALIVE === 'true') {
  createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: botState.isConnected ? 'online' : 'offline',
      uptime: Math.floor((Date.now() - botState.startTime) / 1000)
    }));
  }).listen(config.port);
}

process.on('unhandledRejection', (err) => {
  console.error(chalk.red('Unhandled:'), err.message);
});

// Start
console.clear();
console.log(chalk.cyan.bold(`\n╔════════════════════════════╗`));
console.log(chalk.cyan.bold(`║    ${config.botName.toUpperCase()} STARTING...    ║`));
console.log(chalk.cyan.bold(`╚════════════════════════════╝\n`));

startBot().catch(err => {
  console.error(chalk.red('Startup failed:'), err.message);
  process.exit(1);
});
