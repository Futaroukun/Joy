import { jidNormalizedUser } from '@whiskeysockets/baileys'

// Map untuk melacak jumlah panggilan dari user
const callTracker = new Map()
const MAX_CALLS = 3 // User akan diblokir setelah 3x telepon dalam waktu singkat

/**
- Handler untuk menolak panggilan masuk secara otomatis.
- @param {any} json - Data panggilan dari event Baileys.
 */
export async function handleCall(json) {
    // Ambil data panggilan
    const call = json[0]
    if (!call) return

    // Cek dulu, settingan anti-call aktif atau enggak
    const botLid = jidNormalizedUser(this.user?.lid)
    const settings = global.db.data.settings[botLid] || {}

    // Jika fitur mati, jangan lakukan apa-apa
    if (settings.antiCall === false) {
        console.log('Fitur Anti-Call sedang nonaktif.')
        return
    }

    // Kita cuma proses panggilan yang statusnya 'offer' (panggilan masuk, bukan missed call)
    if (call.status === 'offer') {
        const callerId = call.from
        const botName = global.info?.namabot || 'Joy'
        const ownerNumber = global.info?.nomorowner || global.owner[0]

        // Langsung tolak panggilannya
        await this.rejectCall(call.id, callerId)
        console.log(`[ANTI-CALL] Menolak panggilan dari ${callerId}`)
        
        // Kirim pesan peringatan ke user yang nelpon
        await this.sendMessage(callerId, { 
            text: `Maaf, *${botName}* tidak dapat menerima panggilan.\n\nNomor Anda akan otomatis diblokir jika terus-menerus menelepon.\n\nJika ada hal penting, silakan chat *Owner*:\nwa.me/${ownerNumber}`
        })

        // Lacak user yang suka iseng nelpon
        const callCount = (callTracker.get(callerId) || 0) + 1
        callTracker.set(callerId, callCount)

        // Reset counter setelah 1 menit
        setTimeout(() => {
            callTracker.delete(callerId)
        }, 60000)

        // Kalau user nelpon lebih dari MAX_CALLS, langsung blokir
        if (callCount >= MAX_CALLS) {
            await this.updateBlockStatus(callerId, 'block')
            console.log(`[ANTI-CALL] Memblokir ${callerId} karena spam call.`)
            callTracker.delete(callerId) // Hapus dari tracker setelah diblokir
        }
    }
}