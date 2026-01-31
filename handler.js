import chalk from 'chalk';
import util from 'util';
import {
    getBotMode,
    setBotMode,
    isSudoUser,
    addSudoUser,
    removeSudoUser,
    getAllSudoUsers
} from './database.js';

export async function handleMessage(sock, msg, config) {
    // Extract message body
    const m = msg.message;
    const body = (
        m?.conversation ||
        m?.extendedTextMessage?.text ||
        m?.imageMessage?.caption ||
        m?.videoMessage?.caption ||
        ''
    ).trim();

    if (!body) return;

    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;
    const isGroup = from.endsWith('@g.us');
    const userNumber = sender.split('@')[0];

    // Check if message starts with prefix
    if (!body.startsWith(config.prefix)) return;

    // Parse command
    const args = body.slice(config.prefix.length).trim().split(/ +/);
    const cmd = args.shift()?.toLowerCase();
    if (!cmd) return;

    // Log command usage
    const location = isGroup ? 'Group' : 'Private';
    console.log(chalk.cyan(`💫 Command Used In ${location}: ${chalk.yellow(config.prefix + cmd)} | ${chalk.white(userNumber)}`));

    // Helper functions
    const reply = async (text) => {
        try {
            await sock.sendMessage(from, { text }, { quoted: msg });
        } catch (err) {
            console.error(chalk.red('[REPLY ERROR]'), err.message);
        }
    };

    const react = async (emoji) => {
        try {
            await sock.sendMessage(from, { react: { text: emoji, key: msg.key } });
        } catch {}
    };

    const getMentioned = () => {
        return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    };

    const isOwner = () => {
        const owner = (config.ownerNumber || '').replace(/[^0-9]/g, '');
        return owner && sender.includes(owner);
    };

    const isAdmin = async () => {
        if (!isGroup) return false;
        try {
            const meta = await sock.groupMetadata(from);
            return meta.participants.some(p => p.id === sender && p.admin);
        } catch {
            return false;
        }
    };

    const isBotAdmin = async () => {
        if (!isGroup) return false;
        try {
            const meta = await sock.groupMetadata(from);
            return meta.participants.some(p => p.id === sock.user?.id && p.admin);
        } catch {
            return false;
        }
    };

    // Access control
    const botMode = getBotMode();
    const hasAccess = isOwner() || isSudoUser(sender) || botMode === 'public';

    if (!hasAccess) {
        await react('🔒');
        return reply('🔒 Bot is in private mode. Only owner and sudo users can use commands.');
    }

    await react('⚙️');

    // Command handler
    try {
        switch (cmd) {
            // CORE COMMANDS
            case 'menu':
            case 'help': {
                const menuImage = 'https://cdn.jsdelivr.net/gh/amanmohdtp/database@06959cbdefa02cea2c711cd7924982913e1fadcd/menu.png';
                
                let menuText = `╭━━━『 *${config.botName.toUpperCase()}* 』━━━╮\n\n`;
                menuText += `👋 Hello @${userNumber}!\n\n`;
                menuText += `Prefix: *${config.prefix}*\n`;
                menuText += `Mode: *${botMode === 'public' ? '🌍 Public' : '🔒 Private'}*\n\n`;

                menuText += `┏━━━ CORE ━━━┓\n`;
                menuText += `┃ ${config.prefix}alive\n`;
                menuText += `┃ ${config.prefix}menu\n`;
                menuText += `┃ ${config.prefix}ping\n`;
                menuText += `┃ ${config.prefix}owner\n`;
                menuText += `┗━━━━━━━━━━━━┛\n\n`;

                menuText += `┏━━━ OWNER ━━━┓\n`;
                menuText += `┃ ${config.prefix}mode public/private\n`;
                menuText += `┃ ${config.prefix}addsudo @user\n`;
                menuText += `┃ ${config.prefix}delsudo @user\n`;
                menuText += `┃ ${config.prefix}listsudo\n`;
                menuText += `┗━━━━━━━━━━━━━━┛\n\n`;

                menuText += `┏━━━ GROUP ━━━┓\n`;
                menuText += `┃ ${config.prefix}add <num>\n`;
                menuText += `┃ ${config.prefix}kick @user\n`;
                menuText += `┃ ${config.prefix}promote @user\n`;
                menuText += `┃ ${config.prefix}demote @user\n`;
                menuText += `┃ ${config.prefix}tagall\n`;
                menuText += `┃ ${config.prefix}group open/close\n`;
                menuText += `┃ ${config.prefix}link\n`;
                menuText += `┗━━━━━━━━━━━━━━┛\n\n`;

                menuText += `┏━━━ FUN ━━━┓\n`;
                menuText += `┃ ${config.prefix}dice\n`;
                menuText += `┃ ${config.prefix}flip\n`;
                menuText += `┃ ${config.prefix}joke\n`;
                menuText += `┗━━━━━━━━━━━━┛\n\n`;

                menuText += `╰━━━━━━━━━━━━━━━━━╯\n`;
                menuText += `👑 Owner: +${config.ownerNumber || 'Not Set'}`;

                try {
                    await sock.sendMessage(from, {
                        image: { url: menuImage },
                        caption: menuText,
                        mentions: [sender]
                    }, { quoted: msg });
                    await react('✅');
                } catch {
                    await reply(menuText);
                    await react('✅');
                }
                break;
            }

            case 'alive':
            case 'ping': {
                const uptime = process.uptime();
                const d = Math.floor(uptime / 86400);
                const h = Math.floor((uptime % 86400) / 3600);
                const m = Math.floor((uptime % 3600) / 60);

                const aliveImage = 'https://raw.githubusercontent.com/amanmohdtp/Forka-Bot/cba375eab1c584dcca0891e2eda96d0dddc0cdf2/alive.jpg';
                
                const text = 
                    `╔═════《 ALIVE 》═════╗\n\n` +
                    `❖ *Bot:* ${config.botName}\n` +
                    `❖ *Uptime:* ${d}d ${h}h ${m}m\n` +
                    `❖ *Prefix:* ${config.prefix}\n` +
                    `❖ *Mode:* ${botMode === 'public' ? '🌍 Public' : '🔒 Private'}\n` +
                    `❖ *Version:* ${config.version}\n\n` +
                    `╚════════════════════╝`;

                try {
                    await sock.sendMessage(from, {
                        image: { url: aliveImage },
                        caption: text
                    }, { quoted: msg });
                    await react('✅');
                } catch {
                    await reply(text);
                    await react('✅');
                }
                break;
            }

            case 'owner': {
                await react('👑');
                await reply(
                    `👑 *OWNER*\n\n` +
                    `Number: wa.me/${config.ownerNumber || 'Not set'}\n` +
                    `Contact for serious matters only.`
                );
                break;
            }

            // OWNER COMMANDS
            case 'mode': {
                if (!isOwner()) return reply('👑 Owner only');

                const newMode = args[0]?.toLowerCase();
                if (!['public', 'private'].includes(newMode)) {
                    return reply(
                        `🔧 *Bot Mode*\n\n` +
                        `Current: ${botMode === 'public' ? '🌍 Public' : '🔒 Private'}\n\n` +
                        `Usage:\n` +
                        `${config.prefix}mode public\n` +
                        `${config.prefix}mode private`
                    );
                }

                if (setBotMode(newMode)) {
                    await react('✅');
                    await reply(`✅ Mode changed to: ${newMode === 'public' ? '🌍 Public' : '🔒 Private'}`);
                } else {
                    await react('❌');
                    await reply('❌ Failed to change mode');
                }
                break;
            }

            case 'addsudo': {
                if (!isOwner()) return reply('👑 Owner only');

                const users = getMentioned();
                let targetJid = users[0];
                
                if (!targetJid && args[0]) {
                    let num = args[0].replace(/[^0-9]/g, '');
                    targetJid = `${num}@s.whatsapp.net`;
                }

                if (!targetJid) {
                    return reply(`Usage: ${config.prefix}addsudo @user or ${config.prefix}addsudo 628xxx`);
                }

                if (addSudoUser(targetJid)) {
                    await react('✅');
                    await sock.sendMessage(from, {
                        text: `✅ Added @${targetJid.split('@')[0]} as sudo user`,
                        mentions: [targetJid]
                    }, { quoted: msg });
                } else {
                    await react('⚠️');
                    await reply(`⚠️ Already a sudo user`);
                }
                break;
            }

            case 'delsudo':
            case 'removesudo': {
                if (!isOwner()) return reply('👑 Owner only');

                const users = getMentioned();
                let targetJid = users[0];
                
                if (!targetJid && args[0]) {
                    let num = args[0].replace(/[^0-9]/g, '');
                    targetJid = `${num}@s.whatsapp.net`;
                }

                if (!targetJid) {
                    return reply(`Usage: ${config.prefix}delsudo @user or ${config.prefix}delsudo 628xxx`);
                }

                if (removeSudoUser(targetJid)) {
                    await react('✅');
                    await sock.sendMessage(from, {
                        text: `✅ Removed @${targetJid.split('@')[0]} from sudo users`,
                        mentions: [targetJid]
                    }, { quoted: msg });
                } else {
                    await react('❌');
                    await reply(`❌ Not a sudo user`);
                }
                break;
            }

            case 'listsudo': {
                if (!isOwner()) return reply('👑 Owner only');

                const sudos = getAllSudoUsers();
                
                if (sudos.length === 0) {
                    return reply('📋 No sudo users');
                }

                let text = `📋 *SUDO USERS* (${sudos.length})\n\n`;
                sudos.forEach((num, i) => {
                    text += `${i + 1}. @${num}\n`;
                });

                const mentions = sudos.map(n => `${n}@s.whatsapp.net`);
                
                await react('📋');
                await sock.sendMessage(from, { text, mentions }, { quoted: msg });
                break;
            }

            // GROUP COMMANDS
            case 'add': {
                if (!isGroup) return reply('❌ Group only');
                if (!(await isAdmin())) return reply('❌ Admin only');
                if (!(await isBotAdmin())) return reply('❌ Bot must be admin');

                if (!args[0]) return reply(`Usage: ${config.prefix}add 628xxx`);

                let num = args[0].replace(/[^0-9]/g, '');
                
                try {
                    await sock.groupParticipantsUpdate(from, [`${num}@s.whatsapp.net`], 'add');
                    await react('✅');
                    await reply(`✅ Added +${num}`);
                } catch (e) {
                    await react('❌');
                    await reply(`❌ ${e.message}`);
                }
                break;
            }

            case 'kick': {
                if (!isGroup) return reply('❌ Group only');
                if (!(await isAdmin())) return reply('❌ Admin only');
                if (!(await isBotAdmin())) return reply('❌ Bot must be admin');

                const users = getMentioned();
                if (!users.length) return reply('❌ Mention someone');

                try {
                    await sock.groupParticipantsUpdate(from, users, 'remove');
                    await react('✅');
                    await reply(`✅ Removed ${users.length} user(s)`);
                } catch (e) {
                    await react('❌');
                    await reply(`❌ ${e.message}`);
                }
                break;
            }

            case 'promote':
            case 'demote': {
                if (!isGroup) return reply('❌ Group only');
                if (!(await isAdmin())) return reply('❌ Admin only');
                if (!(await isBotAdmin())) return reply('❌ Bot must be admin');

                const users = getMentioned();
                if (!users.length) return reply('❌ Mention someone');

                try {
                    await sock.groupParticipantsUpdate(from, users, cmd);
                    await react('✅');
                    await reply(`✅ ${cmd === 'promote' ? 'Promoted' : 'Demoted'} ${users.length} user(s)`);
                } catch (e) {
                    await react('❌');
                    await reply(`❌ ${e.message}`);
                }
                break;
            }

            case 'tagall': {
                if (!isGroup) return reply('❌ Group only');
                if (!(await isAdmin())) return reply('❌ Admin only');

                try {
                    const meta = await sock.groupMetadata(from);
                    const members = meta.participants.map(p => p.id);
                    const text = args.join(' ') || 'Attention everyone!';

                    let msgText = `📢 *${text}*\n\n`;
                    members.forEach((id, i) => {
                        msgText += `${i + 1}. @${id.split('@')[0]}\n`;
                    });

                    await react('📢');
                    await sock.sendMessage(from, { text: msgText, mentions: members }, { quoted: msg });
                } catch (e) {
                    await react('❌');
                    await reply('❌ Failed');
                }
                break;
            }

            case 'group': {
                if (!isGroup) return reply('❌ Group only');
                if (!(await isAdmin())) return reply('❌ Admin only');
                if (!(await isBotAdmin())) return reply('❌ Bot must be admin');

                const mode = args[0]?.toLowerCase();
                if (!['open', 'close'].includes(mode)) {
                    return reply(`Usage: ${config.prefix}group open/close`);
                }

                try {
                    await sock.groupSettingUpdate(from, mode === 'open' ? 'not_announcement' : 'announcement');
                    await react('✅');
                    await reply(`✅ Group ${mode}ed`);
                } catch (e) {
                    await react('❌');
                    await reply(`❌ ${e.message}`);
                }
                break;
            }

            case 'link': {
                if (!isGroup) return reply('❌ Group only');
                if (!(await isAdmin())) return reply('❌ Admin only');

                try {
                    const code = await sock.groupInviteCode(from);
                    await react('🔗');
                    await reply(`🔗 https://chat.whatsapp.com/${code}`);
                } catch (e) {
                    await react('❌');
                    await reply(`❌ ${e.message}`);
                }
                break;
            }

            // FUN COMMANDS
            case 'dice': {
                const roll = Math.floor(Math.random() * 6) + 1;
                await react('🎲');
                await reply(`🎲 You rolled *${roll}*`);
                break;
            }

            case 'flip':
            case 'coinflip': {
                const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
                await react('🪙');
                await reply(`🪙 *${result}*`);
                break;
            }

            case 'joke': {
                const jokes = [
                    "Why don't skeletons fight? They don't have the guts.",
                    "I told my wife she was drawing her eyebrows too high. She looked surprised.",
                    "Why do programmers prefer dark mode? Light attracts bugs."
                ];
                const j = jokes[Math.floor(Math.random() * jokes.length)];
                await react('😄');
                await reply(j);
                break;
            }

            // OWNER EVAL
            case 'eval': {
                if (!isOwner()) return reply('👑 Owner only');

                try {
                    const code = args.join(' ');
                    let res = eval(code);
                    if (typeof res !== 'string') res = util.inspect(res);
                    await react('✅');
                    await reply(`\`\`\`js\n${res}\n\`\`\``);
                } catch (e) {
                    await react('❌');
                    await reply(`\`\`\`Error: ${e.message}\`\`\``);
                }
                break;
            }

            default: {
                await react('❓');
                await reply(`Unknown command. Type ${config.prefix}menu`);
                break;
            }
        }
    } catch (error) {
        console.error(chalk.red(`[ERROR]`), error.message);
        await react('❌');
        await reply(`❌ Error: ${error.message}`);
    }
}
