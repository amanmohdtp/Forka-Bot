import chalk from 'chalk';
import util from 'util';
import {
    getBotMode,
    setBotMode,
    isSudoUser,
    addSudoUser,
    removeSudoUser,
    getAllSudoUsers,
    getGroupSettings,
    setGroupSettings,
    getWelcomeMessage,
    setWelcomeMessage,
    getGoodbyeMessage,
    setGoodbyeMessage,
    getAutoAddGroup,
    setAutoAddGroup,
    removeAutoAddGroup
} from './database.js';

// Game states
const tttGames = new Map();
const rpsGames = new Map();

export async function handleMessage(sock, msg, config) {
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
    const sender = msg.key.participant || msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const senderNumber = sender.split('@')[0];
    const botNumber = sock.user?.id?.split(':')[0] || '';
    
    // Check if this is a self-message (sent by bot owner in their own DM)
    const isSelfMessage = msg.key.fromMe;
    const isSelfDM = !isGroup && sender.includes(botNumber);

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
        const botNumber = sock.user?.id?.split(':')[0] || '';
        
        // Check if sender matches owner number or is the bot's own number
        return (owner && senderNumber === owner) || senderNumber === botNumber;
    };

    const isAdmin = async () => {
        if (!isGroup) return false;
        try {
            const meta = await sock.groupMetadata(from);
            return meta.participants.some(p => p.id === sender && (p.admin === 'admin' || p.admin === 'superadmin'));
        } catch {
            return false;
        }
    };

    const isBotAdmin = async () => {
        if (!isGroup) return false;
        try {
            const meta = await sock.groupMetadata(from);
            const botJid = sock.user?.id;
            return meta.participants.some(p => p.id === botJid && (p.admin === 'admin' || p.admin === 'superadmin'));
        } catch {
            return false;
        }
    };

    // Antilink check
    if (isGroup && body && !body.startsWith(config.prefix)) {
        const settings = getGroupSettings(from);
        if (settings.antilink) {
            const linkRegex = /(https?:\/\/|www\.)[^\s]+/gi;
            if (linkRegex.test(body)) {
                const userIsAdmin = await isAdmin();
                
                // Check antilink mode
                if (settings.antilinkMode === 'all' || 
                   (settings.antilinkMode === 'users' && !userIsAdmin)) {
                    
                    if (await isBotAdmin()) {
                        try {
                            await sock.sendMessage(from, {
                                delete: msg.key
                            });
                            await sock.sendMessage(from, {
                                text: `⚠️ @${senderNumber} Links are not allowed!`,
                                mentions: [sender]
                            });
                            return;
                        } catch {}
                    } else {
                        await sock.sendMessage(from, {
                            text: `⚠️ @${senderNumber} Links are not allowed! (Bot needs admin to delete)`,
                            mentions: [sender]
                        });
                        return;
                    }
                }
            }
        }
    }

    // Check if message starts with prefix
    if (!body.startsWith(config.prefix)) return;

    // Parse command
    const args = body.slice(config.prefix.length).trim().split(/ +/);
    const cmd = args.shift()?.toLowerCase();
    if (!cmd) return;

    // Log command
    const location = isGroup ? 'Group' : 'Private';
    console.log(chalk.cyan(`💫 ${location}: ${chalk.yellow(config.prefix + cmd)} | ${chalk.white(senderNumber)}`));

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
                
                let menuText = `*${config.botName.toUpperCase()} BOT*\n\n`;
                menuText += `👋 Hello @${senderNumber}!\n\n`;
                menuText += `Prefix: *${config.prefix}*\n`;
                menuText += `Mode: *${botMode === 'public' ? '🌍 Public' : '🔒 Private'}*\n`;
                menuText += `Owner: *${config.ownerName || 'Not Set'}*\n\n`;

                menuText += `*COMMAND CATEGORIES*\n\n`;
                menuText += `📌 Core\n`;
                menuText += `👑 Owner\n`;
                menuText += `👥 Group\n`;
                menuText += `🎮 Fun & Games\n\n`;

                menuText += `Type *${config.prefix}listcmd* to see all commands with descriptions!`;

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

            case 'listcmd':
            case 'cmdlist':
            case 'list': {
                let cmdText = `*${config.botName.toUpperCase()} COMMANDS*\n\n`;
                cmdText += `Prefix: *${config.prefix}*\n\n`;

                cmdText += `*📌 CORE COMMANDS*\n\n`;
                cmdText += `1. ${config.prefix}menu\n   └ Show main menu\n\n`;
                cmdText += `2. ${config.prefix}listcmd\n   └ Show this command list\n\n`;
                cmdText += `3. ${config.prefix}alive / ping\n   └ Check bot status & uptime\n\n`;
                cmdText += `4. ${config.prefix}owner\n   └ Get owner contact info\n\n`;

                cmdText += `*👑 OWNER COMMANDS*\n\n`;
                cmdText += `5. ${config.prefix}mode <public/private>\n   └ Change bot access mode\n\n`;
                cmdText += `6. ${config.prefix}addsudo @user\n   └ Add sudo user\n\n`;
                cmdText += `7. ${config.prefix}delsudo @user\n   └ Remove sudo user\n\n`;
                cmdText += `8. ${config.prefix}listsudo\n   └ Show all sudo users\n\n`;
                cmdText += `9. ${config.prefix}eval <code>\n   └ Execute JavaScript code\n\n`;

                cmdText += `*👥 GROUP COMMANDS*\n\n`;
                cmdText += `10. ${config.prefix}add <number>\n    └ Add member to group\n\n`;
                cmdText += `11. ${config.prefix}kick @user\n    └ Remove member from group\n\n`;
                cmdText += `12. ${config.prefix}promote @user\n    └ Make user admin\n\n`;
                cmdText += `13. ${config.prefix}demote @user\n    └ Remove admin privileges\n\n`;
                cmdText += `14. ${config.prefix}tagall <message>\n    └ Tag all members\n\n`;
                cmdText += `15. ${config.prefix}hidetag <message>\n    └ Tag all without showing list\n\n`;
                cmdText += `16. ${config.prefix}group <open/close>\n    └ Change group settings\n\n`;
                cmdText += `17. ${config.prefix}link\n    └ Get group invite link\n\n`;
                cmdText += `18. ${config.prefix}antimenu\n    └ Group protection settings\n\n`;
                cmdText += `19. ${config.prefix}welcome <on/off>\n    └ Toggle welcome messages\n\n`;
                cmdText += `20. ${config.prefix}setwelcome <msg>\n    └ Set custom welcome message\n\n`;
                cmdText += `21. ${config.prefix}goodbye <on/off>\n    └ Toggle goodbye messages\n\n`;
                cmdText += `22. ${config.prefix}setgoodbye <msg>\n    └ Set custom goodbye message\n\n`;
                cmdText += `23. ${config.prefix}antilink <on/off>\n    └ Toggle antilink protection\n\n`;
                cmdText += `24. ${config.prefix}alink <all/users>\n    └ Set antilink mode\n\n`;

                cmdText += `*🎮 FUN & GAMES*\n\n`;
                cmdText += `25. ${config.prefix}dice\n    └ Roll a dice (1-6)\n\n`;
                cmdText += `26. ${config.prefix}flip\n    └ Flip a coin\n\n`;
                cmdText += `27. ${config.prefix}joke\n    └ Get random joke\n\n`;
                cmdText += `28. ${config.prefix}ttt\n    └ Start Tic Tac Toe game\n\n`;
                cmdText += `29. ${config.prefix}rps <r/p/s>\n    └ Play Rock Paper Scissors\n\n`;

                cmdText += `*Total Commands:* 29`;

                await react('📋');
                await reply(cmdText);
                break;
            }

            case 'alive':
            case 'ping': {
                const uptime = process.uptime();
                const d = Math.floor(uptime / 86400);
                const h = Math.floor((uptime % 86400) / 3600);
                const m = Math.floor((uptime % 3600) / 60);

                const aliveImage = 'https://raw.githubusercontent.com/amanmohdtp/Forka-Bot/cba375eab1c584dcca0891e2eda96d0dddc0cdf2/alive.jpg';
                
                // Measure actual latency
                const start = Date.now();
                await react('⏱️');
                const latency = Date.now() - start;
                
                const text = 
                    `*${config.botName.toUpperCase()} STATUS*\n\n` +
                    `✅ Bot: Online\n` +
                    `⏱️ Uptime: ${d}d ${h}h ${m}m\n` +
                    `⚡ Response: ${latency}ms\n` +
                    `🔧 Prefix: ${config.prefix}\n` +
                    `🌍 Mode: ${botMode === 'public' ? 'Public' : 'Private'}\n` +
                    `📦 Version: ${config.version}\n`;

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
                const ownerNum = config.ownerNumber || 'Not set';
                await reply(
                    `*BOT OWNER*\n\n` +
                    `👤 ${config.ownerName}\n` +
                    `📱 +${ownerNum}\n\n` +
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
                        `*BOT MODE*\n\n` +
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
                    return reply(`Usage: ${config.prefix}delsudo @user`);
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

                let text = `*SUDO USERS* (${sudos.length})\n\n`;
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

            case 'hidetag':
            case 'tag': {
                if (!isGroup) return reply('❌ Group only');
                if (!(await isAdmin())) return reply('❌ Admin only');

                try {
                    const meta = await sock.groupMetadata(from);
                    const members = meta.participants.map(p => p.id);
                    const text = args.join(' ') || 'Hidden tag';

                    await react('👻');
                    await sock.sendMessage(from, {
                        text: text,
                        mentions: members
                    }, { quoted: msg });
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

            case 'antimenu': {
                if (!isGroup) return reply('❌ Group only');
                if (!(await isAdmin())) return reply('❌ Admin only');

                const settings = getGroupSettings(from);
                
                let text = `*GROUP PROTECTION MENU*\n\n`;
                text += `*Welcome System*\n`;
                text += `• ${config.prefix}welcome on/off\n`;
                text += `• ${config.prefix}setwelcome <message>\n`;
                text += `Status: ${settings.welcome ? '✅ ON' : '❌ OFF'}\n\n`;
                
                text += `*Goodbye System*\n`;
                text += `• ${config.prefix}goodbye on/off\n`;
                text += `• ${config.prefix}setgoodbye <message>\n`;
                text += `Status: ${settings.goodbye ? '✅ ON' : '❌ OFF'}\n\n`;
                
                text += `*Antilink System*\n`;
                text += `• ${config.prefix}antilink on/off\n`;
                text += `• ${config.prefix}alink all/users\n`;
                text += `Status: ${settings.antilink ? '✅ ON' : '❌ OFF'}\n`;
                text += `Mode: ${settings.antilinkMode || 'all'}\n\n`;
                
                text += `*Variables:*\n`;
                text += `{user} - mention user\n`;
                text += `{group} - group name\n`;
                text += `{count} - member count`;

                await react('🛡️');
                await reply(text);
                break;
            }

            case 'welcome': {
                if (!isGroup) return reply('❌ Group only');
                if (!(await isAdmin())) return reply('❌ Admin only');

                const mode = args[0]?.toLowerCase();
                if (!['on', 'off'].includes(mode)) {
                    const settings = getGroupSettings(from);
                    return reply(
                        `*Welcome Status*\n\n` +
                        `Current: ${settings.welcome ? '✅ ON' : '❌ OFF'}\n\n` +
                        `Usage: ${config.prefix}welcome on/off`
                    );
                }

                const settings = getGroupSettings(from);
                settings.welcome = mode === 'on';
                setGroupSettings(from, settings);

                await react('✅');
                await reply(`✅ Welcome messages ${mode === 'on' ? 'enabled' : 'disabled'}`);
                break;
            }

            case 'setwelcome': {
                if (!isGroup) return reply('❌ Group only');
                if (!(await isAdmin())) return reply('❌ Admin only');

                const welcomeMsg = args.join(' ');
                if (!welcomeMsg) {
                    const current = getWelcomeMessage(from);
                    return reply(
                        `*Current Welcome Message:*\n\n${current}\n\n` +
                        `Usage: ${config.prefix}setwelcome <message>\n\n` +
                        `Variables:\n{user} {group} {count}`
                    );
                }

                setWelcomeMessage(from, welcomeMsg);
                await react('✅');
                await reply(`✅ Welcome message updated!`);
                break;
            }

            case 'goodbye': {
                if (!isGroup) return reply('❌ Group only');
                if (!(await isAdmin())) return reply('❌ Admin only');

                const mode = args[0]?.toLowerCase();
                if (!['on', 'off'].includes(mode)) {
                    const settings = getGroupSettings(from);
                    return reply(
                        `*Goodbye Status*\n\n` +
                        `Current: ${settings.goodbye ? '✅ ON' : '❌ OFF'}\n\n` +
                        `Usage: ${config.prefix}goodbye on/off`
                    );
                }

                const settings = getGroupSettings(from);
                settings.goodbye = mode === 'on';
                setGroupSettings(from, settings);

                await react('✅');
                await reply(`✅ Goodbye messages ${mode === 'on' ? 'enabled' : 'disabled'}`);
                break;
            }

            case 'setgoodbye': {
                if (!isGroup) return reply('❌ Group only');
                if (!(await isAdmin())) return reply('❌ Admin only');

                const goodbyeMsg = args.join(' ');
                if (!goodbyeMsg) {
                    const current = getGoodbyeMessage(from);
                    return reply(
                        `*Current Goodbye Message:*\n\n${current}\n\n` +
                        `Usage: ${config.prefix}setgoodbye <message>\n\n` +
                        `Variables:\n{user} {group} {count}`
                    );
                }

                setGoodbyeMessage(from, goodbyeMsg);
                await react('✅');
                await reply(`✅ Goodbye message updated!`);
                break;
            }

            case 'antilink': {
                if (!isGroup) return reply('❌ Group only');
                if (!(await isAdmin())) return reply('❌ Admin only');

                const mode = args[0]?.toLowerCase();
                if (!['on', 'off'].includes(mode)) {
                    const settings = getGroupSettings(from);
                    return reply(
                        `*Antilink Status*\n\n` +
                        `Current: ${settings.antilink ? '✅ ON' : '❌ OFF'}\n` +
                        `Mode: ${settings.antilinkMode || 'all'}\n\n` +
                        `Usage: ${config.prefix}antilink on/off`
                    );
                }

                const settings = getGroupSettings(from);
                settings.antilink = mode === 'on';
                setGroupSettings(from, settings);

                await react('✅');
                await reply(`✅ Antilink ${mode === 'on' ? 'enabled' : 'disabled'}`);
                break;
            }

            case 'alink': {
                if (!isGroup) return reply('❌ Group only');
                if (!(await isAdmin())) return reply('❌ Admin only');

                const mode = args[0]?.toLowerCase();
                if (!['all', 'users'].includes(mode)) {
                    return reply(
                        `*Antilink Mode*\n\n` +
                        `all - Block links from everyone\n` +
                        `users - Block links from non-admins\n\n` +
                        `Usage: ${config.prefix}alink all/users`
                    );
                }

                const settings = getGroupSettings(from);
                settings.antilinkMode = mode;
                setGroupSettings(from, settings);

                await react('✅');
                await reply(`✅ Antilink mode: ${mode === 'all' ? 'Everyone' : 'Users only'}`);
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
                    "Why do programmers prefer dark mode? Light attracts bugs.",
                    "Why did the scarecrow win an award? He was outstanding in his field!",
                    "What do you call a bear with no teeth? A gummy bear!"
                ];
                const j = jokes[Math.floor(Math.random() * jokes.length)];
                await react('😄');
                await reply(j);
                break;
            }

            case 'ttt': {
                if (tttGames.has(from)) {
                    return reply('❌ Game already in progress! Finish it first.');
                }

                const board = [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '];
                tttGames.set(from, {
                    board,
                    currentPlayer: sender,
                    players: [sender],
                    turn: 'X'
                });

                await react('⭕');
                await reply(
                    `*TIC TAC TOE*\n\n` +
                    `${board[0]}|${board[1]}|${board[2]}\n─┼─┼─\n` +
                    `${board[3]}|${board[4]}|${board[5]}\n─┼─┼─\n` +
                    `${board[6]}|${board[7]}|${board[8]}\n\n` +
                    `Waiting for opponent! Type a number (1-9) to play.`
                );
                break;
            }

            case 'rps': {
                const choice = args[0]?.toLowerCase();
                if (!['r', 'p', 's', 'rock', 'paper', 'scissors'].includes(choice)) {
                    return reply(
                        `*ROCK PAPER SCISSORS*\n\n` +
                        `Usage: ${config.prefix}rps <r/p/s>\n` +
                        `r = rock, p = paper, s = scissors`
                    );
                }

                const choices = ['rock', 'paper', 'scissors'];
                const userChoice = choice[0] === 'r' ? 'rock' : choice[0] === 'p' ? 'paper' : 'scissors';
                const botChoice = choices[Math.floor(Math.random() * 3)];

                let result;
                if (userChoice === botChoice) {
                    result = "It's a tie!";
                } else if (
                    (userChoice === 'rock' && botChoice === 'scissors') ||
                    (userChoice === 'paper' && botChoice === 'rock') ||
                    (userChoice === 'scissors' && botChoice === 'paper')
                ) {
                    result = '🎉 You win!';
                } else {
                    result = '😔 You lose!';
                }

                await react('✊');
                await reply(
                    `*ROCK PAPER SCISSORS*\n\n` +
                    `You: ${userChoice}\n` +
                    `Bot: ${botChoice}\n\n` +
                    `${result}`
                );
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

            // HIDDEN JID COMMAND - Not shown in menu
            case 'jid': {
                if (!isGroup) {
                    // In DM, show user's JID
                    await react('🔑');
                    await reply(
                        `*YOUR JID*\n\n` +
                        `\`${sender}\`\n\n` +
                        `Copy this for use in commands.`
                    );
                } else {
                    // In group, show group JID
                    await react('🔑');
                    await reply(
                        `*GROUP JID*\n\n` +
                        `\`${from}\`\n\n` +
                        `Use this for auto-add feature.`
                    );
                }
                break;
            }

            // AUTO-ADD GROUP COMMANDS
            case 'setautoadd': {
                if (!isOwner()) return reply('👑 Owner only');

                if (!isGroup) {
                    return reply('❌ Use this command in the group you want to set for auto-add');
                }

                setAutoAddGroup(from);
                await react('✅');
                await reply(
                    `✅ Auto-add enabled for this group!\n\n` +
                    `Users who join will be automatically added when the link updates.\n\n` +
                    `Group JID: \`${from}\``
                );
                break;
            }

            case 'removeautoadd': {
                if (!isOwner()) return reply('👑 Owner only');

                const current = getAutoAddGroup();
                if (!current) {
                    return reply('❌ No auto-add group set');
                }

                removeAutoAddGroup();
                await react('✅');
                await reply(`✅ Auto-add disabled`);
                break;
            }

            case 'autoadd': {
                if (!isOwner()) return reply('👑 Owner only');

                const groupJid = getAutoAddGroup();
                if (!groupJid) {
                    return reply(
                        `*AUTO-ADD STATUS*\n\n` +
                        `Status: ❌ Disabled\n\n` +
                        `To enable:\n` +
                        `1. Go to the target group\n` +
                        `2. Use ${config.prefix}setautoadd\n\n` +
                        `To disable:\n` +
                        `${config.prefix}removeautoadd`
                    );
                }

                try {
                    const meta = await sock.groupMetadata(groupJid);
                    await react('✅');
                    await reply(
                        `*AUTO-ADD STATUS*\n\n` +
                        `Status: ✅ Enabled\n` +
                        `Group: ${meta.subject}\n` +
                        `JID: \`${groupJid}\`\n\n` +
                        `Commands:\n` +
                        `${config.prefix}removeautoadd - Disable`
                    );
                } catch (e) {
                    await react('⚠️');
                    await reply(
                        `*AUTO-ADD STATUS*\n\n` +
                        `Status: ⚠️ Enabled but group not found\n` +
                        `JID: \`${groupJid}\`\n\n` +
                        `Use ${config.prefix}removeautoadd to disable`
                    );
                }
                break;
            }

            default: {
                // Check if it's a TicTacToe move
                if (tttGames.has(from) && /^[1-9]$/.test(cmd)) {
                    const game = tttGames.get(from);
                    const pos = parseInt(cmd) - 1;

                    if (game.board[pos] !== ' ') {
                        return reply('❌ Position already taken!');
                    }

                    if (game.players.length < 2) {
                        if (!game.players.includes(sender)) {
                            game.players.push(sender);
                        }
                    }

                    if (!game.players.includes(sender)) {
                        return reply('❌ You are not in this game!');
                    }

                    if (game.currentPlayer !== sender) {
                        return reply('❌ Not your turn!');
                    }

                    game.board[pos] = game.turn;
                    game.currentPlayer = game.players.find(p => p !== sender);
                    game.turn = game.turn === 'X' ? 'O' : 'X';

                    const b = game.board;
                    let boardText = `${b[0]}|${b[1]}|${b[2]}\n─┼─┼─\n${b[3]}|${b[4]}|${b[5]}\n─┼─┼─\n${b[6]}|${b[7]}|${b[8]}`;

                    // Check win
                    const wins = [
                        [0,1,2], [3,4,5], [6,7,8],
                        [0,3,6], [1,4,7], [2,5,8],
                        [0,4,8], [2,4,6]
                    ];

                    let winner = null;
                    for (let w of wins) {
                        if (b[w[0]] !== ' ' && b[w[0]] === b[w[1]] && b[w[1]] === b[w[2]]) {
                            winner = b[w[0]];
                            break;
                        }
                    }

                    if (winner) {
                        tttGames.delete(from);
                        await react('🎉');
                        return reply(`*TIC TAC TOE*\n\n${boardText}\n\n🎉 Player ${winner} wins!`);
                    }

                    if (!b.includes(' ')) {
                        tttGames.delete(from);
                        await react('🤝');
                        return reply(`*TIC TAC TOE*\n\n${boardText}\n\n🤝 It's a draw!`);
                    }

                    await reply(`*TIC TAC TOE*\n\n${boardText}\n\nNext: ${game.turn}`);
                    return;
                }

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

// Export handler for group events (welcome/goodbye/auto-add)
export async function handleGroupUpdate(sock, update, config) {
    try {
        const { id, participants, action } = update;
        const settings = getGroupSettings(id);

        // Auto-add functionality
        const autoAddGroupJid = getAutoAddGroup();
        if (autoAddGroupJid && action === 'add') {
            // If someone joins ANY group, try to add them to the auto-add group
            if (id !== autoAddGroupJid) { // Don't auto-add if they're joining the target group
                try {
                    await sock.groupParticipantsUpdate(autoAddGroupJid, participants, 'add');
                    console.log(chalk.green(`[AUTO-ADD] Added ${participants.length} user(s) to auto-add group`));
                } catch (err) {
                    console.log(chalk.yellow(`[AUTO-ADD] Failed: ${err.message}`));
                }
            }
        }

        if (action === 'add' && settings.welcome) {
            const meta = await sock.groupMetadata(id);
            const welcomeMsg = getWelcomeMessage(id);
            
            for (let participant of participants) {
                const message = welcomeMsg
                    .replace('{user}', `@${participant.split('@')[0]}`)
                    .replace('{group}', meta.subject)
                    .replace('{count}', meta.participants.length);

                await sock.sendMessage(id, {
                    text: message,
                    mentions: [participant]
                });
            }
        }

        if (action === 'remove' && settings.goodbye) {
            const meta = await sock.groupMetadata(id);
            const goodbyeMsg = getGoodbyeMessage(id);
            
            for (let participant of participants) {
                const message = goodbyeMsg
                    .replace('{user}', `@${participant.split('@')[0]}`)
                    .replace('{group}', meta.subject)
                    .replace('{count}', meta.participants.length);

                await sock.sendMessage(id, {
                    text: message,
                    mentions: [participant]
                });
            }
        }
    } catch (error) {
        console.error(chalk.red('[GROUP UPDATE ERROR]'), error.message);
    }
}
