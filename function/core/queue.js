/*
 * @Author      : Joy Bot
 * @Feature     : Task Concurrency Limiter & Queue Manager
 * @Description : Mengelola antrian pemrosesan tugas CPU-bound (FFmpeg, WebP, Scraper)
 *                untuk mencegah lonjakan CPU 100% dan OOM crash di lingkungan Termux.
 */

export function createQueue(concurrency = 1) {
    const queue = [];
    let active = 0;

    const next = () => {
        if (active < concurrency && queue.length > 0) {
            active++;
            const { fn, resolve, reject } = queue.shift();
            Promise.resolve()
                .then(() => fn())
                .then(resolve)
                .catch(reject)
                .finally(() => {
                    active--;
                    next();
                });
        }
    };

    const add = (fn) => {
        return new Promise((resolve, reject) => {
            queue.push({ fn, resolve, reject });
            next();
        });
    };

    Object.defineProperty(add, 'activeCount', { get: () => active });
    Object.defineProperty(add, 'pendingCount', { get: () => queue.length });

    return add;
}

/**
 * Task throttler khusus untuk operasi media berat (FFmpeg, Image/Video to WebP).
 * Dibatasi ke 1 tugas konversi dalam satu waktu agar CPU Termux tidak throttling/hang.
 */
export const mediaTaskLimit = createQueue(1);

/**
 * Helper untuk memberikan batas waktu maksimum pada Promise (mencegah hanging promise).
 */
export function withTimeout(promise, ms = 60000, errorMsg = 'Task execution timed out') {
    if (!ms || ms <= 0) return promise;
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const err = new Error(errorMsg);
            err.name = 'TimeoutError';
            reject(err);
        }, ms);
    });

    return Promise.race([
        promise,
        timeoutPromise
    ]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}
