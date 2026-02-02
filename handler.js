import chalk from 'chalk';
import { jidDecode } from '@whiskeysockets/baileys';
import { getGroupSettings, isSudoUser, getBotMode, setGroupSettings, getWelcomeMessage, setWelcomeMessage, getGoodbyeMessage, setGoodbyeMessage } from './database.js';

const commands = new Map();
const cooldowns = new Map();

function jidToNumber(jid) {
  const decoded = jidDecode(jid);
  return decoded?.user || jid.split('@')[0];
}

function isOwner(msg, config) {
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const senderNumber = jidToNumber(senderJid);
  const ownerNumbers = config.ownerNumber.split(',').map(n => n.trim().replace(/[^0-9]/g, ''));
  return ownerNumbers.includes(senderNumber);
}

function isSudoOrOwner(msg, config) {
  if (isOwner(msg, config)) return true;
  const senderJid = msg.key.participant || msg.key.remoteJid;
  return isSudoUser(senderJid);
}

async function isAdmin(sock, groupJid, userJid) {
  try {
    const groupMetadata = await sock.groupMetadata(groupJid);
    const participant = groupMetadata.participants.find(p => p.id === userJid);
    return participant?.admin === 'admin' || participant?.admin === 'superadmin';
  } catch {
    return false;
  }
}

async function isBotAdmin(sock, groupJid) {
  try {
    const groupMetadata = await sock.groupMetadata(groupJid);
    const botJid = sock.user.id;
    const participant = groupMetadata.participants.find(p => p.id === botJid);
    return participant?.admin === 'admin' || participant?.admin === 'superadmin';
  } catch {
    return false;
  }
}

function loadCommands() {
  commands.set('alive', {
    category: 'core',
    execute: async (sock, msg, args, config) => {
      await sock.sendMessage(msg.key.remoteJid, {
        text: `✅ *${config.botName} is Online!*\n\n` +
              `📱 Number: ${sock.user.id.split(':')[0]}\n` +
              `🔧 Prefix: ${config.prefix}\n` +
              `👤 Owner: ${config.ownerNumber.split(',')[0]}\n` +
              `🎯 Version: ${config.version}`
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
      const ownerJids = ownerNumbers.map(num => num + '@s.whatsapp.net');
      
      let text = `👑 *Owner Information*\n\n`;
      text += `Name: ${config.ownerName}\n`;
      ownerNumbers.forEach((num, i) => {
        text += `${i === 0 ? 'Main' : 'Co-owner'}: +${num}\n`;
      });
      
      await sock.sendMessage(msg.key.remoteJid, {
        text,
        mentions: ownerJids
      });
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

  commands.set('mode', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const mode = args[0]?.toLowerCase();
      if (!['public', 'private'].includes(mode)) {
        return await sock.sendMessage(msg.key.remoteJid, {
          text: '❌ Usage: .mode public/private'
        });
      }

      const { setBotMode } = await import('./database.js');
      setBotMode(mode);
      await sock.sendMessage(msg.key.remoteJid, {
        text: `✅ Bot mode set to: *${mode}*`
      });
    }
  });

  commands.set('addsudo', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!targetJid) {
        return await sock.sendMessage(msg.key.remoteJid, {
          text: '❌ Please mention a user to add as sudo'
        });
      }

      const { addSudoUser } = await import('./database.js');
      const success = addSudoUser(targetJid);
      
      await sock.sendMessage(msg.key.remoteJid, {
        text: success ? `✅ User added as sudo` : `❌ User already sudo`,
        mentions: [targetJid]
      });
    }
  });

  commands.set('delsudo', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!targetJid) {
        return await sock.sendMessage(msg.key.remoteJid, {
          text: '❌ Please mention a user to remove from sudo'
        });
      }

      const { removeSudoUser } = await import('./database.js');
      const success = removeSudoUser(targetJid);
      
      await sock.sendMessage(msg.key.remoteJid, {
        text: success ? `✅ User removed from sudo` : `❌ User is not sudo`,
        mentions: [targetJid]
      });
    }
  });

  commands.set('listsudo', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const { getAllSudoUsers } = await import('./database.js');
      const sudoUsers = getAllSudoUsers();
      
      if (sudoUsers.length === 0) {
        return await sock.sendMessage(msg.key.remoteJid, {
          text: '📋 No sudo users found'
        });
      }

      const list = sudoUsers.map((num, i) => `${i + 1}. +${num}`).join('\n');
      await sock.sendMessage(msg.key.remoteJid, {
        text: `👑 *Sudo Users*\n\n${list}`
      });
    }
  });

  commands.set('block', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                       (args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
      
      if (!targetJid) {
        return await sock.sendMessage(msg.key.remoteJid, {
          text: '❌ Mention user or provide number'
        });
      }

      await sock.updateBlockStatus(targetJid, 'block');
      await sock.sendMessage(msg.key.remoteJid, {
        text: `✅ Blocked user`,
        mentions: [targetJid]
      });
    }
  });

  commands.set('unblock', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                       (args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
      
      if (!targetJid) {
        return await sock.sendMessage(msg.key.remoteJid, {
          text: '❌ Mention user or provide number'
        });
      }

      await sock.updateBlockStatus(targetJid, 'unblock');
      await sock.sendMessage(msg.key.remoteJid, {
        text: `✅ Unblocked user`,
        mentions: [targetJid]
      });
    }
  });

  commands.set('join', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const inviteCode = args[0]?.replace(/https:\/\/chat\.whatsapp\.com\//gi, '');
      
      if (!inviteCode) {
        return await sock.sendMessage(msg.key.remoteJid, {
          text: '❌ Provide group invite link'
        });
      }

      try {
        await sock.groupAcceptInvite(inviteCode);
        await sock.sendMessage(msg.key.remoteJid, {
          text: `✅ Joined group successfully`
        });
      } catch (error) {
        await sock.sendMessage(msg.key.remoteJid, {
          text: `❌ Failed to join: ${error.message}`
        });
      }
    }
  });

  commands.set('leave', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      
      if (!groupJid.endsWith('@g.us')) {
        return await sock.sendMessage(groupJid, {
          text: '❌ This command only works in groups'
        });
      }

      await sock.sendMessage(groupJid, { text: '👋 Goodbye!' });
      await sock.groupLeave(groupJid);
    }
  });

  commands.set('broadcast', {
    category: 'owner',
    ownerOnly: true,
    execute: async (sock, msg, args, config) => {
      if (args.length === 0) {
        return await sock.sendMessage(msg.key.remoteJid, {
          text: '❌ Usage: .broadcast <message>'
        });
      }

      const broadcastMsg = args.join(' ');
      const groups = await sock.groupFetchAllParticipating();
      const groupJids = Object.keys(groups);

      let success = 0;
      for (const jid of groupJids) {
        try {
          await sock.sendMessage(jid, {
            text: `📢 *Broadcast Message*\n\n${broadcastMsg}`
          });
          success++;
        } catch {}
      }

      await sock.sendMessage(msg.key.remoteJid, {
        text: `✅ Broadcast sent to ${success}/${groupJids.length} groups`
      });
    }
  });

  commands.set('add', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      
      const botAdmin = await isBotAdmin(sock, groupJid);
      if (!botAdmin) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Bot needs to be admin'
        });
      }

      if (args.length === 0) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Usage: .add 1234567890'
        });
      }

      const number = args[0].replace(/[^0-9]/g, '');
      const userJid = number + '@s.whatsapp.net';

      try {
        await sock.groupParticipantsUpdate(groupJid, [userJid], 'add');
        await sock.sendMessage(groupJid, {
          text: `✅ Added +${number}`,
          mentions: [userJid]
        });
      } catch (error) {
        await sock.sendMessage(groupJid, {
          text: `❌ Failed to add: ${error.message}`
        });
      }
    }
  });

  commands.set('kick', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      
      const botAdmin = await isBotAdmin(sock, groupJid);
      if (!botAdmin) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Bot needs to be admin'
        });
      }

      const targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!targetJid) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Please mention a user to kick'
        });
      }

      try {
        await sock.groupParticipantsUpdate(groupJid, [targetJid], 'remove');
        await sock.sendMessage(groupJid, {
          text: `✅ Kicked user`,
          mentions: [targetJid]
        });
      } catch (error) {
        await sock.sendMessage(groupJid, {
          text: `❌ Failed to kick: ${error.message}`
        });
      }
    }
  });

  commands.set('promote', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      
      const botAdmin = await isBotAdmin(sock, groupJid);
      if (!botAdmin) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Bot needs to be admin'
        });
      }

      const targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!targetJid) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Please mention a user to promote'
        });
      }

      try {
        await sock.groupParticipantsUpdate(groupJid, [targetJid], 'promote');
        await sock.sendMessage(groupJid, {
          text: `✅ Promoted to admin`,
          mentions: [targetJid]
        });
      } catch (error) {
        await sock.sendMessage(groupJid, {
          text: `❌ Failed to promote: ${error.message}`
        });
      }
    }
  });

  commands.set('demote', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      
      const botAdmin = await isBotAdmin(sock, groupJid);
      if (!botAdmin) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Bot needs to be admin'
        });
      }

      const targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!targetJid) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Please mention a user to demote'
        });
      }

      try {
        await sock.groupParticipantsUpdate(groupJid, [targetJid], 'demote');
        await sock.sendMessage(groupJid, {
          text: `✅ Demoted from admin`,
          mentions: [targetJid]
        });
      } catch (error) {
        await sock.sendMessage(groupJid, {
          text: `❌ Failed to demote: ${error.message}`
        });
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
        const mentions = participants.map(p => p.id);
        const message = args.join(' ') || 'Attention everyone!';

        let text = `📢 *Tag All*\n\n${message}\n\n`;
        participants.forEach((p, i) => {
          const number = jidToNumber(p.id);
          text += `${i + 1}. @${number}\n`;
        });

        await sock.sendMessage(groupJid, {
          text,
          mentions
        });
      } catch (error) {
        await sock.sendMessage(groupJid, {
          text: `❌ Failed to tag all: ${error.message}`
        });
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
        const mentions = participants.map(p => p.id);
        const message = args.join(' ') || 'Hidden tag message';

        await sock.sendMessage(groupJid, {
          text: message,
          mentions
        });
      } catch (error) {
        await sock.sendMessage(groupJid, {
          text: `❌ Failed to send: ${error.message}`
        });
      }
    }
  });

  commands.set('link', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      
      const botAdmin = await isBotAdmin(sock, groupJid);
      if (!botAdmin) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Bot needs to be admin'
        });
      }

      try {
        const inviteCode = await sock.groupInviteCode(groupJid);
        await sock.sendMessage(groupJid, {
          text: `🔗 *Group Invite Link*\n\nhttps://chat.whatsapp.com/${inviteCode}`
        });
      } catch (error) {
        await sock.sendMessage(groupJid, {
          text: `❌ Failed to get link: ${error.message}`
        });
      }
    }
  });

  commands.set('revoke', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      
      const botAdmin = await isBotAdmin(sock, groupJid);
      if (!botAdmin) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Bot needs to be admin'
        });
      }

      try {
        await sock.groupRevokeInvite(groupJid);
        await sock.sendMessage(groupJid, {
          text: `✅ Group link revoked successfully`
        });
      } catch (error) {
        await sock.sendMessage(groupJid, {
          text: `❌ Failed to revoke: ${error.message}`
        });
      }
    }
  });

  commands.set('delete', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      
      const botAdmin = await isBotAdmin(sock, groupJid);
      if (!botAdmin) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Bot needs to be admin'
        });
      }

      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
      if (!quotedMsg) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Please reply to a message to delete it'
        });
      }

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
        await sock.sendMessage(groupJid, {
          text: `❌ Failed to delete: ${error.message}`
        });
      }
    }
  });

  commands.set('setname', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      
      const botAdmin = await isBotAdmin(sock, groupJid);
      if (!botAdmin) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Bot needs to be admin'
        });
      }

      if (args.length === 0) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Usage: .setname <new name>'
        });
      }

      const newName = args.join(' ');

      try {
        await sock.groupUpdateSubject(groupJid, newName);
        await sock.sendMessage(groupJid, {
          text: `✅ Group name updated to: ${newName}`
        });
      } catch (error) {
        await sock.sendMessage(groupJid, {
          text: `❌ Failed to update: ${error.message}`
        });
      }
    }
  });

  commands.set('setdesc', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      
      const botAdmin = await isBotAdmin(sock, groupJid);
      if (!botAdmin) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Bot needs to be admin'
        });
      }

      if (args.length === 0) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Usage: .setdesc <new description>'
        });
      }

      const newDesc = args.join(' ');

      try {
        await sock.groupUpdateDescription(groupJid, newDesc);
        await sock.sendMessage(groupJid, {
          text: `✅ Group description updated`
        });
      } catch (error) {
        await sock.sendMessage(groupJid, {
          text: `❌ Failed to update: ${error.message}`
        });
      }
    }
  });

  commands.set('group', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      
      const botAdmin = await isBotAdmin(sock, groupJid);
      if (!botAdmin) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Bot needs to be admin'
        });
      }

      const action = args[0]?.toLowerCase();
      if (!['open', 'close'].includes(action)) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Usage: .group open/close'
        });
      }

      try {
        await sock.groupSettingUpdate(groupJid, action === 'close' ? 'announcement' : 'not_announcement');
        await sock.sendMessage(groupJid, {
          text: `✅ Group ${action === 'close' ? 'closed' : 'opened'}`
        });
      } catch (error) {
        await sock.sendMessage(groupJid, {
          text: `❌ Failed to update: ${error.message}`
        });
      }
    }
  });

  commands.set('mute', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      
      const botAdmin = await isBotAdmin(sock, groupJid);
      if (!botAdmin) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Bot needs to be admin'
        });
      }

      try {
        await sock.groupSettingUpdate(groupJid, 'announcement');
        await sock.sendMessage(groupJid, {
          text: `🔇 Group muted - Only admins can send messages`
        });
      } catch (error) {
        await sock.sendMessage(groupJid, {
          text: `❌ Failed to mute: ${error.message}`
        });
      }
    }
  });

  commands.set('unmute', {
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      
      const botAdmin = await isBotAdmin(sock, groupJid);
      if (!botAdmin) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Bot needs to be admin'
        });
      }

      try {
        await sock.groupSettingUpdate(groupJid, 'not_announcement');
        await sock.sendMessage(groupJid, {
          text: `🔊 Group unmuted - Everyone can send messages`
        });
      } catch (error) {
        await sock.sendMessage(groupJid, {
          text: `❌ Failed to unmute: ${error.message}`
        });
      }
    }
  });

  commands.set('welcome', {
    category: 'protection',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const action = args[0]?.toLowerCase();

      if (!['on', 'off'].includes(action)) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Usage: .welcome on/off'
        });
      }

      const settings = getGroupSettings(groupJid);
      settings.welcome = action === 'on';
      setGroupSettings(groupJid, settings);

      await sock.sendMessage(groupJid, {
        text: `✅ Welcome message ${action === 'on' ? 'enabled' : 'disabled'}`
      });
    }
  });

  commands.set('goodbye', {
    category: 'protection',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const action = args[0]?.toLowerCase();

      if (!['on', 'off'].includes(action)) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Usage: .goodbye on/off'
        });
      }

      const settings = getGroupSettings(groupJid);
      settings.goodbye = action === 'on';
      setGroupSettings(groupJid, settings);

      await sock.sendMessage(groupJid, {
        text: `✅ Goodbye message ${action === 'on' ? 'enabled' : 'disabled'}`
      });
    }
  });

  commands.set('antilink', {
    category: 'protection',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;
      const action = args[0]?.toLowerCase();

      if (!['on', 'off'].includes(action)) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Usage: .antilink on/off'
        });
      }

      const settings = getGroupSettings(groupJid);
      settings.antilink = action === 'on';
      setGroupSettings(groupJid, settings);

      await sock.sendMessage(groupJid, {
        text: `✅ Antilink ${action === 'on' ? 'enabled' : 'disabled'}`
      });
    }
  });

  commands.set('setwelcome', {
    category: 'protection',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;

      if (args.length === 0) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Usage: .setwelcome <message>\n\nVariables:\n{user} - User mention\n{group} - Group name\n{count} - Member count'
        });
      }

      const message = args.join(' ');
      setWelcomeMessage(groupJid, message);

      await sock.sendMessage(groupJid, {
        text: `✅ Welcome message set to:\n\n${message}`
      });
    }
  });

  commands.set('setgoodbye', {
    category: 'protection',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, msg, args, config) => {
      const groupJid = msg.key.remoteJid;

      if (args.length === 0) {
        return await sock.sendMessage(groupJid, {
          text: '❌ Usage: .setgoodbye <message>\n\nVariables:\n{user} - User mention\n{group} - Group name'
        });
      }

      const message = args.join(' ');
      setGoodbyeMessage(groupJid, message);

      await sock.sendMessage(groupJid, {
        text: `✅ Goodbye message set to:\n\n${message}`
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

      await sock.sendMessage(msg.key.remoteJid, {
        image: { url: menuImage },
        caption: menuText
      });
    }
  });
}

export async function handleMessage(sock, msg, config) {
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

  console.log(chalk.green(`[COMMAND] ${commandName} by +${senderNumber}`));

  if (command.ownerOnly && !isSudoOrOwner(msg, config)) {
    return await sock.sendMessage(groupJid, {
      text: '❌ Owner only command',
      quoted: msg
    });
  }

  if (command.adminOnly && groupJid.endsWith('@g.us')) {
    const userIsAdmin = await isAdmin(sock, groupJid, senderJid);
    if (!userIsAdmin && !isSudoOrOwner(msg, config)) {
      return await sock.sendMessage(groupJid, {
        text: '❌ Admin only command',
        quoted: msg
      });
    }
  }

  if (command.groupOnly && !groupJid.endsWith('@g.us')) {
    return await sock.sendMessage(groupJid, {
      text: '❌ Group only command',
      quoted: msg
    });
  }

  try {
    await command.execute(sock, msg, args, config);
  } catch (error) {
    console.error(chalk.red(`[ERROR] ${commandName}:`), error.message);
    await sock.sendMessage(groupJid, {
      text: `❌ Error: ${error.message}`,
      quoted: msg
    });
  }
}

export async function handleGroupUpdate(sock, update, config) {
  const { id: groupJid, participants, action } = update;
  
  const settings = getGroupSettings(groupJid);
  const groupMetadata = await sock.groupMetadata(groupJid).catch(() => null);
  if (!groupMetadata) return;

  const { getAutoAddGroup } = await import('./database.js');
  const autoAddGroupJid = getAutoAddGroup();
  
  if (action === 'add' && autoAddGroupJid && groupJid !== autoAddGroupJid) {
    for (const participant of participants) {
      try {
        await sock.groupParticipantsUpdate(autoAddGroupJid, [participant], 'add');
        console.log(chalk.cyan(`[AUTO-ADD] Added ${jidToNumber(participant)} to auto-add group`));
      } catch (error) {
        console.error(chalk.red(`[AUTO-ADD] Failed:`, error.message));
      }
    }
  }

  if (action === 'add' && settings.welcome) {
    let welcomeMsg = getWelcomeMessage(groupJid);
    
    for (const participant of participants) {
      const userName = jidToNumber(participant);
      const message = welcomeMsg
        .replace(/{user}/g, `@${userName}`)
        .replace(/{group}/g, groupMetadata.subject)
        .replace(/{count}/g, groupMetadata.participants.length);

      await sock.sendMessage(groupJid, {
        text: message,
        mentions: [participant]
      });
    }
  }

  if (action === 'remove' && settings.goodbye) {
    let goodbyeMsg = getGoodbyeMessage(groupJid);
    
    for (const participant of participants) {
      const userName = jidToNumber(participant);
      const message = goodbyeMsg
        .replace(/{user}/g, `@${userName}`)
        .replace(/{group}/g, groupMetadata.subject);

      await sock.sendMessage(groupJid, {
        text: message,
        mentions: [participant]
      });
    }
  }

  if (settings.antilink && action === 'add') {
    const senderJid = msg?.key?.participant || msg?.key?.remoteJid;
    const messageText = (
      msg?.message?.conversation ||
      msg?.message?.extendedTextMessage?.text ||
      ''
    ).toLowerCase();

    if (messageText.includes('chat.whatsapp.com')) {
      const userIsAdmin = await isAdmin(sock, groupJid, senderJid);
      const userIsOwner = isOwner(msg, config);
      
      if (!userIsAdmin && !userIsOwner) {
        const botAdmin = await isBotAdmin(sock, groupJid);
        if (botAdmin) {
          await sock.sendMessage(groupJid, {
            delete: {
              remoteJid: groupJid,
              fromMe: false,
              id: msg.key.id,
              participant: senderJid
            }
          });

          await sock.sendMessage(groupJid, {
            text: `❌ @${jidToNumber(senderJid)} Group links are not allowed!`,
            mentions: [senderJid]
          });
        }
      }
    }
  }
}