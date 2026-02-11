import chalk from 'chalk';
import { jidDecode } from '@whiskeysockets/baileys';
import {
  getGroupSettings,
  isSudoUser,
  setGroupSettings,
  getWelcomeMessage,
  setWelcomeMessage,
  getGoodbyeMessage,
  setGoodbyeMessage,
  setBotLid,
  getBotLid
} from './database.js';

const commands = new Map();
const lidCache = new Map();

// ---------- Simple in‑memory group cache (5s TTL) ----------
const groupCache = new Map();
const CACHE_TTL = 5000;

function getCachedGroup(chatId) {
  const entry = groupCache.get(chatId);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) return entry.data;
  return null;
}
function setCachedGroup(chatId, data) {
  groupCache.set(chatId, { data, timestamp: Date.now() });
}
export function clearCachedGroup(chatId) {
  groupCache.delete(chatId);
}

// ---------- JID utilities ----------
export function jidToNumber(jid) {
  if (!jid) return null;
  try {
    if (typeof jid === 'string' && /^\d+$/.test(jid)) return jid;
    const jidString = String(jid);
    if (jidString.includes('@lid')) {
      const num = jidString.split('@')[0];
      if (num && /^\d+$/.test(num)) return num;
    }
    if (jidString.includes('@s.whatsapp.net')) {
      const num = jidString.split('@')[0].split(':')[0];
      if (num && /^\d+$/.test(num)) return num;
    }
    if (jidString.includes('@g.us')) return jidString;
    try {
      const decoded = jidDecode(jidString);
      if (decoded?.user) return decoded.user;
    } catch {}
    const nums = jidString.match(/\d+/g);
    if (nums?.length) return nums.join('');
    return null;
  } catch {
    return null;
  }
}

export function storeLid(jid) {
  if (!jid) return null;
  try {
    const num = jidToNumber(jid);
    if (num) {
      lidCache.set(num, jid);
      if (jid.includes('@lid')) lidCache.set(`lid:${num}`, jid);
      return num;
    }
    return null;
  } catch {
    return null;
  }
}

export function numberToLid(number) {
  if (!number) return null;
  try {
    if (number.includes('@')) return number;
    return lidCache.get(number) || lidCache.get(`lid:${number}`) || `${number}@s.whatsapp.net`;
  } catch {
    return `${number}@s.whatsapp.net`;
  }
}

// ---------- LID Cache init ----------
export async function initializeLidCache(sock, config) {
  try {
    if (sock.user?.id) storeLid(sock.user.id);
    config.ownerNumber.split(',').forEach(n => {
      const clean = n.trim().replace(/[^0-9]/g, '');
      if (clean && !lidCache.has(clean)) lidCache.set(clean, `${clean}@s.whatsapp.net`);
    });
    return true;
  } catch (error) {
    console.error(chalk.red('[LID] Init error:'), error.message);
    return false;
  }
}

// ---------- Group metadata with cache ----------
async function getGroupData(sock, chatId, senderId) {
  if (!chatId.endsWith('@g.us')) return null;

  const cached = getCachedGroup(chatId);
  if (cached) return cached;

  const metadata = await sock.groupMetadata(chatId).catch(() => null);
  if (!metadata) return null;

  const participants = metadata.participants.map(p => ({
    id: p.id,
    admin: p.admin
  }));

  const botNumber = jidToNumber(sock.user.id);
  const storedBotLid = getBotLid();

  let botParticipant = null;
  for (const p of participants) {
    if (jidToNumber(p.id) === botNumber) {
      botParticipant = p;
      break;
    }
    if (storedBotLid && p.id === storedBotLid) {
      botParticipant = p;
      break;
    }
  }

  const senderNumber = jidToNumber(senderId);
  const userParticipant = participants.find(p => jidToNumber(p.id) === senderNumber) || {};

  const data = {
    metadata,
    participants,
    isAdmin: userParticipant?.admin === 'admin' || userParticipant?.admin === 'superadmin',
    isBotAdmin: botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin',
    botParticipantId: botParticipant?.id || null
  };

  setCachedGroup(chatId, data);
  return data;
}

// ---------- Permission checks ----------
function isOwner(msg, config) {
  try {
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const senderNumber = jidToNumber(senderJid);
    if (!senderNumber) return false;
    const ownerNumbers = config.ownerNumber.split(',').map(n => n.trim().replace(/[^0-9]/g, ''));
    return ownerNumbers.includes(senderNumber);
  } catch {
    return false;
  }
}

function isSudoOrOwner(msg, config) {
  if (isOwner(msg, config)) return true;
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const senderNumber = jidToNumber(senderJid);
  return senderNumber ? isSudoUser(senderNumber) : false;
}

async function isBotAdmin(sock, groupJid) {
  if (!groupJid.endsWith('@g.us') || !sock.user?.id) return false;
  const data = await getGroupData(sock, groupJid, sock.user.id);
  return data?.isBotAdmin || false;
}

// ---------- Load all commands ----------
function loadCommands() {
  console.log(chalk.blue('[CMD] Loading commands...'));

  // ----- CORE -----
  commands.set('alive', {
    category: 'core',
    execute: async (sock, msg, args, config) => {
      const botNumber = jidToNumber(sock.user.id);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `✅ *${config.botName} is Online!*\n\n` +
              `📱 Number: ${botNumber}\n🔧 Prefix: ${config.prefix}\n` +
              `👤 Owner: ${config.ownerNumber.split(',')[0]}\n🎯 Version: ${config.version || '1.0.0'}`
      });
    }
  });

  commands.set('ping', {
    category: 'core',
    execute: async (sock, msg, args, config) => {
      const start = Date.now();
      const sent = await sock.sendMessage(msg.key.remoteJid, { text: '⏳ Pinging...' });
      const latency = Date.now() - start;
      await sock.sendMessage(msg.key.remoteJid, {
        text: `🏓 *Pong!*\n\n📊 Latency: ${latency}ms`,
        edit: sent.key
      });
    }
  });

  commands.set('owner', {
    category: 'core',
    execute: async (sock, msg, args, config) => {
      const ownerNumbers = config.ownerNumber.split(',').map(n => n.trim().replace(/[^0-9]/g, ''));
      const ownerJids = ownerNumbers.map(num => numberToLid(num));
      let text = `👑 *Owner Information*\n\nName: ${config.ownerName || 'Bot Owner'}\n`;
      ownerNumbers.forEach((num, i) => text += `${i === 0 ? 'Main' : 'Co-owner'}: +${num}\n`);
      await sock.sendMessage(msg.key.remoteJid, { text, mentions: ownerJids });
    }
  });

  commands.set('runtime', {
    category: 'core',
    execute: async (sock, msg, args, config) => {
      const uptime = process.uptime();
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `⏱️ *Bot Runtime*\n\n${days}d ${hours}h ${minutes}m ${seconds}s`
      });
    }
  });

  commands.set('speed', {
    category: 'core',
    execute: async (sock, msg, args, config) => {
      const start = Date.now();
      const sent = await sock.sendMessage(msg.key.remoteJid, { text: '⚡ Testing speed...' });
      const responseTime = Date.now() - start;
      await sock.sendMessage(msg.key.remoteJid, {
        text: `⚡ *Speed Test*\n\nResponse Time: ${responseTime}ms\nProcess Uptime: ${Math.floor(process.uptime())}s`,
        edit: sent.key
      });
    }
  });

  commands.set('menu', {
    category: 'core',
    execute: async (sock, msg, args, config) => {
      const menuImage = 'https://cdn.jsdelivr.net/gh/amanmohdtp/database@06959cbdefa02cea2c711cd7924982913e1fadcd/menu.png';
      const menuText = `*🤖 ${config.botName.toUpperCase()} MENU*

*🏷️ CORE*
.alive
.ping
.owner
.runtime
.speed
.menu

*👑 OWNER*
.mode
.addsudo
.delsudo
.listsudo
.broadcast
.block
.unblock
.join
.leave
.mylid

*👥 GROUP ADMIN*
.add
.kick
.promote
.demote
.tagall
.hidetag
.link
.revoke
.delete
.setname
.setdesc
.group
.mute
.unmute

*🛡️ PROTECTION*
.welcome
.goodbye
.antilink
.setwelcome
.setgoodbye

> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${config.botName} ʙᴏᴛ`;
      try {
        await sock.sendMessage(msg.key.remoteJid, { image: { url: menuImage }, caption: menuText });
      } catch {
        await sock.sendMessage(msg.key.remoteJid, { text: menuText });
      }
    }
  });

  // ----- OWNER -----
  commands.set('mode', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const mode = args[0]?.toLowerCase();
      if (!['public', 'private'].includes(mode)) {
        return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Usage: .mode public/private' });
      }
      const { setBotMode } = await import('./database.js');
      setBotMode(mode);
      await sock.sendMessage(msg.key.remoteJid, { text: `✅ Bot mode set to: *${mode}*` });
    }
  });

  commands.set('addsudo', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Please mention a user to add as sudo' });
      const num = storeLid(target);
      if (!num) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Could not extract user number' });
      const { addSudoUser } = await import('./database.js');
      const ok = addSudoUser(num);
      if (ok) lidCache.set(num, target);
      await sock.sendMessage(msg.key.remoteJid, {
        text: ok ? `✅ User +${num} added as sudo` : `❌ User already sudo`,
        mentions: [target]
      });
    }
  });

  commands.set('delsudo', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Please mention a user to remove from sudo' });
      const num = storeLid(target);
      if (!num) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Could not extract user number' });
      const { removeSudoUser } = await import('./database.js');
      const ok = removeSudoUser(num);
      await sock.sendMessage(msg.key.remoteJid, {
        text: ok ? `✅ User +${num} removed from sudo` : `❌ User is not sudo`,
        mentions: [target]
      });
    }
  });

  commands.set('listsudo', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const { getAllSudoUsers } = await import('./database.js');
      const list = getAllSudoUsers();
      if (!list.length) return await sock.sendMessage(msg.key.remoteJid, { text: '📋 No sudo users found' });
      const text = list.map((num, i) => `${i + 1}. +${num}`).join('\n');
      await sock.sendMessage(msg.key.remoteJid, { text: `👑 *Sudo Users*\n\n${text}` });
    }
  });

  commands.set('block', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      let target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target && args[0]) target = numberToLid(args[0].replace(/[^0-9]/g, ''));
      if (!target) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Mention user or provide number' });
      const num = storeLid(target);
      try {
        await sock.updateBlockStatus(target, 'block');
        await sock.sendMessage(msg.key.remoteJid, { text: `✅ Blocked user +${num}`, mentions: [target] });
      } catch (e) {
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to block: ${e.message}` });
      }
    }
  });

  commands.set('unblock', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      let target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target && args[0]) target = numberToLid(args[0].replace(/[^0-9]/g, ''));
      if (!target) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Mention user or provide number' });
      const num = storeLid(target);
      try {
        await sock.updateBlockStatus(target, 'unblock');
        await sock.sendMessage(msg.key.remoteJid, { text: `✅ Unblocked user +${num}`, mentions: [target] });
      } catch (e) {
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to unblock: ${e.message}` });
      }
    }
  });

  commands.set('join', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const code = args[0]?.replace(/https:\/\/chat\.whatsapp\.com\//gi, '');
      if (!code) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Provide group invite link' });
      try {
        const res = await sock.groupAcceptInvite(code);
        await sock.sendMessage(msg.key.remoteJid, { text: '✅ Joined group successfully' });
        if (res) clearCachedGroup(res);
      } catch (e) {
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to join: ${e.message}` });
      }
    }
  });

  commands.set('leave', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const jid = msg.key.remoteJid;
      if (!jid.endsWith('@g.us')) return await sock.sendMessage(jid, { text: '❌ This command only works in groups' });
      await sock.sendMessage(jid, { text: '👋 Goodbye!' });
      await sock.groupLeave(jid);
      clearCachedGroup(jid);
    }
  });

  commands.set('broadcast', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      if (!args.length) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Usage: .broadcast <message>' });
      const groups = await sock.groupFetchAllParticipating();
      const list = Object.keys(groups);
      let sent = 0;
      for (const jid of list) {
        try {
          await sock.sendMessage(jid, { text: `📢 *Broadcast Message*\n\n${args.join(' ')}` });
          sent++;
        } catch {}
      }
      await sock.sendMessage(msg.key.remoteJid, {
        text: `✅ Broadcast sent to ${sent}/${list.length} groups`
      });
    }
  });

  // ---------- BOT LID CAPTURE (hidden, self-deleting) ----------
  commands.set('mylid', {
    category: 'owner',
    ownerOnly: true,
    groupOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const groupData = await getGroupData(sock, groupJid, sock.user.id);
      if (!groupData?.botParticipantId) {
        return await sock.sendMessage(groupJid, { text: '❌ Bot not found in participants' });
      }

      const botLid = groupData.botParticipantId;
      setBotLid(botLid);
      storeLid(botLid);
      console.log(chalk.green(`[LID] Stored: ${botLid}`));

      // Delete command and its response
      const sent = await sock.sendMessage(groupJid, { text: '✅ Bot LID stored successfully' });
      await sock.sendMessage(groupJid, { delete: msg.key });
      setTimeout(() => sock.sendMessage(groupJid, { delete: sent.key }), 1000);
    }
  });

  // ----- ADMIN -----
  const adminCmd = {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    botAdminRequired: true,
    execute: async (sock, msg, args, config) => {
      // implemented per command
    }
  };

  commands.set('add', {
    ...adminCmd,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNumber = jidToNumber(senderJid);
      if (!args.length) return await sock.sendMessage(groupJid, { text: '❌ Usage: .add 1234567890' });
      const num = args[0].replace(/[^0-9]/g, '');
      const userJid = `${num}@s.whatsapp.net`;
      try {
        await sock.groupParticipantsUpdate(groupJid, [userJid], 'add');
        console.log(chalk.green(`[ADD] By +${senderNumber} (${senderJid})`));
        await sock.sendMessage(groupJid, { text: `✅ Added +${num} by +${senderNumber}`, mentions: [userJid] });
      } catch (e) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to add: ${e.message}` });
      }
    }
  });

  commands.set('kick', {
    ...adminCmd,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNumber = jidToNumber(senderJid);
      const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target) return await sock.sendMessage(groupJid, { text: '❌ Please mention a user to kick' });
      const num = storeLid(target);
      try {
        await sock.groupParticipantsUpdate(groupJid, [target], 'remove');
        console.log(chalk.green(`[KICK] +${num} by +${senderNumber} (${senderJid})`));
        await sock.sendMessage(groupJid, { text: `✅ Kicked +${num} by +${senderNumber}`, mentions: [target] });
      } catch (e) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to kick: ${e.message}` });
      }
    }
  });

  commands.set('promote', {
    ...adminCmd,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNumber = jidToNumber(senderJid);
      const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target) return await sock.sendMessage(groupJid, { text: '❌ Please mention a user to promote' });
      const num = storeLid(target);
      try {
        await sock.groupParticipantsUpdate(groupJid, [target], 'promote');
        console.log(chalk.green(`[PROMOTE] +${num} by +${senderNumber} (${senderJid})`));
        await sock.sendMessage(groupJid, { text: `✅ Promoted +${num} to admin by +${senderNumber}`, mentions: [target] });
      } catch (e) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to promote: ${e.message}` });
      }
    }
  });

  commands.set('demote', {
    ...adminCmd,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNumber = jidToNumber(senderJid);
      const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target) return await sock.sendMessage(groupJid, { text: '❌ Please mention a user to demote' });
      const num = storeLid(target);
      try {
        await sock.groupParticipantsUpdate(groupJid, [target], 'demote');
        console.log(chalk.green(`[DEMOTE] +${num} by +${senderNumber} (${senderJid})`));
        await sock.sendMessage(groupJid, { text: `✅ Demoted +${num} from admin by +${senderNumber}`, mentions: [target] });
      } catch (e) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to demote: ${e.message}` });
      }
    }
  });

  commands.set('tagall', {
    ...adminCmd,
    botAdminRequired: false,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const data = await getGroupData(sock, groupJid, sock.user.id);
      if (!data) return;
      const message = args.join(' ') || 'Attention everyone!';
      const mentions = data.participants.map(p => { storeLid(p.id); return p.id; });
      const MAX_LENGTH = 4000;
      let currentText = `📢 *Tag All*\n\n${message}\n\n`;
      let currentMentions = [];
      for (let i = 0; i < data.participants.length; i++) {
        const p = data.participants[i];
        const num = jidToNumber(p.id);
        const line = `${i + 1}. @${num}\n`;
        if ((currentText + line).length > MAX_LENGTH) {
          await sock.sendMessage(groupJid, { text: currentText, mentions: currentMentions });
          await new Promise(resolve => setTimeout(resolve, 1000));
          currentText = '';
          currentMentions = [];
        }
        currentText += line;
        currentMentions.push(p.id);
      }
      if (currentText.trim()) {
        await sock.sendMessage(groupJid, { text: currentText, mentions: currentMentions });
      }
    }
  });

  commands.set('hidetag', {
    ...adminCmd,
    botAdminRequired: false,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const data = await getGroupData(sock, groupJid, sock.user.id);
      if (!data) return;
      const mentions = data.participants.map(p => { storeLid(p.id); return p.id; });
      const message = args.join(' ') || 'Hidden tag message';
      await sock.sendMessage(groupJid, { text: message, mentions });
    }
  });

  commands.set('link', {
    ...adminCmd,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      try {
        const code = await sock.groupInviteCode(groupJid);
        await sock.sendMessage(groupJid, {
          text: `🔗 *Group Invite Link*\n\nhttps://chat.whatsapp.com/${code}`
        });
      } catch (e) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to get link: ${e.message}` });
      }
    }
  });

  commands.set('revoke', {
    ...adminCmd,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      try {
        await sock.groupRevokeInvite(groupJid);
        await sock.sendMessage(groupJid, { text: '✅ Group link revoked successfully' });
      } catch (e) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to revoke: ${e.message}` });
      }
    }
  });

  commands.set('delete', {
    ...adminCmd,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const quoted = msg.message?.extendedTextMessage?.contextInfo;
      if (!quoted) return await sock.sendMessage(groupJid, { text: '❌ Please reply to a message to delete it' });
      try {
        await sock.sendMessage(groupJid, {
          delete: { remoteJid: groupJid, fromMe: false, id: quoted.stanzaId, participant: quoted.participant }
        });
      } catch (e) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to delete: ${e.message}` });
      }
    }
  });

  commands.set('setname', {
    ...adminCmd,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      if (!args.length) return await sock.sendMessage(groupJid, { text: '❌ Usage: .setname <new name>' });
      const newName = args.join(' ');
      try {
        await sock.groupUpdateSubject(groupJid, newName);
        await sock.sendMessage(groupJid, { text: `✅ Group name updated to: ${newName}` });
      } catch (e) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to update: ${e.message}` });
      }
    }
  });

  commands.set('setdesc', {
    ...adminCmd,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      if (!args.length) return await sock.sendMessage(groupJid, { text: '❌ Usage: .setdesc <new description>' });
      const newDesc = args.join(' ');
      try {
        await sock.groupUpdateDescription(groupJid, newDesc);
        await sock.sendMessage(groupJid, { text: '✅ Group description updated' });
      } catch (e) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to update: ${e.message}` });
      }
    }
  });

  commands.set('group', {
    ...adminCmd,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNumber = jidToNumber(senderJid);
      const act = args[0]?.toLowerCase();
      if (!['open', 'close'].includes(act)) {
        return await sock.sendMessage(groupJid, { text: '❌ Usage: .group open/close' });
      }
      try {
        await sock.groupSettingUpdate(groupJid, act === 'close' ? 'announcement' : 'not_announcement');
        console.log(chalk.green(`[GROUP] ${act} by +${senderNumber} (${senderJid})`));
        await sock.sendMessage(groupJid, { text: `✅ Group ${act === 'close' ? 'closed' : 'opened'} by +${senderNumber}` });
      } catch (e) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to update: ${e.message}` });
      }
    }
  });

  commands.set('mute', {
    ...adminCmd,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNumber = jidToNumber(senderJid);
      try {
        await sock.groupSettingUpdate(groupJid, 'announcement');
        console.log(chalk.green(`[MUTE] By +${senderNumber} (${senderJid})`));
        await sock.sendMessage(groupJid, { text: `🔇 Group muted by +${senderNumber} - Only admins can send messages` });
      } catch (e) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to mute: ${e.message}` });
      }
    }
  });

  commands.set('unmute', {
    ...adminCmd,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNumber = jidToNumber(senderJid);
      try {
        await sock.groupSettingUpdate(groupJid, 'not_announcement');
        console.log(chalk.green(`[UNMUTE] By +${senderNumber} (${senderJid})`));
        await sock.sendMessage(groupJid, { text: `🔊 Group unmuted by +${senderNumber} - Everyone can send messages` });
      } catch (e) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to unmute: ${e.message}` });
      }
    }
  });

  // ----- PROTECTION -----
  commands.set('welcome', {
    category: 'protection',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const act = args[0]?.toLowerCase();
      if (!['on', 'off'].includes(act)) return await sock.sendMessage(groupJid, { text: '❌ Usage: .welcome on/off' });
      const settings = getGroupSettings(groupJid);
      settings.welcome = act === 'on';
      setGroupSettings(groupJid, settings);
      await sock.sendMessage(groupJid, { text: `✅ Welcome message ${act === 'on' ? 'enabled' : 'disabled'}` });
    }
  });

  commands.set('goodbye', {
    category: 'protection',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const act = args[0]?.toLowerCase();
      if (!['on', 'off'].includes(act)) return await sock.sendMessage(groupJid, { text: '❌ Usage: .goodbye on/off' });
      const settings = getGroupSettings(groupJid);
      settings.goodbye = act === 'on';
      setGroupSettings(groupJid, settings);
      await sock.sendMessage(groupJid, { text: `✅ Goodbye message ${act === 'on' ? 'enabled' : 'disabled'}` });
    }
  });

  commands.set('antilink', {
    category: 'protection',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const act = args[0]?.toLowerCase();
      if (!['on', 'off'].includes(act)) return await sock.sendMessage(groupJid, { text: '❌ Usage: .antilink on/off' });
      const settings = getGroupSettings(groupJid);
      settings.antilink = act === 'on';
      setGroupSettings(groupJid, settings);
      await sock.sendMessage(groupJid, { text: `✅ Antilink ${act === 'on' ? 'enabled' : 'disabled'}` });
    }
  });

  commands.set('setwelcome', {
    category: 'protection',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      if (!args.length) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Usage: .setwelcome <message>\n\nVariables:\n{user} - User mention\n{group} - Group name\n{count} - Member count'
        });
      }
      const message = args.join(' ');
      setWelcomeMessage(groupJid, message);
      await sock.sendMessage(groupJid, { text: `✅ Welcome message set to:\n\n${message}` });
    }
  });

  commands.set('setgoodbye', {
    category: 'protection',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      if (!args.length) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Usage: .setgoodbye <message>\n\nVariables:\n{user} - User mention\n{group} - Group name'
        });
      }
      const message = args.join(' ');
      setGoodbyeMessage(groupJid, message);
      await sock.sendMessage(groupJid, { text: `✅ Goodbye message set to:\n\n${message}` });
    }
  });

  console.log(chalk.green(`[CMD] Loaded ${commands.size} commands`));
}

// ---------- Main message handler ----------
export async function handleMessage(sock, msg, config) {
  try {
    if (commands.size === 0) loadCommands();

    const senderJid = msg.key.participant || msg.key.remoteJid;
    const senderNumber = jidToNumber(senderJid);
    const groupJid = msg.key.remoteJid;

    storeLid(senderJid);
    console.log(chalk.green(`[CMD] ${msg.message?.conversation?.split(' ')[0] || 'cmd'} from +${senderNumber}`));

    const body = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      ''
    ).trim();

    if (!body.startsWith(config.prefix)) return;
    const args = body.slice(config.prefix.length).trim().split(/ +/);
    const cmdName = args.shift().toLowerCase();
    const cmd = commands.get(cmdName);
    if (!cmd) return;

    // Permission checks
    if (cmd.ownerOnly && !isSudoOrOwner(msg, config))
      return await sock.sendMessage(groupJid, { text: '❌ Owner only command', quoted: msg });

    if (cmd.groupOnly && !groupJid.endsWith('@g.us'))
      return await sock.sendMessage(groupJid, { text: '❌ Group only command', quoted: msg });

    if (cmd.adminOnly && groupJid.endsWith('@g.us')) {
      const data = await getGroupData(sock, groupJid, senderJid);
      if (!data?.isAdmin && !isSudoOrOwner(msg, config))
        return await sock.sendMessage(groupJid, { text: '❌ Admin only command', quoted: msg });
    }

    if (cmd.botAdminRequired && groupJid.endsWith('@g.us')) {
      const data = await getGroupData(sock, groupJid, sock.user.id);
      if (!data?.isBotAdmin)
        return await sock.sendMessage(groupJid, { text: '❌ Bot needs to be admin to execute this command', quoted: msg });
    }

    await cmd.execute(sock, msg, args, config);
  } catch (e) {
    console.error(chalk.red('[CMD ERR]'), e.message);
  }
}

// ---------- Group events (welcome/goodbye, auto‑add, cache invalidation) ----------
export async function handleGroupUpdate(sock, update, config) {
  try {
    const { id: groupJid, participants, action } = update;
    if (!groupJid || !participants?.length) return;

    // Invalidate cache on participant changes
    clearCachedGroup(groupJid);

    const settings = getGroupSettings(groupJid);
    const metadata = await sock.groupMetadata(groupJid).catch(() => null);
    if (!metadata) return;

    // Auto‑add (if configured)
    const { getAutoAddGroup } = await import('./database.js');
    const autoGroup = getAutoAddGroup();
    if (action === 'add' && autoGroup && groupJid !== autoGroup) {
      for (const p of participants) {
        try { await sock.groupParticipantsUpdate(autoGroup, [p], 'add'); } catch {}
      }
    }

    // Welcome message
    if (action === 'add' && settings.welcome) {
      const msg = getWelcomeMessage(groupJid);
      for (const p of participants) {
        storeLid(p);
        const num = jidToNumber(p);
        const text = msg
          .replace(/{user}/g, `@${num}`)
          .replace(/{group}/g, metadata.subject)
          .replace(/{count}/g, metadata.participants.length);
        await sock.sendMessage(groupJid, { text, mentions: [p] });
      }
    }

    // Goodbye message
    if (action === 'remove' && settings.goodbye) {
      const msg = getGoodbyeMessage(groupJid);
      for (const p of participants) {
        storeLid(p);
        const num = jidToNumber(p);
        const text = msg
          .replace(/{user}/g, `@${num}`)
          .replace(/{group}/g, metadata.subject);
        await sock.sendMessage(groupJid, { text, mentions: [p] });
      }
    }
  } catch (e) {
    console.error(chalk.red('[GROUP ERR]'), e.message);
  }
}

export { lidCache, jidToNumber, numberToLid, storeLid, clearCachedGroup };