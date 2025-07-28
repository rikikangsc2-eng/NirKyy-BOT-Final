import axios from 'axios';
import FormData from 'form-data';

export async function uploadToTmpFiles(buffer, filename = 'file.bin') {
    try {
        const form = new FormData();
        form.append('file', buffer, { filename });
        
        const { data } = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
            headers: { ...form.getHeaders() },
            timeout: 60000
        });

        if (data && data.status === 'success' && data.data.url) {
            return data.data.url.replace('.org/', '.org/dl/');
        }
        throw new Error('Gagal mengupload ke TmpFiles atau format respons tidak dikenali.');
    } catch (error) {
        throw new Error(error.response?.data?.message || error.message || 'Gagal terhubung ke TmpFiles API.');
    }
}

export async function uploadToCatbox(buffer, filename = 'file.bin') {
    try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', buffer, { filename });

        const { data } = await axios.post('https://catbox.moe/user/api.php', form, {
            headers: { ...form.getHeaders() },
            timeout: 60000
        });

        if (typeof data === 'string' && data.startsWith('http')) {
            return data;
        }
        throw new Error('Gagal mengupload ke Catbox atau respons tidak valid.');
    } catch (error) {
        throw new Error(error.response?.data || error.message || 'Gagal terhubung ke Catbox API.');
    }
}