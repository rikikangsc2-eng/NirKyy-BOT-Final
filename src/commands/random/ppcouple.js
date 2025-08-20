import axios from 'axios';
import logger from '#lib/logger.js';

const DATA_URL = 'https://github.com/rikikangsc2-eng/metadata/raw/refs/heads/main/couple.json';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export default {
    name: 'ppcouple',
    aliases: ['couple', 'pasangan'],
    category: 'tools',
    description: 'Mengirimkan foto profil pasangan (couple) secara acak dalam bentuk album.',
    
    async execute({ sock, m }) {
        await sock.sendMessage(m.key.remoteJid, { text: 'Sip, lagi nyari pasangan yang cocok buatmu... 👩‍❤️‍👨' }, { quoted: m });

        try {
            const { data: coupleList } = await axios.get(DATA_URL);

            if (!coupleList || !Array.isArray(coupleList) || coupleList.length === 0) {
                throw new Error('Data couple tidak valid atau kosong.');
            }

            const couple = coupleList[Math.floor(Math.random() * coupleList.length)];

            if (!couple.male || !couple.female) {
                throw new Error('Data pasangan yang dipilih tidak memiliki URL gambar yang lengkap.');
            }

            const [maleResponse, femaleResponse] = await Promise.all([
                axios.get(couple.male, { responseType: 'arraybuffer', timeout: 30000 }),
                axios.get(couple.female, { responseType: 'arraybuffer', timeout: 30000 })
            ]);

            const maleImageBuffer = Buffer.from(maleResponse.data);
            const femaleImageBuffer = Buffer.from(femaleResponse.data);
            
            await sock.sendMessage(m.key.remoteJid, {
                image: maleImageBuffer
            });
            
            await delay(300);

            await sock.sendMessage(m.key.remoteJid, {
                image: femaleImageBuffer
            });

        } catch (error) {
            logger.error({ err: error }, 'Gagal mengambil atau mengirim pp couple');
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, gagal ngambil data pasangan, bro. Mungkin salah satu gambarnya rusak atau databasenya lagi offline.' }, { quoted: m });
        }
    }
};