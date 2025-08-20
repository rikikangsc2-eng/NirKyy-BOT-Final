import axios from 'axios';
import { load as cheerioLoad } from 'cheerio';
import crypto from 'crypto';
import FormData from 'form-data';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const solveCaptcha = (question) => {
  const sanitized = question.replace(/[= ?]/g, '');
  const parts = sanitized.split('+');
  return parseInt(parts[0], 10) + parseInt(parts[1], 10);
};

const decryptCookieValue = (scriptContent) => {
  const keyMatch = scriptContent.match(/var a=toNumbers\("([a-f0-9]+)"\)/);
  const ivMatch = scriptContent.match(/b=toNumbers\("([a-f0-9]+)"\)/);
  const encryptedMatch = scriptContent.match(/c=toNumbers\("([a-f0-9]+)"\)/);

  if (!keyMatch || !ivMatch || !encryptedMatch) {
    throw new Error('Gagal ambil parameter AES');
  }

  const key = Buffer.from(keyMatch[1], 'hex');
  const iv = Buffer.from(ivMatch[1], 'hex');
  const encrypted = Buffer.from(encryptedMatch[1], 'hex');

  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(false);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('hex');
};

const topage = async (html, name) => {
  if (!html || !name) throw new Error('page_name dan html_code wajib');

  try {
    const agent = axios.create({
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; RMX2185 Build/QP1A.190711.020) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.7151.115 Mobile Safari/537.36'
      }
    });

    const res1 = await agent.get('https://1page.ct.ws');
    const testCookie = `__test=${decryptCookieValue(res1.data)}`;

    const res2 = await agent.get('https://1page.ct.ws/?i=1', {
      headers: { 'Cookie': testCookie }
    });

    const phpsessid = res2.headers['set-cookie'][0].split(';')[0];
    const $ = cheerioLoad(res2.data);
    const csrf = $('input[name="csrf_token"]').val();
    const cap = $('#captcha-question').text();
    if (!csrf || !cap) throw new Error('Gagal ambil token/captcha');

    const jawab = solveCaptcha(cap);
    const form = new FormData();
    form.append('csrf_token', csrf);
    form.append('action', 'create_page');
    form.append('page_name', name);
    form.append('html_code', html);
    form.append('html_file', '', { filename: '' });
    form.append('captcha_answer', jawab.toString());

    await delay(3000);

    const res3 = await agent.post('https://1page.ct.ws/index.php', form, {
      headers: {
        ...form.getHeaders(),
        'Cookie': `${testCookie}; ${phpsessid}`,
        'Origin': 'https://1page.ct.ws',
        'Referer': 'https://1page.ct.ws/?i=1',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    return res3.data;
  } catch (err) {
    const msg = err.response ? err.response.data : err.message;
    return { success: false, message: 'Terjadi error saat proses', error: msg };
  }
};

export { topage };