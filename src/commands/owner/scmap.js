/*
 * Lokasi: src/commands/owner/scmap.js
 * Versi: v2
 */

import { promises as fs } from 'fs';
import path from 'path';
import config from '#config';
import logger from '#lib/logger.js';

async function getAllFiles(dirPath, arrayOfFiles = [], targetCategory = null) {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        if (file.isDirectory()) {
            if (file.name !== 'node_modules' && file.name !== '.git' && file.name !== 'baileys_session') {
                if (path.basename(dirPath) === 'commands' && targetCategory && file.name !== targetCategory) {
                    continue;
                }
                await getAllFiles(fullPath, arrayOfFiles, targetCategory);
            }
        } else {
            if (file.name.endsWith('.js') || file.name.endsWith('package.json')) {
                arrayOfFiles.push(fullPath);
            }
        }
    }
    return arrayOfFiles;
}

export default {
    name: 'scmap',
    description: 'Membuat peta source code, opsional per kategori command, dan mengirimkannya. (Owner Only)',
    aliases: ['sc'],
    execute: async ({ sock, m, args }) => {
       if (!config.ownerNumber.includes(m.sender)) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Perintah ini hanya untuk owner.' }, { quoted: m });
        }

        const targetCategory = args[0] || null;
        const projectRoot = process.cwd();
        
        try {
            await sock.sendMessage(m.key.remoteJid, { text: `Sip, lagi nyiapin peta source code${targetCategory ? ' untuk kategori `' + targetCategory + '`' : ''}... Ini mungkin butuh beberapa detik.` }, { quoted: m });

            const allFiles = await getAllFiles(projectRoot, [], targetCategory);
            let fileContent = `Source Code Map for ${path.basename(projectRoot)}${targetCategory ? ` (Category: ${targetCategory})` : ''}\nGenerated on: ${new Date().toISOString()}\n\n`;

            for (const filePath of allFiles) {
                const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
                const separator = `---${relativePath}---\n`;
                fileContent += separator;
                const content = await fs.readFile(filePath, 'utf-8');
                fileContent += content + '\n\n';
            }

            const mapBuffer = Buffer.from(fileContent, 'utf-8');

            await sock.sendMessage(m.key.remoteJid, {
                document: mapBuffer,
                fileName: `source_code_map${targetCategory ? '_' + targetCategory : ''}.txt`,
                mimetype: 'text/plain',
                caption: 'Nih bro, peta source code lu. Kalo kita mulai dari awal lagi, tinggal kirim file ini ke gue.'
            }, { quoted: m });

        } catch (error) {
            logger.error({ err: error }, "Gagal membuat scmap");
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal bikin peta source code, bro.' }, { quoted: m });
        }
    }
};