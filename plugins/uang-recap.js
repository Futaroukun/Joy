/*
- @Author: Rafli
- @Feature: Money Tracker
- @Description: Catatan keuangan pemasukan dan pengeluaran dengan database terpisah.
*/

let handler = async (m, { conn, text, usedPrefix, command }) => {

    let db = global.uangDb.data

    if (!db[m.sender]) db[m.sender] = { saldo: 0, history: [] }

    let user = db[m.sender]

    const formatRupiah = (n) => new Intl.NumberFormat('id-ID', {
        style: 'currency', currency: 'IDR', minimumFractionDigits: 0
    }).format(n)

    let cmd = command.toLowerCase()
    let input = text

    // ── DUKUNGAN SUBCOMMAND .uang in / .uang out ────────────────────────────────
    if (cmd === 'uang' || cmd === 'keuangan') {
        const parts = (text || '').trim().split(/\s+/)
        const sub = parts[0]?.toLowerCase()
        if (sub === 'in' || sub === 'masuk') {
            cmd = 'in'
            input = parts.slice(1).join(' ')
        } else if (sub === 'out' || sub === 'keluar') {
            cmd = 'out'
            input = parts.slice(1).join(' ')
        }
    }

    // ── DASHBOARD ──────────────────────────────────────────────────────────────
    if (cmd === 'uang' || cmd === 'keuangan') {
        if (input === 'reset') {
            db[m.sender] = { saldo: 0, history: [] }
            global.saveData('keuangan', m.sender)
            return m.reply('Data keuangan berhasil direset.')
        }

        let { saldo, history } = user
        let txt = `*CATATAN KEUANGAN*\n\n`
        txt += `*Saldo saat ini:* ${formatRupiah(saldo)}\n\n`
        txt += `*10 Transaksi Terakhir:*\n`

        if (!history?.length) {
            txt += `_Belum ada transaksi._`
        } else {
            history.slice(-10).reverse().forEach((h, i) => {
                const tanda = h.type === 'in' ? '+' : '-'
                txt += `${i + 1}. ${tanda}${formatRupiah(h.amount)} — ${h.note}\n`
                txt += `   _${h.date}_\n`
            })
        }

        txt += `\n*Perintah:*\n`
        txt += `\`${usedPrefix}uang in <nominal> | <catatan>\` — catat pemasukan\n`
        txt += `\`${usedPrefix}uang out <nominal> | <catatan>\` — catat pengeluaran\n`
        txt += `\`${usedPrefix}uang reset\` — hapus semua data`

        return m.reply(txt)
    }

    // ── INPUT TRANSAKSI ────────────────────────────────────────────────────────
    if (!input) {
        const tipe = (cmd === 'in' || cmd === 'masuk') ? 'pemasukan' : 'pengeluaran'
        return m.reply(
            `*CATAT ${tipe.toUpperCase()}*\n\n` +
            `*Format:* \`${usedPrefix}uang ${cmd} nominal | catatan\`\n\n` +
            `*Contoh:*\n` +
            `\`${usedPrefix}uang ${cmd} 50000 | makan siang\`\n` +
            `\`${usedPrefix}uang ${cmd} 50.000 | makan siang\``
        )
    }

    let [nominalRaw, ...catatanRaw] = input.split('|')
    let nominal = parseInt(nominalRaw.replace(/[^0-9]/g, ''))
    let catatan = catatanRaw.join('|').trim() || 'Tanpa catatan'

    if (!nominal || isNaN(nominal)) {
        return m.reply('Nominal harus berupa angka.\n\nContoh: `50000` atau `50.000`')
    }

    let type = (cmd === 'in' || cmd === 'masuk') ? 'in' : 'out'
    let date = new Date().toLocaleString('id-ID', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    }).replace(/\./g, ':')

    if (type === 'in') {
        user.saldo += nominal
    } else {
        if (user.saldo < nominal) {
            return m.reply(
                `*Saldo tidak mencukupi.*\n\n` +
                `Kamu ingin mengeluarkan ${formatRupiah(nominal)}, ` +
                `tapi saldo kamu hanya ${formatRupiah(user.saldo)}.`
            )
        }
        user.saldo -= nominal
    }

    user.history.push({ type, amount: nominal, note: catatan, date })
    if (user.history.length > 100) user.history.shift()
    global.saveData('keuangan', m.sender)

    let res  = `*Transaksi berhasil dicatat.*\n\n`
    res += `Tipe    : ${type === 'in' ? 'Pemasukan' : 'Pengeluaran'}\n`
    res += `Nominal : ${formatRupiah(nominal)}\n`
    res += `Catatan : ${catatan}\n`
    res += `Waktu   : ${date}\n\n`
    res += `*Saldo sekarang:* ${formatRupiah(user.saldo)}`

    await m.reply(res)
}

handler.help = ['uang *in/out/reset*']
handler.tags    = ['keuangan']
handler.command = /^(uang|keuangan|masuk|keluar|in|out)$/i

export default handler