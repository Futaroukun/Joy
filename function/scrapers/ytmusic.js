import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import axios from 'axios';

const BASE_URL = 'https://music.youtube.com';

const FILTER_PARAMS = {
  songs: 'EgWKAQIIAWoSEAUQAxAJEAoQERAQEAQQDhAV',
  videos: 'EgWKAQIQAWoSEAUQAxAJEAoQERAQEAQQDhAV',
  albums: 'EgWKAQIYAWoSEAUQAxAJEAoQERAQEAQQDhAV',
  artists: 'EgWKAQIgAWoSEAUQAxAJEAoQERAQEAQQDhAV',
  playlists: 'EgeKAQQoADgBahIQBRADEAkQChAREBAQBBAOEBU%3D',
  community_playlists: 'EgeKAQQoAEABahIQBRADEAkQChAREBAQBBAOEBU%3D'
};

const INNERTUBE_CLIENTS = [
  {
    clientName: 'VISIONOS',
    clientVersion: '1.02',
    clientId: '104',
    deviceMake: 'Apple',
    deviceModel: 'RealityDevice17,1',
    osName: 'visionOS',
    osVersion: '26.5.23O471'
  },
  {
    clientName: 'ANDROID_VR',
    clientVersion: '1.61.48',
    clientId: '89',
    deviceMake: 'Oculus',
    deviceModel: 'Quest 3',
    osName: 'Android',
    osVersion: '12'
  }
];

let cachedContext = null;
let lastContextTime = 0;

function getTempDir() {
  const localTmp = path.join(process.cwd(), 'tmp');
  if (existsSync(localTmp)) return localTmp;
  return process.env.TMPDIR || os.tmpdir();
}

export function parseCookies(input = null) {
  if (input === false || input === '') {
    return '';
  }
  if (input && typeof input === 'string' && input.includes('=')) {
    return input.trim();
  }
  if (input && typeof input === 'string' && existsSync(input)) {
    try {
      return readFileSync(input, 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && (!line.startsWith('#') || line.startsWith('#HttpOnly_')))
        .map(line => {
          const clean = line.replace(/^#HttpOnly_/, '');
          const parts = clean.includes('\t') ? clean.split('\t') : clean.split(/\s+/);
          return parts.length >= 7 ? `${parts[5]}=${parts[6]}` : line;
        })
        .join('; ');
    } catch {
      return '';
    }
  }

  const cwd = process.cwd();
  const searchPaths = [
    path.join(cwd, 'ytmusic.txt'),
    path.join(cwd, 'ytcook.txt'),
    path.join(cwd, 'cookies.txt'),
    new URL('ytmusic.txt', import.meta.url).pathname,
    new URL('ytcook.txt', import.meta.url).pathname
  ];

  for (const target of searchPaths) {
    if (existsSync(target)) {
      try {
        return readFileSync(target, 'utf8')
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && (!line.startsWith('#') || line.startsWith('#HttpOnly_')))
          .map(line => {
            const clean = line.replace(/^#HttpOnly_/, '');
            const parts = clean.includes('\t') ? clean.split('\t') : clean.split(/\s+/);
            return parts.length >= 7 ? `${parts[5]}=${parts[6]}` : line;
          })
          .join('; ');
      } catch {}
    }
  }

  return '';
}

const FALLBACK_VISITOR_DATA = 'CgtENVhpLU1TSmdzRSjOisHWBjIKCgJJRBIEGgAgW2K1AgqyAkN1SUJDQVVTbEFFQjhRWnVacnFZRExFbTNUN2NtQzJvUVc5bHduUWVKTFJJbVhhbHNTdHktdEdaVHJJeV9UTVljXzN1dFp4Z3ZUaTFmZUtDbnRCTXFDMW9ZNVpBaGQwMjVmR3dCenBwY2ZSbWN3TFRBRl9Hc2FHUlBuSHNFdkpuTE1vM3ZzSXMwc1RuQmlLVF9FQjAxNUI2aHRoY291VTZhVVlNMlVuYks4ck1kZk5tbFZTUEJwbHdMWlRmQ0pfaXFKMmk2TUZ4Z0l4OHZleVVLQVV5UlFIZXFaMVB5X3d2eVhTSjZRRzc5VTYwMmQxbldOR09Yc093WGs5QzBPVXVFX3gwR1hXSmprbTdfODRNcm12SHZYRzUwekZQQjNONmFGeU52dm1Vc3RMVjdnN2lCZw%3D%3D';

export async function getInnertubeConfig(customCookie = null) {
  const cookieHeader = parseCookies(customCookie);
  const now = Date.now();
  if (cachedContext && (now - lastContextTime < 1800000) && cachedContext.cookieHeader === cookieHeader && cachedContext.visitorData) {
    return cachedContext;
  }

  const [musicHtml, visitorData] = await Promise.all([
    fetch(BASE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(cookieHeader ? { Cookie: cookieHeader } : {})
      }
    }).then(r => r.text()).catch(() => ''),
    fetch('https://www.youtube.com/sw.js_data', {
      headers: cookieHeader ? { Cookie: cookieHeader } : {}
    })
      .then(r => r.text())
      .then(t => JSON.parse(t.slice(5))[0][2][0][0][13])
      .catch(() => undefined)
  ]);

  const effectiveVisitorData = visitorData || cachedContext?.visitorData || FALLBACK_VISITOR_DATA;
  const apiKey = musicHtml.match(/"INNERTUBE_API_KEY":\s*"([^"]+)"/)?.[1] || 'AIzaSyAO_FJ2SlqAE4An4EkweQ4C_a6dF';
  const clientVersion = musicHtml.match(/"INNERTUBE_CLIENT_VERSION":\s*"([^"]+)"/)?.[1] || '1.20261011.16.00';

  cachedContext = {
    apiKey,
    clientVersion,
    visitorData: effectiveVisitorData,
    cookieHeader,
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion,
        hl: 'en',
        gl: 'US',
        visitorData: effectiveVisitorData
      }
    }
  };
  lastContextTime = now;
  return cachedContext;
}

export function extractVideoId(input) {
  if (!input) return null;
  const str = String(input).trim();
  if (str.startsWith('MPREb_') || str.startsWith('UC') || str.startsWith('VL') || str.startsWith('PL')) {
    return null;
  }
  const urlMatch = str.match(/(?:youtu\.be\/|music\.youtube\.com\/(?:watch\?v=|watch\?.+&v=)|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  return null;
}

export function extractBrowseId(input) {
  if (!input) return null;
  const str = String(input).trim();
  const channelMatch = str.match(/(?:channel\/|browse\/|artist\/)(UC[a-zA-Z0-9_-]+|FEmusic_[a-zA-Z0-9_-]+)/);
  if (channelMatch) return channelMatch[1];
  const playlistMatch = str.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (playlistMatch) {
    const listId = playlistMatch[1];
    return listId.startsWith('VL') ? listId : `VL${listId}`;
  }
  return str;
}

async function apiRequest(endpoint, payload, options = {}) {
  const cookieOpt = options.cookie !== undefined ? options.cookie : options.cookies;
  const cfg = await getInnertubeConfig(cookieOpt);
  const url = `${BASE_URL}/youtubei/v1/${endpoint}?key=${cfg.apiKey}`;

  const bodyData = {
    context: cfg.context,
    ...payload
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': BASE_URL,
      'Referer': `${BASE_URL}/`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...(cfg.cookieHeader ? { Cookie: cfg.cookieHeader } : {})
    },
    body: JSON.stringify(bodyData)
  });

  if (!res.ok) {
    throw new Error(`YouTube Music API error: HTTP ${res.status}`);
  }
  return res.json();
}

function parseFlexColumn(item, index) {
  return item?.flexColumns?.[index]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
}

function parseResponsiveItem(item) {
  const ir = item.musicResponsiveListItemRenderer;
  if (!ir) return null;

  const col0Runs = parseFlexColumn(ir, 0);
  const col1Runs = parseFlexColumn(ir, 1);
  const col2Runs = parseFlexColumn(ir, 2);

  const title = col0Runs[0]?.text || '';
  const firstCol1 = col1Runs[0]?.text || '';

  const artists = col1Runs
    .filter(r => r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('UC'))
    .map(r => ({
      name: r.text,
      id: r.navigationEndpoint?.browseEndpoint?.browseId
    }));

  const albumRun = col1Runs.find(r => r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('MPREb_')) ||
                   col2Runs.find(r => r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('MPREb_'));
  const album = albumRun ? {
    name: albumRun.text,
    id: albumRun.navigationEndpoint?.browseEndpoint?.browseId
  } : null;

  const durationRun = col1Runs.find(r => /^\d+:\d+$/.test(r.text)) ||
                      col2Runs.find(r => /^\d+:\d+$/.test(r.text)) ||
                      ir.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0];
  const duration = durationRun?.text || null;

  const playsRun = col1Runs.find(r => r.text.includes('plays') || r.text.includes('views')) ||
                   col2Runs.find(r => r.text.includes('plays') || r.text.includes('views'));
  const plays = playsRun?.text || null;

  const videoId = ir.playlistItemData?.videoId ||
                  ir.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
                  col0Runs[0]?.navigationEndpoint?.watchEndpoint?.videoId;

  const browseId = col0Runs[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
                   ir.navigationEndpoint?.browseEndpoint?.browseId;

  const thumbnails = ir.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
  const thumbnail = thumbnails.length ? thumbnails[thumbnails.length - 1].url : null;

  let itemType = 'unknown';
  if (firstCol1.toLowerCase().includes('song')) itemType = 'song';
  else if (firstCol1.toLowerCase().includes('video')) itemType = 'video';
  else if (firstCol1.toLowerCase().includes('artist')) itemType = 'artist';
  else if (firstCol1.toLowerCase().includes('album') || firstCol1.toLowerCase().includes('ep')) itemType = 'album';
  else if (firstCol1.toLowerCase().includes('playlist')) itemType = 'playlist';
  else if (videoId) itemType = 'song';
  else if (browseId?.startsWith('UC')) itemType = 'artist';
  else if (browseId?.startsWith('MPREb_')) itemType = 'album';
  else if (browseId?.startsWith('VL')) itemType = 'playlist';

  return {
    type: itemType,
    title,
    videoId: videoId || null,
    browseId: browseId || null,
    artists,
    album,
    duration,
    plays,
    thumbnail,
    thumbnails
  };
}

export async function search(query, options = {}) {
  if (!query || !query.trim()) throw new Error('Search query cannot be empty');
  const filter = (options.filter || 'all').toLowerCase();
  const payload = { query: query.trim() };

  if (FILTER_PARAMS[filter]) {
    payload.params = FILTER_PARAMS[filter];
  }

  const data = await apiRequest('search', payload, options);
  const sections = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

  if (filter !== 'all') {
    const shelf = sections[0]?.musicShelfRenderer;
    const contents = shelf?.contents || [];
    return contents.map(parseResponsiveItem).filter(Boolean);
  }

  let topResult = null;
  const topCard = sections.find(s => s.musicCardShelfRenderer)?.musicCardShelfRenderer;
  if (topCard) {
    const title = topCard.title?.runs?.[0]?.text;
    const subtitleRuns = topCard.subtitle?.runs || [];
    const fullSubtitle = subtitleRuns.map(r => r.text).join('');
    const videoId = topCard.onTap?.watchEndpoint?.videoId ||
                    topCard.buttons?.[0]?.buttonRenderer?.command?.watchEndpoint?.videoId;
    const browseId = topCard.onTap?.browseEndpoint?.browseId;
    const thumbs = topCard.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];

    topResult = {
      title,
      type: subtitleRuns[0]?.text || 'top',
      subtitle: fullSubtitle,
      videoId: videoId || null,
      browseId: browseId || null,
      thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : null,
      thumbnails: thumbs
    };
  }

  const songs = [];
  const videos = [];
  const albums = [];
  const artists = [];
  const playlists = [];

  for (const s of sections) {
    if (s.itemSectionRenderer) {
      const items = s.itemSectionRenderer.contents || [];
      for (const it of items) {
        const parsed = parseResponsiveItem(it);
        if (!parsed) continue;
        if (parsed.type === 'song') songs.push(parsed);
        else if (parsed.type === 'video') videos.push(parsed);
        else if (parsed.type === 'album') albums.push(parsed);
        else if (parsed.type === 'artist') artists.push(parsed);
        else if (parsed.type === 'playlist') playlists.push(parsed);
      }
    } else if (s.musicShelfRenderer) {
      const shelfTitle = (s.musicShelfRenderer.title?.runs?.[0]?.text || '').toLowerCase();
      const items = s.musicShelfRenderer.contents || [];
      for (const it of items) {
        const parsed = parseResponsiveItem(it);
        if (!parsed) continue;
        if (shelfTitle.includes('song')) songs.push(parsed);
        else if (shelfTitle.includes('video')) videos.push(parsed);
        else if (shelfTitle.includes('album')) albums.push(parsed);
        else if (shelfTitle.includes('artist')) artists.push(parsed);
        else if (shelfTitle.includes('playlist')) playlists.push(parsed);
      }
    }
  }

  return {
    query: query.trim(),
    topResult,
    songs,
    videos,
    albums,
    artists,
    playlists
  };
}

export async function getAudioStream(videoIdOrUrl, options = {}) {
  const cookieOpt = options.cookie !== undefined ? options.cookie : options.cookies;
  let videoId = extractVideoId(videoIdOrUrl);
  let candidates = [];

  if (!videoId) {
    const sRes = await search(videoIdOrUrl, options);
    candidates = [
      sRes.topResult?.videoId,
      ...sRes.songs.map(s => s.videoId),
      ...sRes.videos.map(v => v.videoId)
    ].filter(Boolean);
  } else {
    candidates = [videoId];
  }

  const cfg = await getInnertubeConfig(cookieOpt);

  async function fetchStreamForId(id) {
    for (const client of INNERTUBE_CLIENTS) {
      try {
        const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'X-YouTube-Client-Name': client.clientId || '104',
            'X-YouTube-Client-Version': client.clientVersion || '1.02',
            'Origin': 'https://www.youtube.com',
            ...(cfg.cookieHeader ? { Cookie: cfg.cookieHeader } : {})
          },
          body: JSON.stringify({
            context: {
              client: {
                ...client,
                visitorData: cfg.visitorData,
                hl: 'en',
                gl: 'US'
              }
            },
            videoId: id
          })
        });

        const data = await res.json();
        if (data.playabilityStatus?.status !== 'OK') continue;

        const afs = data.streamingData?.adaptiveFormats || [];
        const m4aTrack = afs.find(f => f.itag === 140 && f.url);
        const webmTrack = afs.find(f => f.itag === 251 && f.url);
        const bestAudio = m4aTrack || webmTrack || afs.find(f => f.mimeType?.includes('audio') && f.url);
        if (!bestAudio) continue;

        const url = bestAudio.contentLength
          ? `${bestAudio.url}&range=0-${Number(bestAudio.contentLength) - 1}`
          : bestAudio.url;

        return {
          videoId: id,
          itag: bestAudio.itag,
          format: bestAudio.mimeType?.includes('mp4') ? 'm4a (aac)' : 'webm (opus)',
          mimeType: bestAudio.mimeType?.split(';')[0],
          bitrate: bestAudio.bitrate,
          audioQuality: bestAudio.audioQuality,
          contentLength: bestAudio.contentLength ? parseInt(bestAudio.contentLength, 10) : null,
          url
        };
      } catch {}
    }
    return null;
  }

  for (const id of candidates) {
    const s = await fetchStreamForId(id);
    if (s) return s;
  }

  if (videoId) {
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oembedRes.ok) {
        const oembed = await oembedRes.json();
        const cleanAuthor = (oembed.author_name || '').replace(/\s*-\s*Topic/i, '').trim();
        const query = `${cleanAuthor} ${oembed.title}`.trim();
        const sRes = await search(query);
        const altCandidates = [
          sRes.topResult?.videoId,
          ...sRes.songs.map(s => s.videoId),
          ...sRes.videos.map(v => v.videoId)
        ].filter(id => id && id !== videoId);

        for (const altId of altCandidates) {
          const s = await fetchStreamForId(altId);
          if (s) return s;
        }
      }
    } catch {}
  }

  return null;
}

export async function getLyrics(videoIdOrUrl, options = {}) {
  let videoId = extractVideoId(videoIdOrUrl);
  let fallbackQuery = null;

  if (!videoId) {
    fallbackQuery = String(videoIdOrUrl);
    const sRes = await search(videoIdOrUrl, { filter: 'songs', ...options });
    const first = Array.isArray(sRes) ? sRes[0] : sRes?.songs?.[0];
    if (first?.videoId) videoId = first.videoId;
  }
  if (!videoId) throw new Error('Invalid YouTube video ID or URL');

  // 1. YouTube Music Official Lyrics
  try {
    const nextData = await apiRequest('next', { videoId }, options);
    const tabs = nextData.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs || [];
    const lyricsTab = tabs.find(t => t.tabRenderer?.endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType === 'MUSIC_PAGE_TYPE_TRACK_LYRICS');

    const browseId = lyricsTab?.tabRenderer?.endpoint?.browseEndpoint?.browseId;
    if (browseId) {
      const browseData = await apiRequest('browse', { browseId }, options);
      const shelf = browseData.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer;

      const lyricsText = shelf?.description?.runs?.map(r => r.text).join('') || null;
      const source = shelf?.footer?.runs?.map(r => r.text).join('') || null;

      if (lyricsText) {
        return {
          videoId,
          lyrics: lyricsText,
          syncedLyrics: null,
          source: source || 'YouTube Music'
        };
      }
    }
  } catch {}

  // 2. Fallback ke LRCLIB
  try {
    const track = await getTrack(videoId, { ...options, skipAudio: true }).catch(() => null);
    const trackName = track?.title || fallbackQuery || '';
    const artistName = track?.author || '';

    if (trackName) {
      const q = new URLSearchParams({
        track_name: trackName,
        ...(artistName ? { artist_name: artistName } : {})
      });
      const lrcRes = await fetch(`https://lrclib.net/api/get?${q}`, {
        headers: { 'User-Agent': 'Joy-Bot-YTMusic/1.0' }
      });
      if (lrcRes.ok) {
        const lrc = await lrcRes.json();
        if (lrc.plainLyrics || lrc.syncedLyrics) {
          return {
            videoId,
            lyrics: lrc.plainLyrics || lrc.syncedLyrics,
            syncedLyrics: lrc.syncedLyrics || null,
            source: 'LRCLIB'
          };
        }
      }
    }
  } catch {}

  return {
    videoId,
    lyrics: null,
    syncedLyrics: null,
    source: null
  };
}

export async function getQueue(videoIdOrUrl, options = {}) {
  const videoId = extractVideoId(videoIdOrUrl);
  if (!videoId) throw new Error('Invalid YouTube video ID or URL');

  const nextData = await apiRequest('next', {
    videoId,
    playlistId: `RDAMVM${videoId}`
  }, options);

  const tab0 = nextData.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs?.[0];
  const queueList = tab0?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents || [];

  const queue = [];
  for (const item of queueList) {
    const ppr = item.playlistPanelVideoRenderer;
    if (!ppr) continue;

    const title = ppr.title?.runs?.[0]?.text;
    const vId = ppr.videoId;
    const artistDesc = ppr.longBylineText?.runs?.map(r => r.text).join('') || '';
    const duration = ppr.lengthText?.runs?.[0]?.text || null;
    const thumbs = ppr.thumbnail?.thumbnails || [];

    queue.push({
      title,
      videoId: vId,
      subtitle: artistDesc,
      duration,
      thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : null
    });
  }

  return {
    videoId,
    total: queue.length,
    queue
  };
}

export async function getTrack(videoIdOrUrl, options = {}) {
  let videoId = extractVideoId(videoIdOrUrl);
  if (!videoId) {
    const sRes = await search(videoIdOrUrl, { filter: 'songs', ...options });
    const first = Array.isArray(sRes) ? sRes[0] : sRes?.songs?.[0];
    if (first?.videoId) videoId = first.videoId;
  }
  if (!videoId) throw new Error('Invalid YouTube video ID or URL');

  const promises = [apiRequest('player', { videoId }, options)];
  if (!options.skipAudio) {
    promises.push(getAudioStream(videoId, options));
  }

  const [playerData, audioResult] = await Promise.all(promises);

  const vd = playerData.videoDetails || {};
  const lengthSeconds = parseInt(vd.lengthSeconds, 10) || 0;
  const mins = Math.floor(lengthSeconds / 60);
  const secs = String(lengthSeconds % 60).padStart(2, '0');
  const durationText = `${mins}:${secs}`;

  const thumbs = vd.thumbnail?.thumbnails || [];
  const thumbnail = thumbs.length ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  let lyrics = null;
  if (options.lyrics) {
    lyrics = await getLyrics(videoId, options);
  }

  let queue = null;
  if (options.queue || options.related) {
    queue = await getQueue(videoId, options);
  }

  return {
    videoId,
    title: vd.title || null,
    author: vd.author || null,
    channelId: vd.channelId || null,
    durationSeconds: lengthSeconds,
    duration: durationText,
    thumbnail,
    thumbnails: thumbs,
    audio: audioResult || null,
    ...(lyrics ? { lyrics: lyrics.lyrics, lyricsSource: lyrics.source } : {}),
    ...(queue ? { queue: queue.queue } : {})
  };
}

export async function getAlbum(browseIdOrUrl, options = {}) {
  const browseId = extractBrowseId(browseIdOrUrl);
  if (!browseId) throw new Error('Invalid album browseId or URL');

  const res = await apiRequest('browse', { browseId }, options);
  const tc = res.contents?.twoColumnBrowseResultsRenderer;

  const tab0Hdr = tc?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer;
  const title = tab0Hdr?.title?.runs?.[0]?.text;
  const subtitle = tab0Hdr?.subtitle?.runs?.map(r => r.text).join('') || '';
  const secondSubtitle = tab0Hdr?.secondSubtitle?.runs?.map(r => r.text).join('') || '';
  const thumbs = tab0Hdr?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
  const thumbnail = thumbs.length ? thumbs[thumbs.length - 1].url : null;
  const description = tab0Hdr?.description?.musicDescriptionShelfRenderer?.description?.runs?.map(r => r.text).join('') || null;

  const secContents = tc?.secondaryContents?.sectionListRenderer?.contents || [];
  const shelf = secContents.find(c => c.musicShelfRenderer)?.musicShelfRenderer;
  const trackItems = shelf?.contents || [];

  const tracks = [];
  trackItems.forEach((item, idx) => {
    const ir = item.musicResponsiveListItemRenderer;
    if (!ir) return;
    const trackTitle = ir.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
    const duration = ir.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text || null;
    const videoId = ir.playlistItemData?.videoId ||
                    ir.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
    const artists = ir.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
      ?.filter(r => r.navigationEndpoint?.browseEndpoint?.browseId)
      ?.map(r => ({ name: r.text, id: r.navigationEndpoint?.browseEndpoint?.browseId })) || [];

    tracks.push({
      trackNumber: idx + 1,
      title: trackTitle,
      videoId,
      duration,
      artists
    });
  });

  return {
    browseId,
    title,
    subtitle,
    secondSubtitle,
    thumbnail,
    thumbnails: thumbs,
    description,
    totalTracks: tracks.length,
    tracks
  };
}

export async function getArtist(browseIdOrUrl, options = {}) {
  const browseId = extractBrowseId(browseIdOrUrl);
  if (!browseId) throw new Error('Invalid artist browseId or URL');

  const res = await apiRequest('browse', { browseId }, options);
  const hdr = res.header?.musicImmersiveHeaderRenderer;
  const name = hdr?.title?.runs?.[0]?.text;
  const description = hdr?.description?.runs?.map(r => r.text).join('') || null;
  const thumbs = hdr?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
  const thumbnail = thumbs.length ? thumbs[thumbs.length - 1].url : null;

  const sections = res.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

  const topSongs = [];
  const albums = [];
  const singles = [];
  const videos = [];
  const similarArtists = [];

  for (const s of sections) {
    if (s.musicShelfRenderer) {
      const items = s.musicShelfRenderer.contents || [];
      items.forEach(it => {
        const parsed = parseResponsiveItem(it);
        if (parsed) topSongs.push(parsed);
      });
    } else if (s.musicCarouselShelfRenderer) {
      const title = (s.musicCarouselShelfRenderer.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.map(r => r.text).join('') || '').toLowerCase();
      const items = s.musicCarouselShelfRenderer.contents || [];

      items.forEach(it => {
        const twoRow = it.musicTwoRowItemRenderer;
        if (!twoRow) return;

        const itTitle = twoRow.title?.runs?.[0]?.text;
        const itSubtitle = twoRow.subtitle?.runs?.map(r => r.text).join('') || '';
        const bId = twoRow.navigationEndpoint?.browseEndpoint?.browseId;
        const vId = twoRow.navigationEndpoint?.watchEndpoint?.videoId;
        const itThumbs = twoRow.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];

        const obj = {
          title: itTitle,
          subtitle: itSubtitle,
          browseId: bId || null,
          videoId: vId || null,
          thumbnail: itThumbs.length ? itThumbs[itThumbs.length - 1].url : null
        };

        if (title.includes('album')) albums.push(obj);
        else if (title.includes('single') || title.includes('ep')) singles.push(obj);
        else if (title.includes('video')) videos.push(obj);
        else if (title.includes('fans might') || title.includes('similar')) similarArtists.push(obj);
      });
    }
  }

  return {
    browseId,
    name,
    description,
    thumbnail,
    thumbnails: thumbs,
    topSongs,
    albums,
    singles,
    videos,
    similarArtists
  };
}

export async function getPlaylist(browseIdOrUrl, options = {}) {
  const browseId = extractBrowseId(browseIdOrUrl);
  if (!browseId) throw new Error('Invalid playlist browseId or URL');

  const res = await apiRequest('browse', { browseId }, options);
  const tc = res.contents?.twoColumnBrowseResultsRenderer;

  const tabHdr = tc?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer;
  const title = tabHdr?.title?.runs?.[0]?.text;
  const subtitle = tabHdr?.subtitle?.runs?.map(r => r.text).join('') || '';
  const secondSubtitle = tabHdr?.secondSubtitle?.runs?.map(r => r.text).join('') || '';
  const description = tabHdr?.description?.musicDescriptionShelfRenderer?.description?.runs?.map(r => r.text).join('') || null;
  const thumbs = tabHdr?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
  const thumbnail = thumbs.length ? thumbs[thumbs.length - 1].url : null;

  const rawTracks = tc?.secondaryContents?.sectionListRenderer?.contents?.[0]?.musicPlaylistShelfRenderer?.contents || [];

  const tracks = [];
  rawTracks.forEach((item, idx) => {
    const ir = item.musicResponsiveListItemRenderer;
    if (!ir) return;

    const trackTitle = ir.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
    const videoId = ir.playlistItemData?.videoId;
    const artists = ir.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
      ?.filter(r => r.navigationEndpoint?.browseEndpoint?.browseId)
      ?.map(r => ({ name: r.text, id: r.navigationEndpoint?.browseEndpoint?.browseId })) || [];
    const duration = ir.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text || null;
    const itThumbs = ir.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];

    tracks.push({
      position: idx + 1,
      title: trackTitle,
      videoId,
      artists,
      duration,
      thumbnail: itThumbs.length ? itThumbs[itThumbs.length - 1].url : null
    });
  });

  return {
    browseId,
    title,
    subtitle,
    secondSubtitle,
    description,
    thumbnail,
    thumbnails: thumbs,
    totalTracks: tracks.length,
    tracks
  };
}

export async function getCharts(country = 'US', options = {}) {
  const cookieOpt = options.cookie !== undefined ? options.cookie : options.cookies;
  const cfg = await getInnertubeConfig(cookieOpt);
  const customContext = {
    ...cfg.context,
    client: {
      ...cfg.context.client,
      gl: country.toUpperCase(),
      hl: 'en'
    }
  };

  const url = `${BASE_URL}/youtubei/v1/browse?key=${cfg.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': BASE_URL,
      'Referer': `${BASE_URL}/`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...(cfg.cookieHeader ? { Cookie: cfg.cookieHeader } : {})
    },
    body: JSON.stringify({
      context: customContext,
      browseId: 'FEmusic_charts'
    })
  }).then(r => r.json());

  const sections = res.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
  const topArtists = [];
  const chartPlaylists = [];

  sections.forEach(s => {
    const carousel = s.musicCarouselShelfRenderer;
    if (!carousel) return;
    const title = (carousel.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.map(r => r.text).join('') || '').toLowerCase();
    const items = carousel.contents || [];

    if (title.includes('artist') || title.includes('artis')) {
      items.forEach((it, idx) => {
        const twoRow = it.musicTwoRowItemRenderer;
        const ir = it.musicResponsiveListItemRenderer;

        if (twoRow) {
          const itemTitle = twoRow.title?.runs?.[0]?.text;
          const itemSubtitle = twoRow.subtitle?.runs?.map(r => r.text).join('') || '';
          const bId = twoRow.navigationEndpoint?.browseEndpoint?.browseId;
          const thumbs = twoRow.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];

          topArtists.push({
            rank: idx + 1,
            name: itemTitle,
            subscribers: itemSubtitle,
            browseId: bId || null,
            thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : null
          });
        } else if (ir) {
          const itemTitle = ir.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
          const itemSubtitle = ir.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
          const bId = ir.navigationEndpoint?.browseEndpoint?.browseId;
          const thumbs = ir.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];

          topArtists.push({
            rank: idx + 1,
            name: itemTitle,
            subscribers: itemSubtitle,
            browseId: bId || null,
            thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : null
          });
        }
      });
    } else {
      items.forEach(it => {
        const twoRow = it.musicTwoRowItemRenderer;
        if (twoRow) {
          const itemTitle = twoRow.title?.runs?.[0]?.text;
          const itemSubtitle = twoRow.subtitle?.runs?.map(r => r.text).join('') || '';
          const bId = twoRow.navigationEndpoint?.browseEndpoint?.browseId;
          const thumbs = twoRow.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];

          chartPlaylists.push({
            title: itemTitle,
            subtitle: itemSubtitle,
            browseId: bId || null,
            thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : null
          });
        }
      });
    }
  });

  return {
    country: country.toUpperCase(),
    topArtists,
    chartPlaylists
  };
}

export async function getExplore(options = {}) {
  const res = await apiRequest('browse', { browseId: 'FEmusic_explore' }, options);
  const sections = res.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

  const categories = [];
  sections.forEach(s => {
    const carousel = s.musicCarouselShelfRenderer;
    if (!carousel) return;
    const title = carousel.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.map(r => r.text).join('');
    const items = carousel.contents || [];

    const parsedItems = [];
    items.forEach(it => {
      const twoRow = it.musicTwoRowItemRenderer;
      if (twoRow) {
        const itTitle = twoRow.title?.runs?.[0]?.text;
        const itSubtitle = twoRow.subtitle?.runs?.map(r => r.text).join('') || '';
        const bId = twoRow.navigationEndpoint?.browseEndpoint?.browseId;
        const vId = twoRow.navigationEndpoint?.watchEndpoint?.videoId;
        const thumbs = twoRow.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];

        parsedItems.push({
          title: itTitle,
          subtitle: itSubtitle,
          browseId: bId || null,
          videoId: vId || null,
          thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : null
        });
      }
    });

    if (title && parsedItems.length) {
      categories.push({
        title,
        items: parsedItems
      });
    }
  });

  return {
    totalCategories: categories.length,
    categories
  };
}

function convertToMp3(inputBuffer, metadata = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', 'pipe:0',
      '-vn',
      '-acodec', 'libmp3lame',
      '-b:a', '192k',
      '-id3v2_version', '3'
    ];

    if (metadata.title) args.push('-metadata', `title=${metadata.title}`);
    if (metadata.artist) args.push('-metadata', `artist=${metadata.artist}`);
    if (metadata.album) args.push('-metadata', `album=${metadata.album}`);

    args.push('-f', 'mp3', 'pipe:1');

    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    let stderr = '';

    proc.stdout.on('data', chunk => chunks.push(chunk));
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', code => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`FFmpeg error (code ${code}): ${stderr.slice(-200)}`));
    });

    proc.on('error', err => {
      if (err.code === 'ENOENT') {
        reject(new Error('FFmpeg tidak terinstal di Termux. Jalankan: pkg install ffmpeg'));
      } else {
        reject(err);
      }
    });

    proc.stdin.write(inputBuffer);
    proc.stdin.end();
  });
}

async function downloadViaSaveTube(videoId) {
  try {
    const ky = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
    const cdnRes = await axios.get('https://media.savetube.vip/api/random-cdn', { timeout: 10000 }).catch(() => null);
    const cdn = cdnRes?.data?.cdn || 'cdn403.savetube.vip';

    const infoRes = await axios.post(`https://${cdn}/v2/info`, {
      url: `https://www.youtube.com/watch?v=${videoId}`
    }, {
      headers: {
        'content-type': 'application/json',
        'origin': 'https://yt.savetube.me',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });

    if (!infoRes.data?.data) return null;
    const sr = Buffer.from(infoRes.data.data, 'base64');
    const dc = crypto.createDecipheriv('aes-128-cbc', Buffer.from(ky, 'hex'), sr.slice(0, 16));
    const dec = JSON.parse(Buffer.concat([dc.update(sr.slice(16)), dc.final()]).toString());

    const dlRes = await axios.post(`https://${cdn}/download`, {
      id: videoId,
      downloadType: 'audio',
      quality: '128',
      key: dec.key
    }, {
      headers: {
        'content-type': 'application/json',
        'origin': 'https://yt.savetube.me',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });

    const dlUrl = dlRes.data?.data?.downloadUrl;
    if (!dlUrl) return null;

    const audioRes = await axios.get(dlUrl, {
      responseType: 'arraybuffer',
      timeout: 45000,
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    const rawBuf = Buffer.from(audioRes.data);
    const head = rawBuf.slice(0, 200).toString('utf-8').toLowerCase();
    if (rawBuf.length < 50000 || head.includes('<!doctype') || head.includes('<html') || head.includes('<?xml')) {
      return null;
    }

    return {
      title: dec.title,
      thumbnail: dec.thumbnail,
      duration: dec.durationLabel,
      buffer: rawBuf
    };
  } catch {
    return null;
  }
}

export async function download(urlOrId, options = {}) {
  let videoId = extractVideoId(urlOrId);
  let resolvedTrack = null;
  let candidates = [];

  if (!videoId) {
    const sRes = await search(urlOrId, options);
    candidates = [
      sRes?.topResult?.videoId,
      ...(sRes?.songs || []).map(s => s.videoId),
      ...(sRes?.videos || []).map(v => v.videoId)
    ].filter(Boolean);

    if (!candidates.length) throw new Error('Lagu tidak ditemukan pada pencarian YouTube Music');
    resolvedTrack = sRes.topResult || sRes.songs?.[0] || sRes.videos?.[0];
  } else {
    candidates = [videoId];
  }

  let audio = null;
  let effectiveId = null;

  // 1. Coba ambil stream langsung dari Innertube VisionOS untuk setiap kandidat
  for (const candId of candidates) {
    try {
      audio = await getAudioStream(candId, options);
      if (audio?.url) {
        effectiveId = candId;
        break;
      }
    } catch {}
  }

  let buffer = null;
  let track = null;

  if (effectiveId) {
    track = await getTrack(effectiveId, { ...options, skipAudio: true }).catch(() => resolvedTrack || {});
  } else {
    effectiveId = candidates[0];
    track = resolvedTrack || {};
  }

  // 2. Fallback SaveTube jika direct Innertube gagal
  if (!audio?.url) {
    for (const candId of candidates.slice(0, 3)) {
      try {
        const st = await downloadViaSaveTube(candId);
        if (st && st.buffer && st.buffer.length >= 10000) {
          effectiveId = candId;
          buffer = st.buffer;
          track = {
            ...track,
            title: track?.title || st.title,
            thumbnail: track?.thumbnail || st.thumbnail,
            duration: track?.duration || st.duration
          };
          break;
        }
      } catch {}
    }
  }

  if (!audio?.url && !buffer) {
    throw new Error('Gagal mendapatkan stream audio dari YouTube Music dan semua fallback');
  }

  const cleanTitle = (track?.title || 'audio').replace(/[/\\?%*:|"<>]/g, '_');
  const cleanAuthor = (track?.author || track?.artists?.[0]?.name || 'YouTube Music').replace(/[/\\?%*:|"<>]/g, '_');
  const wantMp3 = options.format?.toLowerCase() === 'mp3' || Boolean(options.whatsapp);
  const ext = wantMp3 ? 'mp3' : (audio ? 'm4a' : 'mp3');
  const filename = `${cleanAuthor} - ${cleanTitle}.${ext}`;

  const formatSize = (bytes) => {
    if (!bytes) return null;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  let savedPath = null;

  if ((options.save || options.outputPath || options.buffer || wantMp3 || options.whatsapp) && !buffer && audio?.url) {
    const res = await fetch(audio.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/'
      }
    });
    if (!res.ok) throw new Error(`Gagal download stream audio: HTTP ${res.status}`);
    const rawBuffer = Buffer.from(await res.arrayBuffer());

    if (wantMp3) {
      buffer = await convertToMp3(rawBuffer, {
        title: track?.title || cleanTitle,
        artist: cleanAuthor,
        album: track?.album?.name || 'YouTube Music'
      });
    } else {
      buffer = rawBuffer;
    }
  }

  if (buffer) {
    if (options.outputPath) {
      savedPath = options.outputPath;
      writeFileSync(savedPath, buffer);
    } else if (options.save) {
      savedPath = path.join(getTempDir(), filename);
      writeFileSync(savedPath, buffer);
    }
  }

  return {
    videoId: effectiveId,
    title: track?.title || cleanTitle,
    artist: cleanAuthor,
    duration: track?.duration || null,
    durationSeconds: track?.durationSeconds || null,
    thumbnail: track?.thumbnail || `https://i.ytimg.com/vi/${effectiveId}/hqdefault.jpg`,
    filename,
    format: ext,
    mimeType: wantMp3 ? 'audio/mpeg' : (audio?.mimeType || 'audio/mpeg'),
    bitrate: audio?.bitrate || 128000,
    size: buffer ? buffer.length : (audio?.contentLength || 0),
    formattedSize: formatSize(buffer ? buffer.length : (audio?.contentLength || 0)),
    downloadUrl: audio?.url || null,
    ...(savedPath ? { savedPath } : {}),
    ...(options.buffer || options.whatsapp ? { buffer } : {})
  };
}

export async function getThumbnail(urlOrId, options = {}) {
  const videoId = extractVideoId(urlOrId);
  const browseId = !videoId ? extractBrowseId(urlOrId) : null;

  if (!videoId && !browseId) {
    throw new Error('ID YouTube Music atau URL tidak valid');
  }

  let title = '';
  let rawThumbnail = null;
  let allThumbnails = [];

  if (videoId) {
    const track = await getTrack(videoId, { skipAudio: true }).catch(() => ({}));
    title = track.title || videoId;
    rawThumbnail = track.thumbnail;
    allThumbnails = track.thumbnails || [];
  } else if (browseId?.startsWith('MPREb_')) {
    const album = await getAlbum(browseId).catch(() => ({}));
    title = album.title || browseId;
    rawThumbnail = album.thumbnail;
    allThumbnails = album.thumbnails || [];
  } else if (browseId?.startsWith('UC')) {
    const artist = await getArtist(browseId).catch(() => ({}));
    title = artist.name || browseId;
    rawThumbnail = artist.thumbnail;
    allThumbnails = artist.thumbnails || [];
  } else if (browseId?.startsWith('VL')) {
    const playlist = await getPlaylist(browseId).catch(() => ({}));
    title = playlist.title || browseId;
    rawThumbnail = playlist.thumbnail;
    allThumbnails = playlist.thumbnails || [];
  }

  let ultraHd = rawThumbnail;
  let hd = rawThumbnail;
  let medium = rawThumbnail;
  let small = rawThumbnail;

  if (rawThumbnail && rawThumbnail.includes('googleusercontent.com')) {
    ultraHd = rawThumbnail.replace(/=w\d+-h\d+.*$/, '=w1200-h1200-l90-rj');
    hd = rawThumbnail.replace(/=w\d+-h\d+.*$/, '=w544-h544-l90-rj');
    medium = rawThumbnail.replace(/=w\d+-h\d+.*$/, '=w226-h226-l90-rj');
    small = rawThumbnail.replace(/=w\d+-h\d+.*$/, '=w120-h120-l90-rj');
  } else if (videoId) {
    ultraHd = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
    hd = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    medium = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    small = `https://i.ytimg.com/vi/${videoId}/default.jpg`;
  }

  const selectedQuality = (options.quality || 'ultra_hd').toLowerCase();
  const selectedUrl = selectedQuality === 'small' ? small :
                      selectedQuality === 'medium' ? medium :
                      selectedQuality === 'hd' ? hd : ultraHd;

  let buffer = null;
  let savedPath = null;

  if (options.save || options.outputPath || options.buffer) {
    const res = await fetch(selectedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!res.ok) throw new Error(`Gagal fetch thumbnail: HTTP ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());

    if (options.outputPath) {
      savedPath = options.outputPath;
      writeFileSync(savedPath, buffer);
    } else if (options.save) {
      const cleanName = (title || 'thumbnail').replace(/[/\\?%*:|"<>]/g, '_');
      savedPath = path.join(getTempDir(), `${cleanName}.jpg`);
      writeFileSync(savedPath, buffer);
    }
  }

  return {
    id: videoId || browseId,
    title,
    quality: selectedQuality,
    url: selectedUrl,
    sizes: {
      ultraHd,
      hd,
      medium,
      small
    },
    allThumbnails,
    ...(savedPath ? { savedPath } : {}),
    ...(options.buffer || options.whatsapp ? { buffer } : {})
  };
}

export default {
  parseCookies,
  getThumbnail,
  download,
  getInnertubeConfig,
  extractVideoId,
  extractBrowseId,
  search,
  getTrack,
  getAudioStream,
  getLyrics,
  getQueue,
  getAlbum,
  getArtist,
  getPlaylist,
  getCharts,
  getExplore
};
