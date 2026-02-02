import chalk from 'chalk';
import { getGroupSettings, isSudoUser, getBotMode } from './database.js';

const commands = new Map();
const cooldowns = new Map();

// Helper to get sender number
function getSenderNumber(msg) {
  const sender = msg.key.participant || msg.key.remoteJid;
  return sender.split('@')[0];
}

// Helper to check if user is owner
function isOwner(msg, config) {
  const senderNumber = getSenderNumber(msg);
  const ownerNumber = config.ownerNumber.replace(/[^0-9]/g, '');
  return senderNumber === ownerNumber;
}

// Helper to check if user is admin
async function isAdmin(sock, groupJid, userJid) {
  try {
    const groupMetadata = await sock.groupMetadata(groupJid);
    const participant = groupMetadata.participants.find(p => p.id === userJid);
    return participant?.admin === 'admin' || participant?.admin === 'superadmin';
  } catch {
    return false;
  }
}

// Helper to check if bot is admin
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

// Load all commands
function loadCommands() {
  // CORE COMMANDS
  commands.set('alive', {
    category: 'core',
    execute: async (sock, msg, args, config) => {
      await sock.sendMessage(msg.key.remoteJid, {
        text: `✅ *${config.botName} is Online!*\n\n` +
              `📱 Number: ${sock.user.id.split(':')[0]}\n` +
              `🔧 Prefix: ${config.prefix}\n` +
              `👤 Owner: ${config.ownerNumber}\n` +
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
      const ownerJid = config.ownerNumber.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
      await sock.sendMessage(msg.key.remoteJid, {
        text: `👑 *Owner Information*\n\n` +
              `Name: ${config.ownerName}\n` +
              `Number: +${config.ownerNumber}`,
        mentions: [ownerJid]
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
        text: `⏱️ *Bot Runtime*\n\n` +
              `${days}d ${hours}h ${minutes}m ${seconds}s`
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
        text: `⚡ *Speed Test*\n\n` +
              `Response Time: ${responseTime}ms\n` +
              `Process Uptime: ${Math.floor(process.uptime())}s`,
        edit: sent.key
      });
    }
  });

  // OWNER COMMANDS
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
        const response = await sock.groupAcceptInvite(inviteCode);
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

  // MENU COMMAND
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

// Handle incoming messages
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
  
  // Load commands if not loaded
  if (commands.size === 0) loadCommands();
  
  const command = commands.get(commandName);
  if (!command) return;

  const sender = msg.key.participant || msg.key.remoteJid;
  const senderNumber = sender.split('@')[0];
  const groupJid = msg.key.remoteJid;

  console.log(chalk.green(`[COMMAND] ${commandName} by +${senderNumber}`));

  // Permission checks
  if (command.ownerOnly && !isOwner(msg, config)) {
    return await sock.sendMessage(groupJid, {
      text: '❌ Owner only command',
      quoted: msg
    });
  }

  if (command.adminOnly && groupJid.endsWith('@g.us')) {
    const userIsAdmin = await isAdmin(sock, groupJid, sender);
    if (!userIsAdmin && !isOwner(msg, config)) {
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

  // Execute command
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

// Handle group updates (welcome/goodbye/auto-add)
export async function handleGroupUpdate(sock, update, config) {
  const { id: groupJid, participants, action } = update;
  
  const settings = getGroupSettings(groupJid);
  const groupMetadata = await sock.groupMetadata(groupJid).catch(() => null);
  if (!groupMetadata) return;

  // Auto-add to specific group
  const { getAutoAddGroup } = await import('./database.js');
  const autoAddGroupJid = getAutoAddGroup();
  
  if (action === 'add' && autoAddGroupJid && groupJid !== autoAddGroupJid) {
    for (const participant of participants) {
      try {
        await sock.groupParticipantsUpdate(autoAddGroupJid, [participant], 'add');
        console.log(chalk.cyan(`[AUTO-ADD] Added ${participant} to auto-add group`));
      } catch (error) {
        console.error(chalk.red(`[AUTO-ADD] Failed:`, error.message));
      }
    }
  }

  // Welcome message
  if (action === 'add' && settings.welcome) {
    const { getWelcomeMessage } = await import('./database.js');
    let welcomeMsg = getWelcomeMessage(groupJid);
    
    for (const participant of participants) {
      const userName = participant.split('@')[0];
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

  // Goodbye message
  if (action === 'remove' && settings.goodbye) {
    const { getGoodbyeMessage } = await import('./database.js');
    let goodbyeMsg = getGoodbyeMessage(groupJid);
    
    for (const participant of participants) {
      const userName = participant.split('@')[0];
      const message = goodbyeMsg
        .replace(/{user}/g, `@${userName}`)
        .replace(/{group}/g, groupMetadata.subject);

      await sock.sendMessage(groupJid, {
        text: message,
        mentions: [participant]
      });
    }
  }
}