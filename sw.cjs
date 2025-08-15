const fs = require('fs');
const path = require('path');

const INPUT_FILE = 'input.txt';
const BLOCK_REGEX = /```[\w-]*\n([\s\S]*?)```/g;
const LOKASI_REGEX = /\/\*\s*\*?\s*Lokasi:\s*(.*?)\s*\*?\s*Versi:\s*(.*?)\s*\*\//i;

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function saveBlockToFile(lokasi, content) {
  const fullPath = path.join(__dirname, lokasi);
  const dir = path.dirname(fullPath);
  ensureDirSync(dir);
  fs.writeFileSync(fullPath, content.trimStart(), 'utf-8');
  console.log(`✅ Saved: ${lokasi}`);
}

function processBlocks(inputText) {
  const blocks = [...inputText.matchAll(BLOCK_REGEX)];

  if (blocks.length === 0) {
    console.log('⚠️  No code blocks found.');
    return;
  }

  blocks.forEach((match, index) => {
    const block = match[1].trim();
    const lokasiMatch = block.match(LOKASI_REGEX);

    if (!lokasiMatch) {
      console.log(`⏩ Block #${index + 1} skipped (no Lokasi/Versi)`);
      return;
    }

    const lokasi = lokasiMatch[1].trim();
    saveBlockToFile(lokasi, block);
  });
}

function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ File "${INPUT_FILE}" tidak ditemukan.`);
    return;
  }

  const inputText = fs.readFileSync(INPUT_FILE, 'utf-8');
  processBlocks(inputText);
}

main();
