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
        m?.documentMessage?.caption ||
        ''
    ).trim();

    // Log when body is empty for debugging
    if (!body) {
        console.log(chalk.gray('[DEBUG] Empty message body received'));
        return;
    }

    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;
    const isGroup = from.endsWith('@g.us');
    
    // Normalize sender to plain number for consistent comparison
    const senderNumber = sender.split('@')[0].replace(/[^0-9]/g, '');

    // Use PREFIX consistently (not config.prefix)
    const PREFIX = config.prefix || '.';

    // Check if message starts with prefix
    if (!body.startsWith(PREFIX)) return;

    // Parse command - guard against empty command
    const args = body.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift()?.toLowerCase();
    
    if (!cmd) {
        console.log(chalk.yellow('[DEBUG] User sent only prefix, no command'));
        return;
    }

    // Log command usage
    const location = isGroup ? 'Group' : 'Private';
    console.log(chalk.cyan(`💫 Command Used In ${location}: ${chalk.yellow(PREFIX + cmd)} | ${chalk.white(senderNumber)}`));

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

    // EXACT owner check - compare normalized numbers only
    const isOwner = () => {
        const ownerNum = (config.ownerNumber || '').replace(/[^0-9]/g, '');
        if (!ownerNum) {
            console.log(chalk.red('[DEBUG] OWNER_NUMBER not set in config'));
            return false;
        }
        const isMatch = senderNumber === ownerNum;
        console.log(chalk.gray(`[DEBUG] Owner check: sender=${senderNumber}, owner=${ownerNum}, match=${isMatch}`));
        return isMatch;
    };

    const isAdmin = async () => {
        if (!isGroup) return false;
        try {
            const meta = await sock.groupMetadata(from);
            return meta.participants.some(p => {
                const participantNum = p.id.split('@')[0].replace(/[^0-9]/g, '');
                return participantNum === senderNumber && p.admin;
            });
        } catch {
            return false;
        }
    };

    const isBotAdmin = async () => {
        if (!isGroup) return false;
        try {
            const meta = await sock.groupMetadata(from);
            const botNum = sock.user?.id.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
            return meta.participants.some(p => {
                const participantNum = p.id.split('@')[0].replace(/[^0-9]/g, '');
                return participantNum === botNum && p.admin;
            });
        } catch {
            return false;
        }
    };

    // Access control - check BEFORE cooldown
    const botMode = getBotMode();
    console.log(chalk.gray(`[DEBUG] Bot mode: ${botMode}`));
    
    const ownerStatus = isOwner();
    const sudoStatus = isSudoUser(senderNumber); // Pass normalized number
    const hasAccess = botMode === 'public' || ownerStatus || sudoStatus;
    
    console.log(chalk.gray(`[DEBUG] Access check: mode=${botMode}, owner=${ownerStatus}, sudo=${sudoStatus}, hasAccess=${hasAccess}`));

    if (!hasAccess) {
        console.log(chalk.yellow('[DEBUG] Access denied - bot in private mode'));
        await react('🔒');
        return reply('🔒 Bot is in private mode. Only owner and sudo users can use commands.');
    }

    await react('⚙️');

    // Command handler
    try {
        console.log(chalk.green(`[DEBUG] Executing command: ${cmd}`));
        
        switch (cmd) {
            // CORE COMMANDS
            case 'menu':
            case 'help': {
                console.log(chalk.blue('[DEBUG] Menu command started'));
                const menuImage = 'https://cdn.jsdelivr.net/gh/amanmohdtp/database@06959cbdefa02cea2c711cd7924982913e1fadcd/menu.png';
                
                let menuText = `╭━━━『 *${config.botName.toUpperCase()}* 』━━━╮\n\n`;
                menuText += `👋 Hello @${senderNumber}!\n\n`;
                menuText += `Prefix: *${PREFIX}*\n`;
                menuText += `Mode: *${botMode === 'public' ? '🌍 Public' : '🔒 Private'}*\n\n`;

                menuText += `┏━━━ CORE ━━━┓\n`;
                menuText += `┃ ${PREFIX}alive\n`;
                menuText += `┃ ${PREFIX}menu\n`;
                menuText += `┃ ${PREFIX}ping\n`;
                menuText += `┃ ${PREFIX}owner\n`;
                menuText += `┗━━━━━━━━━━━━┛\n\n`;

                menuText += `┏━━━ OWNER ━━━┓\n`;
                menuText += `┃ ${PREFIX}mode public/private\n`;
                menuText += `┃ ${PREFIX}addsudo @user\n`;
                menuText += `┃ ${PREFIX}delsudo @user\n`;
                menuText += `┃ ${PREFIX}listsudo\n`;
                menuText += `┗━━━━━━━━━━━━━━┛\n\n`;

                menuText += `┏━━━ GROUP ━━━┓\n`;
                menuText += `┃ ${PREFIX}add <num>\n`;
                menuText += `┃ ${PREFIX}kick @user\n`;
                menuText += `┃ ${PREFIX}promote @user\n`;
                menuText += `┃ ${PREFIX}demote @user\n`;
                menuText += `┃ ${PREFIX}tagall\n`;
                menuText += `┃ ${PREFIX}group open/close\n`;
                menuText += `┃ ${PREFIX}link\n`;
                menuText += `┗━━━━━━━━━━━━━━┛\n\n`;

                menuText += `┏━━━ FUN ━━━┓\n`;
                menuText += `┃ ${PREFIX}dice\n`;
                menuText += `┃ ${PREFIX}flip\n`;
                menuText += `┃ ${PREFIX}joke\n`;
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
                } catch (err) {
                    console.log(chalk.red('[DEBUG] Menu image failed, sending text'));
                    await reply(menuText);
                    await react('✅');
                }
                break;
            }

            case 'alive':
            case 'ping': {
                console.log(chalk.blue('[DEBUG] Alive command started'));
                const uptime = process.uptime();
                const d = Math.floor(uptime / 86400);
                const h = Math.floor((uptime % 86400) / 3600);
                const m = Math.floor((uptime % 3600) / 60);

                const aliveImage = 'https://raw.githubusercontent.com/amanmohdtp/Forka-Bot/cba375eab1c584dcca0891e2eda96d0dddc0cdf2/alive.jpg';
                
                const text = 
                    `╔═════《 ALIVE 》═════╗\n\n` +
                    `❖ *Bot:* ${config.botName}\n` +
                    `❖ *Uptime:* ${d}d ${h}h ${m}m\n` +
                    `❖ *Prefix:* ${PREFIX}\n` +
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
                console.log(chalk.blue('[DEBUG] Owner command started'));
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
                console.log(chalk.blue('[DEBUG] Mode command started'));
                if (!isOwner()) {
                    console.log(chalk.yellow('[DEBUG] Mode command denied - not owner'));
                    return reply('👑 Owner only');
                }

                const newMode = args[0]?.toLowerCase();
                if (!['public', 'private'].includes(newMode)) {
                    return reply(
                        `🔧 *Bot Mode*\n\n` +
                        `Current: ${botMode === 'public' ? '🌍 Public' : '🔒 Private'}\n\n` +
                        `Usage:\n` +
                        `${PREFIX}mode public\n` +
                        `${PREFIX}mode private`
                    );
                }

                const success = setBotMode(newMode);
                console.log(chalk.gray(`[DEBUG] setBotMode returned: ${success}`));
                
                if (success) {
                    await react('✅');
                    await reply(`✅ Mode changed to: ${newMode === 'public' ? '🌍 Public' : '🔒 Private'}`);
                } else {
                    await react('❌');
                    await reply('❌ Failed to change mode');
                }
                break;
            }

            case 'addsudo': {
                console.log(chalk.blue('[DEBUG] Addsudo command started'));
                if (!isOwner()) {
                    console.log(chalk.yellow('[DEBUG] Addsudo denied - not owner'));
                    return reply('👑 Owner only');
                }

                const mentioned = getMentioned();
                let targetNumber = null;
                
                // Get number from mention or argument
                if (mentioned.length > 0) {
                    targetNumber = mentioned[0].split('@')[0].replace(/[^0-9]/g, '');
                } else if (args[0]) {
                    targetNumber = args[0].replace(/[^0-9]/g, '');
                }

                if (!targetNumber) {
                    return reply(`Usage: ${PREFIX}addsudo @user or ${PREFIX}addsudo 628xxx`);
                }

                console.log(chalk.gray(`[DEBUG] Adding sudo: ${targetNumber}`));
                
                // Pass plain number to addSudoUser
                const success = addSudoUser(targetNumber);
                console.log(chalk.gray(`[DEBUG] addSudoUser returned: ${success}`));
                
                if (success) {
                    await react('✅');
                    const targetJid = `${targetNumber}@s.whatsapp.net`;
                    await sock.sendMessage(from, {
                        text: `✅ Added @${targetNumber} as sudo user`,
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
                console.log(chalk.blue('[DEBUG] Delsudo command started'));
                if (!isOwner()) {
                    console.log(chalk.yellow('[DEBUG] Delsudo denied - not owner'));
                    return reply('👑 Owner only');
                }

                const mentioned = getMentioned();
                let targetNumber = null;
                
                if (mentioned.length > 0) {
                    targetNumber = mentioned[0].split('@')[0].replace(/[^0-9]/g, '');
                } else if (args[0]) {
                    targetNumber = args[0].replace(/[^0-9]/g, '');
                }

                if (!targetNumber) {
                    return reply(`Usage: ${PREFIX}delsudo @user or ${PREFIX}delsudo 628xxx`);
                }

                console.log(chalk.gray(`[DEBUG] Removing sudo: ${targetNumber}`));
                
                const success = removeSudoUser(targetNumber);
                console.log(chalk.gray(`[DEBUG] removeSudoUser returned: ${success}`));
                
                if (success) {
                    await react('✅');
                    const targetJid = `${targetNumber}@s.whatsapp.net`;
                    await sock.sendMessage(from, {
                        text: `✅ Removed @${targetNumber} from sudo users`,
                        mentions: [targetJid]
                    }, { quoted: msg });
                } else {
                    await react('❌');
                    await reply(`❌ Not a sudo user`);
                }
                break;
            }

            case 'listsudo': {
                console.log(chalk.blue('[DEBUG] Listsudo command started'));
                if (!isOwner()) {
                    console.log(chalk.yellow('[DEBUG] Listsudo denied - not owner'));
                    return reply('👑 Owner only');
                }

                const sudos = getAllSudoUsers();
                console.log(chalk.gray(`[DEBUG] Sudo users: ${JSON.stringify(sudos)}`));
                
                if (sudos.length === 0) {
                    return reply('📋 No sudo users');
                }

                let text = `📋 *SUDO USERS* (${sudos.length})\n\n`;
                const mentions = [];
                
                sudos.forEach((num, i) => {
                    text += `${i + 1}. @${num}\n`;
                    mentions.push(`${num}@s.whatsapp.net`);
                });

                await react('📋');
                await sock.sendMessage(from, { text, mentions }, { quoted: msg });
                break;
            }

            // GROUP COMMANDS
            case 'add': {
                console.log(chalk.blue('[DEBUG] Add command started'));
                if (!isGroup) return reply('❌ Group only');
                if (!(await isAdmin())) return reply('❌ Admin only');
                if (!(await isBotAdmin())) return reply('❌ Bot must be admin');

                if (!args[0]) return reply(`Usage: ${PREFIX}add 628xxx`);

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
                console.log(chalk.blue('[DEBUG] Kick command started'));
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
                console.log(chalk.blue('[DEBUG] Promote/demote command started'));
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
                console.log(chalk.blue('[DEBUG] Tagall command started'));
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
                console.log(chalk.blue('[DEBUG] Group command started'));
                if (!isGroup) return reply('❌ Group only');
                if (!(await isAdmin())) return reply('❌ Admin only');
                if (!(await isBotAdmin())) return reply('❌ Bot must be admin');

                const mode = args[0]?.toLowerCase();
                if (!['open', 'close'].includes(mode)) {
                    return reply(`Usage: ${PREFIX}group open/close`);
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
                console.log(chalk.blue('[DEBUG] Link command started'));
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
                console.log(chalk.blue('[DEBUG] Dice command started'));
                const roll = Math.floor(Math.random() * 6) + 1;
                await react('🎲');
                await reply(`🎲 You rolled *${roll}*`);
                break;
            }

            case 'flip':
            case 'coinflip': {
                console.log(chalk.blue('[DEBUG] Flip command started'));
                const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
                await react('🪙');
                await reply(`🪙 *${result}*`);
                break;
            }

            case 'joke': {
                console.log(chalk.blue('[DEBUG] Joke command started'));
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

            // OWNER EVAL - KEEP LAST
            case 'eval': {
                console.log(chalk.blue('[DEBUG] Eval command started'));
                if (!isOwner()) {
                    console.log(chalk.yellow('[DEBUG] Eval denied - not owner'));
                    return reply('👑 Owner only');
                }

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
                console.log(chalk.yellow(`[DEBUG] Unknown command: ${cmd}`));
                await react('❓');
                await reply(`Unknown command. Type ${PREFIX}menu`);
                break;
            }
        }
    } catch (error) {
        console.error(chalk.red(`[ERROR] Command ${cmd}:`), error.message);
        console.error(chalk.red(error.stack));
        await react('❌');
        await reply(`❌ Error: ${error.message}`);
    }
}
