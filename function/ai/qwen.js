/***
  @ Base: https://play.google.com/store/apps/details?id=ai.qwenlm.chat.android
  @ Author: Shannz
  @ Note: Wrapper from apk qwen ai.
***/

import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const CONFIG = {
    BASE_URL: "https://chat.qwen.ai/api/v2",
    HEADERS: {
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 15; 25028RN03A Build/AP3A.240905.015.A2) AliApp(QWENCHAT/2.10.0) AppType/Release AplusBridgeLite',
        'Connection': 'Keep-Alive',
        'Accept': 'application/json',
        'X-Platform': 'android',
        'source': 'app',
        'Accept-Language': 'en-US',
        'Accept-Charset': 'UTF-8'
    }
};
const cookieJars = new Map();

const utils = {
    sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    generateUUID: () => crypto.randomUUID(),

    hashPassword: (password) => {
        return crypto.createHash('sha256').update(password).digest('hex');
    },

    getFileType: (filename) => {
        const ext = path.extname(filename).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return 'image';
        if (['.mp4', '.avi', '.mov', '.mkv'].includes(ext)) return 'video';
        return 'file';
    },

    getMimeType: (filetype, filename) => {
        const ext = path.extname(filename).toLowerCase();
        if (filetype === 'image') return 'image/jpeg';
        if (filetype === 'video') return 'video/mp4';
        return 'application/octet-stream';
    },

    parseSSE: (chunk) => {
        const lines = chunk.toString().split('\n');
        const events = [];
        let currentEvent = { event: 'message', data: '' };

        for (const line of lines) {
            if (line.startsWith('event:')) {
                if (currentEvent.data) events.push({ ...currentEvent });
                currentEvent = { event: line.substring(6).trim(), data: '' };
            } else if (line.startsWith('data:')) {
                currentEvent.data += line.substring(5).trim();
            } else if (line === '' && currentEvent.data) {
                events.push({ ...currentEvent });
                currentEvent = { event: 'message', data: '' };
            }
        }
        if (currentEvent.data) events.push(currentEvent);
        return events;
    },

    parseCookies: (arr) => {
        return Object.fromEntries(
            (arr || []).map(c => {
                const [pair] = c.split(';')
                const i = pair.indexOf('=')
                return i < 0 ? [] : [pair.slice(0, i).trim(), pair.slice(i + 1).trim()]
            }).filter(e => e.length)
        )
    },

    getCookieStr: (token) => {
        const jar = cookieJars.get(token);
        if (!jar) return '';
        return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    },

    updateCookies: (token, setCookieHeaders) => {
        if (!setCookieHeaders) return;
        let jar = cookieJars.get(token);
        if (!jar) {
            jar = {};
            cookieJars.set(token, jar);
        }
        Object.assign(jar, utils.parseCookies(setCookieHeaders));
    },

    getAuthHeaders: (token) => {
        const headers = {
            ...CONFIG.HEADERS,
            'Authorization': `Bearer ${token}`,
            'x-request-id': utils.generateUUID()
        };
        const cookieStr = utils.getCookieStr(token);
        if (cookieStr) {
            headers['Cookie'] = cookieStr;
        }
        return headers;
    }
};

export const qwen = {
    login: async (email, password) => {
        try {
            const hashedPassword = utils.hashPassword(password);

            const response = await axios.post(`${CONFIG.BASE_URL}/auths/signin`, {
                email: email,
                password: hashedPassword
            }, {
                headers: {
                    ...CONFIG.HEADERS,
                    'x-request-id': utils.generateUUID()
                }
            });

            if (!response.data.success) throw new Error("Login failed");

            const token = response.data.data.token;
            utils.updateCookies(token, response.headers['set-cookie']);

            await qwen.fetchModels(token);

            return {
                token: token,
                user: response.data.data
            };
        } catch (error) {
            console.error(`Login error: ${error.message}`);
            return null;
        }
    },

    createSession: async (token) => {
        try {
            const response = await axios.post(`${CONFIG.BASE_URL}/chats/new`, {
                chat_mode: "normal",
                project_id: ""
            }, {
                headers: utils.getAuthHeaders(token)
            });

            if (!response.data.success) throw new Error('Failed to create session');
            utils.updateCookies(token, response.headers['set-cookie']);
            return response.data.data.id;
        } catch (error) {
            console.error(`Create session error: ${error.message}`);
            return null;
        }
    },

    getListSession: async (token, page = 1) => {
        try {
            const response = await axios.get(`${CONFIG.BASE_URL}/chats/list?exclude_project=true&page=${page}`, {
                headers: utils.getAuthHeaders(token)
            });

            if (!response.data.success) throw new Error('Failed to get session list');
            utils.updateCookies(token, response.headers['set-cookie']);
            return response.data.data;
        } catch (error) {
            console.error(`Get list session error: ${error.message}`);
            return null;
        }
    },

    getHistory: async (token, chatId) => {
        try {
            const response = await axios.get(`${CONFIG.BASE_URL}/chats/${chatId}`, {
                headers: utils.getAuthHeaders(token)
            });

            if (!response.data.success) throw new Error('Failed to get history');
            utils.updateCookies(token, response.headers['set-cookie']);
            return response.data.data;
        } catch (error) {
            console.error(`Get history error: ${error.message}`);
            return null;
        }
    },

    deleteSession: async (token, chatId) => {
        try {
            const response = await axios.delete(`${CONFIG.BASE_URL}/chats/${chatId}`, {
                headers: utils.getAuthHeaders(token)
            });

            if (!response.data.success) throw new Error('Failed to delete session');
            utils.updateCookies(token, response.headers['set-cookie']);
            return response.data.data.status;
        } catch (error) {
            console.error(`Delete session error: ${error.message}`);
            return false;
        }
    },

    upload: async (token, filePath) => {
        try {
            if (!fs.existsSync(filePath)) throw new Error('File not found');
            const stats = fs.statSync(filePath);
            const filename = path.basename(filePath);
            const filetype = utils.getFileType(filename);
            const mimeType = utils.getMimeType(filetype, filename);
            const fileBuffer = fs.readFileSync(filePath);

            const stsRes = await axios.post(`${CONFIG.BASE_URL}/files/getstsToken`, {
                filename: filename, filetype: filetype, filesize: stats.size.toString()
            }, { headers: utils.getAuthHeaders(token) });

            if (!stsRes.data.success) throw new Error('Failed to get STS Token');
            utils.updateCookies(token, stsRes.headers['set-cookie']);
            const stsData = stsRes.data.data;
            const fileId = stsData.file_id;
            const dateStr = new Date().toUTCString();
            const stringToSign = `PUT\n\n${mimeType}\n${dateStr}\nx-oss-security-token:${stsData.security_token}\n/${stsData.bucketname}/${stsData.file_path}`;
            const signature = crypto.createHmac('sha1', stsData.access_key_secret).update(stringToSign).digest('base64');
            const putUrl = `https://${stsData.bucketname}.${stsData.region}.aliyuncs.com/${stsData.file_path}`;

            await axios.put(putUrl, fileBuffer, {
                headers: {
                    'User-Agent': 'aliyun-sdk-android/2.9.21',
                    'Authorization': `OSS ${stsData.access_key_id}:${signature}`,
                    'x-oss-security-token': stsData.security_token,
                    'Date': dateStr,
                    'Content-Type': mimeType
                },
                maxBodyLength: Infinity
            });

            // Gambar dan video langsung return setelah upload
            if (filetype === 'image' || filetype === 'video') {
                return { id: fileId, type: filetype, name: filename, size: stats.size, url: stsData.file_url };
            }

            // Dokumen perlu parsing dulu
            const parseRes = await axios.post(`${CONFIG.BASE_URL}/files/parse`, { file_id: fileId }, { headers: utils.getAuthHeaders(token) });
            if (!parseRes.data.success) throw new Error('Parse init failed');
            utils.updateCookies(token, parseRes.headers['set-cookie']);

            let attempts = 0;
            while (attempts < 30) {
                await utils.sleep(3000);
                const statusRes = await axios.post(`${CONFIG.BASE_URL}/files/parse/status`, { file_id_list: [fileId] }, { headers: utils.getAuthHeaders(token) });
                utils.updateCookies(token, statusRes.headers['set-cookie']);

                if (statusRes.data.success && statusRes.data.data.length > 0) {
                    const statusData = statusRes.data.data[0];
                    if (statusData.status === 'success') {
                        return { id: fileId, type: filetype, name: filename, size: stats.size, url: stsData.file_url };
                    } else if (statusData.status === 'failed' || statusData.error_code) {
                        return null;
                    }
                }
                attempts++;
            }

            return null;

        } catch (error) {
            console.error(`Upload error: ${error.message}`);
            return null;
        }
    },

    getModels: async (token) => {
        try {
            const response = await axios.get(`${CONFIG.BASE_URL}/models`, {
                headers: utils.getAuthHeaders(token)
            });
            if (!response.data?.success) throw new Error('Failed to get models list');
            utils.updateCookies(token, response.headers['set-cookie']);
            return response.data.data.data;
        } catch (error) {
            console.error(`Get models error: ${error.message}`);
            return null;
        }
    },

    sortModels: (models) => {
        const getTierScore = (name) => {
            if (name.includes('max')) return 3;
            if (name.includes('plus')) return 2;
            if (name.includes('flash')) return 1;
            return 0;
        };

        const parseVersion = (id) => {
            const match = id.match(/qwen(\d+(?:\.\d+)?)/i);
            return match ? parseFloat(match[1]) : 0;
        };

        return [...models].sort((a, b) => {
            const verA = parseVersion(a);
            const verB = parseVersion(b);
            if (verB !== verA) return verB - verA;
            return getTierScore(b) - getTierScore(a);
        });
    },

    fetchModels: async (token) => {
        const modelsData = await qwen.getModels(token);
        if (modelsData && Array.isArray(modelsData)) {
            const fetchedList = modelsData.map(m => m.id).filter(Boolean);
            if (fetchedList.length > 0) {
                qwen.MODELS = qwen.sortModels(fetchedList);
            }
        }
        return qwen.MODELS;
    },

    MODELS: [
        "qwen3.8-max",
        "qwen3.8-omni-flash",
        "qwen3.7-max",
        "qwen3.7-plus",
        "qwen3.6-plus",
        "qwen3.5-plus",
        "qwen3.5-omni-plus"
    ],

    chat: async (token, chatId, prompt, options = {}) => {
        try {
            const useStream = options.stream !== false;
            const messageId = utils.generateUUID();
            const selectedModel = options.model || qwen.MODELS?.[0] || "qwen3.8-max";
            const thinkingEnabled = options.thinkingEnabled !== false;
            const searchEnabled = options.searchEnabled !== false;

            let fileAttachment = [];
            if (options.file) {
                fileAttachment = [{
                    type: options.file.type,
                    file: {
                        data: {},
                        filename: options.file.name,
                        meta: {
                            name: options.file.name,
                            size: options.file.size,
                            content_type: options.file.type === 'image' ? '' : options.file.type
                        }
                    },
                    url: options.file.url,
                    name: options.file.name,
                    file_type: options.file.type === 'image' ? undefined : options.file.name.split('.').pop()
                }];

                if (options.file.type === 'image') {
                    fileAttachment[0].image_width = 1000;
                    fileAttachment[0].image_height = 1000;
                }
            }

            const payload = {
                stream: true,
                incremental_output: true,
                chat_id: chatId,
                chat_mode: "normal",
                model: selectedModel,
                messages: [
                    {
                        chat_type: "t2t",
                        content: prompt,
                        role: "user",
                        feature_config: {
                            output_schema: "phase",
                            thinking_enabled: thinkingEnabled,
                            thinking_format: "summary",
                            auto_thinking: thinkingEnabled,
                            auto_search: searchEnabled
                        },
                        timestamp: Math.floor(Date.now() / 1000),
                        sub_chat_type: "t2t",
                        models: [selectedModel],
                        fid: messageId,
                        user_action: "chat",
                        extra: { meta: { subChatType: "t2t" } },
                        ...(fileAttachment.length > 0 && { files: fileAttachment })
                    }
                ],
                timestamp: Math.floor(Date.now() / 1000),
                share_id: "",
                origin_branch_message_id: ""
            };

            if (options.parentId) {
                payload.parent_id = options.parentId;
                payload.messages[0].parentId = options.parentId;
                payload.messages[0].parent_id = options.parentId;
            }

            const response = await axios.post(`${CONFIG.BASE_URL}/chat/completions?chat_id=${chatId}`, payload, {
                headers: {
                    ...utils.getAuthHeaders(token),
                    'Accept': '*/*,text/event-stream',
                    'Content-Type': 'application/json; charset=UTF-8'
                },
                responseType: 'stream'
            });
            utils.updateCookies(token, response.headers['set-cookie']);

            const contentType = response.headers['content-type'] || '';
            const isPunished = response.headers['bxpunish'] === '1';

            if (isPunished || contentType.includes('text/html')) {
                let html = '';
                return new Promise((resolve, reject) => {
                    response.data.on('data', (chunk) => {
                        html += chunk.toString();
                    });
                    response.data.on('end', () => {
                        if (html.includes('punish') || html.includes('captcha') || html.includes('rgv587')) {
                            reject(new Error('Terdeteksi blokir Captcha/Anti-Bot oleh Alibaba/Qwen. Akun atau IP Termux Anda terblokir sementara (butuh verifikasi Captcha). Coba toggle airplane mode/ganti jaringan untuk mengubah IP Termux Anda.'));
                        } else {
                            reject(new Error('API Qwen mengembalikan HTML bukan stream. Kemungkinan terblokir Cloudflare/Anti-Bot.'));
                        }
                    });
                    response.data.on('error', (err) => {
                        reject(new Error('Gagal membaca respon HTML error: ' + err.message));
                    });
                });
            }

            let fullText = '';
            let thoughtText = '';
            let searchResults = [];
            let buffer = '';
            let printedThoughts = 0;
            let searchPrinted = false;
            let lastResponseId = '';

            return new Promise((resolve, reject) => {
                response.data.on('data', (chunk) => {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const events = utils.parseSSE(line + '\n\n');
                        for (const event of events) {
                            if (!event.data || event.data === ':') continue;

                            try {
                                const parsed = JSON.parse(event.data);
                                if (parsed.response_id) {
                                    lastResponseId = parsed.response_id;
                                }
                                if (!parsed.choices || parsed.choices.length === 0) continue;
                                const delta = parsed.choices[0].delta;
                                if (!delta) continue;

                                if (delta.phase === 'thinking_summary') {
                                    if (delta.extra?.summary_thought?.content) {
                                        const thoughts = delta.extra.summary_thought.content;
                                        for (let i = printedThoughts; i < thoughts.length; i++) {
                                            thoughtText += thoughts[i] + '\n';
                                        }
                                        printedThoughts = thoughts.length;
                                    }
                                }

                                if (delta.phase === 'image_search' || delta.phase === 'search') {
                                    if (delta.extra?.search_result && !searchPrinted) {
                                        searchResults = delta.extra.search_result;
                                        searchPrinted = true;
                                    }
                                }

                                if (delta.phase === 'answer') {
                                    if (delta.content) {
                                        fullText += delta.content;
                                    }
                                }

                            } catch (e) { /* ignore parse errors */ }
                        }
                    }
                });

                response.data.on('end', () => {
                    if (useStream) {
                        resolve(fullText || 'No response');
                    } else {
                        resolve({
                            status: 'success',
                            thinking: thoughtText.trim(),
                            search_results: searchResults,
                            response: fullText.trim(),
                            responseId: lastResponseId
                        });
                    }
                });

                response.data.on('error', (err) => {
                    if (useStream) reject(err);
                    else resolve({ status: 'error', message: err.message });
                });
            });

        } catch (error) {
            console.error(`Chat error: ${error.message}`);
            return options.stream !== false ? null : { status: 'error', message: error.message };
        }
    }
};