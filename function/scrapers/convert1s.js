/*
 * @Author      : Rafli
 * @Feature     : YouTube MP3 Downloader Scraper (Convert1s + Ytmp3 Fallback)
 * @Description : Ekstraksi audio YouTube / YouTube Music 320kbps via Convert1s API & Ytmp3 Engine
 */

import axios from 'axios';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function extractVideoId(url = '') {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(
    /(?:youtu\.be\/|(?:www\.|m\.|music\.)?youtube\.com\/(?:.*[?&]v=|shorts\/|embed\/|v\/))([a-zA-Z0-9_-]{11})/i
  );
  return match?.[1] || null;
}

export function isValidAudioBuffer(buf) {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 50000) return false;
  const headerStr = buf.slice(0, 200).toString('utf-8').toLowerCase();
  if (headerStr.includes('<!doctype') || headerStr.includes('<html') || headerStr.includes('<?xml')) {
    return false;
  }
  const isId3 = buf.slice(0, 3).toString('ascii') === 'ID3';
  const isMp3Sync = (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
  const isM4a = buf.slice(4, 8).toString('ascii') === 'ftyp';
  const isOgg = buf.slice(0, 4).toString('ascii') === 'OggS';
  const isWebm = buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
  const isRiff = buf.slice(0, 4).toString('ascii') === 'RIFF';
  return isId3 || isMp3Sync || isM4a || isOgg || isWebm || isRiff;
}

export async function convertViaConvert1s(url, format = 'mp3', quality = '320k') {
  try {
    const headers = {
      Origin: 'https://media.ytmp3.gg',
      Referer: 'https://media.ytmp3.gg/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Content-Type': 'application/json'
    };

    const { data: conv } = await axios.post(
      'https://hub.convert1s.com/api/download',
      {
        url,
        os: 'macos',
        output: {
          type: format === 'mp4' ? 'video' : 'audio',
          format,
          quality
        },
        audio: { bitrate: '320k' }
      },
      { headers, timeout: 20000 }
    );

    if (!conv?.statusUrl) return null;

    for (let i = 0; i < 25; i++) {
      await sleep(1500);
      const { data } = await axios.get(conv.statusUrl, { headers, timeout: 15000 });
      if (data?.status === 'completed' && data?.downloadUrl) {
        return {
          url: data.downloadUrl,
          title: conv.title || null,
          quality: conv.selectedQuality || quality
        };
      }
      if (['failed', 'error'].includes(data?.status)) break;
    }
    return null;
  } catch {
    return null;
  }
}

export async function convertViaYtmp3(videoId, format = 'mp3') {
  try {
    const client = axios.create({
      headers: {
        Origin: 'https://ytmp3.mobi',
        Referer: 'https://ytmp3.mobi/en8/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
        Accept: '*/*'
      },
      timeout: 15000
    });

    const { data: init } = await client.get(
      `https://a.ymcdn.org/api/v1/init?p=y&23=1llum1n471&_=${Date.now()}`
    );
    if (!init?.convertURL) return null;

    let { data } = await client.get(`${init.convertURL}&v=${videoId}&f=${format}&_=${Date.now()}`);
    let redirects = 0;

    while (data?.redirect > 0 && data?.redirectURL && redirects < 10) {
      const response = await client.get(`${data.redirectURL}&v=${videoId}&f=${format}&_=${Date.now()}`);
      data = response.data;
      redirects++;
    }

    if (!data || data.error) return null;

    let progress = 0;
    let downloadUrl = data.downloadURL;

    for (let i = 0; i < 20; i++) {
      await sleep(2000);
      if (!data.progressURL) break;
      const { data: status } = await client.get(`${data.progressURL}&_=${Date.now()}`);
      progress = status?.progress ?? 0;
      downloadUrl = status?.downloadURL || downloadUrl;
      if (progress >= 3) break;
    }

    if (progress < 3 || !downloadUrl) return null;

    return {
      url: downloadUrl.startsWith('//') ? `https:${downloadUrl}` : downloadUrl,
      title: data.title || null,
      quality: format === 'mp3' ? '320kbps' : '720p'
    };
  } catch {
    return null;
  }
}

export async function downloadAudio(inputUrlOrId) {
  const videoId = extractVideoId(inputUrlOrId) || inputUrlOrId;
  if (!videoId || videoId.length !== 11) {
    throw new Error('ID YouTube tidak valid');
  }

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // 1. Coba via Convert1s
  let res = await convertViaConvert1s(canonicalUrl, 'mp3', '320k');

  // 2. Fallback via Ytmp3
  if (!res?.url) {
    res = await convertViaYtmp3(videoId, 'mp3');
  }

  if (!res?.url) {
    throw new Error('Gagal mendapatkan link download audio dari provider.');
  }

  const dlRes = await axios.get(res.url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  const buffer = Buffer.from(dlRes.data);
  if (!isValidAudioBuffer(buffer)) {
    throw new Error('Hasil unduhan bukan file audio yang valid.');
  }

  return {
    videoId,
    title: res.title,
    quality: res.quality,
    downloadUrl: res.url,
    buffer
  };
}

export default {
  extractVideoId,
  isValidAudioBuffer,
  convertViaConvert1s,
  convertViaYtmp3,
  downloadAudio
};
