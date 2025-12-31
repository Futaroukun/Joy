import axios from 'axios';

async function chatgpt(question, { model = 'gpt-4o-mini' } = {}) {
    try {
        const models = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-5-mini', 'gpt-5-nano', 'gpt-3.5-turbo'];
        
        if (!question) throw new Error('Question is required.');
        if (!models.includes(model)) throw new Error(`Model tidak valid. Pilihan: ${models.join(', ')}.`);
        
        const { data: html, headers } = await axios.get('https://minitoolai.com/chatGPT/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
            },
            responseType: 'text'
        });
        
        const { data: cf } = await axios.post('https://api.nekolabs.web.id/tls/bypass/cf-turnstile', {
            url: 'https://minitoolai.com/chatGPT/',
            siteKey: '0x4AAAAAABjI2cBIeVpBYEFi'
        });
        
        if (!cf?.result) throw new Error('Gagal mendapatkan token CF.');
        
        const safety_identifier = html.match(/var\s+safety_identifier\s*=\s*"([^"]*)"/)?.[1];
        const utoken = html.match(/var\s+utoken\s*=\s*"([^"]*)"/)?.[1];
        
        if (!safety_identifier) throw new Error('Gagal mendapatkan safety identifier.');
        if (!utoken) throw new Error('Gagal mendapatkan utoken.');
        
        const { data: task } = await axios.post('https://minitoolai.com/chatGPT/chatgpt_stream.php', new URLSearchParams({
            messagebase64img1: '',
            messagebase64img0: '',
            safety_identifier: safety_identifier,
            select_model: model,
            temperature: '0.7',
            utoken: utoken,
            message: question,
            umes1a: '',
            umes1stimg1a: '',
            umes2ndimg1a: '',
            bres1a: '',
            umes2a: '',
            umes1stimg2a: '',
            umes2ndimg2a: '',
            bres2a: '',
            cft: encodeURIComponent(cf.result)
        }).toString(), {
            headers: {
                'accept': '*/*',
                'accept-encoding': 'gzip, deflate, br',
                'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                cookie: headers['set-cookie'] ? headers['set-cookie'].join('; ') : '',
                'origin': 'https://minitoolai.com',
                'referer': 'https://minitoolai.com/chatGPT/',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
                'x-requested-with': 'XMLHttpRequest'
            }
        });
        
        const { data } = await axios.get('https://minitoolai.com/chatGPT/chatgpt_stream.php', {
            headers: {
                'accept': '*/*',
                'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                cookie: headers['set-cookie'] ? headers['set-cookie'].join('; ') : '',
                'referer': 'https://minitoolai.com/chatGPT/',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
                'x-requested-with': 'XMLHttpRequest'
            },
            params: {
                streamtoken: task
            },
            responseType: 'text'
        });
        
        const rawResult = data.split('\n\n')
            .filter(line => line.includes('{"type":"response.completed"'))
            .map(line => JSON.parse(line.split('\n')[1].substring(6)))
            .find(line => line.type === 'response.completed');

        const result = rawResult?.response?.output?.[0]?.content?.[0]?.text;

        if (!result) throw new Error('Tidak ada hasil teks ditemukan dalam respons API.');
        
        return result;
    } catch (error) {
        console.error('Error in chatgpt function:', error);
        throw new Error(error.message);
    }
}

export default chatgpt;