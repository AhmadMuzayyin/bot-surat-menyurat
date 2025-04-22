const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const {
  saveCustomToSpreadsheet,
  saveSuratKeluarToSpreadsheet,
  saveUndanganToSpreadsheet,
  saveSuratMasukToSpreadsheet,
  saveSKToSpreadsheet,
  findLetterData,
  updateLetterData } = require('./sheet');
const { generateDocument, cleanupTempFile } = require('./docs');
const app = express();
const {
  initializeUsersFile,
  isUserRegistered,
  isUserPending,
  addPendingUser,
  approveUser,
  rejectUser,
  getPendingUsers,
  isAdmin,
  ADMIN_ID,
  getUserById,
  getRejectedUsers,
  saveUsersData,
  getUsersData
} = require('./users');
const { suratFormat, jenisSuratKeluar } = require('./surat.js');
const { getRegisteredUsers } = require('./users.js');
require('dotenv').config()
initializeUsersFile();

// Ganti dengan token bot Anda
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

async function checkUserAuthorization(msg, bot) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (msg.text && (msg.text === '/start' || msg.text === '/daftar')) {
    return true;
  }

  if (isAdmin(userId)) {
    return true;
  }

  const isRegistered = await isUserRegistered(userId);
  const isPending = await isUserPending(userId);

  if (!isRegistered && !isPending) {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📝 Daftar Sekarang', callback_data: 'register' }]
        ]
      }
    };

    await bot.sendMessage(
      chatId,
      '⚠️ *Akses Ditolak*\n\nAnda belum terdaftar sebagai pengguna bot ini. Silakan daftar terlebih dahulu.',
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
    return false;
  }

  if (isPending) {
    await bot.sendMessage(
      chatId,
      '⏳ Pendaftaran Anda sedang menunggu persetujuan admin. Mohon tunggu.'
    );
    return false;
  }

  return true;
}

bot.onText(/\/(start|restart)/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const firstName = msg.from.first_name;

  try {
    // Cek status registrasi user
    const isRegistered = await isUserRegistered(userId);
    const isPending = await isUserPending(userId);

    let message = `👋 Halo ${firstName}!\n\n`;
    message += `Selamat datang di *Bot Administrasi Surat*\n\n`;
    message += `Bot ini akan membantu Anda dalam:\n`;
    message += `📝 Pembuatan Surat Keluar\n`;
    message += `📨 Pendaftaran Surat Masuk\n`;
    message += `📋 Pembuatan Undangan\n`;
    message += `📎 Pembuatan SK\n\n`;

    let keyboard;

    if (isRegistered) {
      // Jika user sudah terdaftar
      message += `*Perintah yang tersedia:*\n`;
      message += `/suratkeluar - Buat surat keluar\n`;
      message += `/suratmasuk - Daftar surat masuk\n`;
      message += `/undangan - Buat undangan\n`;
      message += `/sk - Surat Keputusan\n`;
      message += `/spt - Surat Perintah Tugas\n`;
      message += `/edit - Edit surat yang sudah dibuat\n`;

      keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 Buat Surat Keluar', callback_data: 'menu_suratkeluar' }],
            [{ text: '📨 Daftar Surat Masuk', callback_data: 'menu_suratmasuk' }],
            [{ text: '📋 Buat Undangan', callback_data: 'menu_undangan' }],
            [{ text: '📎 Surat Keputusan', callback_data: 'menu_sk' }],
          ]
        }
      };
    } else if (isPending) {
      // Jika user masih pending
      message += `Status pendaftaran Anda masih dalam proses verifikasi. Mohon tunggu persetujuan dari admin.`;
      keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❓ Cek Status Pendaftaran', callback_data: 'check_status' }]
          ]
        }
      };
    } else {
      // Jika user belum terdaftar
      message += `Untuk menggunakan bot ini, Anda perlu mendaftar terlebih dahulu.`;
      keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 Daftar Sekarang', callback_data: 'register' }]
          ]
        }
      };
    }

    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      ...keyboard
    });

  } catch (error) {
    console.error('Error in start/restart command:', error);
    await bot.sendMessage(chatId, 'Maaf, terjadi kesalahan. Silakan coba lagi nanti.');
  }
});
bot.onText(/\/daftar/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  // Check if already registered or pending
  const isRegistered = await isUserRegistered(userId);
  const isPending = await isUserPending(userId);

  if (isRegistered) {
    await bot.sendMessage(chatId, '✅ Anda sudah terdaftar sebagai pengguna bot.');
    return;
  }
  if (isPending) {
    await bot.sendMessage(chatId, '⏳ Pendaftaran Anda sedang menunggu persetujuan admin.');
    return;
  }
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Daftar Sekarang', callback_data: 'register' }]
      ]
    }
  };
  await bot.sendMessage(
    chatId,
    '👋 Selamat datang! Silakan klik tombol di bawah untuk mendaftar:',
    keyboard
  );
});

function validateLetterType(type) {
  return jenisSuratKeluar.includes(type);
}
const userStates = {};
// Handle command /suratkeluar
bot.onText(/\/suratkeluar/, async (msg) => {
  if (msg.text && (msg.text === '/start' || msg.text === '/daftar')) {
    return;
  }
  const isAuthorized = await checkUserAuthorization(msg, bot);
  if (!isAuthorized) {
    return;
  }
  const chatId = msg.chat.id;
  userStates[chatId] = {
    type: null,
    data: {}
  };
  const suratList = [
    { number: '1', text: 'Keterangan Usaha', data: 'Keterangan Usaha' },
    { number: '2', text: 'SKCK', data: 'SKCK' },
    { number: '3', text: 'Rekom BBM Solar', data: 'Rekom BBM Solar' },
    { number: '4', text: 'Rekom BBM Pertalite', data: 'Rekom BBM Pertalite' },
    { number: '5', text: 'Keterangan Kematian', data: 'Keterangan Kematian' },
    { number: '6', text: 'Keterangan Domisili', data: 'Keterangan Domisili' },
    { number: '7', text: 'Keterangan Domisili Organisasi', data: 'Keterangan Domisili Organisasi' },
    { number: '8', text: 'Keterangan Tidak Mampu Umum', data: 'Keterangan Tidak Mampu Umum' },
    { number: '9', text: 'Keterangan Tidak Mampu Dengan Penghasilan Orang Tua', data: 'Keterangan Tidak Mampu Dengan Penghasilan Orang Tua' },
    { number: '10', text: 'Keterangan Satu Nama Umum', data: 'Keterangan Satu Nama Umum' },
    { number: '11', text: 'Keterangan Satu Nama Khusus', data: 'Keterangan Satu Nama Khusus' },
    { number: '12', text: 'Keterangan Asal Usul', data: 'Keterangan Asal Usul' },
    { number: '13', text: 'Keterangan Pindah Domisili', data: 'Keterangan Pindah Domisili' },
    { number: '14', text: 'Keterangan Kuasa', data: 'Keterangan Kuasa' },
    { number: '15', text: 'Pemberitahuan', data: 'Pemberitahuan' },
    { number: '16', text: 'Undangan', data: 'Undangan' }
  ];
  const inlineKeyboard = [];
  for (let i = 0; i < suratList.length; i += 2) {
    const row = [];
    row.push({
      text: `${suratList[i].number}. ${suratList[i].text}`,
      callback_data: suratList[i].data
    });
    if (i + 1 < suratList.length) {
      row.push({
        text: `${suratList[i + 1].number}. ${suratList[i + 1].text}`,
        callback_data: suratList[i + 1].data
      });
    }
    inlineKeyboard.push(row);
  }
  inlineKeyboard.push([{ text: '❌ Cancel', callback_data: 'cancel' }]);
  const keyboard = {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  };
  bot.sendMessage(
    chatId,
    '📋 *Pilih Jenis Surat:*\n\nSilakan pilih jenis surat yang akan dibuat:',
    {
      parse_mode: 'Markdown',
      ...keyboard
    }
  );
});

// Handle command /upload
bot.onText(/\/upload/, async (msg) => {
  if (msg.text && (msg.text === '/start' || msg.text === '/daftar')) {
    return;
  }
  const isAuthorized = await checkUserAuthorization(msg, bot);
  if (!isAuthorized) {
    return;
  }
  const chatId = msg.chat.id;
  userStates[chatId] = {
    type: 'upload',
    category: null,
    uploadStatus: 'waiting_category',
    files: [] // Track uploaded files in this session
  };

  const uploadCategories = [
    { text: '1. Surat Keluar', data: 'upload_surat_keluar' },
    { text: '2. Surat Masuk', data: 'upload_surat_masuk' },
    { text: '3. Surat Custom', data: 'upload_surat_custom' },
    { text: '4. Administrasi Desa Umum', data: 'upload_adm_desa_umum' },
    { text: '5. Administrasi Desa Khusus', data: 'upload_adm_desa_khusus' }
  ];

  const inlineKeyboard = [];
  for (let i = 0; i < uploadCategories.length; i++) {
    inlineKeyboard.push([{
      text: uploadCategories[i].text,
      callback_data: uploadCategories[i].data
    }]);
  }
  inlineKeyboard.push([{ text: '❌ Cancel', callback_data: 'cancel_upload' }]);

  const keyboard = {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  };

  bot.sendMessage(
    chatId,
    '📤 *Upload Dokumen*\n\nSilakan pilih kategori dokumen yang ingin Anda upload:',
    {
      parse_mode: 'Markdown',
      ...keyboard
    }
  );
});

// Format surat masuk
const suratMasukFormat = [
  { no: 1, field: 'Pengirim' },
  { no: 2, field: 'Nomor Surat Masuk' },
  { no: 3, field: 'Identitas' },
  { no: 4, field: 'Tanggal Masuk' },
  { no: 5, field: 'Tujuan' },
  { no: 6, field: 'Perihal' },
  { no: 7, field: 'Lampiran' },
  { no: 8, field: 'Deskripsi' },
  { no: 9, field: 'Penerima' }
];
// Handler untuk command /suratmasuk
bot.onText(/\/suratmasuk/, async (msg) => {
  if (msg.text && (msg.text === '/start' || msg.text === '/daftar')) {
    return;
  }
  const isAuthorized = await checkUserAuthorization(msg, bot);
  if (!isAuthorized) {
    return;
  }
  const chatId = msg.chat.id;
  userStates[chatId] = {
    type: 'Surat Masuk',
    data: {}
  };

  // Buat pesan format input
  let formatMessage = 'Silakan masukkan data surat masuk dengan format berikut:\n\n';
  suratMasukFormat.forEach(item => {
    formatMessage += `${item.no}. ${item.field}\n`;
  });

  formatMessage += '\nContoh input:\n';
  formatMessage += '1. PT. ABC Indonesia\n';
  formatMessage += '2. ABC/123/V/2025\n';
  formatMessage += '3. KTP/SIM/Paspor\n';
  formatMessage += '4. 05-01-2025\n';
  formatMessage += '5. Kepala Desa\n';
  formatMessage += '6. Undangan Rapat\n';
  formatMessage += '7. 2 Berkas\n';
  formatMessage += '8. Rapat koordinasi pembangunan\n';
  formatMessage += '9. Staff Administrasi\n';
  formatMessage += '\nMasukkan semua data sekaligus sesuai format nomor di atas';

  // Tambahkan tombol cancel
  const cancelKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Cancel', callback_data: 'cancel' }]
      ]
    }
  };

  await bot.sendMessage(chatId, formatMessage, cancelKeyboard);
});
// Handler untuk command /spt
bot.onText(/\/spt/, async (msg) => {
  if (msg.text && (msg.text === '/start' || msg.text === '/daftar')) {
    return;
  }
  const isAuthorized = await checkUserAuthorization(msg, bot);
  if (!isAuthorized) {
    return;
  }
  const chatId = msg.chat.id;
  userStates[chatId] = {
    type: 'Surat Perintah Tugas',
    data: {}
  };

  // Buat pesan format input
  let formatMessage = 'Silakan masukkan data surat perintah tugas dengan format berikut:\n\n';
  suratFormat['Surat Perintah Tugas'].forEach(item => {
    formatMessage += `${item.no}. ${item.field}\n`;
  });

  formatMessage += '\nContoh input:\n';
  formatMessage += "1. Surat dari Dinas Kesehatan Pengendalian Penduduk dan Keluarga Berencana Kabupaten sumenep pada tanggal 27 Agustus 2024 Nomor 400.13/1756/102.06/2024 perihal Pelaksanaan Kegiatan Program Penyuluhan Bangga Kencana\n";
  formatMessage += '2. 123456789\n';
  formatMessage += '3. KTP/SIM/Paspor\n';
  formatMessage += '4. Alex\n';
  formatMessage += '5. Suemenep/01-01-2025\n';
  formatMessage += '\nDst.\n\n';
  formatMessage += 'Masukkan semua data sekaligus sesuai format nomor di atas atau kirim /cancel untuk membatalkan';

  // Tambahkan tombol cancel
  const cancelKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Cancel', callback_data: 'cancel' }]
      ]
    }
  };

  await bot.sendMessage(chatId, formatMessage, cancelKeyboard);
});
bot.onText(/\/undangan/, async (msg) => {
  if (msg.text && (msg.text === '/start' || msg.text === '/daftar')) {
    return;
  }
  const isAuthorized = await checkUserAuthorization(msg, bot);
  if (!isAuthorized) {
    return;
  }
  const chatId = msg.chat.id;
  userStates[chatId] = {
    type: 'Undangan',
    data: {}
  };

  // Tampilkan format input
  let formatMessage = 'Silakan masukkan data undangan dengan format berikut:\n\n';
  suratFormat['Undangan'].forEach(item => {
    formatMessage += `${item.no}. ${item.field}\n`;
  });
  formatMessage += '\nContoh input:\n';
  formatMessage += '1. Penting\n';
  formatMessage += '2. Ketua RT\n';
  formatMessage += '3. -\n';
  formatMessage += 'dst.\n\n';
  formatMessage += 'Masukkan semua data sekaligus sesuai format nomor di atas\n';
  formatMessage += 'Atau kirim /cancel untuk membatalkan';

  // Buat keyboard dengan tombol cancel
  const cancelKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Cancel', callback_data: 'cancel' }]
      ]
    }
  };

  bot.sendMessage(chatId, formatMessage, cancelKeyboard);
});
bot.onText(/\/custom/, async (msg) => {
  if (msg.text && (msg.text === '/start' || msg.text === '/daftar')) {
    return;
  }
  const isAuthorized = await checkUserAuthorization(msg, bot);
  if (!isAuthorized) {
    return;
  }
  const chatId = msg.chat.id;
  userStates[chatId] = {
    type: 'Custom',
    data: {}
  };

  // Tampilkan format input
  let formatMessage = 'Silakan masukkan data custom surat dengan format berikut:\n\n';
  suratFormat['Custom'].forEach(item => {
    formatMessage += `${item.no}. ${item.field}\n`;
  });
  formatMessage += '\nContoh input:\n';
  formatMessage += '1. 122\n';
  formatMessage += '2. Surat Pembentukan Panitia\n';
  formatMessage += '3. Diisi sesuai kebutuhan\n';
  formatMessage += 'dst.\n\n';
  formatMessage += 'Masukkan semua data sekaligus sesuai format nomor di atas\n';
  formatMessage += 'Atau kirim /cancel untuk membatalkan';

  // Buat keyboard dengan tombol cancel
  const cancelKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Cancel', callback_data: 'cancel' }]
      ]
    }
  };

  bot.sendMessage(chatId, formatMessage, cancelKeyboard);
});
const skFormat = [
  { no: 1, field: 'Tentang' },
  { no: 2, field: 'Tanggal' },
  { no: 3, field: 'Tujuan' }
];
// Handle command /sk
bot.onText(/\/sk/, async (msg) => {
  if (msg.text && (msg.text === '/start' || msg.text === '/daftar')) {
    return;
  }
  const isAuthorized = await checkUserAuthorization(msg, bot);
  if (!isAuthorized) {
    return;
  }
  const chatId = msg.chat.id;
  userStates[chatId] = {
    type: 'SK',
    data: {}
  };

  let formatMessage = `Silakan masukkan data dengan format berikut:\n\n`;
  skFormat.forEach(item => {
    formatMessage += `${item.no}. ${item.field}\n`;
  });
  formatMessage += '\nContoh input:\n';
  formatMessage += '1. Pembangunan Jalan\n';
  formatMessage += '2. 5 Januari 2025\n';
  formatMessage += '3. Dinas PUPR\n\n';
  formatMessage += 'Masukkan semua data sesuai format nomor di atas atau kirim /cancel untuk membatalkan';

  const cancelKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Cancel', callback_data: 'cancel' }]
      ]
    }
  };

  await bot.sendMessage(chatId, formatMessage, cancelKeyboard);
});
// Handle command /sheets
bot.onText(/\/sheets/, async (msg) => {
  if (msg.text && (msg.text === '/start' || msg.text === '/daftar')) {
    return;
  }
  const isAuthorized = await checkUserAuthorization(msg, bot);
  if (!isAuthorized) {
    return;
  }
  const chatId = msg.chat.id;
  const sheetsUrl = 'https://docs.google.com/spreadsheets/d/1fwUE2xLM3qvVCQZZjWzJps5lq3vyiXvDTHJoV3ZZvlw/edit?usp=sharing';

  userStates[chatId] = {
    type: null,
    data: {}
  };

  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '⚠️ Anda tidak memiliki akses ke perintah ini.');
    return;
  }
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{
          text: '📊 Buka Google Sheets',
          url: sheetsUrl
        }],
        [{
          text: '❌ Tutup',
          callback_data: 'close_sheets'
        }]
      ]
    }
  };

  bot.sendMessage(
    chatId,
    '📋 *Data Arsip Surat*\n\nKlik tombol di bawah untuk membuka Google Sheets:',
    {
      parse_mode: 'Markdown',
      ...keyboard
    }
  );
});
bot.onText(/\/daftar/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const isRegistered = await isUserRegistered(userId);
  const isPending = await isUserPending(userId);

  if (isRegistered) {
    await bot.sendMessage(chatId, '✅ Anda sudah terdaftar sebagai pengguna bot.');
    return;
  }

  if (isPending) {
    await bot.sendMessage(chatId, '⏳ Pendaftaran Anda sedang menunggu persetujuan admin.');
    return;
  }

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Daftar Sekarang', callback_data: 'register' }]
      ]
    }
  };

  await bot.sendMessage(
    chatId,
    '👋 Selamat datang! Silakan klik tombol di bawah untuk mendaftar:',
    keyboard
  );
});
bot.onText(/\/pending/, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  try {
    if (!isAdmin(userId)) {
      await bot.sendMessage(chatId, '⚠️ Anda tidak memiliki akses ke perintah ini.');
      return;
    }

    const pendingUsers = await getPendingUsers();

    if (pendingUsers.length === 0) {
      await bot.sendMessage(chatId, '📋 Tidak ada pendaftaran yang menunggu persetujuan.');
      return;
    }

    for (const user of pendingUsers) {
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Setujui', callback_data: `approve_${user.userId}` },
              { text: '❌ Tolak', callback_data: `reject_${user.userId}` }
            ]
          ]
        }
      };

      const message = `📋 *Pendaftaran Tertunda*\n\n` +
        `Nama: ${user.firstName} ${user.lastName || ''}\n` +
        `Username: @${user.username || '-'}\n` +
        `User ID: ${user.userId}\n` +
        `Tanggal Daftar: ${new Date(user.requestedAt).toLocaleString('id-ID')}`;

      await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    }
  } catch (error) {
    console.error('Error fetching pending users:', error);
    await bot.sendMessage(
      chatId,
      '❌ Terjadi kesalahan saat mengambil data pending users.'
    );
  }
});
bot.onText(/\/rejected/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    if (!isAdmin(userId)) {
      await bot.sendMessage(chatId, '⚠️ Anda tidak memiliki akses ke perintah ini.');
      return;
    }
    const result = await getRejectedUsers();
    if (!result.success) {
      await bot.sendMessage(chatId, `❌ Error: ${result.error}`);
      return;
    }
    const rejectedUsers = result.rejectedUsers;
    if (rejectedUsers.length === 0) {
      await bot.sendMessage(chatId, '📋 Tidak ada data user yang ditolak.');
      return;
    }
    for (const user of rejectedUsers) {
      const message = `📋 *Data User Ditolak*\n\n` +
        `ID: \`${user.userId}\`\n` +
        `Nama: ${user.firstName} ${user.lastName || ''}\n` +
        `Username: ${user.username ? '@' + user.username : '-'}\n` +
        `Tanggal Ditolak: ${new Date(user.rejectedAt).toLocaleString('id-ID')}\n` +
        `Status: ${user.status}`;
      await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Setujui', callback_data: `approve_rejected_${user.userId}` }
            ]
          ]
        }
      });
    }
  } catch (error) {
    console.error('Error in /rejected command:', error);
    await bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data.');
  }
});
bot.onText(/\/edit/, async (msg, match) => {
  const chatId = msg.chat.id;

  userStates[chatId] = {
    type: 'wait_letter_number',
    data: {}
  };

  await bot.sendMessage(
    chatId,
    'Masukkan nomor surat yang akan diedit (Contoh: 510/026/311.110/2025):',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancel', callback_data: 'cancel_edit' }]
        ]
      }
    }
  );
});
bot.onText(/\/template/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isAdmin(userId)) {
    await bot.sendMessage(chatId, '⚠️ Anda tidak memiliki akses ke perintah ini.');
    return;
  }
  const templates = {
    'Keterangan Usaha': `https://docs.google.com/document/d/${process.env.KETERANGAN_USAHA}/edit?tab=t.0`,
    'SKCK': `https://docs.google.com/document/d/${process.env.SKCK}/edit?tab=t.0`,
    'Rekom BBM Solar': `https://docs.google.com/document/d/${process.env.REKOM_BBM_SOLAR}/edit?tab=t.0`,
    'Rekom BBM Pertalite': `https://docs.google.com/document/d/${process.env.REKOM_BBM_PERTALITE}/edit?tab=t.0`,
    'Keterangan Kematian': `https://docs.google.com/document/d/${process.env.KETERANGAN_KEMATIAN}/edit?tab=t.0`,
    'Keterangan Domisili': `https://docs.google.com/document/d/${process.env.KETERANGAN_DOMISILI}/edit?tab=t.0`,
    'Keterangan Domisili Organisasi': `https://docs.google.com/document/d/${process.env.KETERANGAN_DOMISILI_ORGANISASI}/edit?tab=t.0`,
    'Keterangan Tidak Mampu Umum': `https://docs.google.com/document/d/${process.env.KETERANGAN_TIDAK_MAMPU_UMUM}/edit?tab=t.0`,
    'Keterangan Tidak Mampu Dengan Penghasilan Orang Tua': `https://docs.google.com/document/d/${process.env.KETERANGAN_TIDAK_MAMPU_DENGAN_PENGHASILAN_ORANG_TUA}/edit?tab=t.0`,
    'Keterangan Satu Nama Umum': `https://docs.google.com/document/d/${process.env.KETERANGAN_SATU_NAMA_UMUM}/edit?tab=t.0`,
    'Keterangan Satu Nama Khusus': `https://docs.google.com/document/d/${process.env.KETERANGAN_SATU_NAMA_KHUSUS}/edit?tab=t.0`,
    'Keterangan Asal Usul': `https://docs.google.com/document/d/${process.env.KETERANGAN_ASAL_USUL}/edit?tab=t.0`,
    'Keterangan Pindah Domisili': `https://docs.google.com/document/d/${process.env.KETERANGAN_PINDAH_DOMISILI}/edit?tab=t.0`,
    'Keterangan Kuasa': `https://docs.google.com/document/d/${process.env.KETERANGAN_KUASA}/edit?tab=t.0`,
    'Pemberitahuan': `https://docs.google.com/document/d/${process.env.PEMBERITAHUAN}/edit?tab=t.0`,
    'Undangan': `https://docs.google.com/document/d/${process.env.UNDANGAN}/edit?tab=t.0`,
    'Surat Perintah Tugas': `https://docs.google.com/document/d/${process.env.SURAT_PERINTAH_TUGAS}/edit?tab=t.0`
  };

  const templateArray = Object.entries(templates);
  const inlineKeyboard = [];

  for (let i = 0; i < templateArray.length; i += 2) {
    const row = [];

    row.push({
      text: templateArray[i][0],
      url: templateArray[i][1]
    });

    if (i + 1 < templateArray.length) {
      row.push({
        text: templateArray[i + 1][0],
        url: templateArray[i + 1][1]
      });
    }

    inlineKeyboard.push(row);
  }

  inlineKeyboard.push([{ text: '❌ Tutup', callback_data: 'close_template' }]);

  await bot.sendMessage(chatId,
    '*📋 Template Dokumen*\n\nSilakan pilih template yang ingin dilihat:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    }
  );
});
bot.onText(/\/users/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    if (!isAdmin(userId)) {
      await bot.sendMessage(chatId, '⚠️ Anda tidak memiliki akses ke perintah ini.');
      return;
    }

    const result = await getRegisteredUsers();
    if (!result.success) {
      throw new Error(result.error);
    }

    if (result.users.length === 0) {
      await bot.sendMessage(chatId, '📋 Tidak ada user yang terdaftar.');
      return;
    }

    let message = '*Daftar User Terdaftar*\n\n';
    for (const user of result.users) {
      message = `👤 *${user.firstName} ${user.lastName || ''}*\n`;
      message += `Username: ${user.username ? '@' + user.username : '-'}\n`;
      message += `ID: \`${user.userId}\`\n`;
      message += `Terdaftar: ${new Date(user.approvedAt).toLocaleString('id-ID')}`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '❌ Keluarkan', callback_data: `remove_${user.userId}` }]
        ]
      };

      await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    }

  } catch (error) {
    console.error('Error in /users command:', error);
    await bot.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil data user.');
  }
});
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  handleCancel(chatId);
});
function handleCancel(chatId) {
  if (userStates[chatId]) {
    delete userStates[chatId];
    bot.sendMessage(chatId, 'Proses pembuatan surat telah dibatalkan. Gunakan /suratkeluar untuk memulai kembali.');
  }
}
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // Handle upload category selection
  if (data.startsWith('upload_') && userStates[chatId]?.type === 'upload') {
    const categories = {
      'upload_surat_keluar': 'Surat Keluar',
      'upload_surat_masuk': 'Surat Masuk',
      'upload_surat_custom': 'Surat Custom',
      'upload_adm_desa_umum': 'Administrasi Desa Umum',
      'upload_adm_desa_khusus': 'Administrasi Desa Khusus'
    };

    const folderNames = {
      'upload_surat_keluar': 'SuratKeluar',
      'upload_surat_masuk': 'SuratMasuk',
      'upload_surat_custom': 'SuratCustom',
      'upload_adm_desa_umum': 'AdministrasiDesaUmum',
      'upload_adm_desa_khusus': 'AdministrasiDesaKhusus'
    };

    const categoryName = categories[data];
    const folderName = folderNames[data];

    userStates[chatId].category = categoryName;
    userStates[chatId].folderName = folderName;
    userStates[chatId].uploadStatus = 'waiting_file';

    await bot.editMessageText(
      `📤 *Upload Dokumen: ${categoryName}*\n\n` +
      `Silakan kirim dokumen yang ingin diupload. Dokumen yang diterima:\n` +
      `- Foto (JPG, PNG)\n` +
      `- Dokumen (DOC, DOCX)\n` +
      `- PDF\n\n` +
      `Dokumen akan disimpan ke folder Google Drive: *${folderName}*`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancel', callback_data: 'cancel_upload' }]
          ]
        }
      }
    );

    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'cancel_upload') {
    if (userStates[chatId]?.type === 'upload') {
      delete userStates[chatId];
      await bot.editMessageText(
        '❌ Proses upload dibatalkan.',
        {
          chat_id: chatId,
          message_id: query.message.message_id
        }
      );
    }
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (query.data.startsWith('remove_')) {
    const userId = data.split('_')[1];

    if (!isAdmin(query.from.id)) {
      await bot.answerCallbackQuery(query.id, {
        text: '⚠️ Anda tidak memiliki akses untuk melakukan ini',
        show_alert: true
      });
      return;
    }

    try {
      const userData = await getUsersData();
      const userIndex = userData.users.findIndex(u => u.userId.toString() === userId);

      if (userIndex > -1) {
        const removedUser = userData.users.splice(userIndex, 1)[0];
        await saveUsersData(userData);

        await bot.editMessageText(
          `✅ User ${removedUser.firstName} telah dikeluarkan dari daftar terdaftar`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
          }
        );

        // Kirim pesan ke user yang dikeluarkan
        try {
          await bot.sendMessage(
            userId,
            '❌ Akses Anda telah dicabut oleh admin. Hubungi admin untuk informasi lebih lanjut.'
          );
        } catch (notifyError) {
          console.error('Failed to notify removed user:', notifyError);
        }
      }

      await bot.answerCallbackQuery(query.id);

    } catch (error) {
      console.error('Error removing user:', error);
      await bot.answerCallbackQuery(query.id, {
        text: '❌ Gagal mengeluarkan user',
        show_alert: true
      });
    }
    return;
  }
  if (query.data.startsWith('approve_rejected_')) {
    // Cek apakah user adalah admin
    if (!isAdmin(query.from.id)) {
      await bot.answerCallbackQuery(query.id, {
        text: '⚠️ Anda tidak memiliki akses untuk melakukan ini.',
        show_alert: true
      });
      return;
    }

    const userId = data.split('_')[2];
    console.log('Approving rejected user:', userId); // Logging untuk debug

    const userData = await getUsersData();

    // Cari user di rejectedUsers
    const rejectedUserIndex = userData.rejectedUsers.findIndex(
      user => user.userId.toString() === userId
    );

    if (rejectedUserIndex === -1) {
      await bot.answerCallbackQuery(query.id, {
        text: '❌ User tidak ditemukan',
        show_alert: true
      });
      return;
    }

    // Pindahkan user dari rejected ke approved
    const approvedUser = {
      ...userData.rejectedUsers[rejectedUserIndex],
      approvedAt: new Date().toISOString(),
      status: 'approved'
    };

    // Hapus dari rejected dan tambahkan ke users
    userData.users?.push(approvedUser);
    userData.rejectedUsers.splice(rejectedUserIndex, 1);
    await saveUsersData(userData);

    // Update pesan
    await bot.editMessageText(
      `✅ *User Disetujui*\n\n` +
      `Nama: ${approvedUser.firstName} ${approvedUser.lastName || ''}\n` +
      `Username: ${approvedUser.username ? '@' + approvedUser.username : '-'}\n` +
      `Status: Disetujui`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      }
    );

    // Notifikasi ke user
    try {
      await bot.sendMessage(
        userId,
        '🎉 *Selamat! Pendaftaran Anda telah disetujui*\n\nAnda sekarang dapat menggunakan bot ini.',
        { parse_mode: 'Markdown' }
      );
    } catch (notifyError) {
      console.error('Error notifying user:', notifyError);
    }

    await bot.answerCallbackQuery(query.id, {
      text: '✅ User berhasil disetujui',
      show_alert: true
    });
    return;
  }
  if (query.data === 'register') {
    const userInfo = {
      userId: query.from.id,
      firstName: query.from.first_name,
      lastName: query.from.last_name,
      username: query.from.username
    };

    const success = await addPendingUser(userInfo);
    if (success) {
      // Notify user
      await bot.sendMessage(
        chatId,
        '📝 *Pendaftaran Berhasil Dikirim*\n\nData pendaftaran Anda telah dikirim ke admin untuk diverifikasi. Mohon tunggu persetujuan dari admin.',
        { parse_mode: 'Markdown' }
      );

      // Notify admin
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Setujui', callback_data: `approve_${userInfo.userId}` },
              { text: '❌ Tolak', callback_data: `reject_${userInfo.userId}` }
            ]
          ]
        }
      };

      const adminMessage = `📋 *Pendaftaran Baru*\n\n` +
        `Nama: ${userInfo.firstName} ${userInfo.lastName || ''}\n` +
        `Username: @${userInfo.username || '-'}\n` +
        `User ID: ${userInfo.userId}`;

      await bot.sendMessage(ADMIN_ID, adminMessage, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    }

    await bot.answerCallbackQuery(query.id);
    return;
  }
  if (query.data === 'start_registration') {
    await handleRegistration(query.message, bot);
    await bot.answerCallbackQuery(query.id);
    return;
  }
  if (query.data.startsWith('approve_') || query.data.startsWith('reject_')) {
    // Check if user is admin
    if (!isAdmin(query.from.id)) {
      await bot.answerCallbackQuery(query.id, {
        text: '⚠️ Anda tidak memiliki akses untuk melakukan ini.',
        show_alert: true
      });
      return;
    }

    const userId = parseInt(query.data.split('_')[1]);
    if (query.data.startsWith('approve_')) {
      const approvedUser = await approveUser(userId);
      if (approvedUser) {
        // Notify admin
        await bot.editMessageText(
          `✅ *Pendaftaran Disetujui*\n\nNama: ${approvedUser.firstName}\nUsername: @${approvedUser.username || '-'}`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
          }
        );

        // Notify user
        await bot.sendMessage(
          userId,
          '🎉 *Selamat! Pendaftaran Anda Disetujui*\n\nAnda sekarang dapat menggunakan bot ini. Silakan gunakan perintah yang tersedia.',
          { parse_mode: 'Markdown' }
        );
      }
    } else if (query.data.startsWith('reject_')) {
      const rejected = await rejectUser(userId);
      if (rejected) {
        // Notify admin
        await bot.editMessageText(
          '❌ Pendaftaran ditolak.',
          {
            chat_id: ADMIN_ID,
            message_id: query.message.message_id
          }
        );

        // Notify user
        const userAdmin = await getUserById(ADMIN_ID, bot);
        await bot.sendMessage(
          userId,
          `❌ Maaf, pendaftaran Anda ditolak oleh admin. Silakan hubungi admin untuk informasi lebih lanjut.\n\nNama: ${userAdmin.user.firstName}\nUsername: @${userAdmin.user.username || '-'}`,
          { parse_mode: 'Markdown' }
        );
      }
    }

    await bot.answerCallbackQuery(query.id);
    return;
  }
  if (query.data.startsWith('cancel')) {
    handleCancel(chatId);
    return;
  }
  if (query.data === 'close_sheets') {
    bot.deleteMessage(query.message.chat.id, query.message.message_id);
    if (userStates[query.message.chat.id]) {
      delete userStates[query.message.chat.id];
    }
  }
  if (suratFormat[data]) {
    userStates[chatId] = {
      type: data,
      data: {}
    };

    let formatMessage = `Silakan masukkan data ${data} dengan format berikut:\n\n`;
    suratFormat[data].forEach(item => {
      formatMessage += `${item.no}. ${item.field}\n`;
    });
    formatMessage += '\nContoh input:\n';
    formatMessage += '1. 1234567890\n';
    formatMessage += '2. Alex\n';
    formatMessage += '3. Jakarta, 01-01-1990\n';
    formatMessage += 'dst.\n\n';
    formatMessage += 'Masukkan semua data sekaligus sesuai format nomor di atas\n';
    formatMessage += 'Atau kirim /cancel untuk membatalkan proses';

    const cancelKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancel', callback_data: 'cancel' }]
        ]
      }
    };

    await bot.sendMessage(chatId, formatMessage, cancelKeyboard);
  }
  if (query.data === 'cancel_edit') {
    delete userStates[chatId];
    await bot.sendMessage(chatId, '❌ Proses edit dibatalkan.');
    await bot.answerCallbackQuery(query.id);
    return;
  }
  if (query.data === 'close_template') {
    await bot.deleteMessage(query.message.chat.id, query.message.message_id);
  }
});

// Handle input text dari user
bot.on('message', async (msg) => {
  if (msg.text && (msg.text === '/start' || msg.text === '/daftar')) {
    return;
  }
  const chatId = msg.chat.id;
  const userState = userStates[chatId];
  if (userState && validateLetterType(userState.type) && !msg.text.startsWith('/')) {
    const lines = msg.text.split('\n');
    const data = {};
    const errors = [];

    lines.forEach(line => {
      const match = line.match(/^(\d+)\.\s*(.+)$/);
      if (match) {
        const no = parseInt(match[1]);
        const value = match[2].trim();

        const fieldObj = suratFormat[userState.type].find(f => f.no === no);
        if (fieldObj) {
          data[fieldObj.field] = value;
        } else {
          errors.push(`Nomor ${no} tidak valid`);
        }
      } else {
        errors.push(`Format baris "${line}" tidak valid`);
      }
    });
    const missingFields = suratFormat[userState.type].filter(field =>
      !data[field.field]
    );

    const cancelKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancel', callback_data: 'cancel' }]
        ]
      }
    };

    if (errors.length > 0) {
      bot.sendMessage(chatId,
        'Terdapat kesalahan dalam input:\n' +
        errors.join('\n') +
        '\n\nSilakan input ulang sesuai format atau kirim /cancel untuk membatalkan.',
        cancelKeyboard
      );
    } else if (missingFields.length > 0) {
      bot.sendMessage(chatId,
        'Data belum lengkap. Field yang belum diisi:\n' +
        missingFields.map(f => `${f.no}. ${f.field}`).join('\n') +
        '\n\nSilakan input ulang dengan data lengkap atau kirim /cancel untuk membatalkan.',
        cancelKeyboard
      );
    } else {
      userState.data = data;
      processCompletedForm(chatId, userState, msg);
    }
  }
  if (userState && userState.type === 'Custom' && !msg.text.startsWith('/')) {
    const lines = msg.text.split('\n');
    const data = {};

    const errors = [];

    lines.forEach(line => {
      const match = line.match(/^(\d+)\.\s*(.+)$/);
      if (match) {
        const no = parseInt(match[1]);
        const value = match[2].trim();

        const fieldObj = suratFormat[userState.type].find(f => f.no === no);
        if (fieldObj) {
          data[fieldObj.field] = value;
        } else {
          errors.push(`Nomor ${no} tidak valid`);
        }
      } else {
        errors.push(`Format baris "${line}" tidak valid`);
      }
    });
    const missingFields = suratFormat[userState.type].filter(field =>
      !data[field.field]
    );

    const cancelKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancel', callback_data: 'cancel' }]
        ]
      }
    };

    if (errors.length > 0) {
      bot.sendMessage(chatId,
        'Terdapat kesalahan dalam input:\n' +
        errors.join('\n') +
        '\n\nSilakan input ulang sesuai format atau kirim /cancel untuk membatalkan.',
        cancelKeyboard
      );
    } else if (missingFields.length > 0) {
      bot.sendMessage(chatId,
        'Data belum lengkap. Field yang belum diisi:\n' +
        missingFields.map(f => `${f.no}. ${f.field}`).join('\n') +
        '\n\nSilakan input ulang dengan data lengkap atau kirim /cancel untuk membatalkan.',
        cancelKeyboard
      );
    } else {
      userState.data = data;
      processCompletedForm(chatId, userState, msg);
    }
  }
  if (userState && userState.type === 'Undangan' && msg.text && !msg.text.startsWith('/')) {
    const lines = msg.text.split('\n');
    const data = {};
    const errors = [];
    lines.forEach(line => {
      const match = line.match(/^(\d+)\.\s*(.+)$/);
      if (match) {
        const no = parseInt(match[1]);
        const value = match[2].trim();
        const fieldObj = suratFormat['Undangan'].find(f => f.no === no);
        if (fieldObj) {
          data[fieldObj.field] = value;
        } else {
          errors.push(`Nomor ${no} tidak valid`);
        }
      } else {
        errors.push(`Format baris "${line}" tidak valid`);
      }
    });
    const missingFields = suratFormat['Undangan'].filter(field =>
      !data[field.field]
    );
    const cancelKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancel', callback_data: 'cancel' }]
        ]
      }
    };

    if (errors.length > 0) {
      bot.sendMessage(chatId,
        'Terdapat kesalahan dalam input:\n' +
        errors.join('\n') +
        '\n\nSilakan input ulang sesuai format atau kirim /cancel untuk membatalkan.',
        cancelKeyboard
      );
    } else if (missingFields.length > 0) {
      bot.sendMessage(chatId,
        'Data belum lengkap. Field yang belum diisi:\n' +
        missingFields.map(f => `${f.no}. ${f.field}`).join('\n') +
        '\n\nSilakan input ulang dengan data lengkap atau kirim /cancel untuk membatalkan.',
        cancelKeyboard
      );
    } else {
      try {
        const result = await saveUndanganToSpreadsheet(data, msg);

        if (result.success) {
          let message = `✅ Data surat ${userState.type} telah berhasil disimpan.\n\n`;
          message += `📃 Nomor Surat: ${result.letterNumber}\n\n`;
          message += `Sedang memproses dokumen...`;
          await bot.sendMessage(chatId, message);
          const documentData = {
            ...data,
            NomorSurat: result.letterNumber,
            TanggalSurat: new Date().toLocaleDateString('id-ID', {
              dateStyle: 'long'
            })
          };
          const docResult = await generateDocument(userState.type, documentData);
          if (docResult.success) {
            await bot.sendDocument(chatId, docResult.filePath, {
              caption: `Dokumen ${userState.type} - ${result.letterNumber}`
            });
            cleanupTempFile(docResult.filePath);
          } else {
            await bot.sendMessage(
              chatId,
              '❌ Berhasil menyimpan data tetapi gagal generate dokumen. Error: ' + docResult.error
            );
          }
        } else {
          bot.sendMessage(chatId, 'Maaf, terjadi kesalahan saat menyimpan data. Silakan coba lagi.');
        }
      } catch (error) {
        console.error('Error saat memproses undangan:', error);
        bot.sendMessage(chatId, 'Terjadi kesalahan sistem. Silakan coba lagi nanti.');
      }
      delete userStates[chatId];
    }
  }
  if (userState && userState.type === 'Surat Masuk' && msg.text && !msg.text.startsWith('/')) {
    const lines = msg.text.split('\n');
    const data = {};
    const errors = [];

    lines.forEach(line => {
      const match = line.match(/^(\d+)\.\s*(.+)$/);
      if (match) {
        const no = parseInt(match[1]);
        const value = match[2].trim();

        const fieldObj = suratMasukFormat.find(f => f.no === no);
        if (fieldObj) {
          data[fieldObj.field] = value;
        } else {
          errors.push(`Nomor ${no} tidak valid`);
        }
      } else {
        errors.push(`Format baris "${line}" tidak valid`);
      }
    });

    const missingFields = suratMasukFormat.filter(field =>
      !data[field.field]
    );

    const cancelKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancel', callback_data: 'cancel' }]
        ]
      }
    };

    if (errors.length > 0) {
      bot.sendMessage(chatId,
        'Terdapat kesalahan dalam input:\n' +
        errors.join('\n') +
        '\n\nSilakan input ulang sesuai format atau kirim /cancel untuk membatalkan.',
        cancelKeyboard
      );
    } else if (missingFields.length > 0) {
      bot.sendMessage(chatId,
        'Data belum lengkap. Field yang belum diisi:\n' +
        missingFields.map(f => `${f.no}. ${f.field}`).join('\n') +
        '\n\nSilakan input ulang dengan data lengkap atau kirim /cancel untuk membatalkan.',
        cancelKeyboard
      );
    } else {
      try {
        const result = await saveSuratMasukToSpreadsheet(data, 'Surat Masuk', msg);

        if (result.success) {
          let message = `✅ Data surat masuk berhasil disimpan\n\n`;
          message += `📃 Nomor Registrasi: ${result.letterNumber}\n\n`;
          message += `Detail Surat:\n`;
          for (const [field, value] of Object.entries(data)) {
            message += `${field}: ${value}\n`;
          }

          bot.sendMessage(chatId, message);
        } else {
          bot.sendMessage(chatId, '❌ Gagal menyimpan data. Silakan coba lagi.');
        }
      } catch (error) {
        console.error('Error saat menyimpan surat masuk:', error);
        bot.sendMessage(chatId, '❌ Terjadi kesalahan sistem. Silakan coba lagi nanti.');
      }
      delete userStates[chatId];
    }
  }
  if (userState && userState.type === 'SK' && msg.text && !msg.text.startsWith('/')) {
    const lines = msg.text.split('\n');
    const data = {};
    const errors = [];

    lines.forEach(line => {
      const match = line.match(/^(\d+)\.\s*(.+)$/);
      if (match) {
        const no = parseInt(match[1]);
        const value = match[2].trim();

        const fieldObj = skFormat.find(f => f.no === no);
        if (fieldObj) {
          data[fieldObj.field] = value;
        } else {
          errors.push(`Nomor ${no} tidak valid`);
        }
      } else {
        errors.push(`Format baris "${line}" tidak valid`);
      }
    });

    const missingFields = skFormat.filter(field =>
      !data[field.field]
    );

    const cancelKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancel', callback_data: 'cancel' }]
        ]
      }
    };

    if (errors.length > 0) {
      bot.sendMessage(chatId,
        'Terdapat kesalahan dalam input:\n' +
        errors.join('\n') +
        '\n\nSilakan input ulang sesuai format atau kirim /cancel untuk membatalkan.',
        cancelKeyboard
      );
    } else if (missingFields.length > 0) {
      bot.sendMessage(chatId,
        'Data belum lengkap. Field yang belum diisi:\n' +
        missingFields.map(f => `${f.no}. ${f.field}`).join('\n') +
        '\n\nSilakan input ulang dengan data lengkap atau kirim /cancel untuk membatalkan.',
        cancelKeyboard
      );
    } else {
      userState.data = data
      try {
        const sheetName = 'SK';
        const result = await saveSKToSpreadsheet(userState.data, sheetName, msg);
        if (result.success) {
          let message = `Data SK telah berhasil disimpan.\n\n`;
          message += `Nomor Surat: ${result.letterNumber}\n\n`;
          for (const [field, value] of Object.entries(userState.data)) {
            if (field !== 'Nomor Surat') {
              message += `${field}: ${value}\n`;
            }
          }
          bot.sendMessage(chatId, message);
        } else {
          bot.sendMessage(chatId, 'Maaf, terjadi kesalahan saat menyimpan data. Silakan coba lagi.');
        }
        delete userStates[chatId];
      } catch (error) {
        console.error('Error di processSKForm:', error);
        bot.sendMessage(chatId, 'Terjadi kesalahan sistem. Silakan coba lagi nanti.');
        delete userStates[chatId];
      }
    }
  }
  if (userState && userState.type === 'Surat Perintah Tugas' && msg.text && !msg.text.startsWith('/')) {
    const lines = msg.text.split('\n');
    const data = {};
    const errors = [];

    lines.forEach(line => {
      const match = line.match(/^(\d+)\.\s*(.+)$/);
      if (match) {
        const no = parseInt(match[1]);
        const value = match[2].trim();

        const fieldObj = suratFormat['Surat Perintah Tugas'].find(f => f.no === no);
        if (fieldObj) {
          data[fieldObj.field] = value;
        } else {
          errors.push(`Nomor ${no} tidak valid`);
        }
      } else {
        errors.push(`Format baris "${line}" tidak valid`);
      }
    });

    const missingFields = suratFormat['Surat Perintah Tugas'].filter(field =>
      !data[field.field]
    );

    const cancelKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancel', callback_data: 'cancel' }]
        ]
      }
    };

    if (errors.length > 0) {
      bot.sendMessage(chatId,
        'Terdapat kesalahan dalam input:\n' +
        errors.join('\n') +
        '\n\nSilakan input ulang sesuai format atau kirim /cancel untuk membatalkan.',
        cancelKeyboard
      );
    } else if (missingFields.length > 0) {
      bot.sendMessage(chatId,
        'Data belum lengkap. Field yang belum diisi:\n' +
        missingFields.map(f => `${f.no}. ${f.field}`).join('\n') +
        '\n\nSilakan input ulang dengan data lengkap atau kirim /cancel untuk membatalkan.',
        cancelKeyboard
      );
    } else {
      userState.data = data
      processCompletedForm(chatId, userState, msg);
    }
  }
  if (userState && userState.type === 'wait_letter_number' && !msg.text.startsWith('/')) {
    try {
      const letterNumber = msg.text.trim();

      // Cari data surat
      const letterData = await findLetterData(letterNumber);

      if (!letterData) {
        await bot.sendMessage(chatId, '❌ Nomor surat tidak ditemukan.');
        delete userStates[chatId];
        return;
      }

      // Update state untuk proses edit
      userStates[chatId] = {
        type: 'edit',
        letterNumber: letterNumber,
        letterType: letterData.type,
        originalData: letterData
      };

      // Tampilkan format input
      let formatMessage = `📝 *Edit Surat*\nNomor: ${letterNumber}\nJenis: ${letterData.type}\n\n`;
      formatMessage += 'Silakan masukkan data baru dengan format berikut:\n\n';

      if (suratFormat[letterData.type]) {
        suratFormat[letterData.type].forEach(item => {
          formatMessage += `${item.no}. ${item.field}\n`;
        });
        formatMessage += '\nMasukkan data baru sesuai format di atas.';
      }

      await bot.sendMessage(chatId, formatMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancel', callback_data: 'cancel_edit' }]
          ]
        }
      });

    } catch (error) {
      console.error('Error processing letter number:', error);
      await bot.sendMessage(chatId, '❌ Terjadi kesalahan saat memproses nomor surat.');
      delete userStates[chatId];
    }
  }
  if (userState && userState.type === 'edit' && !msg.text.startsWith('/')) {
    try {
      const lines = msg.text.split('\n');
      const data = {};
      const errors = [];

      // Validasi format input
      lines.forEach(line => {
        const match = line.match(/^(\d+)\.\s*(.+)$/);
        if (match) {
          const no = parseInt(match[1]);
          const value = match[2].trim();

          const fieldObj = suratFormat[userState.letterType].find(f => f.no === no);
          if (fieldObj) {
            data[fieldObj.field] = value;
          } else {
            errors.push(`Nomor ${no} tidak valid`);
          }
        } else {
          errors.push(`Format baris "${line}" tidak valid`);
        }
      });
      const cancelKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancel', callback_data: 'cancel' }]
          ]
        }
      };
      let format = '';
      if (userState.letterType !== 'SK') {
        format = suratFormat[userState.letterType]
      } else {
        format = skFormat
      }
      const missingFields = format.filter(field =>
        !data[field.field]
      );
      if (errors.length > 0) {
        bot.sendMessage(chatId,
          'Terdapat kesalahan dalam input:\n' +
          errors.join('\n') +
          '\n\nSilakan input ulang sesuai format atau kirim /cancel untuk membatalkan.',
          cancelKeyboard
        );
      } else if (missingFields.length > 0) {
        bot.sendMessage(chatId,
          'Data belum lengkap. Field yang belum diisi:\n' +
          missingFields.map(f => `${f.no}. ${f.field}`).join('\n') +
          '\n\nSilakan input ulang dengan data lengkap atau kirim /cancel untuk membatalkan.',
          cancelKeyboard
        );
      } else {
        try {
          // Update data di Google Sheets
          await updateLetterData(userState, data, bot, chatId);
        } catch (error) {
          console.error('Error saat memproses undangan:', error);
          bot.sendMessage(chatId, 'Terjadi kesalahan sistem. Silakan coba lagi nanti.');
        }
        delete userStates[chatId];
      }

    } catch (error) {
      console.error('Error updating letter:', error);
      await bot.sendMessage(chatId, '❌ Terjadi kesalahan saat memperbarui data.');
      delete userStates[chatId];
    }
  }
});
// Fungsi untuk surat keluar
async function processCompletedForm(chatId, userState, userData) {
  try {
    const sheetName = userState.type;
    const result = userState.type === 'Custom' ? await saveCustomToSpreadsheet(userState, sheetName, userData) : await saveSuratKeluarToSpreadsheet(userState, sheetName, userData);

    if (result.success) {
      if (userState.type === 'Custom') {
        let message = `✅ Data surat ${userState.type} telah berhasil disimpan.\n\n`;
        message += `📃 Nomor Surat: ${result.letterNumber}\n\n`;
        await bot.sendMessage(chatId, message);
      }

      if (userState.type !== 'Custom') {
        let message = `✅ Data surat ${userState.type} telah berhasil disimpan.\n\n`;
        message += `📃 Nomor Surat: ${result.letterNumber}\n\n`;
        message += `Sedang memproses dokumen...`;

        await bot.sendMessage(chatId, message);
        const documentData = {
          ...userState.data,
          NomorSurat: result.letterNumber,
          TanggalSurat: new Date().toLocaleDateString('id-ID', {
            dateStyle: 'long'
          })
        };
        const docResult = await generateDocument(userState.type, documentData);
        if (docResult.success) {
          await bot.sendDocument(chatId, docResult.filePath, {
            caption: `Dokumen ${userState.type} - ${result.letterNumber}`
          });
          cleanupTempFile(docResult.filePath);
        } else {
          await bot.sendMessage(
            chatId,
            '❌ Berhasil menyimpan data tetapi gagal generate dokumen. Error: ' + docResult.error
          );
        }
      }
    } else {
      bot.sendMessage(chatId, 'Maaf, terjadi kesalahan saat menyimpan data. Silakan coba lagi.');
    }
    delete userStates[chatId];
  } catch (error) {
    console.error('Error di processCompletedForm:', error);
    bot.sendMessage(chatId, 'Terjadi kesalahan sistem. Silakan coba lagi nanti.');
    delete userStates[chatId];
  }
}

// monitoring
const io = require('@pm2/io')

const realtimeUser = io.metric({
  name: 'Realtime user',
})
realtimeUser.set(42)
io.init({
  transactions: true, // will enable the transaction tracing
  http: true // will enable metrics about the http server (optional)
})
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server berjalan di port ${port}`);
});

// Handle file uploads (documents, photos) for the upload command
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userState = userStates[chatId];

  if (userState?.type === 'upload' && userState.uploadStatus === 'waiting_file') {
    const waitMessage = await bot.sendMessage(chatId, '⏳ Sedang mengupload foto...');

    try {
      // Get the photo (highest quality)
      const photoId = msg.photo[msg.photo.length - 1].file_id;
      const fileInfo = await bot.getFile(photoId);
      const fileUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;

      // Upload to Google Drive using the folder specified in user state
      const fileName = `photo_${Date.now()}.jpg`;
      const uploadResult = await uploadToGoogleDrive(fileUrl, fileName, userState.folderName, 'photo');

      if (uploadResult.success) {
        await bot.editMessageText(
          `✅ Foto berhasil diupload ke Google Drive!\n\n` +
          `📁 Folder: ${userState.category}\n`,
          {
            chat_id: chatId,
            message_id: waitMessage.message_id,
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Upload File Lainnya', callback_data: userState.category.toLowerCase().replace(/\s+/g, '_') }],
                [{ text: '❌ Selesai', callback_data: 'cancel_upload' }]
              ]
            }
          }
        );
      } else {
        throw new Error('Failed to upload to Google Drive');
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
      await bot.editMessageText(
        '❌ Gagal mengupload foto. Silakan coba lagi.',
        {
          chat_id: chatId,
          message_id: waitMessage.message_id
        }
      );
    }
  }
});

bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const userState = userStates[chatId];

  if (userState?.type === 'upload' && userState.uploadStatus === 'waiting_file') {
    const document = msg.document;
    const mimeType = document.mime_type;
    const fileName = document.file_name;

    // Check if the document is of allowed type (PDF or DOC/DOCX)
    const allowedMimeTypes = [
      'application/pdf',                                                  // PDF
      'application/msword',                                               // DOC
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // DOCX
    ];

    if (!allowedMimeTypes.includes(mimeType)) {
      await bot.sendMessage(
        chatId,
        '⚠️ Format file tidak didukung. Hanya file PDF, DOC dan DOCX yang diperbolehkan.'
      );
      return;
    }

    const waitMessage = await bot.sendMessage(chatId, '⏳ Sedang mengupload dokumen...');

    try {
      const fileInfo = await bot.getFile(document.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;

      // Determine file type
      let fileType = 'document';
      if (mimeType === 'application/pdf') {
        fileType = 'pdf';
      }

      // Upload to Google Drive
      const uploadResult = await uploadToGoogleDrive(fileUrl, fileName, userState.folderName, fileType);

      if (uploadResult.success) {
        await bot.editMessageText(
          `✅ Dokumen berhasil diupload ke Google Drive!\n\n` +
          `📁 Folder: ${userState.category}\n` +
          `📄 Nama file: ${fileName}\n` +
          `🔗 Link: ${uploadResult.fileUrl}`,
          {
            chat_id: chatId,
            message_id: waitMessage.message_id,
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Upload File Lainnya', callback_data: userState.category.toLowerCase().replace(/\s+/g, '_') }],
                [{ text: '❌ Selesai', callback_data: 'cancel_upload' }]
              ]
            }
          }
        );
      } else {
        throw new Error('Failed to upload to Google Drive');
      }
    } catch (error) {
      console.error('Error uploading document:', error);
      await bot.editMessageText(
        '❌ Gagal mengupload dokumen. Silakan coba lagi.',
        {
          chat_id: chatId,
          message_id: waitMessage.message_id
        }
      );
    }
  }
});

// Function to upload files to Google Drive
async function uploadToGoogleDrive(fileUrl, fileName, folderName, fileType) {
  try {
    const { google } = require('googleapis');
    const axios = require('axios');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    // Menggunakan auth yang sudah ada di auth.js
    const auth = require('./auth');

    // Initialize Google Drive API dengan autentikasi service account
    const drive = google.drive({ version: 'v3', auth });

    // Download file dari Telegram
    const response = await axios({
      url: fileUrl,
      method: 'GET',
      responseType: 'stream'
    });

    const tempFilePath = path.join(os.tmpdir(), fileName);
    const writer = fs.createWriteStream(tempFilePath);

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Use the specified Google Drive folder ID instead of creating new folders
    const parentFolderId = '1JexwsLYnMGxuui32vLrnowPypnHVQQvH';

    // Create subfolder within the parent folder if needed
    let folderId;
    const folderQuery = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents`;
    const folderRes = await drive.files.list({
      q: folderQuery,
      fields: 'files(id, name)'
    });

    if (folderRes.data.files.length > 0) {
      folderId = folderRes.data.files[0].id;
    } else {
      // Buat folder jika tidak ada
      const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId] // Use the specified parent folder ID
      };

      const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id'
      });

      folderId = folder.data.id;
    }

    // Tentukan MIME type
    let mimeType;
    switch (fileType) {
      case 'pdf':
        mimeType = 'application/pdf';
        break;
      case 'photo':
        mimeType = 'image/jpeg';
        break;
      default:
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    // Upload file ke folder
    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };

    const media = {
      mimeType: mimeType,
      body: fs.createReadStream(tempFilePath)
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink'
    });

    // Hapus file sementara
    fs.unlinkSync(tempFilePath);

    return {
      success: true,
      fileUrl: file.data.webViewLink
    };
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    return {
      success: false,
      error: error.message
    };
  }
}