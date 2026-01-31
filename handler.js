import chalk from 'chalk';
import util from 'util';

export const handleMessage = async (sock, msg, config) => {
    if (!msg?.key || !msg?.message) return;

    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;
    const isGroup = from.endsWith('@g.us');
    const userNumber = sender.split('@')[0];

    // ─── Body extraction ───────────────────────────────────────────────
    const getBody = () => {
        const m = msg.message ?? {};
        return (
            m.conversation ||
            m.extendedTextMessage?.text ||
            m.imageMessage?.caption ||
            m.videoMessage?.caption ||
            m.documentMessage?.caption ||
            m.documentWithCaptionMessage?.message?.documentMessage?.caption ||
            m.buttonsResponseMessage?.selectedButtonId ||
            m.listResponseMessage?.title ||
            m.templateButtonReplyMessage?.selectedId ||
            ''
        ).trim();
    };

    const body = getBody();
    console.log(chalk.cyan(`[MSG] ${userNumber}: ${body.substring(0, 50)}${body.length > 50 ? '...' : ''}`));
    
    if (!body.startsWith(config.prefix)) return;

    const args = body.slice(config.prefix.length).trim().split(/ +/);
    const cmd = args.shift()?.toLowerCase();
    if (!cmd) return;

    console.log(chalk.green(`[CMD] ${cmd} | ${userNumber} | ${isGroup ? 'group' : 'private'}`));

    // ─── Helpers ───────────────────────────────────────────────────────
    const reply = async (text, opts = {}) => {
        await sock.sendPresenceUpdate('composing', from);
        if (opts.delay) await new Promise(r => setTimeout(r, opts.delay));

        const sent = await sock.sendMessage(from, { text }, { quoted: msg, ...opts });
        await sock.sendPresenceUpdate('available', from);
        return sent;
    };

    const react = async (emoji) => {
        try {
            await sock.sendMessage(from, { react: { text: emoji, key: msg.key } });
        } catch {}
    };

    const mentionReply = async (text, jids) => {
        const mentions = Array.isArray(jids) ? jids : [jids];
        return reply(text, { mentions });
    };

    const getMentionedJids = () => {
        return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    };

    const isOwner = () => {
        const owner = (config.ownerNumber || '').replace(/[^0-9]/g, '');
        return owner && (sender.includes(owner) || sender === `${owner}@s.whatsapp.net`);
    };

    const isAdmin = async (jid) => {
        if (!isGroup) return false;
        try {
            const meta = await sock.groupMetadata(from);
            return meta.participants.some(p => p.id === jid && p.admin);
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

    // Cooldown (anti-spam)
    if (!global.cooldowns) global.cooldowns = new Map();
    const COOLDOWN_MS = 1800;

    const checkCooldown = () => {
        const now = Date.now();
        const last = global.cooldowns.get(sender) || 0;
        if (now - last < COOLDOWN_MS) return Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
        global.cooldowns.set(sender, now);
        return 0;
    };

    const cdLeft = checkCooldown();
    if (cdLeft > 0) {
        await react('⏳');
        return reply(`⏳ Wait ${cdLeft}s`);
    }

    await react('🔄');

    // ─── Command Handler ───────────────────────────────────────────────
    try {
        switch (cmd) {
        // ── CORE ────────────────────────────────────────────────────────
        case 'menu':
        case 'help': {
            const menuImageUrl = 'https://raw.githubusercontent.com/amanmohdtp/Forka-Bot/1d6fd5149f1c0bc1ff1d1d3201f397e859eb4e55/menu.png';

            let menuText = `╭━━━『 *${config.botName.toUpperCase()}* 』━━━╮\n\n`;
            menuText += `👋 Hello @${userNumber}!\n\n`;
            menuText += `Prefix : *${config.prefix}*\n\n`;

            menuText += `┏━━━ CORE ━━━┓\n`;
            menuText += `┃ ${config.prefix}alive / ping\n`;
            menuText += `┃ ${config.prefix}menu\n`;
            menuText += `┃ ${config.prefix}botinfo\n`;
            menuText += `┃ ${config.prefix}owner\n`;
            menuText += `┃ ${config.prefix}runtime\n`;
            menuText += `┗━━━━━━━━━━━━┛\n\n`;

            menuText += `┏━━━ GROUP ━━━┓\n`;
            menuText += `┃ ${config.prefix}add <num>\n`;
            menuText += `┃ ${config.prefix}kick @user\n`;
            menuText += `┃ ${config.prefix}promote @user\n`;
            menuText += `┃ ${config.prefix}demote @user\n`;
            menuText += `┃ ${config.prefix}tagall\n`;
            menuText += `┃ ${config.prefix}group open/close\n`;
            menuText += `┃ ${config.prefix}setname <text>\n`;
            menuText += `┃ ${config.prefix}setdesc <text>\n`;
            menuText += `┃ ${config.prefix}admins\n`;
            menuText += `┃ ${config.prefix}groupinfo\n`;
            menuText += `┃ ${config.prefix}link\n`;
            menuText += `┗━━━━━━━━━━━━━━┛\n\n`;

            menuText += `┏━━━ FUN ━━━┓\n`;
            menuText += `┃ ${config.prefix}dice\n`;
            menuText += `┃ ${config.prefix}coinflip\n`;
            menuText += `┃ ${config.prefix}8ball <q>\n`;
            menuText += `┃ ${config.prefix}joke\n`;
            menuText += `┗━━━━━━━━━━━━┛\n\n`;

            menuText += `┏━━━ TOOLS ━━━┓\n`;
            menuText += `┃ ${config.prefix}getpic @user\n`;
            menuText += `┃ ${config.prefix}del\n`;
            menuText += `┃ ${config.prefix}calc <expr>\n`;
            menuText += `┗━━━━━━━━━━━━━━┛\n\n`;

            menuText += `╰━━━━━━━━━━━━━━━━━╯\n`;
            menuText += `👑 Owner: ${config.ownerNumber || 'Not Set'}`;

            try {
                await sock.sendMessage(from, {
                    image: { url: menuImageUrl },
                    caption: menuText,
                    mentions: [sender]
                }, { quoted: msg });
                await react('📋');
            } catch (err) {
                console.error(chalk.red('Menu image failed:'), err.message);
                await reply(menuText, { mentions: [sender] });
                await react('📋');
            }
            break;
        }

        case 'alive':
        case 'ping': {
            const aliveImageUrl = 'https://raw.githubusercontent.com/amanmohdtp/Forka-Bot/cba375eab1c584dcca0891e2eda96d0dddc0cdf2/alive.jpg';

            const uptime = process.uptime();
            const d = Math.floor(uptime / 86400);
            const h = Math.floor((uptime % 86400) / 3600);
            const m = Math.floor((uptime % 3600) / 60);

            const statusText = 
                `╔═════《 ALIVE 》═════╗\n\n` +
                `❖ *Bot:* ${config.botName}\n` +
                `❖ *Uptime:* ${d}d ${h}h ${m}m\n` +
                `❖ *Prefix:* ${config.prefix}\n` +
                `❖ *Owner:* ${config.ownerName || 'Owner'}\n` +
                `❖ *Number:* +${sock.user?.id?.split(':')[0] || '???'}\n` +
                `❖ *Mode:* Public\n` +
                `❖ *Version:* ${config.version || '1.0.0'}\n\n` +
                `╚════════════════════╝`;

            try {
                await sock.sendMessage(from, {
                    image: { url: aliveImageUrl },
                    caption: statusText,
                    footer: 'Powered by Forka Bot',
                    mentions: [sender]
                }, { quoted: msg });
                await react('✅');
            } catch (err) {
                console.error(chalk.red('Alive image failed:'), err.message);
                await reply(statusText, { mentions: [sender] });
                await react('✅');
            }
            break;
        }

        case 'botinfo': {
            const uptime = process.uptime();
            const d = Math.floor(uptime / 86400);
            const h = Math.floor((uptime % 86400) / 3600);
            const m = Math.floor((uptime % 3600) / 60);

            await react('🤖');
            await reply(
                `╭━━━ BOT INFO ━━━╮\n\n` +
                `Name     : ${config.botName || 'Bot'}\n` +
                `Number   : ${sock.user?.id.split(':')[0] || 'Unknown'}\n` +
                `Prefix   : ${config.prefix}\n` +
                `Uptime   : ${d}d ${h}h ${m}m\n` +
                `Memory   : ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB\n` +
                `Owner    : ${config.ownerNumber || 'Not set'}\n` +
                `Status   : Online\n\n` +
                `╰━━━━━━━━━━━━━━━╯`
            );
            break;
        }

        case 'owner': {
            await react('👑');
            await reply(
                `👑 *OWNER*\n\n` +
                `Number : wa.me/${config.ownerNumber || 'Not set'}\n` +
                `Contact directly for serious matters.`
            );
            break;
        }

        case 'runtime': {
            const rt = process.uptime();
            const d = Math.floor(rt / 86400);
            const h = Math.floor((rt % 86400) / 3600);
            const m = Math.floor((rt % 3600) / 60);
            const s = Math.floor(rt % 60);

            await react('⏱️');
            await reply(`⏱️ *Runtime*\n\n${d}d ${h}h ${m}m ${s}s`);
            break;
        }

        // ── GROUP COMMANDS ──────────────────────────────────────────────
        case 'add': {
            if (!isGroup) return reply('Group only');
            if (!(await isAdmin(sender))) return reply('Admin only');
            if (!(await isBotAdmin())) return reply('Make bot admin first');

            if (!args[0]) return reply(`Usage: ${config.prefix}add 628xxxxxxxxxx`);

            let num = args[0].replace(/[^0-9]/g, '');
            if (num.startsWith('0')) num = '62' + num.slice(1);
            if (!num.startsWith('62')) num = '62' + num;

            try {
                await sock.groupParticipantsUpdate(from, [`${num}@s.whatsapp.net`], 'add');
                await react('✅');
                await reply(`Added +${num}`);
            } catch (e) {
                await react('❌');
                await reply(`Failed: ${e.message.includes('already') ? 'Already in group' : e.message}`);
            }
            break;
        }

        case 'kick': {
            if (!isGroup) return reply('Group only');
            if (!(await isAdmin(sender))) return reply('Admin only');
            if (!(await isBotAdmin())) return reply('Make bot admin first');

            const users = getMentionedJids();
            if (!users.length) return reply('Mention someone to kick');

            try {
                await sock.groupParticipantsUpdate(from, users, 'remove');
                await react('✅');
                await reply(`Removed ${users.length} user(s)`);
            } catch (e) {
                await react('❌');
                await reply(`Failed: ${e.message}`);
            }
            break;
        }

        case 'promote':
        case 'demote': {
            if (!isGroup) return reply('Group only');
            if (!(await isAdmin(sender))) return reply('Admin only');
            if (!(await isBotAdmin())) return reply('Make bot admin first');

            const users = getMentionedJids();
            if (!users.length) return reply('Mention someone');

            const action = cmd === 'promote' ? 'promote' : 'demote';

            try {
                await sock.groupParticipantsUpdate(from, users, action);
                await react('✅');
                await reply(`${action === 'promote' ? 'Promoted' : 'Demoted'} ${users.length} user(s)`);
            } catch (e) {
                await react('❌');
                await reply(`Failed: ${e.message}`);
            }
            break;
        }

        case 'tagall': {
            if (!isGroup) return reply('Group only');
            if (!(await isAdmin(sender))) return reply('Admin only');

            try {
                const meta = await sock.groupMetadata(from);
                const members = meta.participants.map(p => p.id);
                const text = args.join(' ') || 'Attention everyone!';

                let msgText = `📢 *${text}*\n\n`;
                members.forEach((id, i) => {
                    msgText += `${i + 1}. @${id.split('@')[0]}\n`;
                });

                await react('📢');
                await mentionReply(msgText, members);
            } catch (e) {
                await react('❌');
                await reply('Failed to tagall');
            }
            break;
        }

        case 'group': {
            if (!isGroup) return reply('Group only');
            if (!(await isAdmin(sender))) return reply('Admin only');
            if (!(await isBotAdmin())) return reply('Make bot admin first');

            const mode = args[0]?.toLowerCase();
            if (!['open', 'close'].includes(mode)) return reply(`Usage: ${config.prefix}group open / close`);

            try {
                await sock.groupSettingUpdate(from, mode === 'open' ? 'not_announcement' : 'announcement');
                await react('✅');
                await reply(`Group is now ${mode === 'open' ? 'open' : 'closed'} for non-admins`);
            } catch (e) {
                await react('❌');
                await reply(`Failed: ${e.message}`);
            }
            break;
        }

        case 'setname': {
            if (!isGroup) return reply('Group only');
            if (!(await isAdmin(sender))) return reply('Admin only');
            if (!(await isBotAdmin())) return reply('Make bot admin first');

            const name = args.join(' ');
            if (!name) return reply(`Usage: ${config.prefix}setname New Group Name`);

            try {
                await sock.groupUpdateSubject(from, name);
                await react('✅');
                await reply('Group name updated');
            } catch (e) {
                await react('❌');
                await reply(`Failed: ${e.message}`);
            }
            break;
        }

        case 'setdesc': {
            if (!isGroup) return reply('Group only');
            if (!(await isAdmin(sender))) return reply('Admin only');
            if (!(await isBotAdmin())) return reply('Make bot admin first');

            const desc = args.join(' ');
            if (!desc) return reply(`Usage: ${config.prefix}setdesc New description`);

            try {
                await sock.groupUpdateDescription(from, desc);
                await react('✅');
                await reply('Group description updated');
            } catch (e) {
                await react('❌');
                await reply(`Failed: ${e.message}`);
            }
            break;
        }

        case 'link': {
            if (!isGroup) return reply('Group only');
            if (!(await isAdmin(sender))) return reply('Admin only');

            try {
                const code = await sock.groupInviteCode(from);
                await react('🔗');
                await reply(`https://chat.whatsapp.com/${code}`);
            } catch (e) {
                await react('❌');
                await reply(`Failed: ${e.message.includes('not') ? 'Bot not admin' : e.message}`);
            }
            break;
        }

        case 'admins': {
            if (!isGroup) return reply('Group only');

            try {
                const meta = await sock.groupMetadata(from);
                const admins = meta.participants.filter(p => p.admin);

                let txt = `👑 *ADMINS* (${admins.length})\n\n`;
                admins.forEach((a, i) => {
                    txt += `${i + 1}. @${a.id.split('@')[0]} ${a.admin === 'superadmin' ? '👑 Creator' : ''}\n`;
                });

                await react('👑');
                await mentionReply(txt, admins.map(a => a.id));
            } catch (e) {
                await react('❌');
                await reply('Failed to fetch admins');
            }
            break;
        }

        case 'groupinfo': {
            if (!isGroup) return reply('Group only');

            try {
                const meta = await sock.groupMetadata(from);
                const txt = 
                    `📊 *GROUP INFO*\n\n` +
                    `Name       : ${meta.subject}\n` +
                    `ID         : ${from.split('@')[0]}\n` +
                    `Members    : ${meta.participants.length}\n` +
                    `Admins     : ${meta.participants.filter(p => p.admin).length}\n` +
                    `Created    : ${new Date(meta.creation * 1000).toLocaleDateString()}\n` +
                    `Locked     : ${meta.announce ? 'Yes' : 'No'}\n` +
                    `Desc       : ${meta.desc?.slice(0, 120) || 'No description'}`;

                await react('📊');
                await reply(txt);
            } catch (e) {
                await react('❌');
                await reply('Failed to get group info');
            }
            break;
        }

        // ── FUN ─────────────────────────────────────────────────────────
        case 'dice': {
            const roll = Math.floor(Math.random() * 6) + 1;
            await react('🎲');
            await reply(`🎲 You rolled **${roll}**`);
            break;
        }

        case 'coinflip':
        case 'flip': {
            const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
            await react('🪙');
            await reply(`🪙 **${result}**`);
            break;
        }

        case '8ball': {
            if (!args.length) return reply('Ask a question!');
            const answers = [
                'Yes', 'No', 'Maybe', 'Definitely', 'Ask again later',
                'Without a doubt', 'Very doubtful', 'Outlook good',
                'Cannot predict now', 'Most likely', 'My reply is no'
            ];
            const ans = answers[Math.floor(Math.random() * answers.length)];
            await react('🔮');
            await reply(`🔮 ${ans}`);
            break;
        }

        case 'joke': {
            const jokes = [
                "Why don't skeletons fight each other? They don't have the guts.",
                "I told my wife she was drawing her eyebrows too high. She looked surprised.",
                "Why do programmers prefer dark mode? Light attracts bugs.",
                "Parallel lines have so much in common. It’s a shame they’ll never meet.",
                "I’m reading a book on anti-gravity. It’s impossible to put down!"
            ];
            const j = jokes[Math.floor(Math.random() * jokes.length)];
            await react('😄');
            await reply(j);
            break;
        }

        // ── TOOLS ───────────────────────────────────────────────────────
        case 'getpic':
        case 'pp': {
            const target = getMentionedJids()[0] || sender;
            try {
                const url = await sock.profilePictureUrl(target, 'image');
                await sock.sendMessage(from, { image: { url }, caption: `Profile picture of @${target.split('@')[0]}` }, { quoted: msg });
                await react('✅');
            } catch {
                await react('❌');
                await reply('No profile picture or private');
            }
            break;
        }

        case 'del':
        case 'delete': {
            if (!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                return reply('Reply to a message to delete');
            }

            try {
                const quoted = msg.message.extendedTextMessage.contextInfo;
                const key = {
                    remoteJid: from,
                    fromMe: quoted.participant === sock.user?.id,
                    id: quoted.stanzaId,
                    participant: quoted.participant
                };
                await sock.sendMessage(from, { delete: key });
                await react('🗑️');
            } catch (e) {
                await react('❌');
                await reply('Cannot delete (maybe old message or not sent by bot)');
            }
            break;
        }

        case 'calc':
        case 'calculate': {
            if (!args.length) return reply(`Usage: ${config.prefix}calc 2 + 3 * 4`);
            try {
                const expr = args.join(' ').replace(/[^0-9+\-*/(). ]/g, '');
                const result = eval(expr); 
                await react('🧮');
                await reply(`${expr} = **${result}**`);
            } catch {
                await react('❌');
                await reply('Invalid expression');
            }
            break;
        }

        // ── OWNER ONLY ──────────────────────────────────────────────────
        case 'eval': {
            if (!isOwner()) return reply('👑 Owner only');

            try {
                const code = args.join(' ');
                let res = eval(code);
                if (typeof res !== 'string') res = util.inspect(res, { depth: 2 });
                await react('✅');
                await reply(`\`\`\`js\n${res}\n\`\`\``);
            } catch (e) {
                await react('❌');
                await reply(`\`\`\`js\nError: ${e.message}\n\`\`\``);
            }
            break;
        }

        default: {
            await react('❓');
            await reply(`Unknown command *${cmd}*\n\nType ${config.prefix}menu`);
            break;
        }
        }
    } catch (error) {
        console.error(chalk.red(`[CMD ERROR] ${cmd}:`), error.message);
        await react('❌');
        try {
            await reply(`❌ Error executing command: ${error.message}`);
        } catch (replyError) {
            console.error(chalk.red('[REPLY ERROR]'), replyError.message);
        }
    }
};
