import axios from 'axios';
import crypto from 'crypto';
import { gameSessionCache, statements, susunkataDataCache } from '#database';
import logger from '#lib/logger.js';

const GAME_DURATION_S = 60;
const DATA_URL = 'https://github.com/rikikangsc2-eng/metadata/raw/refs/heads/main/susunkata.json';

async function getSusunkataData() {
    if (susunkataDataCache.has('gameData')) {
        return susunkataDataCache.get('gameData');
    }
    try {
        const { data } = await axios.get(DATA_URL);
        if (data && Array.isArray(data) && data.length > 0) {
            logger.info(`Berhasil memuat dan menyimpan cache ${data.length} soal Susun Kata.`);
            susunkataDataCache.set('gameData', data);
            return data;
        }
        throw new Error('Format data tidak valid atau kosong');
    } catch (error) {
        logger.error({ err: error }, 'Gagal memuat data game Susun Kata');
        return [];
    }
}

const hashAnswer = (answer) => {
    return crypto.createHash('sha256').update(answer.toUpperCase()).digest('hex');
};

export default {
    name: 'susunkata',
    category: 'rpg',
    description: 'Main game susun kata dan menangkan hadiah koin.',
    async execute({ sock, m }) {
        const chatId = m.key.remoteJid;

        if (!chatId.endsWith('@g.us')) {
            return sock.sendMessage(chatId, { text: 'Game ini hanya bisa dimainkan di dalam grup.' }, { quoted: m });
        }
        
        const existingSession = gameSessionCache.get(chatId) || statements.getGameSession.get(chatId);
        if (existingSession) {
            return sock.sendMessage(chatId, { text: `Masih ada soal yang belum terjawab di grup ini. Silakan selesaikan dulu soal yang ada.` }, { quoted: m });
        }
        
        const gameData = await getSusunkataData();
        if (gameData.length === 0) {
            return sock.sendMessage(chatId, { text: 'Maaf, bank soal game sedang tidak tersedia. Coba lagi nanti.' }, { quoted: m });
        }

        const question = gameData[Math.floor(Math.random() * gameData.length)];
        const correctAnswer = question.jawaban;
        const answerHash = hashAnswer(correctAnswer);
        const expiresAt = Date.now() + (GAME_DURATION_S * 1000);

        const sessionData = {
            gameId: crypto.randomBytes(8).toString('hex'),
            question: question.pertanyaan,
            answer: correctAnswer,
            expiresAt: expiresAt
        };

        statements.insertOrReplaceGameSession.run(
            chatId,
            'susunkata',
            JSON.stringify(sessionData),
            expiresAt
        );
        
        const fullSessionForCache = {
            ...sessionData,
            game_type: 'susunkata',
            db_expires_at: expiresAt
        };
        gameSessionCache.set(chatId, fullSessionForCache);

        const ZWS = '\u200B';
        const metadata = `${ZWS.repeat(3)}SUSUNKATA:${expiresAt}:${answerHash}${ZWS.repeat(3)}`;
        const gameMessage = `✨ *Game Susun Kata Dimulai!* ✨\n\nBalas (reply) pesan ini untuk menjawab pertanyaan di bawah ini dan dapatkan hadiah!\n\nSoal: *${question.pertanyaan}*\n\nWaktu: *${GAME_DURATION_S} detik*\n\n${metadata}`;
        
        await sock.sendMessage(chatId, { text: gameMessage });
    }
};