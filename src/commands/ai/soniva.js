import axios from 'axios';
import logger from '#lib/logger.js';
import { getGameMasterResponse } from '#lib/aiHelper.js';

const SUNO_API_URL = 'https://api.paxsenix.biz.id/ai-tools/suno-music';
const AUTH_TOKEN = 'sk-paxsenix-ImdMKbWzB6ztCfdbLn_1bYiNONyIKs2ZS-M6nELU9mEYe_Qb';
const POLLING_INTERVAL = 15000;
const POLLING_TIMEOUT = 300000;

const SONG_CREATOR_PROMPT = `ANDA ADALAH "SONGWRITER AI", seorang pencipta lagu yang sangat kreatif. Tugas Anda adalah mengubah sebuah ide sederhana dari pengguna menjadi konsep lagu yang lengkap.

### ATURAN SUPER KETAT ###
1.  **Analisis Prompt**: Pahami tema dan emosi dari prompt pengguna.
2.  **Hasilkan Komponen**: Buat tiga komponen berikut:
    *   **Judul (Title)**: Singkat, menarik, dan relevan dengan prompt.
    *   **Gaya (Style)**: Deskripsi gaya musik yang imajinatif, pisahkan dengan koma (contoh: "energetic pop rock, anthemic chorus, male vocal", "lo-fi hip hop, chill beat, melancholic piano").
    *   **Lirik (Lyrics)**: Tulis lirik lengkap (minimal 2 bait dan 1 chorus) yang sesuai dengan tema.
3.  **FORMAT OUTPUT**: Balasan Anda WAJIB mengikuti format ini dengan tag yang jelas. JANGAN tambahkan teks atau penjelasan lain di luar struktur ini.

[TITLE]:
(Judul lagu Anda di sini)

[STYLE]:
(Deskripsi gaya musik Anda di sini)

[LYRICS]:
(Lirik lengkap Anda di sini)`;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getSongDetailsFromAI(prompt) {
    try {
        const response = await getGameMasterResponse(SONG_CREATOR_PROMPT, `[PROMPT PENGGUNA]: "${prompt}"`);
        const titleMatch = response.match(/\[TITLE\]:\s*([\s\S]*?)\s*\[STYLE\]:/);
        const styleMatch = response.match(/\[STYLE\]:\s*([\s\S]*?)\s*\[LYRICS\]:/);
        const lyricsMatch = response.match(/\[LYRICS\]:\s*([\s\S]*)/);

        return {
            title: titleMatch?.[1].trim() || prompt.slice(0, 30),
            style: styleMatch?.[1].trim() || 'pop',
            lyrics: lyricsMatch?.[1].trim() || prompt,
        };
    } catch (error) {
        logger.error({ err: error }, 'Gagal mendapatkan detail lagu dari AI');
        return { title: prompt.slice(0, 30), style: 'pop', lyrics: prompt };
    }
}

async function pollTask(taskUrl) {
    const startTime = Date.now();
    while (Date.now() - startTime < POLLING_TIMEOUT) {
        try {
            const { data } = await axios.get(taskUrl);
            if (data.status === 'done') return data;
            if (data.status !== 'pending') throw new Error(`Status tugas tidak valid: ${data.status}`);
            await delay(POLLING_INTERVAL);
        } catch (error) {
            throw new Error('Gagal memeriksa status tugas.');
        }
    }
    throw new Error('Batas waktu pengecekan tugas terlampaui.');
}

export default {
    name: 'soniva',
    category: 'tools',
    description: 'Membuat 2 versi lagu orisinal menggunakan AI Suno.',
    async execute({ sock, m, args }) {
        const prompt = args.join(' ');
        if (!prompt) {
            return sock.sendMessage(m.key.remoteJid, { text: 'Berikan deskripsi lagu yang kamu inginkan. Contoh: `.soniva lagu rock tentang semangat juang`' }, { quoted: m });
        }
        
        const initialMessage = await sock.sendMessage(m.key.remoteJid, { text: 'Permintaan diterima. Meminta Songwriter AI untuk membuat konsep lagu... ✍️' }, { quoted: m });
        
        try {
            const { title, style, lyrics } = await getSongDetailsFromAI(prompt);
            
            await sock.sendMessage(m.key.remoteJid, { text: `Konsep lagu diterima dari AI:\n*Judul:* ${title}\n*Style:* ${style}\n\nMengirim ke studio Suno... 🎶`, edit: initialMessage.key });

            const payload = { title, style, lyrics };
            const initialResponse = await axios.post(SUNO_API_URL, payload, {
                headers: { 'Authorization': `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' }
            });

            if (!initialResponse.data.ok || !initialResponse.data.task_url) {
                throw new Error(initialResponse.data.message || 'API Suno tidak memberikan URL tugas.');
            }
            
            await sock.sendMessage(m.key.remoteJid, { text: 'Studio AI telah menerima permintaan. Proses pembuatan lagu dimulai, ini bisa memakan waktu beberapa menit... ⏳', edit: initialMessage.key });

            const result = await pollTask(initialResponse.data.task_url);

            if (!result.records || result.records.length === 0) {
                throw new Error('AI gagal membuat lagu atau tidak ada hasil yang dikembalikan.');
            }
            
            await sock.sendMessage(m.key.remoteJid, { text: `✅ Lagu selesai! Ini dia hasilnya, ada *${result.records.length} versi*:` }, { quoted: m });
            
            for (const song of result.records) {
                const audioBuffer = (await axios.get(song.audio_url, { responseType: 'arraybuffer' })).data;
                const caption = `🎧 *Versi Lagu Dibuat!*\n\n*Judul:* ${song.title}\n*Style:* ${song.style}`;
                await sock.sendMessage(m.key.remoteJid, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    fileName: `${song.title}.mp3`
                }, { quoted: m });
                await delay(1000);
            }

        } catch (error) {
            logger.error({ err: error, prompt }, 'Gagal membuat lagu dengan Suno');
            let errorMessage = `Waduh, gagal membuat lagu. Terjadi kesalahan: *${error.message}*`;
            if (error.response?.status === 400 && error.response.data?.message) {
                 errorMessage = `Waduh, terjadi kesalahan input.\n*Pesan Error:* ${error.response.data.message}.\n\nCoba lagi dengan prompt yang berbeda.`;
            }
            await sock.sendMessage(m.key.remoteJid, { text: errorMessage, edit: initialMessage.key });
        }
    }
};