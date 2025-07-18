import axios from 'axios';
import crypto from 'crypto';
import { susunkataSessions } from '#database';
import logger from '#lib/logger.js';

let gameData = [];
const GAME_DURATION_S = 60;

async function loadGameData() {
    if (gameData.length > 0) return;
    try {
        const { data } = await axios.get('https://github.com/rikikangsc2-eng/metadata/raw/refs/heads/main/susunkata.json');
        if (data && Array.isArray(data) && data.length > 0) {
            gameData = data;
            logger.info(`Berhasil memuat ${gameData.length} soal Susun Kata.`);
        } else {
            throw new Error('Format data tidak valid atau kosong');
        }
    } catch (error) {
        logger.error({ err: error }, 'Gagal memuat data game Susun Kata');
        gameData = [];
    }
}

const hashAnswer = (answer) => {
    return crypto.createHash('sha256').update(answer.toUpperCase()).digest('hex');
};

loadGameData();

export default {
    name: 'susunkata',
    category: 'rpg',
    description: 'Main game susun kata dan menangkan hadiah koin.',
    async execute({ sock, m }) {
        const chatId = m.key.remoteJid;

        if (!chatId.endsWith('@g.us')) {
            return sock.sendMessage(chatId, { text: 'Game ini hanya bisa dimainkan di dalam grup.' }, { quoted: m });
        }

        if (susunkataSessions.has(chatId)) {
            return sock.sendMessage(chatId, { text: `Masih ada soal yang belum terjawab di grup ini. Silakan selesaikan dulu soal yang ada.` }, { quoted: m });
        }
        
        if (gameData.length === 0) {
            await loadGameData();
            if (gameData.length === 0) {
                 return sock.sendMessage(chatId, { text: 'Maaf, bank soal game sedang tidak tersedia. Coba lagi nanti.' }, { quoted: m });
            }
        }

        const question = gameData[Math.floor(Math.random() * gameData.length)];
        const correctAnswer = question.jawaban;
        const answerHash = hashAnswer(correctAnswer);
        const expiresAt = Date.now() + (GAME_DURATION_S * 1000);

        susunkataSessions.set(chatId, {
            question: question.pertanyaan,
            answer: correctAnswer,
            expiresAt: expiresAt
        });

        const ZWS = '\u200B';
        const metadata = `${ZWS.repeat(3)}SUSUNKATA:${expiresAt}:${answerHash}${ZWS.repeat(3)}`;
        const gameMessage = `✨ *Game Susun Kata Dimulai!* ✨\n\nBalas (reply) pesan ini untuk menjawab pertanyaan di bawah ini dan dapatkan hadiah!\n\nSoal: *${question.pertanyaan}*\n\nWaktu: *${GAME_DURATION_S} detik*\n\n${metadata}`;
        
        await sock.sendMessage(chatId, { text: gameMessage });
    }
};