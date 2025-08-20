/*
* Lokasi: src/game/wordGames.js
* Versi: v2
*/
import db, { statements, gameSessionCache, rpgUserCache } from '#database';
import { formatCoin } from '#lib/utils.js';
import crypto from 'crypto';

const REWARD_GAME = 1500;
const hashAnswer = (answer) => crypto.createHash('sha256').update(answer.toUpperCase()).digest('hex');

export async function handleWordGameAnswer(sock, m, session, gameType, text) {
    if (session.game_type !== gameType) return;
    
    const userAnswer = text.trim();
    if (hashAnswer(userAnswer) === hashAnswer(session.answer)) {
        statements.deleteGameSession.run(m.key.remoteJid);
        gameSessionCache.delete(m.key.remoteJid);
        const winnerJid = m.sender;
        const userRpg = statements.getRpgUser.get(winnerJid);
        let rewardMessage = '';
        if (userRpg) {
            db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?').run(REWARD_GAME, winnerJid);
            rpgUserCache.delete(winnerJid);
            rewardMessage = ` dan mendapatkan hadiah *${formatCoin(REWARD_GAME)}*!`;
        }
        const message = `*Benar!* 🎉\n\nJawaban: *${session.answer}*\n\nSelamat kepada @${winnerJid.split('@')[0]} yang berhasil menjawab${rewardMessage}`;
        await sock.sendMessage(m.key.remoteJid, { text: message, mentions: [winnerJid] });
    } else {
        await sock.sendMessage(m.key.remoteJid, { text: 'Jawaban salah, coba lagi!' }, { quoted: m });
    }
}