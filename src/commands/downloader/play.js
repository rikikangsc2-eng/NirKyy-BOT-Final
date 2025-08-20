import axios from 'axios';
import logger from '#lib/logger.js';

export default {
    name: 'play',
    aliases: ['song', 'ytplay'],
    category: 'downloader',
    description: 'Download dan kirim audio dari SoundCloud berdasarkan pencarian.',
    async execute({ sock, m, args }) {
        const query = args.join(' ');
        if (!query) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Judul lagunya apa, bro? Contoh: `.play lathi`' }, { quoted: m });
        }

        await sock.sendMessage(m.key.remoteJid, { text: 'Sip, lagi nyari lagunya di SoundCloud... 🎧' }, { quoted: m });

        try {
            const searchUrl = `https://api.sxtream.xyz/search/soundcloud-search?query=${encodeURIComponent(query)}`;
            const { data: searchResponse } = await axios.get(searchUrl, { timeout: 30000 });

            if (searchResponse.status !== 200 || !searchResponse.result || searchResponse.result.length === 0) {
                throw new Error('Lagu tidak ditemukan atau API pencarian gagal.');
            }

            const song = searchResponse.result[0];
            const songUrl = song.url;
            
            const downloaderUrl = `https://api.sxtream.xyz/downloader/soundcloud-downloader?url=${encodeURIComponent(songUrl)}`;
            const { data: downloaderResponse } = await axios.get(downloaderUrl, { timeout: 60000 });

            if (!downloaderResponse.success || !downloaderResponse.data?.downloadUrl) {
                throw new Error('Gagal mendapatkan link download dari API.');
            }

            const audioBuffer = await axios.get(downloaderResponse.data.downloadUrl, {
                responseType: 'arraybuffer',
                timeout: 90000
            });

            await sock.sendMessage(m.key.remoteJid, {
                audio: audioBuffer.data,
                mimetype: 'audio/mpeg'
            }, { quoted: m });

        } catch (error) {
            logger.error({ err: error, query }, 'Gagal saat memutar lagu dari SoundCloud');
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal ngambil lagunya, bro. Mungkin judulnya salah atau API-nya lagi rewel.' }, { quoted: m });
        }
    }
};