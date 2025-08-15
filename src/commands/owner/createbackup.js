import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import config from '#config';
import logger from '#lib/logger.js';

export default {
    name: 'backup',
    aliases: ['bu'],
    category: 'owner',
    description: 'Membuat arsip .zip dari seluruh source code dan database bot.',

    async execute({ sock, m }) {
        if (!config.ownerNumber.includes(m.sender)) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Perintah ini hanya untuk owner.' }, { quoted: m });
        }

        const initialMessage = await sock.sendMessage(m.key.remoteJid, { text: 'Memulai proses backup... Mengumpulkan file dan membuat arsip .zip di memori. Mohon tunggu.' }, { quoted: m });

        const projectRoot = process.cwd();
        const outputFileName = `backup-${Date.now()}.zip`;
        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks = [];

        archive.on('data', chunk => chunks.push(chunk));
        
        archive.on('warning', (err) => {
            logger.warn({ err }, 'Peringatan dari proses backup');
        });

        archive.on('error', async (err) => {
            logger.error({ err }, 'Error fatal saat membuat arsip backup.');
            await sock.sendMessage(m.key.remoteJid, { text: `Gagal total membuat backup: ${err.message}`, edit: initialMessage.key });
        });

        archive.on('end', async () => {
            try {
                const backupBuffer = Buffer.concat(chunks);
                logger.info(`Arsip berhasil dibuat di memori: ${outputFileName} (${backupBuffer.length} total bytes)`);
                await sock.sendMessage(m.key.remoteJid, {
                    document: backupBuffer,
                    fileName: outputFileName,
                    mimetype: 'application/zip',
                    caption: '✅ Backup selesai! Ini dia file arsipnya.'
                }, { quoted: m });
            } catch (sendError) {
                logger.error({ err: sendError }, 'Gagal mengirim file backup.');
                await sock.sendMessage(m.key.remoteJid, { text: 'Gagal mengirim file backup setelah berhasil dibuat.' }, { quoted: m });
            }
        });

        try {
            archive.glob('**/*', {
                cwd: projectRoot,
                ignore: ['node_modules/**', 'baileys_session/**', '*.zip']
            });
            await archive.finalize();
        } catch (error) {
            logger.error({ err: error }, 'Error saat menambahkan file ke arsip');
            await sock.sendMessage(m.key.remoteJid, { text: `Terjadi kesalahan saat memproses file untuk di-backup.`, edit: initialMessage.key });
        }
    }
};