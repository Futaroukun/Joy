import chalk from 'chalk';

let monitoring = false;
let monitorData = {
    jidDetected: [],
    lidDetected: [],
    lastCheck: null
};

let handler = async (m, { conn, args, command }) => {
    const action = args[0]?.toLowerCase();
    
    if (!action || !['start', 'stop', 'status', 'report'].includes(action)) {
        return m.reply(
            '*LID MONITORING SYSTEM*\n\n' +
            '*Perintah yang tersedia:*\n\n' +
            '*1. Start Monitor*\n' +
            '   .monitorlid start\n' +
            '   _Mulai monitoring JID yang masuk_\n\n' +
            '*2. Stop Monitor*\n' +
            '   .monitorlid stop\n' +
            '   _Hentikan monitoring_\n\n' +
            '*3. Status*\n' +
            '   .monitorlid status\n' +
            '   _Cek status monitoring_\n\n' +
            '*4. Report*\n' +
            '   .monitorlid report\n' +
            '   _Lihat hasil monitoring_\n\n' +
            '*Fungsi:*\n' +
            '- Deteksi otomatis saat ada JID baru masuk database\n' +
            '- Alert real-time jika ada JID terdeteksi\n' +
            '- Tracking LID yang berhasil dikonversi'
        );
    }
    
    // ===== START MONITORING =====
    if (action === 'start') {
        if (monitoring) {
            return m.reply('*MONITORING SUDAH AKTIF*\n\nGunakan *.monitorlid stop* untuk menghentikan.');
        }
        
        monitoring = true;
        monitorData = {
            jidDetected: [],
            lidDetected: [],
            lastCheck: Date.now(),
            startTime: Date.now()
        };
        
        // Setup interval check
        global.lidMonitorInterval = setInterval(() => {
            if (!monitoring) return;
            
            const users = global.db.data.users || {};
            const currentJids = Object.keys(users).filter(id => id.endsWith('@s.whatsapp.net'));
            
            // Cek JID baru
            for (const jid of currentJids) {
                if (!monitorData.jidDetected.includes(jid)) {
                    monitorData.jidDetected.push(jid);
                    console.log(chalk.red(`[MONITOR] ⚠️ JID DETECTED: ${jid}`));
                    
                    // Auto alert ke owner (opsional)
                    if (global.owner && global.owner[0]) {
                        const ownerId = `${global.owner[0]}@s.whatsapp.net`;
                        conn.reply(ownerId, 
                            `*⚠️ LID MONITOR ALERT*\n\n` +
                            `JID terdeteksi masuk database:\n` +
                            `• ${jid}\n\n` +
                            `*Aksi:* Akan di-auto migrate saat user kirim pesan`, 
                            null
                        ).catch(() => {});
                    }
                }
            }
            
            // Track LID
            const currentLids = Object.keys(users).filter(id => id.endsWith('@lid'));
            for (const lid of currentLids) {
                if (!monitorData.lidDetected.includes(lid)) {
                    monitorData.lidDetected.push(lid);
                    console.log(chalk.green(`[MONITOR] ✅ LID DETECTED: ${lid}`));
                }
            }
            
            monitorData.lastCheck = Date.now();
        }, 10000); // Check setiap 10 detik
        
        return m.reply(
            '*✅ MONITORING AKTIF*\n\n' +
            'Sistem akan:\n' +
            '• Deteksi JID yang masuk database\n' +
            '• Track LID yang berhasil dibuat\n' +
            '• Alert real-time via console\n' +
            '• Auto report setiap 10 detik\n\n' +
            '*Gunakan .monitorlid report untuk lihat hasil*'
        );
    }
    
    // ===== STOP MONITORING =====
    if (action === 'stop') {
        if (!monitoring) {
            return m.reply('*MONITORING TIDAK AKTIF*\n\nGunakan *.monitorlid start* untuk memulai.');
        }
        
        monitoring = false;
        if (global.lidMonitorInterval) {
            clearInterval(global.lidMonitorInterval);
            global.lidMonitorInterval = null;
        }
        
        const duration = Date.now() - monitorData.startTime;
        const durationMin = Math.floor(duration / 60000);
        
        return m.reply(
            '*🛑 MONITORING DIHENTIKAN*\n\n' +
            `*Durasi:* ${durationMin} menit\n` +
            `*JID Detected:* ${monitorData.jidDetected.length}\n` +
            `*LID Detected:* ${monitorData.lidDetected.length}\n\n` +
            '*Gunakan .monitorlid report untuk detail*'
        );
    }
    
    // ===== STATUS =====
    if (action === 'status') {
        if (!monitoring) {
            return m.reply(
                '*MONITORING: TIDAK AKTIF*\n\n' +
                'Gunakan *.monitorlid start* untuk memulai monitoring.'
            );
        }
        
        const duration = Date.now() - monitorData.startTime;
        const durationMin = Math.floor(duration / 60000);
        const lastCheckAgo = Math.floor((Date.now() - monitorData.lastCheck) / 1000);
        
        return m.reply(
            '*✅ MONITORING: AKTIF*\n\n' +
            `*Durasi Running:* ${durationMin} menit\n` +
            `*Last Check:* ${lastCheckAgo} detik yang lalu\n` +
            `*JID Detected:* ${monitorData.jidDetected.length}\n` +
            `*LID Detected:* ${monitorData.lidDetected.length}\n\n` +
            '*Status:* System berjalan normal'
        );
    }
    
    // ===== REPORT =====
    if (action === 'report') {
        if (!monitorData.startTime) {
            return m.reply('*BELUM ADA DATA MONITORING*\n\nJalankan *.monitorlid start* terlebih dahulu.');
        }
        
        let report = '*📊 MONITORING REPORT*\n\n';
        
        if (monitoring) {
            const duration = Date.now() - monitorData.startTime;
            const durationMin = Math.floor(duration / 60000);
            report += `*Status:* Aktif (${durationMin} menit)\n\n`;
        } else {
            report += `*Status:* Stopped\n\n`;
        }
        
        report += `*Summary:*\n`;
        report += `• JID Detected: ${monitorData.jidDetected.length}\n`;
        report += `• LID Detected: ${monitorData.lidDetected.length}\n\n`;
        
        if (monitorData.jidDetected.length > 0) {
            report += `*⚠️ JID yang terdeteksi:*\n`;
            monitorData.jidDetected.slice(0, 10).forEach(jid => {
                report += `• ${jid}\n`;
            });
            if (monitorData.jidDetected.length > 10) {
                report += `_...dan ${monitorData.jidDetected.length - 10} lainnya_\n`;
            }
            report += '\n*Rekomendasi:* Jalankan .fixlid fix\n\n';
        } else {
            report += `*✅ Tidak ada JID terdeteksi*\n\n`;
        }
        
        if (monitorData.lidDetected.length > 0) {
            report += `*✅ LID yang berhasil dibuat:*\n`;
            monitorData.lidDetected.slice(0, 5).forEach(lid => {
                const num = lid.split('@')[0];
                report += `• ${num}\n`;
            });
            if (monitorData.lidDetected.length > 5) {
                report += `_...dan ${monitorData.lidDetected.length - 5} lainnya_\n`;
            }
        }
        
        report += '\n*Kesimpulan:*\n';
        if (monitorData.jidDetected.length === 0) {
            report += '🎉 Sistem LID bekerja sempurna!\n';
            report += 'Semua user baru langsung pakai LID.';
        } else {
            report += '⚠️ Ada JID yang masuk database.\n';
            report += 'Akan auto-migrate saat user kirim pesan.';
        }
        
        return m.reply(report);
    }
}

handler.help = ['monitorlid *action*'];
handler.tags = ['owner'];
handler.command = /^(monitorlid|lidmon)$/i;
handler.owner = true;

export default handler;