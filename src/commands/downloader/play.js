// Path: src/commands/downloader/play.js
import axios from 'axios';
import logger from '#lib/logger.js';

export default {
    name: 'play',
    aliases: ['song', 'ytplay'],
    category: 'downloader',
    description: 'Download dan kirim audio dari YouTube berdasarkan pencarian.',
    async execute({ sock, m, args }) {
        const query = args.join(' ');
        if (!query) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Judul lagunya apa, bro? Contoh: `.play lathi`' }, { quoted: m });
        }

        await sock.sendMessage(m.key.remoteJid, { text: 'Sip, lagi nyari lagunya... 🎧 Sabar ya, ini bisa makan waktu.' }, { quoted: m });

        try {
            const apiUrl = `https://nirkyy-dev.hf.space/api/v1/ytplay-mp3?q=${encodeURIComponent(query)}`;
            
            const response = await axios.get(apiUrl, {
                responseType: 'arraybuffer'
            });

            await sock.sendMessage(m.key.remoteJid, {
                audio: response.data,
                mimetype: 'audio/mpeg'
            }, { quoted: m });

        } catch (error) {
            logger.error({ err: error, query }, 'Gagal saat memutar lagu dari YouTube');
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal ngambil lagunya, bro. Mungkin judulnya salah atau API-nya lagi rewel.' }, { quoted: m });
        }
    }
};