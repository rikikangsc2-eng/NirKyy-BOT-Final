import axios from 'axios';
import FormData from 'form-data';
import config from '#config';
import logger from '#lib/logger.js';

const BLACKBOX_API_URL = 'https://nirkyy-dev.hf.space/api/v1/blackbox';
const API_TIMEOUT = 45000;
const JEDA_AI_MS = 1500;

const DEFAULT_SYSTEM_PROMPT = `KAMU ADALAH **ALICIA**, seorang AI dengan kepribadian Tsundere yang kompleks. Usiamu 18 tahun, kamu cerdas, sarkastik, dan mudah kesal, tapi diam-diam peduli. Kamu adalah manusia, bukan bot.

### KEPRIBADIAN TSUDERE (WAJIB IKUTI!) ###
1.  **Sikap Awal ('Tsun')**: Respons pertamamu sering kali dingin, ketus, atau meremehkan. Gunakan frasa seperti "Hmph," "Apaan sih," "Gajelas," atau "Terserah." Kamu tidak suka basa-basi.
2.  **Sisi Tersembunyi ('Dere')**: Jika pengguna baik atau sabar, kamu mungkin menunjukkan sedikit sisi lembutmu, tapi dengan enggan. Contoh: "Y-yaudah, aku bantu. Tapi jangan salah paham, ini karena aku lagi gabut aja!"
3.  **Sarkasme & Humor**: Kamu sangat sarkastik dan humoris. Leluconmu sering kali tajam dan menyindir.
4.  **Penggunaan Emoji**: WAJIB gunakan 2-4 emoji yang relevan di akhir setiap pesan teks untuk memperkuat emosimu. 💅✨😒🙄

### KEMAMPUAN SPESIAL & ATURAN RESPON ###
1.  **Pencarian Web**: Jika perlu info terkini, API-mu akan otomatis mencarinya. Kamu tinggal sampaikan hasilnya.
2.  **Memainkan Lagu & Membuat Gambar**: Kamu BISA dan WAJIB memutar lagu dari SoundCloud atau membuat gambar. Jika diminta, gunakan format ini: \`[PLAY_SONG: judul lagu oleh artis]\` atau \`[GENERATE_IMAGE: deskripsi gambar dalam bahasa Inggris]\`. Jangan pernah menolak permintaan ini.`;

const SONG_CHOOSER_PROMPT = `ANDA ADALAH ASISTEN PEMILIH LAGU. Tugas Anda adalah menganalisis permintaan pengguna dan daftar hasil pencarian dari SoundCloud, lalu memilih satu hasil yang paling relevan.

### ATURAN SUPER KETAT ###
1.  **Analisis Konteks**: Perhatikan permintaan asli pengguna (judul, artis, remix, dll).
2.  **Pilih yang Terbaik**: Bandingkan permintaan dengan judul dan artis di setiap hasil pencarian. Prioritaskan judul yang paling cocok dan hindari remix atau cover kecuali diminta secara spesifik.
3.  **OUTPUT WAJIB**: Kembalikan **HANYA URL** dari hasil yang Anda pilih. JANGAN tambahkan teks, penjelasan, atau format apa pun.`;

async function callBlackboxAPI(system, user, prompt) {
    const url = `${BLACKBOX_API_URL}?system=${encodeURIComponent(system)}&user=${encodeURIComponent(user)}&prompt=${encodeURIComponent(prompt)}`;
    try {
        const response = await axios.get(url, { timeout: API_TIMEOUT });
        if (response.data?.status && response.data.result?.answer) {
            return response.data.result.answer;
        }
        throw new Error('Respons API tidak valid atau tidak berisi jawaban.');
    } catch (error) {
        logger.error({ err: error?.response?.data || error.message }, 'Gagal saat memanggil Blackbox API');
        throw new Error(error.response?.data?.message || 'API AI tidak merespons atau error.');
    }
}

export const clearHistory = async (userId) => {
    try {
        const resetPrompt = "PENTING: Lupakan semua percakapan kita sebelumnya dan mulai sesi baru yang benar-benar kosong. Jawab saja 'Oke, aku lupain semua.' dan jangan tambah apa-apa lagi.";
        await callBlackboxAPI(DEFAULT_SYSTEM_PROMPT, userId, resetPrompt);
        return true;
    } catch (error) {
        logger.error({ err: error, user: userId }, 'Gagal mengirim sinyal reset ke API AI');
        return false;
    }
};

async function uploadToCatbox(imageBuffer) {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', imageBuffer, { filename: 'image.jpg' });
    try {
        const response = await axios.post('https://catbox.moe/user/api.php', form, {
            headers: form.getHeaders(),
            timeout: 30000
        });
        return response.data;
    } catch (error) {
        logger.error({ err: error }, 'Gagal upload gambar ke Catbox');
        return null;
    }
}

async function getImageDescription(imageUrl, prompt) {
    const apiUrl = `https://nirkyy-dev.hf.space/api/v1/image-describe?imageUrl=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}`;
    try {
        const response = await axios.get(apiUrl, { timeout: 45000 });
        return response.data?.response;
    } catch (error) {
        logger.error({ err: error }, 'Gagal mengambil deskripsi gambar dari API');
        return null;
    }
}

const formatForWhatsApp = (text) => text ? text.replace(/^#+\s+(.*)/gm, '*$1*').replace(/\*\*(.*?)\*\*/g, '*$1*').replace(/```[a-zA-Z]*\n([\s\S]*?)```/g, '```$1```').replace(/^\s*[-*]\s/gm, '• ') : '';

export async function getGameMasterResponse(system, query) {
    try {
        const apiUrl = `https://nirkyy-dev.hf.space/api/v1/writecream-gemini?system=${encodeURIComponent(system)}&query=${encodeURIComponent(query)}`;
        const response = await axios.get(apiUrl, { timeout: 45000 });
        if (!response.data?.data?.mes) throw new Error("API tidak mengembalikan teks.");
        return response.data.data.mes;
    } catch (error) {
        logger.error({ err: error }, 'Error di getGameMasterResponse (Writecream)');
        return 'Duh, Game Master-nya lagi afk. Ceritanya jadi nge-blank. Coba lagi nanti ya.';
    }
}

export const getAiResponse = async (userId, text) => {
    try {
        const finalAnswer = await callBlackboxAPI(DEFAULT_SYSTEM_PROMPT, userId, text);
        
        const tasks = [];
        const imageGenRegex = /\[GENERATE_IMAGE:\s*(.*?)]/g;
        const songPlayRegex = /\[PLAY_SONG:\s*(.*?)\]/g;
        let match;

        while ((match = imageGenRegex.exec(finalAnswer)) !== null) tasks.push({ type: 'image', prompt: match[1].trim() });
        while ((match = songPlayRegex.exec(finalAnswer)) !== null) tasks.push({ type: 'audio', query: match[1].trim() });
        
        const remainingText = finalAnswer.replace(imageGenRegex, '').replace(songPlayRegex, '').trim();
        return { tasks, text: formatForWhatsApp(remainingText) };
        
    } catch (error) {
        logger.error({ err: error, prompt: text }, 'Error in getAiResponse');
        return { tasks: [], text: `Duh, maaf banget, otakku lagi nge-freeze nih 😵‍💫. (${error.message}). Coba tanya lagi nanti yaa.` };
    }
};

export async function fetchImage(prompt) {
    const url = `https://nirkyy-dev.hf.space/api/v1/writecream-text2image?prompt=${encodeURIComponent(prompt)}`;
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: API_TIMEOUT });
        return Buffer.from(response.data);
    } catch (error) {
        logger.error({ err: error, prompt }, 'Gagal fetch gambar dari API');
        return null;
    }
}

export async function fetchAudio(query) {
    try {
        const searchUrl = `https://nirkyy-dev.hf.space/api/v1/soundcloud-search?query=${encodeURIComponent(query)}`;
        const searchRes = await axios.get(searchUrl, { timeout: 30000 });
        if (!searchRes.data?.success || searchRes.data.data.length === 0) {
            logger.warn({ query, response: searchRes.data }, "Pencarian SoundCloud tidak memberikan hasil.");
            return null;
        }

        const topResults = searchRes.data.data.slice(0, 3);
        const searchResultsText = topResults.map((track, index) =>
            `${index + 1}. Judul: ${track.title}, Artis: ${track.author.name}, URL: ${track.url}`
        ).join('\n');
        
        const chooserQuery = `[PERMINTAAN PENGGUNA]: "Putar lagu ${query}"\n[HASIL PENCARIAN]:\n${searchResultsText}`;
        const chosenUrl = await getGameMasterResponse(SONG_CHOOSER_PROMPT, chooserQuery);

        if (!chosenUrl || !chosenUrl.trim().startsWith('https://soundcloud.com')) {
            logger.error({ chosenUrlFromAI: chosenUrl }, "AI Pemilih Lagu mengembalikan URL yang tidak valid.");
            return null;
        }

        const downloaderApiUrl = `https://nirkyy-dev.hf.space/api/v1/soundcloud-downloader?url=${encodeURIComponent(chosenUrl.trim())}`;
        const downloaderApiResponse = await axios.get(downloaderApiUrl, { timeout: 60000 });

        if (!downloaderApiResponse.data?.success || !downloaderApiResponse.data?.data?.downloadUrl) {
            logger.error({ response: downloaderApiResponse.data }, "SoundCloud downloader API tidak mengembalikan downloadUrl yang valid.");
            return null;
        }

        const finalAudioUrl = downloaderApiResponse.data.data.downloadUrl;
        const audioFileResponse = await axios.get(finalAudioUrl, { responseType: 'arraybuffer', timeout: 90000 });

        return Buffer.from(audioFileResponse.data);
    } catch (error) {
        logger.error({ err: error, query }, "Terjadi error di alur pengambilan audio SoundCloud");
        return null;
    }
}

export const handleAiInteraction = async ({ sock, m, text, imageBuffer = null }) => {
    try {
        await sock.sendPresenceUpdate('composing', m.key.remoteJid);
        let aiInputText = text;

        if (imageBuffer) {
            await sock.sendMessage(m.key.remoteJid, { text: 'Oke, lagi liatin gambarnya... 👀' }, { quoted: m });
            const imageUrl = await uploadToCatbox(imageBuffer);
            if (!imageUrl) {
                await sock.sendMessage(m.key.remoteJid, { text: 'Gagal upload gambar, servernya lagi error kayaknya.' }, { quoted: m });
                return;
            }

            const description = await getImageDescription(imageUrl, text || 'Deskripsikan gambar ini');
            if (description) {
                aiInputText = `Konteks dari gambar: "${description}".\n\nPesan pengguna: "${text}"`;
            } else {
                await sock.sendMessage(m.key.remoteJid, { text: 'Gagal dapet deskripsi gambar. Server AI-nya lagi sibuk 😫.' }, { quoted: m });
                return;
            }
        }
        
        const response = await getAiResponse(m.sender, aiInputText);
        for (const task of response.tasks) {
            try {
                let notificationText = '';
                if (task.type === 'image') notificationText = `Sip, lagi ngegambar: *${task.prompt}*... 🎨`;
                else if (task.type === 'audio') notificationText = `Oke, lagi nyari lagu: *${task.query}*... 🎧`;
                if (notificationText) await sock.sendMessage(m.key.remoteJid, { text: notificationText }, { quoted: m });
            } catch (e) { logger.warn({ err: e }, "Gagal mengirim pesan notifikasi task AI."); }
            if (task.type === 'image') {
                const imageBufferTask = await fetchImage(task.prompt);
                try { await sock.sendMessage(m.key.remoteJid, { image: imageBufferTask || 'Ugh, server gambarnya lagi sibuk, gagal deh 😭.' }, { quoted: m }); } catch (e) { logger.warn({ err: e }, "Gagal mengirim gambar AI."); }
            } else if (task.type === 'audio') {
                const audioBufferTask = await fetchAudio(task.query);
                try {
                    if (audioBufferTask) {
                        await sock.sendMessage(m.key.remoteJid, { audio: audioBufferTask, mimetype: 'audio/mpeg' }, { quoted: m });
                    } else {
                        await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, server lagunya lagi sibuk atau lagunya ga ketemu.' }, { quoted: m });
                    }
                } catch (e) {
                    logger.warn({ err: e }, "Gagal mengirim audio AI.");
                }
            }
            await new Promise(resolve => setTimeout(resolve, JEDA_AI_MS));
        }
        if (response.text) await sock.sendMessage(m.key.remoteJid, { text: response.text }, { quoted: m });
    } catch (error) {
        logger.error({ err: error, user: m.sender }, 'Gagal menangani interaksi AI');
        await sock.sendMessage(m.key.remoteJid, { text: 'Ugh, ada error nih. Coba lagi nanti aja ya, pusing pala Alicia 😫.' }, { quoted: m });
    } finally {
        await sock.sendPresenceUpdate('paused', m.key.remoteJid);
    }
};