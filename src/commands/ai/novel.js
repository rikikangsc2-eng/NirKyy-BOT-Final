import axios from 'axios';
import { marked } from 'marked';
import { topage } from '#lib/topage.js';
import logger from '#lib/logger.js';

const callNovelAi = async (system, query, timeout = 240000) => {
    const url = 'https://api.sxtream.xyz/ai/writecream-gemini';
    const response = await axios.get(url, {
        params: { system, query },
        timeout
    });
    if (response.data && response.data.status === true && response.data.result) {
        return response.data.result;
    }
    throw new Error("Format respons API teks tidak sesuai harapan.");
};

const PLOT_ARCHITECT_PROMPT = (totalChapters) => `ANDA ADALAH "ARSITEK CERITA", SEORANG AI SUPER KREATIF. Tugas Anda adalah merancang fondasi lengkap untuk sebuah novel berdasarkan ide singkat dari pengguna.

### ATURAN SUPER KETAT - WAJIB DIIKUTI PERSIS! ###
1.  **Gaya Bahasa**: Untuk deskripsi plot, gunakan gaya Gen Z yang asik dan membuat penasaran.
2.  **Struktur Output (WAJIB)**: Balasan Anda HARUS menggunakan format di bawah ini dengan tag yang jelas. JANGAN TAMBAHKAN TEKS ATAU PENJELASAN LAIN DI LUAR STRUKTUR INI.
    -   \`[JUDUL]\`
        Judul novel yang catchy dan kreatif (3-6 kata).
    -   \`[KARAKTER]\`
        Deskripsikan 1-3 karakter utama secara detail: nama, kepribadian, penampilan fisik, dan tujuan/motivasi mereka dalam cerita.
    -   \`[SETTING]\`
        Deskripsikan dunia atau lokasi cerita dengan hidup. Sebutkan nama tempat, suasana, dan elemen uniknya.
    -   \`[PLOT BAB 1]\`
        Ringkasan plot untuk Bab 1.
    -   \`[PLOT BAB 2]\`
        Ringkasan plot untuk Bab 2.
    -   ... (lanjutkan sampai) ...
    -   \`[PLOT BAB ${totalChapters}]\`
        Ringkasan plot untuk Bab ${totalChapters}. Pastikan ini adalah bagian akhir/kesimpulan cerita.`;

const CHAPTER_WRITER_PROMPT = (currentChapter) => `ANDA ADALAH "NOVELIS", SEORANG PENULIS AI YANG MAHIR. Tugas Anda adalah menulis satu bab novel berdasarkan DOKUMEN ALUR CERITA LENGKAP yang diberikan.

### ATURAN SUPER KETAT - WAJIB DIIKUTI! ###
1.  **FOKUS**: Tulis HANYA konten untuk Bab ${currentChapter}. JANGAN menulis ulang judul, ringkasan, atau bab lain.
2.  **GAYA BAHASA**: Gunakan gaya naratif yang kaya, deskriptif, dan imersif. Hindari bahasa slang kecuali dalam dialog karakter jika sesuai.
3.  **PANJANG BAB**: Cerita WAJIB lebih dari 1000 kata. Ini adalah syarat mutlak. Kembangkan plot yang ada dengan dialog mendalam, deskripsi sensorik, dan pengembangan karakter.
4.  **KONSISTENSI**: Pastikan semua detail (nama karakter, setting, peristiwa) sesuai dengan DOKUMEN ALUR CERITA yang menjadi konteks.
5.  **OUTPUT**: Kembalikan HANYA teks mentah dari bab yang Anda tulis. JANGAN TAMBAHKAN tag, judul bab, atau penjelasan apa pun.`;

const parsePlotResponse = (text) => {
    if (!text) return null;
    try {
        const title = text.split('[JUDUL]')[1].split('[KARAKTER]')[0].trim();
        const characters = text.split('[KARAKTER]')[1].split('[SETTING]')[0].trim();
        const setting = text.split('[SETTING]')[1].split('[PLOT BAB 1]')[0].trim();
        
        const plotEpisodes = [];
        const plotSections = text.split(/\[PLOT BAB \d+\]/);
        for (let i = 1; i < plotSections.length; i++) {
            plotEpisodes.push(plotSections[i].trim());
        }

        if (!title || !characters || !setting || plotEpisodes.length === 0) return null;
        
        return { title, characters, setting, plotEpisodes };
    } catch (error) {
        logger.error({ err: error }, "Gagal mem-parsing alur cerita dari AI");
        return null;
    }
};

const generateHtml = (title, chaptersData) => {
    const css = `
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;700&family=Roboto:wght@400;500&display=swap');
        :root { --primary-color: #4a90e2; --secondary-color: #f5a623; --bg-color: #f4f7f9; --surface-color: #ffffff; --text-color: #333; --heading-color: #1a1a1a; --border-color: #e0e0e0; }
        html { scroll-behavior: smooth; }
        body { font-family: 'Lora', serif; background-color: var(--bg-color); color: var(--text-color); margin: 0; padding: 2rem 1rem; line-height: 1.9; font-size: 18px; }
        .container { max-width: 850px; margin: 2rem auto; background-color: var(--surface-color); border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); overflow: hidden; }
        header { padding: 4rem 3rem; text-align: center; border-bottom: 1px solid var(--border-color); background: linear-gradient(135deg, #ffffff 0%, #f9fcff 100%); }
        header h1 { font-family: 'Roboto', sans-serif; margin: 0; font-size: 3rem; font-weight: 700; color: var(--heading-color); }
        header p { margin: 0.5rem 0 0; color: var(--primary-color); font-weight: 500; font-family: 'Roboto', sans-serif; letter-spacing: 1px; text-transform: uppercase; font-size: 0.9rem; }
        .content-wrapper { max-height: 70vh; overflow-y: auto; padding: 1rem; scrollbar-width: thin; scrollbar-color: var(--primary-color) var(--bg-color); }
        .content-wrapper::-webkit-scrollbar { width: 8px; }
        .content-wrapper::-webkit-scrollbar-track { background: var(--bg-color); }
        .content-wrapper::-webkit-scrollbar-thumb { background-color: var(--primary-color); border-radius: 10px; }
        .chapter-content { display: none; padding: 2.5rem 3rem; animation: fadeIn 0.7s ease-in-out; }
        .chapter-content h2 { font-family: 'Roboto', sans-serif; color: var(--primary-color); border-bottom: 2px solid var(--primary-color); padding-bottom: 0.75rem; margin-top: 0; margin-bottom: 2.5rem; font-size: 2rem; }
        .chapter-content p { text-align: justify; margin-bottom: 1.5em; }
        #chapter-1 { display: block; }
        nav { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 3rem; background-color: rgba(255, 255, 255, 0.9); border-top: 1px solid var(--border-color); backdrop-filter: blur(10px); }
        .nav-btn { background-color: var(--primary-color); color: white; border: none; padding: 12px 25px; border-radius: 8px; cursor: pointer; font-size: 1rem; font-family: 'Roboto', sans-serif; font-weight: 500; transition: all 0.3s ease; }
        .nav-btn:hover:not(:disabled) { background-color: #357abd; transform: translateY(-2px); box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        .nav-btn:disabled { background-color: #c0c0c0; color: #888; cursor: not-allowed; }
        #chapter-indicator { font-size: 1.1rem; font-weight: 500; font-family: 'Roboto', sans-serif; color: var(--text-color); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
    `;
    const js = `
        let currentChapter = 1; const totalChapters = ${chaptersData.length};
        const prevBtn = document.getElementById('prev-btn'), nextBtn = document.getElementById('next-btn'), chapterIndicator = document.getElementById('chapter-indicator'), contentWrapper = document.querySelector('.content-wrapper');
        function showChapter(chapterNumber) {
            document.querySelectorAll('.chapter-content').forEach(c => c.style.display = 'none');
            const chapterToShow = document.getElementById('chapter-' + chapterNumber);
            if(chapterToShow) { chapterToShow.style.display = 'block'; contentWrapper.scrollTo({ top: 0, behavior: 'smooth' }); }
            updateButtons();
        }
        function updateButtons() {
            prevBtn.disabled = currentChapter === 1; nextBtn.disabled = currentChapter === totalChapters;
            chapterIndicator.textContent = 'Bab ' + currentChapter + ' / ' + totalChapters;
        }
        prevBtn.addEventListener('click', () => { if (currentChapter > 1) { currentChapter--; showChapter(currentChapter); } });
        nextBtn.addEventListener('click', () => { if (currentChapter < totalChapters) { currentChapter++; showChapter(currentChapter); } });
        window.onload = updateButtons;
    `;
    let bodyContent = chaptersData.map((chap, index) => {
        const chapterHtml = marked.parse(chap.content);
        return `<div id="chapter-${index + 1}" class="chapter-content"><h2>${chap.title}</h2>${chapterHtml}</div>`;
    }).join('');
    return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title><style>${css}</style></head><body><div class="container"><header><h1>${title}</h1><p>Powered by NirKyy Novel AI</p></header><div class="content-wrapper">${bodyContent}</div><nav><button id="prev-btn" class="nav-btn">‹ Sebelumnya</button><span id="chapter-indicator"></span><button id="next-btn" class="nav-btn">Selanjutnya ›</button></nav></div><script>${js}</script></body></html>`;
};

export default {
    name: 'novel',
    category: 'ai',
    description: 'Bikin novel lengkap dengan alur cerita yang detail.',
    async execute({ sock, m, args }) {
        const text = args.join(' ');
        const [plot, numChaptersStr] = text.split('|').map(p => p.trim());
        const numChapters = parseInt(numChaptersStr, 10);

        if (!plot || !numChaptersStr || isNaN(numChapters)) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Formatnya salah, bro 🙄.\n\nContoh: `.novel petualangan di luar angkasa | 3`' }, { quoted: m });
        }
        if (numChapters < 1 || numChapters > 7) {
            return await sock.sendMessage(m.key.remoteJid, { text: 'Jumlah bab harus antara 1 sampai 7 ya, biar ga kelamaan nungguinnya.' }, { quoted: m });
        }

        const estimatedTime = Math.ceil(numChapters * 2.5);
        await sock.sendMessage(m.key.remoteJid, { text: `Oke, siap! Alicia lagi panggil *Arsitek Cerita* buat ngerancang alur novelmu... 📝\n\nTotal estimasi sekitar *${estimatedTime} menit*. Sabar yaa~` }, { quoted: m });
        
        let plotDocument;
        try {
            const architectSystemPrompt = PLOT_ARCHITECT_PROMPT(numChapters);
            const architectQuery = `Buat rancangan cerita lengkap untuk ide: "${plot}".`;
            const rawPlot = await callNovelAi(architectSystemPrompt, architectQuery);
            plotDocument = parsePlotResponse(rawPlot);
            if (!plotDocument) throw new Error("AI gagal membuat alur cerita dengan format yang benar.");
        } catch (error) {
            logger.error({ err: error, user: m.sender }, 'Gagal saat tahap arsitek cerita');
            return await sock.sendMessage(m.key.remoteJid, { text: `Ugh, Arsitek Cerita-nya lagi pusing 😫. Gagal ngerancang alur, coba lagi nanti ya.\n\n(Error: ${error.message})` }, { quoted: m });
        }

        const plotInfoText = `*Alur Cerita Berhasil Dibuat!*\n\n*Judul:* ${plotDocument.title}\n*Karakter:* ${plotDocument.characters}\n*Setting:* ${plotDocument.setting}`;
        await sock.sendMessage(m.key.remoteJid, { text: plotInfoText });

        const progressMessage = await sock.sendMessage(m.key.remoteJid, { text: "✍️ Memulai proses penulisan..." });
        const progressMessageKey = progressMessage.key;

        let chapters = [];
        try {
            for (let i = 1; i <= numChapters; i++) {
                const currentStatusText = `⏳ Sedang menulis *Bab ${i} dari ${numChapters}*...`;
                await sock.sendMessage(m.key.remoteJid, { text: currentStatusText, edit: progressMessageKey });
                
                const writerSystemPrompt = CHAPTER_WRITER_PROMPT(i);
                const writerQuery = `Ini adalah dokumen alur cerita lengkapnya:\n\n[JUDUL]\n${plotDocument.title}\n\n[KARAKTER]\n${plotDocument.characters}\n\n[SETTING]\n${plotDocument.setting}\n\n${plotDocument.plotEpisodes.map((p, index) => `[PLOT BAB ${index+1}]\n${p}`).join('\n\n')}\n\nSekarang, tuliskan Bab ${i} secara lengkap dan detail sesuai dokumen di atas.`;

                const chapterContent = await callNovelAi(writerSystemPrompt, writerQuery);
                if (!chapterContent) throw new Error(`AI gagal menulis konten untuk Bab ${i}.`);
                
                chapters.push({ title: `Bab ${i}`, content: chapterContent });
            }
        } catch (error) {
            logger.error({ err: error, user: m.sender }, `Gagal saat tahap penulisan bab`);
            return await sock.sendMessage(m.key.remoteJid, { text: `Aduh, maaf banget, Novelis AI-nya kehabisan tinta pas nulis 😭. Proses berhenti.\n\n(Error: ${error.message})` }, { quoted: m });
        }

        try {
            const finalizingText = `✅ Semua bab selesai! Sekarang lagi proses finalisasi dan upload novelmu... 🚀`;
            await sock.sendMessage(m.key.remoteJid, { text: finalizingText, edit: progressMessageKey });

            const htmlContent = generateHtml(plotDocument.title, chapters);
            const sanitizedTitle = plotDocument.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase();
            const result = await topage(htmlContent, sanitizedTitle);
            
            if (result.success) {
                await sock.sendMessage(m.key.remoteJid, { text: `Gils, jadi juga novelnya! 🎉\n\n*Judul:* ${plotDocument.title}\n*Link:* ${result.page_url}\n\nKarya kolaborasi kamu sama Alicia, jangan lupa dibaca sampe abis yaa~ 😉` });
            } else {
                throw new Error(result.message || 'Gagal upload novel ke topage.');
            }
        } catch (error) {
            logger.error({ err: error, user: m.sender }, 'Gagal saat finalisasi novel');
            await sock.sendMessage(m.key.remoteJid, { text: `Waduh, novelnya udah jadi, tapi gagal di-upload 😥. Coba lagi nanti ya.\n\n(Error: ${error.message})` }, { quoted: m });
        }
    }
};