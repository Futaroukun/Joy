import fs from 'fs'
import path from 'path'
import syntaxerror from 'syntax-error';

const formatSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

let handler = async (m, { text, usedPrefix, command }) => {
  if (!text || text.trim() === '') {
    return m.reply(
      '*NAMA PLUGIN DIPERLUKAN*\n\n' +
      '*Format penggunaan:*\n' +
      '*' + usedPrefix + command + ' <nama_plugin>*\n\n' +
      '*Contoh:*\n' +
      usedPrefix + command + ' *test-fitur*'
    );
  }
  
  if (!m.quoted || !m.quoted.text || m.quoted.text.trim() === '') {
    return m.reply(
      '*TIDAK ADA KODE YANG DI-REPLY*\n\n' +
      'Silakan reply pesan yang berisi kode JavaScript valid untuk dijadikan plugin.'
    );
  }
  
  let pluginName = text.trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '')
    .replace(/^-+|-+$/g, '');
  
  if (!pluginName) {
    return m.reply(
      '*NAMA PLUGIN TIDAK VALID*\n\n' +
      'Gunakan hanya huruf, angka, dan strip (-).'
    );
  }
  
  let pluginPath = path.join('plugins', `${pluginName}.js`);
  let pluginCode = m.quoted.text.trim();
  
  const error = syntaxerror(pluginCode, pluginPath, {
      sourceType: 'module',
      allowAwaitOutsideFunction: true
  });

  if (error) {
      return m.reply(
          '*SYNTAX ERROR TERDETEKSI*\n\n' +
          `Plugin *${pluginName}.js* tidak dapat disimpan karena mengandung kesalahan.\n\n` +
          '==================================\n' +
          '```' + error + '```\n' +
          '==================================\n\n' +
          '*PERIKSA KEMBALI KODE ANDA!*\n' +
          'File tidak akan disimpan sampai error diperbaiki.'
      );
  }

  let isUpdate = fs.existsSync(pluginPath);
  let oldSize = 0;
  
  if (isUpdate) {
    try {
      const oldContent = await fs.promises.readFile(pluginPath, 'utf8');
      oldSize = oldContent.length;
    } catch {}
  }
  
  try {
    await fs.promises.writeFile(pluginPath, pluginCode, 'utf8');
    
    if (isUpdate) {
      const sizeDiff = pluginCode.length - oldSize;
      const diffSymbol = sizeDiff > 0 ? '+' : (sizeDiff < 0 ? '' : '');
      
      return m.reply(
        '*PLUGIN BERHASIL DIUPDATE*\n\n' +
        `*Nama Plugin:* ${pluginName}.js\n` +
        `*Lokasi:* \`${pluginPath}\`\n\n` +
        '*Perubahan:*\n' +
        `- Ukuran Lama: *${formatSize(oldSize)}*\n` +
        `- Ukuran Baru: *${formatSize(pluginCode.length)}*\n` +
        `- Selisih: *${diffSymbol}${formatSize(sizeDiff)}*\n\n` +
        '*Status: Plugin berhasil diperbarui*\n\n' +
        '*Langkah selanjutnya:*\n' +
        '1. Plugin akan *otomatis* ter-reload\n' +
        '2. Atau *restart bot* untuk memastikan\n' +
        '3. *Tes plugin* dengan command yang ditentukan\n\n' +
        '*Perintah terkait:*\n' +
        `- Lihat plugin: *.gp ${pluginName}*\n` +
        `- Hapus plugin: *.dp ${pluginName}*`
      );
    } else {
      return m.reply(
        '*PLUGIN BERHASIL DISIMPAN*\n\n' +
        `*Nama Plugin:* ${pluginName}.js\n` +
        `*Lokasi:* \`${pluginPath}\`\n\n` +
        '*Detail:*\n' +
        `- Ukuran: *${formatSize(pluginCode.length)}*\n` +
        `- Status: *Plugin baru*\n\n` +
        '*Status: Plugin berhasil dibuat*\n\n' +
        '*Langkah selanjutnya:*\n' +
        '1. Plugin akan *otomatis* ter-load\n' +
        '2. Atau *restart bot* untuk memastikan\n' +
        '3. *Tes plugin* dengan command yang ditentukan\n\n' +
        '*Perintah terkait:*\n' +
        `- Lihat plugin: *.gp ${pluginName}*\n` +
        `- Hapus plugin: *.dp ${pluginName}*`
      );
    }
    
  } catch (e) {
    console.error('Error saving plugin:', e);
    return m.reply(
        `*GAGAL MENYIMPAN PLUGIN*\n\n*Kesalahan:* ${e.message}`
    );
  }
}

handler.command = /^(sp|saveplugin)$/i;
handler.help = ['sp *nama_plugin*'];
handler.tags = ['owner'];
handler.owner = true;

export default handler;