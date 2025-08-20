import db, { getRpgUser, rpgUserCache } from '#database';
import { getGameMasterResponse } from '#lib/aiHelper.js';

const WORK_NARRATOR_PROMPT = `KAMU ADALAH "NARATOR DUNIA FANTASI" YANG DESKRIPTIF. Tugasmu adalah menarasikan pengalaman seorang "Orang Tersesat" saat melakukan peran bertahan hidup di dunia Arcadia.

### ATURAN SUPER KETAT - WAJIB DIIKUTI! ###
1.  **FOKUS PADA PENGALAMAN**: Berdasarkan \`[PERAN]\` dan \`[DESKRIPSI]\` yang diberikan, tulis cerita pendek (2-3 kalimat) yang menggambarkan aksi dan suasana saat bekerja di dunia fantasi Arcadia.
2.  **JANGAN SEBUTKAN HASIL**: JANGAN PERNAH menulis tentang koin, gaji, bayaran, atau imbalan. Biarkan sistem game yang menyampaikan hasilnya.
3.  **GAYA BAHASA**: Gunakan gaya bahasa yang imersif dan sesuai dengan tema fantasi/isekai.
    -   Contoh Input: \`[PERAN: Penggali Reruntuhan]\` \`[DESKRIPSI: Pekerjaan melelahkan di reruntuhan kuno untuk mencari artefak atau sisa-sisa peradaban.]\`
    -   Contoh Output: "Debu peradaban kuno menyambutmu saat kau melangkah ke dalam reruntuhan. Dengan beliung di tangan, kau mulai menggali dengan hati-hati, berharap menemukan secercah harapan di antara puing-puing masa lalu Arcadia."
4.  **OUTPUT**: Kembalikan HANYA teks narasi mentah. JANGAN tambahkan tag, judul, atau penjelasan apa pun.`;

const jobs = {
    penggali: { name: 'Penggali Reruntuhan', aliases: ['penggali', 'gali', 'reruntuhan'], cooldown: 300000, energyCost: 25, minPay: 700, maxPay: 1600, description: 'Pekerjaan melelahkan di reruntuhan kuno untuk mencari artefak atau sisa-sisa peradaban.' },
    pencari: { name: 'Pencari Kayu Langka', aliases: ['pencari', 'kayu', 'hutan'], cooldown: 240000, energyCost: 20, minPay: 550, maxPay: 1300, description: 'Menjelajahi Hutan Bisikan Arcadia untuk menebang pohon-pohon dengan kualitas magis.' },
    pengantar: { name: 'Pengantar Pesan', aliases: ['pengantar', 'kurir', 'pesan'], cooldown: 180000, energyCost: 15, minPay: 350, maxPay: 900, description: 'Menjadi penyambung lidah antar pemukiman, melintasi jalanan berbahaya Arcadia.' },
    pendongeng: { name: 'Pendongeng Kedai', aliases: ['pendongeng', 'dongeng', 'cerita'], cooldown: 600000, energyCost: 10, minPay: 1800, maxPay: 4000, description: 'Menghibur para petualang lelah dengan cerita-cerita dari dunia asalmu yang kini hanya tinggal kenangan.' },
};

export default {
    name: 'kerja',
    category: 'rpg',
    description: 'Mengambil peran bertahan hidup untuk mendapatkan koin di Arcadia.',
    async execute({ sock, m, args }) {
        const jid = m.sender;
        const jobAlias = args[0]?.toLowerCase();

        if (!jobAlias) {
            let availableJobs = 'Untuk bertahan hidup di Arcadia, kamu harus mengambil peran. Pilih salah satu:\n\n';
            for (const key in jobs) {
                availableJobs += `› *${jobs[key].name}* (\`.kerja ${key}\`)\n`;
            }
            return await sock.sendMessage(m.key.remoteJid, { text: availableJobs.trim() }, { quoted: m });
        }

        const selectedJob = Object.values(jobs).find(job => job.aliases.includes(jobAlias));
        if (!selectedJob) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Peran itu tidak ada di Arcadia.' }, { quoted: m });
        }

        const user = getRpgUser(jid);
        if (!user) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Kamu belum menentukan siapa dirimu di dunia ini. Ketik `.register` dulu ya.' }, { quoted: m });
        }

        const now = Date.now();
        const timeSinceLastWork = now - (user.last_work || 0);

        if (timeSinceLastWork < selectedJob.cooldown) {
            const timeLeft = selectedJob.cooldown - timeSinceLastWork;
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = ((timeLeft % 60000) / 1000).toFixed(0);
            return await sock.sendMessage(m.key.remoteJid, { text: `Kamu perlu istirahat. Tunggu *${minutes} menit ${seconds} detik* lagi sebelum mengambil peran ini.` }, { quoted: m });
        }

        if (user.energy < selectedJob.energyCost) {
            return await sock.sendMessage(m.key.remoteJid, { text: `Energimu terkuras. Untuk peran *${selectedJob.name}*, kamu butuh *${selectedJob.energyCost}* energi, tapi hanya punya *${user.energy}*. Beli makanan di \`.toko\` untuk memulihkan energi.` }, { quoted: m });
        }

        const earnings = Math.floor(Math.random() * (selectedJob.maxPay - selectedJob.minPay + 1)) + selectedJob.minPay;
        const initialMessage = await sock.sendMessage(m.key.remoteJid, { text: `Kamu mulai mengambil peran sebagai *${selectedJob.name}*...` }, { quoted: m });
        
        try {
            const aiQuery = `[PERAN: ${selectedJob.name}]\n[DESKRIPSI: ${selectedJob.description}]`;
            const narrativeResponse = await getGameMasterResponse(WORK_NARRATOR_PROMPT, aiQuery);

            db.prepare('UPDATE rpg_users SET money = money + ?, energy = energy - ?, last_work = ? WHERE jid = ?').run(earnings, selectedJob.energyCost, now, jid);
            rpgUserCache.delete(jid);
            
            const formattedEarnings = earnings.toLocaleString('id-ID');
            const finalMessage = `${narrativeResponse.trim()}\n\n*Imbalan Diterima:*\n› *${formattedEarnings} Koin* 🪙\n\nKamu menggunakan *${selectedJob.energyCost}* energi.`;

            await sock.sendMessage(m.key.remoteJid, { text: finalMessage, edit: initialMessage.key });
        } catch (error) {
            console.error(error);
            db.prepare('UPDATE rpg_users SET money = money + ?, energy = energy - ?, last_work = ? WHERE jid = ?').run(earnings, selectedJob.energyCost, now, jid);
            rpgUserCache.delete(jid);
            const formattedEarnings = earnings.toLocaleString('id-ID');
            await sock.sendMessage(m.key.remoteJid, { text: `Narator sedang beristirahat, tapi usahamu tidak sia-sia. Kamu mendapatkan imbalan: *${formattedEarnings} Koin* 🪙` }, { quoted: m });
        }
    }
};