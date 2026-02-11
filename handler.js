import chalk from 'chalk';
import { jidDecode } from '@whiskeysockets/baileys';
import {
  getGroupSettings,
  isSudoUser,
  getBotMode,
  setGroupSettings,
  getWelcomeMessage,
  setWelcomeMessage,
  getGoodbyeMessage,
  setGoodbyeMessage
} from './database.js';
import { getGroupDataForPlugin, clearGroupCache } from './adminCache.js';

const commands = new Map();
const cooldowns = new Map();
const lidCache = new Map();

function jidToNumber(jid) {
  if (!jid) return null;
  try {
    if (typeof jid === 'string' && /^\d+$/.test(jid)) return jid;
    const jidString = String(jid);
    if (jidString.includes('@lid')) {
      const numberPart = jidString.split('@')[0];
      if (numberPart && /^\d+$/.test(numberPart)) return numberPart;
    }
    if (jidString.includes('@s.whatsapp.net')) {
      const userPart = jidString.split('@')[0];
      const numberPart = userPart.split(':')[0];
      if (numberPart && /^\d+$/.test(numberPart)) return numberPart;
    }
    if (jidString.includes('@g.us')) return jidString;
    try {
      const decoded = jidDecode(jidString);
      if (decoded?.user) return decoded.user;
    } catch (e) {}
    const numbers = jidString.match(/\d+/g);
    if (numbers?.length) return numbers.join('');
    return null;
  } catch {
    return null;
  }
}

function normalizeJid(jid) {
  if (!jid) return null;
  try {
    const number = jidToNumber(jid);
    if (!number) return jid;
    if (jid.includes('@g.us')) return jid;
    return `${number}@s.whatsapp.net`;
  } catch {
    return jid;
  }
}

function storeLid(jid) {
  if (!jid) return null;
  try {
    const number = jidToNumber(jid);
    if (number) {
      lidCache.set(number, jid);
      if (jid.includes('@lid')) lidCache.set(`lid:${number}`, jid);
      return number;
    }
    return null;
  } catch {
    return null;
  }
}

function numberToLid(number) {
  if (!number) return null;
  try {
    if (number.includes('@')) return number;
    const cachedLid = lidCache.get(number);
    if (cachedLid) return cachedLid;
    const lidKey = `lid:${number}`;
    if (lidCache.has(lidKey)) return lidCache.get(lidKey);
    return `${number}@s.whatsapp.net`;
  } catch {
    return `${number}@s.whatsapp.net`;
  }
}

export async function initializeLidCache(sock, config) {
  console.log(chalk.blue('[LID-CACHE] Initializing cache...'));
  try {
    if (sock.user?.id) {
      const botNumber = storeLid(sock.user.id);
      if (botNumber) {
        console.log(chalk.green(`[LID-CACHE] Bot number: ${botNumber}`));
        console.log(chalk.green(`[LID-CACHE] Bot JID: ${sock.user.id}`));
      } else {
        console.log(chalk.red(`[LID-CACHE] Failed to extract bot number from: ${sock.user.id}`));
      }
    }
    const ownerNumbers = config.ownerNumber.split(',').map(n => {
      const clean = n.trim().replace(/[^0-9]/g, '');
      if (clean && !lidCache.has(clean)) lidCache.set(clean, `${clean}@s.whatsapp.net`);
      return clean;
    });
    console.log(chalk.cyan(`[LID-CACHE] Owner numbers cached: ${ownerNumbers.filter(Boolean).join(', ')}`));
    return true;
  } catch (error) {
    console.error(chalk.red('[LID-CACHE INIT ERROR]'), error.message);
    return false;
  }
}

async function updateLidFromGroup(sock, groupJid) {
  try {
    if (!groupJid || typeof groupJid !== 'string' || !sock.groupMetadata) return;
    const groupMetadata = await sock.groupMetadata(groupJid);
    for (const participant of groupMetadata.participants) {
      if (participant.id) storeLid(participant.id);
    }
  } catch {}
}

function isOwner(msg, config) {
  try {
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const senderNumber = jidToNumber(senderJid);
    if (!senderNumber) return false;
    const ownerNumbers = config.ownerNumber.split(',').map(n => n.trim().replace(/[^0-9]/g, ''));
    const result = ownerNumbers.includes(senderNumber);
    if (senderJid) storeLid(senderJid);
    return result;
  } catch {
    return false;
  }
}

function isSudoOrOwner(msg, config) {
  try {
    if (isOwner(msg, config)) return true;
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const senderNumber = jidToNumber(senderJid);
    if (!senderNumber) return false;
    if (senderJid) storeLid(senderJid);
    return isSudoUser(senderNumber);
  } catch {
    return false;
  }
}

async function isAdmin(sock, groupJid, userJid) {
  try {
    if (!groupJid?.endsWith('@g.us')) return false;
    const groupMetadata = await sock.groupMetadata(groupJid);
    const userNumber = jidToNumber(userJid);
    if (!userNumber) return false;
    for (const participant of groupMetadata.participants) {
      if (jidToNumber(participant.id) === userNumber) {
        return participant.admin === 'admin' || participant.admin === 'superadmin';
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function isBotAdmin(sock, groupJid) {
  try {
    if (!groupJid?.endsWith('@g.us') || !sock.user?.id) return false;
    const groupData = await getGroupDataForPlugin(sock, groupJid, sock.user.id);
    return groupData.isBotAdmin;
  } catch {
    return false;
  }
}

function loadCommands() {
  console.log(chalk.blue('[COMMANDS] Loading commands...'));

  // Core
  commands.set('alive', {
    category: 'core',
    execute: async (sock, msg, args, config) => {
      const botNumber = jidToNumber(sock.user.id);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `✅ *${config.botName} is Online!*\n\n` +
              `📱 Number: ${botNumber}\n🔧 Prefix: ${config.prefix}\n` +
              `👤 Owner: ${config.ownerNumber.split(',')[0]}\n🎯 Version: ${config.version}`
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
      let text = `👑 *Owner Information*\n\nName: ${config.ownerName}\n`;
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

  // Owner
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
      const targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!targetJid) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Please mention a user to add as sudo' });
      const targetNumber = storeLid(targetJid);
      if (!targetNumber) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Could not extract user number' });
      const { addSudoUser } = await import('./database.js');
      const success = addSudoUser(targetNumber);
      if (success) lidCache.set(targetNumber, targetJid);
      await sock.sendMessage(msg.key.remoteJid, {
        text: success ? `✅ User +${targetNumber} added as sudo` : `❌ User already sudo`,
        mentions: [targetJid]
      });
    }
  });

  commands.set('delsudo', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!targetJid) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Please mention a user to remove from sudo' });
      const targetNumber = storeLid(targetJid);
      if (!targetNumber) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Could not extract user number' });
      const { removeSudoUser } = await import('./database.js');
      const success = removeSudoUser(targetNumber);
      await sock.sendMessage(msg.key.remoteJid, {
        text: success ? `✅ User +${targetNumber} removed from sudo` : `❌ User is not sudo`,
        mentions: [targetJid]
      });
    }
  });

  commands.set('listsudo', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const { getAllSudoUsers } = await import('./database.js');
      const sudoNumbers = getAllSudoUsers();
      if (!sudoNumbers.length) return await sock.sendMessage(msg.key.remoteJid, { text: '📋 No sudo users found' });
      const list = sudoNumbers.map((num, i) => `${i + 1}. +${num}`).join('\n');
      await sock.sendMessage(msg.key.remoteJid, { text: `👑 *Sudo Users*\n\n${list}` });
    }
  });

  commands.set('block', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      let targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!targetJid && args[0]) targetJid = numberToLid(args[0].replace(/[^0-9]/g, ''));
      if (!targetJid) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Mention user or provide number' });
      const targetNumber = storeLid(targetJid);
      try {
        await sock.updateBlockStatus(targetJid, 'block');
        await sock.sendMessage(msg.key.remoteJid, { text: `✅ Blocked user +${targetNumber}`, mentions: [targetJid] });
      } catch (error) {
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to block: ${error.message}` });
      }
    }
  });

  commands.set('unblock', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      let targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!targetJid && args[0]) targetJid = numberToLid(args[0].replace(/[^0-9]/g, ''));
      if (!targetJid) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Mention user or provide number' });
      const targetNumber = storeLid(targetJid);
      try {
        await sock.updateBlockStatus(targetJid, 'unblock');
        await sock.sendMessage(msg.key.remoteJid, { text: `✅ Unblocked user +${targetNumber}`, mentions: [targetJid] });
      } catch (error) {
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to unblock: ${error.message}` });
      }
    }
  });

  commands.set('join', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const inviteCode = args[0]?.replace(/https:\/\/chat\.whatsapp\.com\//gi, '');
      if (!inviteCode) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Provide group invite link' });
      try {
        const joinResult = await sock.groupAcceptInvite(inviteCode);
        await sock.sendMessage(msg.key.remoteJid, { text: `✅ Joined group successfully` });
        if (joinResult) await updateLidFromGroup(sock, joinResult);
      } catch (error) {
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to join: ${error.message}` });
      }
    }
  });

  commands.set('leave', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      if (!groupJid.endsWith('@g.us')) return await sock.sendMessage(groupJid, { text: '❌ This command only works in groups' });
      await sock.sendMessage(groupJid, { text: '👋 Goodbye!' });
      await sock.groupLeave(groupJid);
    }
  });

  commands.set('broadcast', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      if (!args.length) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Usage: .broadcast <message>' });
      const broadcastMsg = args.join(' ');
      const groups = await sock.groupFetchAllParticipating();
      const groupJids = Object.keys(groups);
      let success = 0;
      for (const jid of groupJids) {
        try {
          await sock.sendMessage(jid, { text: `📢 *Broadcast Message*\n\n${broadcastMsg}` });
          success++;
        } catch {}
      }
      await sock.sendMessage(msg.key.remoteJid, {
        text: `✅ Broadcast sent to ${success}/${groupJids.length} groups`
      });
    }
  });

  // Admin
  commands.set('add', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    botAdminRequired: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNumber = jidToNumber(senderJid);
      if (!args.length) return await sock.sendMessage(groupJid, { text: '❌ Usage: .add 1234567890' });
      const number = args[0].replace(/[^0-9]/g, '');
      const userJid = `${number}@s.whatsapp.net`;
      try {
        await sock.groupParticipantsUpdate(groupJid, [userJid], 'add');
        console.log(chalk.green(`[ADD] By +${senderNumber} (${senderJid})`));
        await sock.sendMessage(groupJid, { text: `✅ Added +${number} by +${senderNumber}`, mentions: [userJid] });
      } catch (error) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to add: ${error.message}` });
      }
    }
  });

  commands.set('kick', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    botAdminRequired: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNumber = jidToNumber(senderJid);
      const targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!targetJid) return await sock.sendMessage(groupJid, { text: '❌ Please mention a user to kick' });
      const targetNumber = storeLid(targetJid);
      try {
        await sock.groupParticipantsUpdate(groupJid, [targetJid], 'remove');
        console.log(chalk.green(`[KICK] +${targetNumber} by +${senderNumber} (${senderJid})`));
        await sock.sendMessage(groupJid, { text: `✅ Kicked +${targetNumber} by +${senderNumber}`, mentions: [targetJid] });
      } catch (error) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to kick: ${error.message}` });
      }
    }
  });

  commands.set('promote', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    botAdminRequired: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNumber = jidToNumber(senderJid);
      const targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!targetJid) return await sock.sendMessage(groupJid, { text: '❌ Please mention a user to promote' });
      const targetNumber = storeLid(targetJid);
      try {
        await sock.groupParticipantsUpdate(groupJid, [targetJid], 'promote');
        console.log(chalk.green(`[PROMOTE] +${targetNumber} by +${senderNumber} (${senderJid})`));
        await sock.sendMessage(groupJid, { text: `✅ Promoted +${targetNumber} to admin by +${senderNumber}`, mentions: [targetJid] });
      } catch (error) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to promote: ${error.message}` });
      }
    }
  });

  commands.set('demote', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    botAdminRequired: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNumber = jidToNumber(senderJid);
      const targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!targetJid) return await sock.sendMessage(groupJid, { text: '❌ Please mention a user to demote' });
      const targetNumber = storeLid(targetJid);
      try {
        await sock.groupParticipantsUpdate(groupJid, [targetJid], 'demote');
        console.log(chalk.green(`[DEMOTE] +${targetNumber} by +${senderNumber} (${senderJid})`));
        await sock.sendMessage(groupJid, { text: `✅ Demoted +${targetNumber} from admin by +${senderNumber}`, mentions: [targetJid] });
      } catch (error) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to demote: ${error.message}` });
      }
    }
  });

  commands.set('tagall', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      try {
        const groupMetadata = await sock.groupMetadata(groupJid);
        const participants = groupMetadata.participants;
        const message = args.join(' ') || 'Attention everyone!';
        const mentions = participants.map(p => { storeLid(p.id); return p.id; });
        const MAX_LENGTH = 4000;
        let currentText = `📢 *Tag All*\n\n${message}\n\n`;
        let currentMentions = [];
        for (let i = 0; i < participants.length; i++) {
          const p = participants[i];
          const number = jidToNumber(p.id);
          const line = `${i + 1}. @${number}\n`;
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
      } catch (error) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to tag all: ${error.message}` });
      }
    }
  });

  commands.set('hidetag', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      try {
        const groupMetadata = await sock.groupMetadata(groupJid);
        const participants = groupMetadata.participants;
        const mentions = participants.map(p => { storeLid(p.id); return p.id; });
        const message = args.join(' ') || 'Hidden tag message';
        await sock.sendMessage(groupJid, { text: message, mentions });
      } catch (error) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to send: ${error.message}` });
      }
    }
  });

  commands.set('link', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    botAdminRequired: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      try {
        const inviteCode = await sock.groupInviteCode(groupJid);
        await sock.sendMessage(groupJid, {
          text: `🔗 *Group Invite Link*\n\nhttps://chat.whatsapp.com/${inviteCode}`
        });
      } catch (error) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to get link: ${error.message}` });
      }
    }
  });

  commands.set('revoke', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    botAdminRequired: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      try {
        await sock.groupRevokeInvite(groupJid);
        await sock.sendMessage(groupJid, { text: `✅ Group link revoked successfully` });
      } catch (error) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to revoke: ${error.message}` });
      }
    }
  });

  commands.set('delete', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    botAdminRequired: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
      if (!quotedMsg) return await sock.sendMessage(groupJid, { text: '❌ Please reply to a message to delete it' });
      try {
        await sock.sendMessage(groupJid, {
          delete: {
            remoteJid: groupJid,
            fromMe: false,
            id: quotedMsg.stanzaId,
            participant: quotedMsg.participant
          }
        });
      } catch (error) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to delete: ${error.message}` });
      }
    }
  });

  commands.set('setname', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    botAdminRequired: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      if (!args.length) return await sock.sendMessage(groupJid, { text: '❌ Usage: .setname <new name>' });
      const newName = args.join(' ');
      try {
        await sock.groupUpdateSubject(groupJid, newName);
        await sock.sendMessage(groupJid, { text: `✅ Group name updated to: ${newName}` });
      } catch (error) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to update: ${error.message}` });
      }
    }
  });

  commands.set('setdesc', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    botAdminRequired: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      if (!args.length) return await sock.sendMessage(groupJid, { text: '❌ Usage: .setdesc <new description>' });
      const newDesc = args.join(' ');
      try {
        await sock.groupUpdateDescription(groupJid, newDesc);
        await sock.sendMessage(groupJid, { text: `✅ Group description updated` });
      } catch (error) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to update: ${error.message}` });
      }
    }
  });

  commands.set('group', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    botAdminRequired: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNumber = jidToNumber(senderJid);
      const action = args[0]?.toLowerCase();
      if (!['open', 'close'].includes(action)) {
        return await sock.sendMessage(groupJid, { text: '❌ Usage: .group open/close' });
      }
      try {
        await sock.groupSettingUpdate(groupJid, action === 'close' ? 'announcement' : 'not_announcement');
        console.log(chalk.green(`[GROUP] ${action} by +${senderNumber} (${senderJid})`));
        await sock.sendMessage(groupJid, { text: `✅ Group ${action === 'close' ? 'closed' : 'opened'} by +${senderNumber}` });
      } catch (error) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to update: ${error.message}` });
      }
    }
  });

  commands.set('mute', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    botAdminRequired: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNumber = jidToNumber(senderJid);
      try {
        await sock.groupSettingUpdate(groupJid, 'announcement');
        console.log(chalk.green(`[MUTE] By +${senderNumber} (${senderJid})`));
        await sock.sendMessage(groupJid, { text: `🔇 Group muted by +${senderNumber} - Only admins can send messages` });
      } catch (error) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to mute: ${error.message}` });
      }
    }
  });

  commands.set('unmute', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    botAdminRequired: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNumber = jidToNumber(senderJid);
      try {
        await sock.groupSettingUpdate(groupJid, 'not_announcement');
        console.log(chalk.green(`[UNMUTE] By +${senderNumber} (${senderJid})`));
        await sock.sendMessage(groupJid, { text: `🔊 Group unmuted by +${senderNumber} - Everyone can send messages` });
      } catch (error) {
        await sock.sendMessage(groupJid, { text: `❌ Failed to unmute: ${error.message}` });
      }
    }
  });

  // Protection
  commands.set('welcome', {
    category: 'protection',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const action = args[0]?.toLowerCase();
      if (!['on', 'off'].includes(action)) return await sock.sendMessage(groupJid, { text: '❌ Usage: .welcome on/off' });
      const settings = getGroupSettings(groupJid);
      settings.welcome = action === 'on';
      setGroupSettings(groupJid, settings);
      await sock.sendMessage(groupJid, { text: `✅ Welcome message ${action === 'on' ? 'enabled' : 'disabled'}` });
    }
  });

  commands.set('goodbye', {
    category: 'protection',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const action = args[0]?.toLowerCase();
      if (!['on', 'off'].includes(action)) return await sock.sendMessage(groupJid, { text: '❌ Usage: .goodbye on/off' });
      const settings = getGroupSettings(groupJid);
      settings.goodbye = action === 'on';
      setGroupSettings(groupJid, settings);
      await sock.sendMessage(groupJid, { text: `✅ Goodbye message ${action === 'on' ? 'enabled' : 'disabled'}` });
    }
  });

  commands.set('antilink', {
    category: 'protection',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const action = args[0]?.toLowerCase();
      if (!['on', 'off'].includes(action)) return await sock.sendMessage(groupJid, { text: '❌ Usage: .antilink on/off' });
      const settings = getGroupSettings(groupJid);
      settings.antilink = action === 'on';
      setGroupSettings(groupJid, settings);
      await sock.sendMessage(groupJid, { text: `✅ Antilink ${action === 'on' ? 'enabled' : 'disabled'}` });
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

  // Menu
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

  console.log(chalk.green(`[COMMANDS] Loaded ${commands.size} commands`));
}

export async function handleMessage(sock, msg, config) {
  try {
    const body = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      ''
    ).trim();
    if (!body.startsWith(config.prefix)) return;

    const args = body.slice(config.prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    if (commands.size === 0) loadCommands();
    const command = commands.get(commandName);
    if (!command) return;

    const senderJid = msg.key.participant || msg.key.remoteJid;
    const senderNumber = jidToNumber(senderJid);
    const groupJid = msg.key.remoteJid;

    if (senderJid) storeLid(senderJid);
    console.log(chalk.green(`[COMMAND] ${commandName} by +${senderNumber || 'unknown'} (${senderJid})`));

    if (groupJid.endsWith('@g.us')) await updateLidFromGroup(sock, groupJid);

    if (command.ownerOnly && !isSudoOrOwner(msg, config)) {
      return await sock.sendMessage(groupJid, { text: '❌ Owner only command', quoted: msg });
    }

    if (command.adminOnly && groupJid.endsWith('@g.us')) {
      const userIsAdmin = await isAdmin(sock, groupJid, senderJid);
      if (!userIsAdmin && !isSudoOrOwner(msg, config)) {
        return await sock.sendMessage(groupJid, { text: '❌ Admin only command', quoted: msg });
      }
    }

    if (command.groupOnly && !groupJid.endsWith('@g.us')) {
      return await sock.sendMessage(groupJid, { text: '❌ Group only command', quoted: msg });
    }

    if (command.botAdminRequired && groupJid.endsWith('@g.us')) {
      const botAdmin = await isBotAdmin(sock, groupJid);
      if (!botAdmin) {
        return await sock.sendMessage(groupJid, { text: '❌ Bot needs to be admin to execute this command', quoted: msg });
      }
    }

    try {
      await command.execute(sock, msg, args, config);
    } catch (error) {
      console.error(chalk.red(`[COMMAND ERROR] ${commandName}:`), error.message);
      await sock.sendMessage(groupJid, { text: `❌ Command Error: ${error.message}`, quoted: msg });
    }
  } catch (error) {
    console.error(chalk.red('[handleMessage ERROR]'), error.message);
  }
}

export async function handleGroupUpdate(sock, update, config) {
  try {
    if (!update?.id) return;
    const { id: groupJid, participants = [], action } = update;
    if (!groupJid || typeof groupJid !== 'string') return;

    console.log(chalk.blue(`[GROUP UPDATE] ${action || 'unknown'} in ${groupJid}`));
    await updateLidFromGroup(sock, groupJid);
    const settings = getGroupSettings(groupJid);
    const groupMetadata = await sock.groupMetadata(groupJid).catch(() => null);
    if (!groupMetadata) return;

    // Detect if bot itself was added
    if (action === 'add' && sock.user?.id) {
      const botNumber = jidToNumber(sock.user.id);
      for (const participant of participants) {
        if (participant && jidToNumber(participant) === botNumber) {
          console.log(chalk.green(`[BOT] Bot added to group ${groupJid}`));
          clearGroupCache(groupJid); // Force refresh of admin status
          break;
        }
      }
    }

    const { getAutoAddGroup } = await import('./database.js');
    const autoAddGroupJid = getAutoAddGroup();

    if (action === 'add' && autoAddGroupJid && groupJid !== autoAddGroupJid) {
      for (const participant of participants) {
        if (participant) {
          storeLid(participant);
          try {
            await sock.groupParticipantsUpdate(autoAddGroupJid, [participant], 'add');
          } catch {}
        }
      }
    }

    if (action === 'add' && settings.welcome) {
      const welcomeMsg = getWelcomeMessage(groupJid);
      for (const participant of participants) {
        if (participant) {
          storeLid(participant);
          const userName = jidToNumber(participant);
          const message = welcomeMsg
            .replace(/{user}/g, `@${userName}`)
            .replace(/{group}/g, groupMetadata.subject)
            .replace(/{count}/g, groupMetadata.participants.length);
          await sock.sendMessage(groupJid, { text: message, mentions: [participant] });
        }
      }
    }

    if (action === 'remove' && settings.goodbye) {
      const goodbyeMsg = getGoodbyeMessage(groupJid);
      for (const participant of participants) {
        if (participant) {
          storeLid(participant);
          const userName = jidToNumber(participant);
          const message = goodbyeMsg
            .replace(/{user}/g, `@${userName}`)
            .replace(/{group}/g, groupMetadata.subject);
          await sock.sendMessage(groupJid, { text: message, mentions: [participant] });
        }
      }
    }
  } catch (error) {
    console.error(chalk.red('[GROUP UPDATE ERROR]'), error.message);
  }
}

export { lidCache, jidToNumber, numberToLid, storeLid };