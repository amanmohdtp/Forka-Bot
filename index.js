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
import { handleMessage, handleGroupUpdate, initializeLidCache } from './handler.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, 'auth_info');
const CREDS_FILE = path.join(AUTH_DIR, 'creds.json');

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

const config = {
  botName: process.env.BOT_NAME || 'Forka',
  ownerName: process.env.OWNER_NAME || 'Owner',
  prefix: process.env.PREFIX || '.',
  ownerNumber: process.env.OWNER_NUMBER || '',
  pairingNumber: process.env.PAIRING_NUMBER || '',
  port: process.env.PORT || 3000,
  version: '2.3.0'
};

let botState = {
  isConnected: false,
  startTime: Date.now(),
  sock: null,
  lastConnectionTime: null
};

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  let pairingCodeSent = false;
  let connectionAttempts = 0;

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
    syncFullHistory: false,
    defaultQueryTimeoutMs: undefined,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    generateHighQualityLinkPreview: true,
    shouldIgnoreJid: jid => jid === 'status@broadcast'
  });

  botState.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'connecting' && !state.creds.registered && !pairingCodeSent) {
      console.log(chalk.cyan('🔄 Socket connecting...'));
      const requestPairing = async () => {
        try {
          const pairingNumber = config.pairingNumber.replace(/[^0-9]/g, '');
          if (!pairingNumber) {
            console.log(chalk.red('\n❌ ERROR: PAIRING_NUMBER not found in .env file\n'));
            process.exit(1);
          }
          console.log(chalk.cyan(`📲 Requesting pairing code for +${pairingNumber}...`));
          const code = await sock.requestPairingCode(pairingNumber);
          pairingCodeSent = true;
          console.log(chalk.green('\n' + '='.repeat(50)));
          console.log(chalk.green.bold('  📱 PAIRING CODE: ') + chalk.yellow.bold(code));
          console.log(chalk.green('='.repeat(50) + '\n'));
        } catch (err) {
          pairingCodeSent = false;
          console.error(chalk.red('❌ Pairing code request failed:'), err.message);
        }
      };
      setTimeout(requestPairing, 5000);
    }

    if (connection === 'close') {
      botState.isConnected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log(chalk.red('\n❌ Bot logged out - Deleting session\n'));
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        process.exit(0);
      } else {
        connectionAttempts++;
        const delay = Math.min(connectionAttempts * 2000, 30000);
        console.log(chalk.yellow(`🔄 Reconnecting in ${delay/1000}s... (Attempt ${connectionAttempts})\n`));
        pairingCodeSent = false;
        setTimeout(() => startBot(), delay);
      }
    } else if (connection === 'open') {
      connectionAttempts = 0;
      pairingCodeSent = false;
      botState.isConnected = true;
      botState.lastConnectionTime = Date.now();

      console.log(chalk.green('\n✅ Bot Connected Successfully!'));
      console.log(chalk.white(`📱 Number: +${sock.user.id.split(':')[0]}`));
      console.log(chalk.white(`🔧 Prefix: ${config.prefix}`));
      console.log(chalk.white(`👤 Owner: ${config.ownerNumber || 'Not Set'}`));
      console.log(chalk.white(`🎯 Version: ${config.version}\n`));

      await initializeLidCache(sock, config);
      const { initializeOwner } = await import('./database.js');
      initializeOwner(config.ownerNumber);

      setTimeout(() => sendWelcomeMessage(sock), 5000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg?.message || msg.key.remoteJid === 'status@broadcast') return;

    const msgId = msg.key.id;
    if (global.processedMessages?.has(msgId)) return;
    if (!global.processedMessages) global.processedMessages = new Set();
    global.processedMessages.add(msgId);
    if (global.processedMessages.size > 100) {
      const arr = Array.from(global.processedMessages);
      global.processedMessages = new Set(arr.slice(-100));
    }

    const body = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      ''
    ).trim();

    if (!body || !body.startsWith(config.prefix)) return;
    try {
      await handleMessage(sock, msg, config);
    } catch (err) {
      console.error(chalk.red('[ERROR]'), err.message);
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    try {
      await handleGroupUpdate(sock, update, config);
    } catch (err) {
      console.error(chalk.red('[GROUP UPDATE ERROR]'), err.message);
    }
  });

  return sock;
}

async function sendWelcomeMessage(sock) {
  if (!sock?.user?.id) return;
  const botNumber = sock.user.id.split(':')[0];
  const ownerJid = config.ownerNumber
    ? config.ownerNumber.split(',')[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net'
    : botNumber + '@s.whatsapp.net';

  const menuImage = 'https://cdn.jsdelivr.net/gh/amanmohdtp/database@06959cbdefa02cea2c711cd7924982913e1fadcd/menu.png';
  const text =
    `✨ *${config.botName.toUpperCase()} BOT ONLINE* ✅\n\n` +
    `Status: Active & Ready\n` +
    `Number: +${botNumber}\n` +
    `Prefix: ${config.prefix}\n` +
    `Owner: ${config.ownerNumber ? '+' + config.ownerNumber.split(',')[0] : 'Not set'}\n` +
    `Version: ${config.version}\n` +
    `⏰ Connected: ${new Date().toLocaleString()}\n\n` +
    `Type *${config.prefix}menu* to see all commands! 🚀`;

  try {
    await sock.sendMessage(ownerJid, { image: { url: menuImage }, caption: text });
    console.log(chalk.cyan('✓ Welcome message sent to owner\n'));
  } catch (err) {
    console.error(chalk.red('❌ Failed to send welcome:'), err.message);
  }
}

if (process.env.KEEP_ALIVE === 'true') {
  createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: botState.isConnected ? 'online' : 'offline',
      uptime: Math.floor((Date.now() - botState.startTime) / 1000),
      version: config.version
    }));
  }).listen(config.port);
  console.log(chalk.cyan(`🔗 Keep-alive server running on port ${config.port}`));
}

process.on('unhandledRejection', (err) => {
  console.error(chalk.red('Unhandled rejection:'), err.message);
});

console.clear();
console.log(chalk.cyan.bold(`\n🤖 ${config.botName.toUpperCase()} v${config.version} Starting...\n`));

const alreadyAuthenticated = fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
if (alreadyAuthenticated) {
  console.log(chalk.green('✅ Found existing session, connecting...\n'));
} else {
  console.log(chalk.yellow('⚠️  No session found, will request pairing code...\n'));
}

startBot().catch(err => {
  console.error(chalk.red('Startup failed:'), err.message);
  process.exit(1);
});