/*
 * Lokasi: src/game/gameManager.js
 * Versi: v2
 */

import { getSession, statements, gameSessionCache, rpgUserCache } from '#database';
import db from '#database';
import { handleTictactoeMove, handleTictactoeInvite } from './tictactoe.js';
import { handleWordGameAnswer } from './wordGames.js';

export async function handleGameResponse(sock, m, text) {
    const chatId = m.key.remoteJid;
    const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMessage) return false;

    const quotedText = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || '';
    
    const susunkataRegex = /\u200B{3}SUSUNKATA:(.*?)\u200B{3}/;
    const tebakkataRegex = /\u200B{3}TEBAKKATA:(.*?)\u200B{3}/;
    const tttInviteRegex = /\u200B{3}TTT_INVITE:(.*?)\u200B{3}/;
    const tttGameRegex = /\u200B{3}TICTACTOE:(.*?)\u200B{3}/;

    const susunkataMatch = quotedText.match(susunkataRegex);
    const tebakkataMatch = quotedText.match(tebakkataRegex);
    const tttInviteMatch = quotedText.match(tttInviteRegex);
    const tttGameMatch = quotedText.match(tttGameRegex);

    if (!susunkataMatch && !tebakkataMatch && !tttInviteMatch && !tttGameMatch) {
        return false;
    }
    
    const session = await getSession(chatId);
    if (!session) {
        await sock.sendMessage(chatId, { text: 'Sesi permainan ini sudah berakhir atau tidak ditemukan.' }, { quoted: m });
        return true;
    }

    if (Date.now() > session.db_expires_at) {
        await sock.sendMessage(chatId, { text: 'Waktu untuk sesi permainan ini telah habis.' }, { quoted: m });
        return true;
    }
    
    if (susunkataMatch || tebakkataMatch) {
        const gameType = susunkataMatch ? 'susunkata' : 'tebakkata';
        await handleWordGameAnswer(sock, m, session, gameType, text);
        return true;
    }
    
    if (tttInviteMatch) {
        await handleTictactoeInvite(sock, m, session, tttInviteMatch[1], text);
        return true;
    }

    if (tttGameMatch) {
        await handleTictactoeMove(sock, m, session, tttGameMatch[1], text);
        return true;
    }

    return false;
}