/*
* Lokasi: src/lib/aiHelper.js
* Versi: v9
*/

import axios from 'axios';
import logger from '#lib/logger.js';
import { statements } from '#database';
import { uploadToCatbox } from '#lib/uploader.js';
import { DEFAULT_SYSTEM_PROMPT, SONG_CHOOSER_PROMPT } from '#lib/prompts.js';

const API_BASE_URL = 'https://www.nirkyy.accesscam.org';
const API_QWEN_URL = `${API_BASE_URL}/api/ai/chatbot`;
const API_IMG_DESC_URL = `${API_BASE_URL}/api/ai/image-describe`;
const API_KEY = 'RIKI-BON4bV';

const API_TIMEOUT = 90000;
const JEDA_AI_MS = 1500;
const POLLING_INTERVAL = 5000;
const POLLING_TIMEOUT = 60000;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callQwenAPI(user, system, prompt, clearDb = false) {
    try {
        const { data: response } = await axios.get(API_QWEN_URL, {
            params: { user, prompt, system, web: false, cleardb: clearDb },
            headers: { 'Authorization': `Bearer ${API_KEY}`, 'User-Agent': 'Mozilla/5.0' },
            timeout: API_TIMEOUT
        });
        if (response && response.success) return response.data?.answer;
        throw new Error(response.message || 'Format respons API tidak sesuai harapan.');
    } catch (error) {
        const errorDetails = error.response ? { status: error.response.status, data: error.response.data } : { message: error.message };
        logger.error({ err: errorDetails }, "Terjadi kesalahan di callQwenAPI");
        throw new Error(`Gagal memanggil API Qwen: ${error.message}`);
    }
}

export const clearHistory = async (userId) => {
    try {
        await callQwenAPI(userId, '', 'clear history', true);
        return true;
    } catch (error) {
        logger.error({ err: error, user: userId }, 'Gagal mereset riwayat AI via API');
        return false;
    }
};

async function getImageDescription(imageUrl, prompt) {
    try {
        const initialResponse = await axios.post(API_IMG_DESC_URL, 
            { url: imageUrl, prompt: prompt },
            { headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 }
        );

        if (!initialResponse.data?.success || !initialResponse.data.data?.statusUrl) {
            throw new Error('API tidak mengembalikan URL status yang valid.');
        }

        const statusUrl = initialResponse.data.data.statusUrl;
        const startTime = Date.now();

        while (Date.now() - startTime < POLLING_TIMEOUT) {
            await delay(POLLING_INTERVAL);
            const statusResponse = await axios.get(statusUrl, { headers: { 'Authorization': `Bearer ${API_KEY}` } });
            const jobData = statusResponse.data?.data;
            if (jobData?.status === 'success') {
                return jobData.result?.response;
            }
            if (jobData?.status === 'failed') {
                throw new Error('Proses deskripsi gambar gagal di server AI.');
            }
        }
        throw new Error('Batas waktu menunggu hasil deskripsi gambar terlampaui.');
    } catch (error) {
        logger.error({ err: error }, 'Gagal mengambil deskripsi gambar dari API');
        return null;
    }
}

const formatForWhatsApp = (text) => text ? text.replace(/^#+\s+(.*)/gm, '*$1*').replace(/\*\*(.*?)\*\*/g, '*$1*').replace(/```[a-zA-Z]*\n([\s\S]*?)```/g, '```$1```').replace(/^\s*[-*]\s/gm, '• ') : '';

export async function getGameMasterResponse(system, query) {
    try {
        const url = 'https://api.sxtream.xyz/ai/writecream-gemini';
        const response = await axios.get(url, { params: { system, query }, timeout: API_TIMEOUT });
        if (response.data?.status === true && response.data.result) return response.data.result;
        throw new Error("Format respons API teks tidak sesuai harapan.");
    } catch (error) {
        logger.error({ err: error }, 'Error di getGameMasterResponse (sxtream)');
        throw error;
    }
}

export const getAiResponse = async (userId, text) => {
    try {
        const finalAnswer = await callQwenAPI(userId, DEFAULT_SYSTEM_PROMPT, text);
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
        if (!imageUrl) throw new Error("API tidak mengembalikan link gambar.");
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: API_TIMEOUT });
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
        const searchResultsText = topResults.map((track, index) => `${index + 1}. Judul: ${track.title}, Artis: ${track.author.name}, URL: ${track.url}`).join('\n');
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