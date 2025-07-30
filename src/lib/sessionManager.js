/*
* Lokasi: src/lib/sessionManager.js
* Versi: v1
*/

import { promises as fs } from 'fs';
import path from 'path';
import logger from '#lib/logger.js';
import db, { statements, gameSessionCache, rpgUserCache } from '#database';

const DAILY_CLEANUP_INTERVAL = 1000 * 60 * 60 * 24;
const SESSION_CLEANUP_INTERVAL_MS = 60 * 1000;

export async function performSessionCleanup(reason = 'berkala') {
    const sessionDir = path.join(process.cwd(), 'baileys_session');
    logger.warn(`Memulai pembersihan sesi (${reason}) pada direktori: ${sessionDir}`);
    try {
        const files = await fs.readdir(sessionDir);
        let filesDeleted = 0;
        const unlinkPromises = files.map(file => {
            if (file !== 'creds.json') {
                filesDeleted++;
                return fs.unlink(path.join(sessionDir, file));
            }
            return Promise.resolve();
        });
        await Promise.all(unlinkPromises);
        if (filesDeleted > 0) {
            logger.info(`Pembersihan sesi selesai: ${filesDeleted} file telah dihapus.`);
            return true;
        }
        logger.warn('Tidak ada file sesi yang perlu dihapus.');
        return false;
    } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
            logger.fatal({ err: cleanupError }, 'Gagal total saat membersihkan direktori sesi. Matikan bot secara manual.');
        }
        return false;
    }
}

export function cleanupExpiredSessions(sock) {
    const now = Date.now();
    const expiredSessions = statements.getExpiredGameSessions.all(now);

    for (const dbSession of expiredSessions) {
        const session = JSON.parse(dbSession.session_data);
        logger.info(`Membersihkan sesi game kedaluwarsa: ${dbSession.game_type} di chat ${dbSession.chat_id}`);
        let message = '';

        if (dbSession.game_type === 'susunkata') {
            message = `Waktu habis untuk game Susun Kata! 😥\n\nJawaban untuk soal "${session.question}" adalah *${session.answer}*.`;
        } else if (dbSession.game_type === 'tebakkata') {
            message = `Waktu habis untuk game Tebak Kata! 😥\n\nJawaban untuk soal "${session.question}" adalah *${session.answer}*.`;
        } else if (dbSession.game_type === 'tictactoe' || dbSession.game_type === 'ttt_invite') {
            try {
                const refundTransaction = db.transaction(() => {
                    if (session.players) {
                        session.players.forEach(player => {
                            if (player.jid !== 'AI') {
                                db.prepare('UPDATE rpg_users SET money = money + ? WHERE jid = ?').run(session.bet, player.jid);
                                rpgUserCache.delete(player.jid);
                            }
                        });
                    }
                });
                refundTransaction();
                message = `Permainan Tic Tac Toe di grup ini kedaluwarsa. Taruhan telah dikembalikan.`;
            } catch (e) {
                logger.error({ err: e, session }, "Gagal mengembalikan taruhan TTT untuk sesi kedaluwarsa dari DB.");
            }
        }
        
        if (message && sock) {
            sock.sendMessage(dbSession.chat_id, { text: message }).catch(e => logger.error({err: e}, "Gagal kirim pesan cleanup"));
        }

        statements.deleteGameSession.run(dbSession.chat_id);
        gameSessionCache.delete(dbSession.chat_id);
    }
}

export function setupDailyCleanup() {
    setInterval(() => performSessionCleanup('harian'), DAILY_CLEANUP_INTERVAL);
}

export function setupGameSessionCleanup(sock) {
     setInterval(() => cleanupExpiredSessions(sock), SESSION_CLEANUP_INTERVAL_MS);
}