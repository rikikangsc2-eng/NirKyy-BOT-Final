import axios from 'axios';
import { URLSearchParams } from 'url';
import FormData from 'form-data';
import crypto from 'crypto';
import config from '#config';
import logger from '#lib/logger.js';
import { statements } from '#database';
import { uploadToCatbox } from '#lib/uploader.js';

const PROXY_BASE_URL = 'https://purxy.vercel.app/';
const DB_HISTORY_LIMIT = 15;
const PAYLOAD_MESSAGE_LIMIT = 15;
const VALIDATED_TOKEN = "a38f5889-8fef-46d4-8ede-bf4668b6a9bb";
const API_TIMEOUT = 90000;
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

const createProxyUrl = (targetUrl, method = 'GET') => {
    const encodedTargetUrl = encodeURIComponent(targetUrl);
    return `${PROXY_BASE_URL}?url=${encodedTargetUrl}&method=${method.toUpperCase()}`;
};

const generateId = (size = 7) => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomBytes = crypto.randomBytes(size);
    return Array.from({ length: size }, (_, i) => alphabet[randomBytes[i] % alphabet.length]).join('');
};

const parseApiResponse = (data) => {
    const delimiter = '$~~~$';
    if (typeof data === 'string' && data.includes(delimiter)) {
        const parts = data.split(delimiter);
        try {
            const sources = JSON.parse(parts[1]);
            const answer = parts[2] ? parts[2].trim() : '';
            return { answer, sources };
        } catch (e) {
            return { answer: data, sources: [] };
        }
    }
    return { answer: data, sources: [] };
};

async function callNewBlackboxAPI(user, system, prompt) {
    try {
        const historyText = statements.getAiHistory.get(user)?.history;
        const history = historyText ? JSON.parse(historyText) : [];

        const newUserMessage = { role: 'user', content: prompt, id: generateId() };
        const conversationHistory = [...history, newUserMessage];
        const messagesForPayload = conversationHistory.slice(-PAYLOAD_MESSAGE_LIMIT);

        const buildPayload = () => ({
            messages: messagesForPayload,
            id: newUserMessage.id, userSystemPrompt: system, validated: VALIDATED_TOKEN,
            previewToken: null, userId: null, codeModelMode: true, trendingAgentMode: {},
            isMicMode: false, maxTokens: 1024, playgroundTopP: null, playgroundTemperature: null,
            isChromeExt: false, githubToken: "", clickedAnswer2: false, clickedAnswer3: false,
            clickedForceWebSearch: false, visitFromDelta: false, isMemoryEnabled: false,
            mobileClient: false, userSelectedModel: null, userSelectedAgent: "VscodeAgent",
            imageGenerationMode: false, imageGenMode: "autoMode", webSearchModePrompt: false,
            deepSearchMode: false, domains: null, vscodeClient: false, codeInterpreterMode: false,
            customProfile: { name: "", occupation: "", traits: [], additionalInfo: "", enableNewChats: false, },
            webSearchModeOption: { autoMode: true, webMode: false, offlineMode: false },
            session: null, isPremium: false, subscriptionCache: null, beastMode: false,
            reasoningMode: false, designerMode: false, workspaceId: "", asyncMode: false,
            integrations: {}, isTaskPersistent: false, selectedElement: null,
        });

        const chatApiUrl = 'https://www.blackbox.ai/api/chat';
        const proxyChatUrl = createProxyUrl(chatApiUrl, 'POST');

        const headers = {
            'Accept': '*/*', 'Content-Type': 'application/json', 'Origin': 'https://www.blackbox.ai',
            'Referer': 'https://www.blackbox.ai/', 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; RMX2185) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
        };

        const chatResponse = await axios.post(proxyChatUrl, buildPayload(), { headers, timeout: API_TIMEOUT });
        const assistantRawResponse = chatResponse.data;
        const parsedResult = parseApiResponse(assistantRawResponse);

        const newAssistantMessage = {
            role: 'assistant', content: assistantRawResponse, id: generateId(), createdAt: new Date().toISOString(),
        };

        const finalHistoryToSave = [...conversationHistory, newAssistantMessage].slice(-DB_HISTORY_LIMIT);
        statements.updateAiHistory.run(user, JSON.stringify(finalHistoryToSave));

        return parsedResult;

    } catch (error) {
        const errorDetails = error.response ? { status: error.response.status, data: error.response.data } : { message: error.message };
        logger.error({ err: errorDetails }, "Terjadi kesalahan di callNewBlackboxAPI");
        throw new Error(`Gagal memanggil API AI: ${JSON.stringify(errorDetails)}`);
    }
}

export const clearHistory = async (userId) => {
    try {
        statements.deleteAiHistory.run(userId);
        return true;
    } catch (error) {
        logger.error({ err: error, user: userId }, 'Gagal menghapus riwayat AI dari database');
        return false;
    }
};

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
        const url = 'https://api.sxtream.xyz/ai/writecream-gemini';
        const response = await axios.get(url, {
            params: { system, query },
            timeout: API_TIMEOUT
        });

        if (response.data && response.data.status === true && response.data.result) {
            return response.data.result;
        }
        throw new Error("Format respons API teks tidak sesuai harapan.");
    } catch (error) {
        logger.error({ err: error }, 'Error di getGameMasterResponse (sxtream)');
        throw error;
    }
}

export const getAiResponse = async (userId, text) => {
    try {
        const result = await callNewBlackboxAPI(userId, DEFAULT_SYSTEM_PROMPT, text);
        const finalAnswer = result.answer;
        
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

export async function fetchImage(prompt, aspectRatio = '1:1') {
    try {
        const apiUrl = 'https://www.writecream.com/wp-admin/admin-ajax.php';
        const payload = new URLSearchParams();
        payload.append('action', 'generate_image');
        payload.append('prompt', prompt);
        payload.append('aspect_ratio', aspectRatio);
        payload.append('hd', '1');

        const { data: apiResponse } = await axios.post(apiUrl, payload, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
                'Referer': 'https://www.writecream.com/text-on-image/',
                'Origin': 'https://www.writecream.com',
            },
            timeout: API_TIMEOUT
        });

        const imageUrl = apiResponse.data?.image_link;
        if (!imageUrl) {
            throw new Error("API tidak mengembalikan link gambar.");
        }

        const imageResponse = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: API_TIMEOUT
        });
        return imageResponse.data;

    } catch (error) {
        logger.error({ err: error, prompt }, 'Gagal fetch gambar dari API Writecream');
        throw error;
    }
}

export async function fetchAudio(query) {
    try {
        const searchUrl = `https://api.sxtream.xyz/search/soundcloud-search?query=${encodeURIComponent(query)}`;
        const { data: searchRes } = await axios.get(searchUrl, { timeout: 30000 });

        if (searchRes.status !== 200 || !searchRes.result || searchRes.result.length === 0) {
            logger.warn({ query, response: searchRes }, "Pencarian SoundCloud tidak memberikan hasil.");
            return null;
        }

        const topResults = searchRes.result.slice(0, 3);
        const searchResultsText = topResults.map((track, index) =>
            `${index + 1}. Judul: ${track.title}, Artis: ${track.author.name}, URL: ${track.url}`
        ).join('\n');
        
        const chooserQuery = `[PERMINTAAN PENGGUNA]: "Putar lagu ${query}"\n[HASIL PENCARIAN]:\n${searchResultsText}`;
        const chosenUrl = await getGameMasterResponse(SONG_CHOOSER_PROMPT, chooserQuery);

        let finalUrlToDownload;
        if (!chosenUrl || !chosenUrl.trim().startsWith('https://soundcloud.com')) {
            logger.error({ chosenUrlFromAI: chosenUrl }, "AI Pemilih Lagu mengembalikan URL yang tidak valid, menggunakan hasil pertama.");
            finalUrlToDownload = topResults[0].url;
        } else {
            finalUrlToDownload = chosenUrl.trim();
        }

        const downloaderApiUrl = `https://api.sxtream.xyz/downloader/soundcloud-downloader?url=${encodeURIComponent(finalUrlToDownload)}`;
        const { data: downloaderApiResponse } = await axios.get(downloaderApiUrl, { timeout: 60000 });

        if (!downloaderApiResponse.success || !downloaderApiResponse.data?.downloadUrl) {
            logger.error({ response: downloaderApiResponse }, "SoundCloud downloader API tidak mengembalikan downloadUrl yang valid.");
            return null;
        }

        const finalAudioUrl = downloaderApiResponse.data.downloadUrl;
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
            const imageUrl = await uploadToCatbox(imageBuffer, 'image-for-ai.jpg');
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