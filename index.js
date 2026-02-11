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
import { handleMessage, handleGroupUpdate, initializeLidCache } from './handler.js';

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
  version: '2.3.3'
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
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    shouldIgnoreJid: jid => jid === 'status@broadcast'
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'connecting' && !state.creds.registered && !pairingCodeSent) {
      const pairingNumber = config.pairingNumber.replace(/[^0-9]/g, '');
      if (!pairingNumber) {
        console.log(chalk.red('\n❌ PAIRING_NUMBER missing in .env\n'));
        process.exit(1);
      }
      try {
        const code = await sock.requestPairingCode(pairingNumber);
        pairingCodeSent = true;
        console.log(chalk.green('\n' + '='.repeat(50)));
        console.log(chalk.green.bold('  📱 PAIRING CODE: ') + chalk.yellow.bold(code));
        console.log(chalk.green('='.repeat(50) + '\n'));
      } catch (err) {
        pairingCodeSent = false;
        console.error(chalk.red('❌ Pairing failed:'), err.message);
      }
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log(chalk.red('\n❌ Logged out – deleting session\n'));
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        process.exit(0);
      } else {
        connectionAttempts++;
        const delay = Math.min(connectionAttempts * 2000, 30000);
        console.log(chalk.yellow(`🔄 Reconnecting in ${delay/1000}s (attempt ${connectionAttempts})`));
        pairingCodeSent = false;
        setTimeout(() => startBot(), delay);
      }
    } else if (connection === 'open') {
      connectionAttempts = 0;
      pairingCodeSent = false;
      console.log(chalk.green('\n✅ Bot connected'));
      console.log(chalk.white(`📱 Number: +${sock.user.id.split(':')[0]}`));
      console.log(chalk.white(`🔧 Prefix: ${config.prefix}\n`));

      await initializeLidCache(sock, config);
      const { initializeOwner } = await import('./database.js');
      initializeOwner(config.ownerNumber);

      // ---------- Send startup image to owner ----------
      const ownerJid = config.ownerNumber
        ? config.ownerNumber.split(',')[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net'
        : (sock.user.id.split(':')[0] + '@s.whatsapp.net');

      const imageUrl = 'https://cdn.jsdelivr.net/gh/amanmohdtp/database@3955fbc85cbf50d35b6427e446e6e553ff4df0cb/bot.jpg';

      try {
        await sock.sendMessage(ownerJid, {
          image: { url: imageUrl },
          caption: '✅ *BOT CONNECTED SUCCESSFULLY*'
        });
        console.log(chalk.cyan('📸 Startup image sent to owner\n'));
      } catch (err) {
        console.error(chalk.red('❌ Failed to send startup image:'), err.message);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg?.message || msg.key.remoteJid === 'status@broadcast') return;

    const body = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      ''
    ).trim();

    if (!body.startsWith(config.prefix)) return;
    await handleMessage(sock, msg, config);
  });

  sock.ev.on('group-participants.update', async (update) => {
    await handleGroupUpdate(sock, update, config);
  });

  return sock;
}

console.clear();
console.log(chalk.cyan.bold(`\n🤖 ${config.botName} v${config.version}\n`));

const alreadyAuthenticated = fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
console.log(alreadyAuthenticated
  ? chalk.green('✅ Using existing session\n')
  : chalk.yellow('⚠️  No session – pairing required\n'));

startBot().catch(err => {
  console.error(chalk.red('Startup failed:'), err.message);
  process.exit(1);
});