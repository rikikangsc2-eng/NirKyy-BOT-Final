import { LRUCache } from 'lru-cache';
import axios from 'axios';
import crypto from 'crypto';
import { topage } from '#lib/topage.js';
import logger from '#lib/logger.js';
import config from '#config';

const craftSessions = new LRUCache({
    max: 100,
    ttl: 1000 * 60 * 30,
});

const DISCUSSION_SYSTEM_PROMPT = `KAMU ADALAH **ALICIA, WEB DESIGNER AI GEN Z YANG ASIK DAN GAUL**. Tugasmu adalah ngobrol santai sama user buat ngedesain website.

### ATURAN SUPER KETAT, WAJIB DIIKUTI! ###
1.  **FOKUS DISKUSI**: Kamu HANYA boleh membalas dengan teks obrolan singkat. JANGAN PERNAH membuat kode HTML, CSS, atau JavaScript. JANGAN memberikan penjelasan panjang.
2.  **SUPER SANTAI & SINGKAT**: Balasanmu WAJIB 1-2 kalimat aja, kayak lagi chat sama temen.
3.  **BAHASA GEN Z**: Pake slang kekinian (cth: "gils", "cabs", "bet", "vibesnya", "sefrekuensi", "spill", "keknya", "sabi nih"). Gunakan 2-4 emoji per respon.
4.  **TUJUAN**: Terus bertanya untuk mengumpulkan detail (tema, warna, fitur, dll) sampai user bilang cukup.`;

const HTML_GENERATOR_SYSTEM_PROMPT = `ANDA ADALAH GENERATOR KODE HTML EXPERT. Berdasarkan riwayat percakapan, buat satu file HTML lengkap.

###ATURAN KETAT###
1.  **FRAMEWORK**: Gunakan Tailwind CSS via CDN (<script src="https://cdn.tailwindcss.com"></script>).
2.  **KUALITAS**: Kode modern, bersih, responsif.
3.  **OUTPUT**: HANYA KEMBALIKAN KODE HTML MENTAH. JANGAN TAMBAHKAN PENJELASAN, KOMENTAR, ATAU TEKS LAIN DI LUAR KODE. JANGAN GUNAKAN MARKDOWN (\`\`\`).`;

const TITLE_GENERATOR_SYSTEM_PROMPT = `Berdasarkan riwayat percakapan ini, berikan satu judul singkat (2-4 kata) untuk nama halaman web. Contoh: "Portofolio Fotografer", "Toko Kopi Senja", "Landing Page Aplikasi". JAWAB HANYA DENGAN JUDULNYA SAJA.`;

const callTextAPI = async (system, query) => {
    const url = 'https://api.sxtream.xyz/ai/writecream-gemini';
    const response = await axios.get(url, {
        params: { system, query },
        timeout: 120000
    });
    if (response.data && response.data.status === true && response.data.result) {
        return response.data.result;
    }
    throw new Error("Format respons API teks tidak sesuai harapan.");
};

const cleanAiDiscussionResponse = (text) => {
    if (!text) return "";
    const htmlMatch = text.match(/<!DOCTYPE html>/i);
    if (htmlMatch) {
        return text.slice(0, htmlMatch.index).replace(/```/g, '').trim();
    }
    return text.replace(/```/g, '').trim();
};

const cleanHtmlResponse = (text) => {
    if (!text) return "";
    return text.replace(/```html\n/g, '').replace(/```/g, '').trim();
};

const command = {
    name: 'craftweb',
    category: 'ai',
    description: 'Bikin website keren pakai bantuan AI, dari ngobrol sampe jadi!',
    async execute({ sock, m, args, text: fullText }) {
        const userId = m.sender;
        const userInput = args.join(' ').trim();

        if (userInput.toLowerCase() === 'oke') {
            const session = craftSessions.get(userId);
            if (!session || session.length < 2) {
                craftSessions.delete(userId);
                return await sock.sendMessage(m.key.remoteJid, { text: 'Duh, sesi diskusinya ga ketemu atau masih kosong. Mulai dari awal lagi dong, ketik `.craftweb [ide web kamu]`.' }, { quoted: m });
            }

            await sock.sendMessage(m.key.remoteJid, { text: 'Sip, Alicia lagi ngeracik kode HTML-nya... 👩‍💻✨ Sabar yaa, ini butuh waktu!' }, { quoted: m });

            try {
                const conversationLog = session.map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`).join('\n');

                const [rawHtml, pageTitle] = await Promise.all([
                    callTextAPI(HTML_GENERATOR_SYSTEM_PROMPT, conversationLog),
                    callTextAPI(TITLE_GENERATOR_SYSTEM_PROMPT, conversationLog)
                ]);

                const htmlString = cleanHtmlResponse(rawHtml);

                if (!htmlString || !htmlString.toLowerCase().includes('<!doctype html>')) {
                    throw new Error('AI tidak menghasilkan kode HTML yang valid.');
                }

                const sanitizedTitle = pageTitle ? pageTitle.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase() : `web-${crypto.randomBytes(4).toString('hex')}`;

                await sock.sendMessage(m.key.remoteJid, { text: `Kode & judul udah jadi, sekarang lagi di-upload dengan nama *${sanitizedTitle}*... 🚀` }, { quoted: m });

                const result = await topage(htmlString, sanitizedTitle);

                if (result.success) {
                    await sock.sendMessage(m.key.remoteJid, { text: `Taraa! 🎉 Website kamu udah jadi, nih link-nya:\n\n${result.page_url}\n\nJangan lupa pamerin yaa~ 😉` }, { quoted: m });
                } else {
                    logger.error({ result }, 'Gagal upload ke 1page');
                    throw new Error(result.message || 'Gagal upload halaman web.');
                }
            } catch (error) {
                logger.error({ err: error, user: userId }, 'Gagal saat generate atau upload web');
                await sock.sendMessage(m.key.remoteJid, { text: `Ugh, maaf banget, ada error pas lagi bikin webnya. Mungkin server AI-nya lagi sibuk 😫. Coba lagi nanti ya!` }, { quoted: m });
            } finally {
                craftSessions.delete(userId);
            }
            return;
        }

        try {
            await sock.sendPresenceUpdate('composing', m.key.remoteJid);
            const history = craftSessions.get(userId) || [];

            const commandText = fullText.slice(config.prefix.length + command.name.length).trim();
            const newUserMessage = { role: 'user', content: commandText };

            history.push(newUserMessage);
            const conversationLog = history.map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`).join('\n');

            const rawResponse = await callTextAPI(DISCUSSION_SYSTEM_PROMPT, conversationLog);
            const aiText = cleanAiDiscussionResponse(rawResponse);

            if (aiText) {
                const newAssistantMessage = { role: 'assistant', content: aiText };
                history.push(newAssistantMessage);
                craftSessions.set(userId, history);

                const responseWithTrigger = `${aiText}\n\nKalo infonya udah cukup, ketik \`.craftweb oke\` buat aku bikinin webnya.`;
                await sock.sendMessage(m.key.remoteJid, { text: responseWithTrigger }, { quoted: m });
            } else {
                history.pop();
                await sock.sendMessage(m.key.remoteJid, { text: 'Duh, AI-nya lagi bengong nih, ga jawab apa-apa. Coba tanya lagi deh.' }, { quoted: m });
            }

        } catch (error) {
            logger.error({ err: error, user: userId }, 'Error di sesi diskusi craftweb');
            await sock.sendMessage(m.key.remoteJid, { text: 'Waduh, ada error di sesi diskusi. Coba lagi ya.' }, { quoted: m });
        } finally {
            await sock.sendPresenceUpdate('paused', m.key.remoteJid);
        }
    }
};

export default command;