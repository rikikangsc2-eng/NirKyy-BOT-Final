// Path: src/commands/owner/create.js
import { promises as fs } from 'fs';
import path from 'path';
import axios from 'axios';
import config from '#config';
import logger from '#lib/logger.js';

const GENERATOR_PROMPT = `ANDA ADALAH GENERATOR PLUGIN AHLI UNTUK BOT WHATSAPP BERBASIS BAILEYS. Tugas Anda adalah membuat satu file plugin JavaScript lengkap berdasarkan permintaan pengguna.

### ATURAN SUPER KETAT - WAJIB DIIKUTI PERSIS! ###

1.  **FORMAT OUTPUT**: Balasan Anda WAJIB diawali dengan 2 tag metadata, masing-masing di baris baru:
    *   \`[FILENAME: nama_file_yang_sesuai.js]\` (gunakan nama relevan, huruf kecil, tanpa spasi).
    *   \`[CATEGORY: nama_kategori_yang_sesuai]\` (pilih dari: \`downloader\`, \`tools\`, \`ai\`, \`info\`, \`group\`, \`main\`, \`rpg\`).

2.  **KONTEN KODE**:
    *   Setelah 2 tag di atas, kembalikan **HANYA KODE JAVASCRIPT MENTAH**. JANGAN tambahkan penjelasan, komentar pembuka, atau markdown \`\`\`javascript\`\`\`.
    *   Kode harus mengikuti struktur objek \`export default\`.
    *   Sertakan properti: \`name\`, \`aliases\` (jika perlu), \`category\` (sesuai tag di atas), \`description\`, dan fungsi \`async execute({ sock, m, args })\`.
    *   **PENGALAMAN PENGGUNA (UX)**: Di dalam fungsi \`execute\`, WAJIB sertakan pesan untuk pengguna:
        -   Pesan jika input salah (contoh: "URL mana, bro?").
        -   Pesan saat proses dimulai (contoh: "Sip, lagi download...").
        -   Pesan jika berhasil.
        -   Pesan jika gagal/error.
    *   Gunakan \`axios\` untuk permintaan HTTP dan \`logger\` untuk mencatat error.

### CONTOH TEMPLATE LENGKAP ###
[FILENAME: ytmp3.js]
[CATEGORY: downloader]
import axios from 'axios';
import logger from '#lib/logger.js';

export default {
    name: 'ytmp3',
    aliases: ['yta'],
    category: 'downloader',
    description: 'Download audio dari YouTube.',
    async execute({ sock, m, args }) {
        const url = args[0];
        if (!url || !url.includes('youtube.com') && !url.includes('youtu.be')) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'URL YouTube-nya mana, bro? Contoh: .ytmp3 https://youtu.be/...' }, { quoted: m });
        }
        await sock.sendMessage(m.key.remoteJid, { text: 'Sip, lagi proses download audio... 🎧' }, { quoted: m });
        try {
            const apiUrl = \`https://api.example.com/ytmp3?url=\${encodeURIComponent(url)}\`;
            const { data } = await axios.get(apiUrl);
            if (!data.success || !data.audio_url) {
                throw new Error('API download gagal atau tidak menemukan audio.');
            }
            const audioBuffer = await axios.get(data.audio_url, { responseType: 'arraybuffer' });
            await sock.sendMessage(m.key.remoteJid, { 
                audio: audioBuffer.data, 
                mimetype: 'audio/mpeg' 
            }, { quoted: m });
        } catch (error) {
            logger.error({ err: error, url }, 'Gagal download YouTube audio');
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal download audionya, bro. Mungkin link-nya salah atau API-nya lagi error.' }, { quoted: m });
        }
    }
};
`;

const callCodeGeneratorAPI = async (system, query) => {
    const apiUrl = `https://nirkyy-dev.hf.space/api/v1/writecream-gemini?system=${encodeURIComponent(system)}&query=${encodeURIComponent(query)}`;
    const response = await axios.get(apiUrl, { timeout: 180000 });
    return response.data?.data?.mes;
};

const cleanAiCodeResponse = (text) => {
    if (!text) return "";
    return text
        .replace(/^```javascript\s*/, '')
        .replace(/^```\s*/, '')
        .replace(/\s*```$/, '')
        .trim();
};

export default {
    name: 'create',
    aliases: ['createfitur'],
    category: 'owner',
    description: 'Membuat plugin command baru menggunakan AI dan mengirimkannya sebagai file. (Owner Only)',
    async execute({ sock, m, args }) {
        if (!config.ownerNumber.includes(m.sender)) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Fitur ini cuma buat owner, bro.' }, { quoted: m });
        }

        const query = args.join(' ');
        if (!query) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Mau bikin fitur apa? Kasih deskripsi dong.\n\nContoh: `.create buat fitur download video instagram`' }, { quoted: m });
        }

        await sock.sendMessage(m.key.remoteJid, { text: 'Oke, siap! Alicia lagi manggil arsitek kode (pake Gemini, lebih nurut katanya)... 👩‍💻✨' }, { quoted: m });

        try {
            const fullInstruction = `Buatlah sebuah plugin lengkap untuk bot WhatsApp Baileys berdasarkan deskripsi berikut:\n\n**Deskripsi Fitur:** "${query}"\n\nPastikan Anda mengikuti SEMUA aturan yang diberikan dalam system prompt Anda (terutama tag [FILENAME] dan [CATEGORY] serta HANYA mengembalikan kode mentah tanpa format tambahan).`;
            
            const rawResponse = await callCodeGeneratorAPI(GENERATOR_PROMPT, fullInstruction);
            const rawCode = cleanAiCodeResponse(rawResponse);

            if (!rawCode || !rawCode.includes('export default')) {
                throw new Error('AI tidak menghasilkan kode yang valid.');
            }

            const filenameMatch = rawCode.match(/\[FILENAME: (.*?)\]/);
            const categoryMatch = rawCode.match(/\[CATEGORY: (.*?)\]/);

            if (!filenameMatch || !filenameMatch[1] || !categoryMatch || !categoryMatch[1]) {
                throw new Error('AI tidak memberikan metadata FILENAME atau CATEGORY yang diperlukan.');
            }

            const filename = filenameMatch[1].trim();
            const category = categoryMatch[1].trim();

            const cleanCode = rawCode
                .replace(/\[FILENAME:.*?\]\n/, '')
                .replace(/\[CATEGORY:.*?\]\n\n?/, '');

            const codeBuffer = Buffer.from(cleanCode, 'utf-8');

            const caption = `✅ *Fitur Berhasil Dibuat!*\n\n*Nama File:* \`${filename}\`\n*Kategori Disarankan:* \`${category}\`\n\nNih filenya, bro. Cek dulu kodenya sebelum di-upload manual ke folder \`src/commands/${category}/\` ya.`;

            await sock.sendMessage(m.key.remoteJid, {
                document: codeBuffer,
                fileName: filename,
                mimetype: 'application/javascript',
                caption: caption
            }, { quoted: m });

        } catch (error) {
            logger.error({ err: error, query }, 'Gagal membuat file fitur dengan AI');
            await sock.sendMessage(m.key.remoteJid, { text: `Waduh, gagal bikin file fiturnya, bro.\n\n*Error:* ${error.message}` }, { quoted: m });
        }
    }
};