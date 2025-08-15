/*
* Lokasi: src/commands/game/tictactoe.js
* Versi: v3
*/

import db, { gameSessionCache, statements, getRpgUser, rpgUserCache } from '#database';
import config from '#config';
import crypto from 'crypto';
import { makeAiMove } from '#game/tictactoe.js';

const formatCoin = (number) => `${number.toLocaleString('id-ID')} 🪙`;
const GAME_TIMEOUT_MS = 10 * 60 * 1000;
const AI_BET_LIMIT = 30000;

function createGameMessage(session, statusText) {
    const numberEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
    let boardStr = '';
    for (let i = 0; i < 9; i++) {
        boardStr += session.board[i] === '' ? numberEmojis[i] : session.board[i];
        if ((i + 1) % 3 === 0) boardStr += '\n';
    }
    
    const currentPlayer = session.players[session.currentPlayerIndex];
    const playerTag = currentPlayer.jid === 'AI' ? 'AI' : `@${currentPlayer.jid.split('@')[0]}`;
    const turnText = `Giliran: ${playerTag} (${currentPlayer.symbol})`;
    
    const ZWS = '\u200B';
    const metadata = `${ZWS.repeat(3)}TICTACTOE:${session.gameId}${ZWS.repeat(3)}`;
    
    return `✨ *Tic Tac Toe* ✨\n\n${boardStr.trim()}\n\nTaruhan: *${formatCoin(session.bet)}*\nStatus: _${statusText}_\n\n${turnText}\n${metadata}`;
}

export default {
    name: 'tictactoe',
    aliases: ['ttt'],
    category: 'game',
    description: 'Main Tic Tac Toe dengan taruhan melawan AI atau teman.',
    async execute({ sock, m, args }) {
        const chatId = m.key.remoteJid;
        const player1Jid = m.sender;
        const mode = args[0]?.toLowerCase();

        if (mode === 'terima') {
            return sock.sendMessage(chatId, { text: 'Untuk menerima tantangan, kamu harus membalas (reply) langsung pesan undangan yang dikirim bot.' }, { quoted: m });
        }

        const existingSession = gameSessionCache.get(chatId) || statements.getGameSession.get(chatId);
        if (existingSession && (!existingSession.game_type || existingSession.game_type !== 'ttt_invite')) {
            return sock.sendMessage(chatId, { text: 'Masih ada permainan yang berlangsung di grup ini. Selesaikan dulu ya.' }, { quoted: m });
        }
        
        const betAmount = parseInt(args[1], 10);
        const opponentJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

        if (!mode || (isNaN(betAmount) && !opponentJid) || (opponentJid && isNaN(parseInt(args[1], 10)))) {
            return sock.sendMessage(chatId, {
                text: `Format salah, bro! Pilih mode:\n\n1. *vs AI (Mudah)*:\n   \`${config.prefix}ttt mudah <taruhan>\`\n\n2. *vs AI (Sulit)*:\n   \`${config.prefix}ttt sulit <taruhan>\`\n\n3. *vs AI (King)*:\n   \`${config.prefix}ttt king <taruhan>\`\n\n4. *vs Teman*:\n   \`${config.prefix}ttt @teman <taruhan>\``
            }, { quoted: m });
        }
        
        const finalBet = opponentJid ? parseInt(args[1], 10) : betAmount;
        if (isNaN(finalBet) || finalBet <= 0) {
            return sock.sendMessage(chatId, { text: 'Taruhan harus berupa angka dan lebih dari nol.' }, { quoted: m });
        }

        const isVsAi = ['mudah', 'sulit', 'king'].includes(mode);
        if (isVsAi && finalBet > AI_BET_LIMIT) {
            return sock.sendMessage(chatId, { text: `Taruhan maksimal untuk melawan AI adalah *${formatCoin(AI_BET_LIMIT)}*.` }, { quoted: m });
        }

        const player1 = getRpgUser(player1Jid);
        if (!player1) {
            return sock.sendMessage(chatId, { text: 'Kamu belum terdaftar di dunia RPG. Ketik `.register` dulu.' }, { quoted: m });
        }
        if (player1.money < finalBet) {
            return sock.sendMessage(chatId, { text: `Koinmu tidak cukup untuk bertaruh sebesar ${formatCoin(finalBet)}.` }, { quoted: m });
        }
        
        if (opponentJid) {
            if (opponentJid === player1Jid) return sock.sendMessage(chatId, { text: 'Tidak bisa bermain dengan diri sendiri.' }, { quoted: m });

            const player2 = getRpgUser(opponentJid);
            if (!player2) {
                return sock.sendMessage(chatId, { text: `Pemain @${opponentJid.split('@')[0]} belum terdaftar di dunia RPG.`, mentions: [opponentJid] }, { quoted: m });
            }
            if (player2.money < finalBet) {
                return sock.sendMessage(chatId, { text: `Koin @${opponentJid.split('@')[0]} tidak cukup untuk taruhan ini.`, mentions: [opponentJid] }, { quoted: m });
            }
            
            const expiresAt = Date.now() + GAME_TIMEOUT_MS;
            const invitationSessionData = {
                gameId: crypto.randomBytes(8).toString('hex'),
                bet: finalBet,
                players: [
                    { jid: player1Jid, symbol: '❌' },
                    { jid: opponentJid, symbol: '⭕' }
                ],
            };
            
            statements.insertOrReplaceGameSession.run(chatId, 'ttt_invite', JSON.stringify(invitationSessionData), expiresAt);
            const fullSessionForCache = {
                ...invitationSessionData,
                game_type: 'ttt_invite',
                db_expires_at: expiresAt
            };
            gameSessionCache.set(chatId, fullSessionForCache);

            const ZWS = '\u200B';
            const metadata = `${ZWS.repeat(3)}TTT_INVITE:${invitationSessionData.gameId}${ZWS.repeat(3)}`;
            const inviteText = `Tantangan Tic Tac Toe dari @${player1Jid.split('@')[0]}! ⚔️\n\nTaruhan: *${formatCoin(finalBet)}*\n\n@${opponentJid.split('@')[0]}, balas (reply) pesan ini dengan \`terima\` untuk memulai permainan.\n(Tantangan kedaluwarsa dalam 10 menit)\n\n${metadata}`;
            return sock.sendMessage(chatId, { text: inviteText, mentions: [player1Jid, opponentJid] });
        }

        if (isVsAi) {
            const expiresAt = Date.now() + GAME_TIMEOUT_MS;
            const sessionData = {
                gameId: crypto.randomBytes(8).toString('hex'),
                mode: mode,
                bet: finalBet,
                board: Array(9).fill(''),
                players: [
                    { jid: player1Jid, symbol: '❌' },
                    { jid: 'AI', symbol: '⭕' }
                ],
                currentPlayerIndex: 0,
            };
            
            if (mode === 'king') {
                sessionData.players.reverse();
                sessionData.currentPlayerIndex = 1;
                const availableStarts = [0, 2, 4, 6, 8];
                const firstMove = availableStarts[Math.floor(Math.random() * availableStarts.length)];
                sessionData.board[firstMove] = sessionData.players[0].symbol;
            }

            try {
                db.prepare('UPDATE rpg_users SET money = money - ? WHERE jid = ?').run(finalBet, player1Jid);
                rpgUserCache.delete(player1Jid);
                
                statements.insertOrReplaceGameSession.run(chatId, 'tictactoe', JSON.stringify(sessionData), expiresAt);
                const fullSessionForCache = {
                    ...sessionData,
                    game_type: 'tictactoe',
                    db_expires_at: expiresAt
                };
                gameSessionCache.set(chatId, fullSessionForCache);

                const messageText = createGameMessage(sessionData, 'Permainan dimulai!');
                await sock.sendMessage(chatId, { text: messageText, mentions: [player1Jid] });

            } catch (error) {
                console.error("Gagal memulai game ttt vs AI:", error);
                await sock.sendMessage(chatId, { text: 'Gagal memulai permainan karena ada masalah internal.' }, { quoted: m });
            }
        } else {
            return sock.sendMessage(chatId, { text: 'Mode permainan tidak valid. Pilih `mudah`, `sulit`, `king`, atau `@mention` temanmu.' }, { quoted: m });
        }
    }
};