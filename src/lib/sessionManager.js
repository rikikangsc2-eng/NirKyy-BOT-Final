/*
 * Lokasi: src/lib/sessionManager.js
 * Versi: v4
 */

import { promises as fs } from 'fs';
import path from 'path';
import logger from '#lib/logger.js';

export async function performSessionCleanup(reason = 'manual') {
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
        } else {
            logger.info('Direktori sesi tidak ditemukan, tidak perlu dibersihkan.');
        }
        return false;
    }
}