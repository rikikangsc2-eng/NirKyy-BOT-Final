import axios from 'axios';
import logger from '#lib/logger.js';

const API_KEY = '27764d42-ca1e-4e57-bbe6-4e0aa2dd637b';
const QUOTE_API_URL = 'https://nirkyy-dev.hf.space/api/Random/katabijak';
const DIALOG_API_URL = 'https://nirkyy-dev.hf.space/api/AI/elevenlabs-dialog';

export default {
    name: 'katabijak',
    aliases: ['wisdom'],
    category: 'ai',
    description: 'Mendengarkan kata-kata bijak dari Alicia dalam bentuk pesan suara.',
    async execute({ sock, m }) {
        await sock.sendMessage(m.key.remoteJid, { text: 'Alicia lagi nyari inspirasi buat kata-kata bijak... 🧘‍♀️' }, { quoted: m });

        try {
            const quoteResponse = await axios.get(QUOTE_API_URL, {
                params: { apikey: API_KEY },
                timeout: 30000
            });

            if (!quoteResponse.data.status || !quoteResponse.data.hasil?.bijak) {
                throw new Error('API kata bijak tidak mengembalikan data yang valid.');
            }

            const wiseWord = quoteResponse.data.hasil.bijak;

            const dialoguePayload = [
                {
                    text: "[excitedly] Alicia Alicia, Kata kata Hari ini dong",
                    voice_id: "d888tBvGmQT2u05J1xTv"
                },
                {
                    text: `[curiously] ${wiseWord}`,
                    voice_id: "I7sakys8pBZ1Z5f0UhT9"
                }
            ];

            const audioResponse = await axios.get(DIALOG_API_URL, {
                params: {
                    dialogue: JSON.stringify(dialoguePayload),
                    apikey: API_KEY
                },
                timeout: 90000
            });

            if (!audioResponse.data.status || !audioResponse.data.hasil?.url) {
                throw new Error('API dialog tidak berhasil membuat audio.');
            }

            const audioUrl = audioResponse.data.hasil.url;

            const { data: audioBuffer } = await axios.get(audioUrl, {
                responseType: 'arraybuffer'
            });

            await sock.sendMessage(m.key.remoteJid, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                ptt: true
            }, { quoted: m });

        } catch (error) {
            logger.error({ err: error }, 'Gagal pada fitur .katabijak');
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, Alicia lagi sariawan, ga bisa ngasih kata bijak sekarang. Coba lagi nanti ya.' }, { quoted: m });
        }
    }
};