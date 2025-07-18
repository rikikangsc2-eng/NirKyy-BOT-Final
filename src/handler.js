import { Mutex } from 'async-mutex';
import { LRUCache } from 'lru-cache';
import { exec as _exec } from 'child_process';
import { promisify, inspect } from 'util';
import crypto from 'crypto';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { loadCommands } from '#lib/commandLoader.js';
import config from '#config';
import db, { statements, getGroupSettings, getAfkUser, getUserForLimiting, removeAfkUser, removePremium, susunkataSessions, tictactoeSessions, rpgUserCache } from '#database';
import logger from '#lib/logger.js';
import { groupMetadataCache } from '#connection';
import { handleAiInteraction } from '#lib/aiHelper.js';

const exec = promisify(_exec);
let commandsMap;
const userMutexes = new LRUCache({ max: 500, ttl: 1000 * 60 * 30 });
const afkNotificationCooldown = new LRUCache({ max: 1000, ttl: 1000 * 60 });
const groupMembershipCache = new LRUCache({ max: 500, ttl: 1000 * 60 * 15 });

const FourteenDaysInMs = 14 * 24 * 60 * 60 * 1000;
const MAX_MESSAGE_PROCESS = 5;
const EXEC_TIMEOUT = 30000;
const LIMIT_REQUIRED_CATEGORIES = ['downloader', 'tools', 'ai'];
const REWARD_SUSUNKATA = 1500;
const TTT_GAME_TIMEOUT_MS = 10 * 60 * 1000;

const whatsappGroupInviteRegex = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i;

function formatDuration(ms) {
    if (ms < 0) ms = -ms;
    const time = { hari: Math.floor(ms / 86400000), jam: Math.floor(ms / 3600000) % 24, menit: Math.floor(ms / 60000) % 60, detik: Math.floor(ms / 1000) % 60 };
    return Object.entries(time).filter(val => val[1] !== 0).map(([key, val]) => `${val} ${key}`).join(', ') || 'beberapa saat';
}

const formatCoin = (number) => `${Math.floor(number).toLocaleString('id-ID')} 🪙`;
const hashAnswer = (answer) => crypto.createHash('sha256').update(answer.toUpperCase()).digest('hex');

async function checkUserGroupMembership(sock, userJid) {
    if (!config.specialLimitGroup) return false;
    if (groupMembershipCache.has(userJid)) {
        return groupMembershipCache.get(userJid);
    }
    try {
        const metadata = await sock.groupMetadata(config.specialLimitGroup);
        const isMember = metadata.participants.some(p => p.id === userJid);
        groupMembershipCache.set(userJid, isMember);
        return isMember;
    } catch (error) {
        logger.warn({ err: error, group: config.specialLimitGroup }, "Gagal memeriksa keanggotaan grup spesial.");
        groupMembershipCache.set(userJid, false);
        return false;
    }
}

async function handleAfkLogic(sock, m, text) {
    const senderAfkData = getAfkUser(m.sender);
    if (senderAfkData) {
        const afkDuration = formatDuration(Date.now() - senderAfkData.afk_since);
        const userMention = `@${m.sender.split('@')[0]}`;
        const mentionsData = statements.getAfkMentions.all(m.sender);
        const mentionJids = new Set([m.sender]);
        let summaryMessage = `*${userMention} telah kembali aktif* setelah AFK selama *${afkDuration}*.`;
        if (mentionsData.length > 0) {
            summaryMessage += `\n\nSelama kamu pergi, ada *${mentionsData.length} pesan* buat kamu:\n`;
            mentionsData.forEach(mention => {
                const mentionerTag = `@${mention.mentioner_jid.split('@')[0]}`;
                const shortText = (mention.message_text || '').slice(0, 50) + ((mention.message_text || '').length > 50 ? '...' : '');
                summaryMessage += `\n- Dari ${mentionerTag}:\n  > _"${shortText}"_`;
                mentionJids.add(mention.mentioner_jid);
            });
        }
        await sock.sendMessage(m.key.remoteJid, { text: summaryMessage, mentions: Array.from(mentionJids) });
        removeAfkUser(m.sender);
    }
    
    const contextInfo = m.message?.extendedTextMessage?.contextInfo;
    const directMentions = contextInfo?.mentionedJid || [];
    const replyMention = contextInfo?.participant ? [contextInfo.participant] : [];
    
    const jidsToCek = new Set([...directMentions, ...replyMention]);

    if (jidsToCek.size > 0 && m.key.remoteJid.endsWith('@g.us')) {
        for (const jid of jidsToCek) {
            const afkData = getAfkUser(jid);
            if (!afkData || afkData.jid === m.sender) continue;
            
            const cooldownKey = `${m.sender}:${afkData.jid}`;
            if (afkNotificationCooldown.has(cooldownKey)) continue;

            const afkDuration = formatDuration(Date.now() - afkData.afk_since);
            const afkMessage = `Heh, jangan ganggu @${afkData.jid.split('@')[0]}, dia lagi AFK.\n\n*Alasan:* ${afkData.reason}\n*Sejak:* ${afkDuration} yang lalu.`;
            await sock.sendMessage(m.key.remoteJid, { text: afkMessage, mentions: [afkData.jid] }, { quoted: m });
            
            afkNotificationCooldown.set(cooldownKey, true);
            statements.insertAfkMention.run(afkData.jid, m.sender, m.pushName || 'Seseorang', m.key.remoteJid, text, Date.now());
        }
    }
}

function canUseLimit(userJid, isMember) {
    const user = getUserForLimiting(userJid);
    if (!user) return true;

    if (user.is_premium && user.premium_expires_at > Date.now()) {
        return { canUse: true };
    }
    if (user.is_premium && user.premium_expires_at <= Date.now()) {
        removePremium(userJid);
        const freshUser = getUserForLimiting(userJid);
        return canUseLimit(freshUser.jid, isMember);
    }

    const maxLimit = isMember ? 20 : 5;
    return { canUse: user.limit_usage < maxLimit, maxLimit };
}

function consumeLimit(userJid) {
    statements.updateUserLimit.run(userJid);
}

const tttNumberEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
const winningCombinations = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

function tttGenerateBoard(board) {
    let boardStr = '';
    for (let i = 0; i < 9; i++) {
        boardStr += board[i] === '' ? tttNumberEmojis[i] : board[i];
        if ((i + 1) % 3 === 0) boardStr += '\n';
    }
    return boardStr.trim();
}

function tttCreateGameMessage(session, statusText) {
    const boardText = tttGenerateBoard(session.board);
    const currentPlayer = session.players[session.currentPlayerIndex];
    const playerTag = currentPlayer.jid === 'AI' ? 'AI' : `@${currentPlayer.jid.split('@')[0]}`;
    const turnText = `Giliran: ${playerTag} (${currentPlayer.symbol})`;
    const ZWS = '\u200B';
    const metadata = `${ZWS.repeat(3)}TICTACTOE:${session.gameId}${ZWS.repeat(3)}`;
    return `✨ *Tic Tac Toe* ✨\n\n${boardText}\n\nTaruhan: *${formatCoin(session.bet)}*\nStatus: _${statusText}_\n\n${turnText}\n${metadata}`;
}

function tttCheckWin(board) {
    for (const combo of winningCombinations) {
        const [a, b, c] = combo;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    return null;
}

function tttCheckDraw(board) {
    return board.every(cell => cell !== '');
}

function tttMakeAiMove(board, difficulty) {
    const availableMoves = board.map((cell, index) => cell === '' ? index : null).filter(val => val !== null);
    if (difficulty === 'mudah') {
        return availableMoves[Math.floor(Math.random() * availableMoves.length)];
    } else {
        const opponentSymbol = '❌';
        for (const move of availableMoves) {
            const nextBoard = [...board];
            nextBoard[move] = '⭕';
            if (tttCheckWin(nextBoard)) return move;
        }
        for (const move of availableMoves) {
            const nextBoard = [...board];
            nextBoard[move] = opponentSymbol;
            if (tttCheckWin(nextBoard)) return move;
        }
        if (availableMoves.includes(4)) return 4;
        const corners = [0, 2, 6, 8].filter(c => availableMoves.includes(c));
        if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
        return availableMoves[Math.floor(Math.random() * availableMoves.length)];
    }
}

export async function initializeHandler(sock) {
    if (!commandsMap) commandsMap = await loadCommands();
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const processableMessages = messages.filter(m => !m.key.fromMe).slice(0, MAX_MESSAGE_PROCESS);
        for (const m of processableMessages) {
            (async () => {
                if (!m.message || m.message.viewOnceMessage) return;
                const isGroup = m.key.remoteJid.endsWith('@g.us');
                m.sender = isGroup ? m.key.participant : m.key.remoteJid;
                if (!m.sender) return logger.warn({ key: m.key }, "Pesan diabaikan: pengirim tidak dikenal.");
                let userMutex = userMutexes.get(m.sender);
                if (!userMutex) {
                    userMutex = new Mutex();
                    userMutexes.set(m.sender, userMutex);
                }
                await userMutex.runExclusive(async () => {
                    let text;
                    try {
                        text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || m.message.videoMessage?.caption || '';
                        
                        await handleAfkLogic(sock, m, text);
                        
                        if (isGroup) {
                            statements.incrementMessageCount.run(m.key.remoteJid, m.sender);
                            
                            let quotedText = '';
                            const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                            if (quotedMessage) {
                                quotedText = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || '';
                            }
                            
                            const susunkataMetadataRegex = /\u200B{3}SUSUNKATA:(\d+):([a-f0-9]+)\u200B{3}/;
                            const tttInviteMetadataRegex = /\u200B{3}TTT_INVITE:(.*?)\u200B{3}/;
                            const tttGameMetadataRegex = /\u200B{3}TICTACTOE:(.*?)\u200B{3}/;
                            
                            const susunkataMatch = quotedText.match(susunkataMetadataRegex);
                            const tttInviteMatch = quotedText.match(tttInviteMetadataRegex);
                            const tttGameMatch = quotedText.match(tttGameMetadataRegex);

                            if (susunkataMatch) {
                                const gameSession = susunkataSessions.get(m.key.remoteJid);
                                if (!gameSession) {
                                    return await sock.sendMessage(m.key.remoteJid, { text: 'Sesi game ini sudah berakhir.' }, { quoted: m });
                                }

                                const expiresAt = parseInt(susunkataMatch[1], 10);
                                if (Date.now() > expiresAt) {
                                    susunkataSessions.delete(m.key.remoteJid);
                                    return await sock.sendMessage(m.key.remoteJid, { text: `Waktu habis! 😥\n\nJawaban untuk soal "${gameSession.question}" adalah *${gameSession.answer}*.` }, { quoted: m });
                                }

                                const userAnswer = text.trim();
                                if (hashAnswer(userAnswer) === susunkataMatch[2]) {
                                    const winnerJid = m.sender;
                                    const userRpg = statements.getRpgUser.get(winnerJid);
                                    let rewardMessage = '';
                                    if (userRpg) {
                                        db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?').run(REWARD_SUSUNKATA, winnerJid);
                                        rpgUserCache.delete(winnerJid);
                                        rewardMessage = ` dan mendapatkan hadiah *${formatCoin(REWARD_SUSUNKATA)}*!`;
                                    }
                                    const message = `*Benar!* 🎉\n\nJawaban: *${gameSession.answer}*\n\nSelamat kepada @${winnerJid.split('@')[0]} yang berhasil menjawab${rewardMessage}`;
                                    await sock.sendMessage(m.key.remoteJid, { text: message, mentions: [winnerJid] });
                                    susunkataSessions.delete(m.key.remoteJid);
                                } else {
                                    await sock.sendMessage(m.key.remoteJid, { text: 'Jawaban salah, coba lagi!' }, { quoted: m });
                                }
                                return;
                            }
                            
                            if (tttInviteMatch && text.toLowerCase() === 'terima') {
                                const gameId = tttInviteMatch[1];
                                const session = tictactoeSessions.get(m.key.remoteJid);
                                if (!session || session.gameId !== gameId || session.mode !== 'pvp_invite') return;
                                
                                if (Date.now() > session.expiresAt) {
                                    tictactoeSessions.delete(m.key.remoteJid);
                                    return sock.sendMessage(m.key.remoteJid, { text: 'Waduh, tantangan ini sudah kedaluwarsa.' }, { quoted: m });
                                }

                                if (m.sender !== session.players[1].jid) return sock.sendMessage(m.key.remoteJid, { text: 'Hanya pemain yang ditantang yang bisa menerima.' }, { quoted: m });
                                
                                const p1 = statements.getRpgUser.get(session.players[0].jid);
                                const p2 = statements.getRpgUser.get(session.players[1].jid);

                                if (!p1 || !p2 || p1.money < session.bet || p2.money < session.bet) {
                                     tictactoeSessions.delete(m.key.remoteJid);
                                     return sock.sendMessage(m.key.remoteJid, { text: 'Salah satu pemain tidak memiliki cukup koin lagi. Tantangan dibatalkan.' }, { quoted: m });
                                }

                                try {
                                    db.prepare('UPDATE rpg_users SET money = money - ? WHERE jid = ?').run(session.bet, session.players[0].jid);
                                    db.prepare('UPDATE rpg_users SET money = money - ? WHERE jid = ?').run(session.bet, session.players[1].jid);
                                    rpgUserCache.delete(session.players[0].jid);
                                    rpgUserCache.delete(session.players[1].jid);
                                    
                                    const newSession = { ...session, mode: 'pvp', board: Array(9).fill(''), currentPlayerIndex: 0, expiresAt: Date.now() + TTT_GAME_TIMEOUT_MS };
                                    const messageText = tttCreateGameMessage(newSession, 'Permainan dimulai!');
                                    await sock.sendMessage(m.key.remoteJid, { text: messageText, mentions: [session.players[0].jid, session.players[1].jid] });
                                    tictactoeSessions.set(m.key.remoteJid, newSession);
                                } catch (error) {
                                    logger.error({err: error}, "Gagal memulai game PvP TTT");
                                }
                                return;
                            }

                            if (tttGameMatch) {
                                const gameId = tttGameMatch[1];
                                const session = tictactoeSessions.get(m.key.remoteJid);
                                if (!session || session.gameId !== gameId) return;
                                
                                if (Date.now() > session.expiresAt) {
                                    tictactoeSessions.delete(m.key.remoteJid);
                                    db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?').run(session.bet, session.players[0].jid);
                                    if(session.mode === 'pvp') db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?').run(session.bet, session.players[1].jid);
                                    return sock.sendMessage(m.key.remoteJid, { text: 'Waktu permainan habis! Game dibatalkan dan taruhan dikembalikan.' }, { quoted: m });
                                }

                                const currentPlayer = session.players[session.currentPlayerIndex];
                                if (currentPlayer.jid !== m.sender) return await sock.sendMessage(m.key.remoteJid, { text: 'Bukan giliranmu.' }, { quoted: m });

                                const move = parseInt(text.trim(), 10) - 1;
                                if (isNaN(move) || move < 0 || move > 8 || session.board[move] !== '') {
                                    return await sock.sendMessage(m.key.remoteJid, { text: 'Pilihan tidak valid. Pilih nomor kotak yang masih kosong.' }, { quoted: m });
                                }
                                
                                session.expiresAt = Date.now() + TTT_GAME_TIMEOUT_MS;
                                session.board[move] = currentPlayer.symbol;
                                let winnerSymbol = tttCheckWin(session.board);
                                let isDraw = !winnerSymbol && tttCheckDraw(session.board);

                                if (winnerSymbol || isDraw) {
                                    tictactoeSessions.delete(m.key.remoteJid);
                                    let endMessage;
                                    let mentions = session.players.filter(p=>p.jid !== 'AI').map(p=>p.jid);
                                    try {
                                        if (winnerSymbol) {
                                            const winner = session.players.find(p => p.symbol === winnerSymbol);
                                            const totalPrize = session.mode === 'pvp' ? session.bet * 2 : Math.floor(session.bet * 1.5);
                                            endMessage = `*Permainan Selesai!* Pemenangnya adalah ${winner.jid === 'AI' ? 'AI' : `@${winner.jid.split('@')[0]}`}! Hadiah *${formatCoin(totalPrize)}* telah diterima.`;
                                            if (winner.jid !== 'AI') {
                                                db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?').run(totalPrize, winner.jid);
                                                rpgUserCache.delete(winner.jid);
                                            }
                                        } else {
                                            endMessage = `*Permainan Berakhir Seri!* Taruhan dikembalikan ke masing-masing pemain.`;
                                            session.players.forEach(p => {
                                                if (p.jid !== 'AI') {
                                                    db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?').run(session.bet, p.jid);
                                                    rpgUserCache.delete(p.jid);
                                                }
                                            });
                                        }
                                    } catch (dbError) {
                                        logger.error({err: dbError}, 'Error saat transaksi TTT');
                                        endMessage = "Permainan berakhir, tapi terjadi error saat memproses hadiah.";
                                    }
                                    const finalText = `✨ *Tic Tac Toe* ✨\n\n${tttGenerateBoard(session.board)}\n\n${endMessage}`;
                                    await sock.sendMessage(m.key.remoteJid, { text: finalText, mentions });
                                } else {
                                    session.currentPlayerIndex = 1 - session.currentPlayerIndex;
                                    
                                    if (session.players[session.currentPlayerIndex].jid === 'AI') {
                                        const aiMove = tttMakeAiMove(session.board, session.mode);
                                        session.board[aiMove] = session.players[session.currentPlayerIndex].symbol;
                                        winnerSymbol = tttCheckWin(session.board);
                                        isDraw = !winnerSymbol && tttCheckDraw(session.board);

                                        if (winnerSymbol || isDraw) {
                                            tictactoeSessions.delete(m.key.remoteJid);
                                            let endMessage;
                                            if (winnerSymbol) {
                                                endMessage = `*Permainan Selesai!* Sayang sekali, AI memenangkan permainan ini. Taruhanmu hangus.`;
                                            } else {
                                                endMessage = `*Permainan Berakhir Seri!* Taruhan dikembalikan.`;
                                                db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?').run(session.bet, session.players[0].jid);
                                                rpgUserCache.delete(session.players[0].jid);
                                            }
                                            const finalText = `✨ *Tic Tac Toe* ✨\n\n${tttGenerateBoard(session.board)}\n\n${endMessage}`;
                                            await sock.sendMessage(m.key.remoteJid, { text: finalText, mentions: [session.players[0].jid]});
                                            return;
                                        }
                                        session.currentPlayerIndex = 1 - session.currentPlayerIndex;
                                    }
                                    const messageText = tttCreateGameMessage(session, 'Lanjutkan!');
                                    const mentions = session.players.filter(p => p.jid !== 'AI').map(p => p.jid);
                                    await sock.sendMessage(m.key.remoteJid, { text: messageText, mentions });
                                }
                                return;
                            }

                            const groupSettings = getGroupSettings(m.key.remoteJid) || {};
                            if (groupSettings?.antilink_enabled) {
                                let metadata = groupMetadataCache.get(m.key.remoteJid) || await sock.groupMetadata(m.key.remoteJid);
                                if (!groupMetadataCache.has(m.key.remoteJid)) groupMetadataCache.set(m.key.remoteJid, metadata);
                                
                                const senderInfo = metadata.participants.find(p => p.id === m.sender);
                                if (!senderInfo?.admin) {
                                    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                                    const botIsAdmin = metadata.participants.find(p => p.id === botId)?.admin;
                                    
                                    if (botIsAdmin && whatsappGroupInviteRegex.test(text)) {
                                        await sock.sendMessage(m.key.remoteJid, { text: `🚨 Terdeteksi link grup WhatsApp!\n@${m.sender.split('@')[0]} dilarang mengirim link undangan di grup ini.`, mentions: [m.sender] });
                                        await sock.sendMessage(m.key.remoteJid, { delete: m.key });
                                        return;
                                    }
                                }
                            }
                        }
                        
                        if (config.autoRead) await sock.readMessages([m.key]);
                        if (config.ownerNumber.includes(m.sender)) {
                            if (text.startsWith('$ ')) {
                                const { stdout, stderr } = await exec(text.slice(2), { timeout: EXEC_TIMEOUT });
                                let output = stdout ? `*STDOUT:*\n${stdout}` : '';
                                if (stderr) output += `\n*STDERR:*\n${stderr}`;
                                await sock.sendMessage(m.key.remoteJid, { text: output.trim() || 'Perintah dieksekusi tanpa output.' }, { quoted: m }); return;
                            }
                            if (text.startsWith('> ') || text.startsWith('=> ')) {
                                const code = text.slice(text.startsWith('> ') ? 2 : 3);
                                const result = text.startsWith('> ') ? await (Object.getPrototypeOf(async function(){}).constructor)('sock','m','text','db')(sock,m,text,db) : eval(code);
                                if (result !== undefined) await sock.sendMessage(m.key.remoteJid, { text: inspect(result, { depth: null }) }, { quoted: m }); return;
                            }
                        }
                        if (text.startsWith(config.prefix)) {
                            const commandArgs = text.slice(config.prefix.length).trim().split(/ +/);
                            const commandName = commandArgs.shift().toLowerCase();
                            const command = commandsMap.get(commandName) || Array.from(commandsMap.values()).find(cmd => cmd.aliases?.includes(commandName));
                            
                            if (command) {
                                const requiresLimit = LIMIT_REQUIRED_CATEGORIES.includes(command.category) && !config.ownerNumber.includes(m.sender);
                                
                                if (requiresLimit) {
                                    const isMemberOfSpecialGroup = await checkUserGroupMembership(sock, m.sender);
                                    const limitStatus = canUseLimit(m.sender, isMemberOfSpecialGroup);

                                    if (!limitStatus.canUse) {
                                        const ownerContact = config.ownerNumber[0].split('@')[0];
                                        const limitMessage = ` Waduh, limit harianmu udah abis, bro! 😩\n\nTenang, ada beberapa cara buat nambah limit:\n\n1.  *Gabung Grup Spesial*\nDapetin *20 limit/hari* dengan gabung grup kami:\n${config.groupInviteLink}\n\n2.  *Jadi Pengguna Premium*\nNikmati *limit tak terbatas* cuma dengan *${config.premiumPrice}*! Hubungi owner di wa.me/${ownerContact} untuk upgrade.\n\nLimit bakal di-reset besok. Sabar ya!`;
                                        await sock.sendMessage(m.key.remoteJid, { text: limitMessage }, { quoted: m });
                                        return;
                                    }
                                }
                                
                                try {
                                    await command.execute({ sock, m, args: commandArgs, text, commands: commandsMap, commandName });
                                    if (requiresLimit) {
                                        consumeLimit(m.sender);
                                    }
                                } catch (error) {
                                    logger.error({ err: error, command: command.name, user: m.sender }, `Error saat eksekusi command.`);
                                    await sock.sendMessage(m.key.remoteJid, { text: `Waduh, ada error internal pas jalanin command \`${command.name}\`. Laporan sudah dikirim ke tim teknis.` }, { quoted: m });
                                 }
                                
                                await sock.sendPresenceUpdate('paused', m.key.remoteJid);
                                return;
                            } else if (isGroup) {
                                const listItem = statements.getGroupListItem.get(m.key.remoteJid, commandName);
                                if (listItem) {
                                    await sock.sendMessage(m.key.remoteJid, { text: listItem.list_value }, { quoted: m });
                                    return;
                                }
                            }
                        }
                        if (!isGroup) {
                            const user = statements.getUserLastInteraction.get(m.sender);
                            if (!user || (Date.now() - user.last_interaction > FourteenDaysInMs)) {
                                const ownerJid = config.ownerNumber[0]; const ownerName = config.ownerName;
                                const greetingMessage = `Halo, ${m.pushName || 'Bro'}! 👋\n\nKenalin, aku *Alicia*, asisten AI di *${config.botName}*.\nAku bisa bantu kamu banyak hal, lho! Mulai dari download video, bikin stiker, sampe ngobrol seru.\n\nKalo mau tau aku bisa apa aja, ketik aja \`${config.prefix}menu\`.\nAtau kalo mau ngobrol langsung sama aku, tinggal chat aja di sini, ga usah pake perintah apa-apa!\n\nKalo ada bug atau saran, laporin aja ke ownerku ya:\n*Nama:* \`${ownerName}\`\n*WA:* \`wa.me/${ownerJid.split('@')[0]}\`\n\nYuk, mulai ngobrol! 💅`;
                                await sock.sendMessage(m.key.remoteJid, { text: greetingMessage.trim() });
                            }
                            statements.updateUserInteraction.run(m.sender, Date.now());
                            
                            let messageForAi = m;
                            let textForAi = text;
                            const isQuotedInPrivate = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                            
                            if (isQuotedInPrivate && !m.message.imageMessage) {
                                const { quotedMessage, stanzaId, participant } = m.message.extendedTextMessage.contextInfo;
                                if (quotedMessage.imageMessage) {
                                    messageForAi = {
                                        key: {
                                            remoteJid: m.key.remoteJid,
                                            id: stanzaId,
                                            fromMe: participant === sock.user.id.split(':')[0] + '@s.whatsapp.net',
                                            participant: participant
                                        },
                                        message: quotedMessage
                                    };
                                    if (!textForAi) {
                                        textForAi = quotedMessage.imageMessage.caption || '';
                                    }
                                }
                            }
                            
                            if (!textForAi) {
                                textForAi = m.message?.imageMessage?.caption || '';
                            }

                            const hasImageForAi = messageForAi.message?.imageMessage;
                            const shouldTriggerAi = (textForAi && !textForAi.startsWith(config.prefix)) || hasImageForAi;

                            if (shouldTriggerAi) {
                                let imageBuffer = null;
                                if (hasImageForAi) {
                                    try {
                                        imageBuffer = await downloadMediaMessage(messageForAi, 'buffer', {});
                                    } catch (error) {
                                        logger.error({ err: error, user: m.sender }, 'Gagal unduh gambar di direct message');
                                        await sock.sendMessage(m.key.remoteJid, { text: 'Gagal download gambar, coba lagi deh.' }, { quoted: m });
                                        return;
                                    }
                                }
                                await handleAiInteraction({ sock, m, text: textForAi, imageBuffer });
                            }
                        }
                    } catch (error) {
                        logger.error({ err: error, from: m.sender, text }, `Error di handler utama`);
                        await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, ada error nih pas jalanin perintah.' }, { quoted: m });
                    }
                }).catch(err => logger.warn({ err, user: m.sender }, "User mutex error."));
            })().catch(err => logger.error({ err, msg: m.key }, "Gagal proses pesan individual."));
        }
    });
    sock.ev.on('group-participants.update', async (event) => {
        const { id, participants, action } = event;
        if (id === config.specialLimitGroup) {
            participants.forEach(p => groupMembershipCache.delete(p));
        }

        if (action !== 'add' || participants.length === 0) return;
        try {
            const groupSettings = getGroupSettings(id) || {};
            if (!groupSettings?.welcome_enabled) return;
            let metadata = groupMetadataCache.get(id) || await sock.groupMetadata(id);
            if (!groupMetadataCache.has(id)) groupMetadataCache.set(id, metadata);
            if (!metadata) return;
            const mentions = participants.map(jid => `@${jid.split('@')[0]}`).join(' ');
            const welcomeMessage = (groupSettings.welcome_message || '').replace(/@user/g, mentions).replace(/@subject/g, metadata.subject);
            await sock.sendMessage(id, { text: welcomeMessage, mentions: participants });
        } catch (error) {
            logger.error({ err: error, group: id }, `Error di event welcome.`);
        }
    });
}