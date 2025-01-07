const { google } = require('googleapis');
require('dotenv').config();
const auth = require('./auth');
const { generateDocument, cleanupTempFile } = require('./docs');
// ID Spreadsheet
const spreadsheetId = process.env.SPREADSHEET_ID;
const suratFormat = require('./surat.js')

// Fungsi untuk membuat sheet baru
async function createNewSheet(sheets, sheetName) {
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          addSheet: {
            properties: {
              title: sheetName
            }
          }
        }]
      }
    });

    console.log(`Sheet ${sheetName} berhasil dibuat`);
    return true;
  } catch (error) {
    console.error('Error saat membuat sheet:', error);
    return false;
  }
}

async function checkSheetExists(sheets, sheetName) {
  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId
    });

    return response.data.sheets.some(
      sheet => sheet.properties.title === sheetName
    );
  } catch (error) {
    console.error('Error saat mengecek sheet:', error);
    return false;
  }
}

// Fungsi untuk setup header
async function setupSheetHeader(sheets, sheetName, data) {
  try {
    let headers = ['Nomor Surat', 'Timestamp', ...Object.keys(data)]
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:${String.fromCharCode(65 + headers.length)}1`,
      valueInputOption: 'RAW',
      resource: {
        values: [headers]
      }
    });

    console.log(`Header untuk sheet ${sheetName} berhasil disetup`);
    return true;
  } catch (error) {
    console.error('Error saat setup header:', error);
    return false;
  }
}

async function getLastLetterNumber(sheets, letterType) {
  try {
    const sheet1 = 'Sheet1';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: letterType === 'SK' || letterType === 'SURAT MASUK' ? `${letterType}!A:A` : `${sheet1}!A:A`
    });

    if (!response.data.values || response.data.values.length <= 1) {
      return 0; // Jika belum ada data atau hanya ada header
    }
    const letterNumbers = response.data.values
      .slice(1) // Skip header
      .filter(row => {
        if (!row[0]) return false;
        const rowStr = row[0].toString().trim();
        return rowStr.includes('/311.110/');
      })
      .map(row => {
        return parseInt(row[0].split('/')[1])
      });

    return Math.max(0, ...letterNumbers);
  } catch (error) {
    console.error('Error saat mengambil nomor surat terakhir:', error);
    return 0;
  }
}
function generateLetterNumber(lastNumber, letterType) {
  const data = [
    { surat: "KETERANGAN USAHA", kode: "510" },
    { surat: "SKCK", kode: "470" },
    { surat: "REKOM BBM SOLAR", kode: "510" },
    { surat: "REKOM BBM PERTALITE", kode: "510" },
    { surat: "KETERANGAN KEMATIAN", kode: "474.3" },
    { surat: "KETERANGAN DOMISILI", kode: "408" },
    { surat: "KETERANGAN DOMISILI ORGANISASI", kode: "408" },
    { surat: "KETERANGAN TIDAK MAMPU UMUM", kode: "406" },
    { surat: "KETERANGAN TIDAK MAMPU DENGAN PENGHASILAN ORANG TUA", kode: "406" },
    { surat: "KETERANGAN SATU NAMA UMUM", kode: "470" },
    { surat: "KETERANGAN SATU NAMA KHUSUS", kode: "470" },
    { surat: "KETERANGAN ASAL USUL", kode: "472" },
    { surat: "KETERANGAN PINDAH DOMISILI", kode: "471.2" },
    { surat: "KETERANGAN KUASA", kode: "______" },
    { surat: "PEMBERITAHUAN", kode: "920" },
    { surat: 'UMUM', kode: '______' },
    { surat: 'UNDANGAN', kode: '______' },
    { surat: 'SK', kode: '188' },
    { surat: 'SURAT PERINTAH TUGAS', kode: '145' },
    { surat: 'SURAT MASUK', kode: '145' },
  ];
  const code = data.find(item => item.surat === letterType).kode;
  const number = String(lastNumber + 1).padStart(3, '0');

  return `${code}/${number}/311.110/2025`;
}

async function saveSuratKeluarToSpreadsheet(state, sheetName, userData) {
  try {
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const sheetExists = await checkSheetExists(sheets, sheetName);
    const data = state.data;

    if (sheetName.toString().toUpperCase() === 'REKOM BBM SOLAR' || sheetName.toString().toUpperCase() === 'REKOM BBM PERTALITE') {
      data['Masa Berlaku'] = new Date().toLocaleString('id-ID', {
        dateStyle: 'long',
      }) + ' - ' + new Date(new Date().setDate(new Date().getDate() + 30)).toLocaleString('id-ID', {
        dateStyle: 'long',
      });
    }
    if (!sheetExists) {
      const created = await createNewSheet(sheets, sheetName);
      if (!created) {
        throw new Error('Gagal membuat sheet baru');
      }
      const headerSetup = await setupSheetHeader(sheets, sheetName, data);
      if (!headerSetup) {
        throw new Error('Gagal setup header');
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    const lastNumber = await getLastLetterNumber(sheets, sheetName.toString().toUpperCase());
    const letterNumber = generateLetterNumber(lastNumber, sheetName.toString().toUpperCase());
    const currentDate = new Date().toLocaleString('id-ID', {
      dateStyle: 'long',
    });
    const values = [
      [letterNumber, currentDate, ...Object.values(data)]
    ];
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:${String.fromCharCode(66 + Object.keys(data).length)}`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values
      }
    });
    if (response.status == 200) {
      const backupNomorSurat = {
        'Nomor Surat': letterNumber,
        'Timestamp': currentDate,
        'Tentang': sheetName,
        'User': `https://t.me/${userData.from.username}`
      }
      const backupValues = [
        Object.values(backupNomorSurat)
      ]
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `Sheet1!A:${String.fromCharCode(66 + Object.keys(backupNomorSurat).length)}`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: backupValues
        }
      });
    }

    console.log('Data berhasil disimpan');
    return { success: true, letterNumber };
  } catch (error) {
    console.error('Error saat menyimpan data:', error.message);
    return { success: false, error: error.message };
  }
}
async function saveSKToSpreadsheet(data, sheetName, userData) {
  try {
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const sheetExists = await checkSheetExists(sheets, sheetName);

    // Jika sheet belum ada, buat baru
    if (!sheetExists) {
      const created = await createNewSheet(sheets, sheetName);
      if (!created) {
        throw new Error('Gagal membuat sheet baru');
      }
      const headers = ['Nomor Surat', 'Timestamp', 'Tentang', 'Tanggal', 'Tujuan', 'User']
      const headerSetup = await setupHeader(sheets, sheetName, headers);
      if (!headerSetup) {
        throw new Error('Gagal setup header');
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    const lastNumber = await getLastLetterNumber(sheets, sheetName.toString().toUpperCase());
    const letterNumber = generateLetterNumber(lastNumber, sheetName.toString().toUpperCase());
    const currentDate = new Date().toLocaleString('id-ID');
    const values = [
      [letterNumber, currentDate, ...Object.values(data), `https://t.me/${userData.from.username}`]
    ];
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:${String.fromCharCode(66 + Object.keys(data).length)}`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values
      }
    });

    console.log('Data berhasil disimpan:', response.data);
    return { success: true, letterNumber };
  } catch (error) {
    console.error('Error saat menyimpan data:', error.message);
    return { success: false, error: error.message };
  }
}
async function saveSuratMasukToSpreadsheet(data, sheetName, userData) {
  try {
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const sheetExists = await checkSheetExists(sheets, sheetName);

    // Jika sheet belum ada, buat baru
    if (!sheetExists) {
      const created = await createNewSheet(sheets, sheetName);
      if (!created) {
        throw new Error('Gagal membuat sheet baru');
      }
      const headers = ['Nomor Surat', 'Timestamp', 'Pengirim', 'Nomor Surat Masuk', 'Identitas', 'Tanggal Masuk', 'Tujuan', 'Perihal', 'Lampiran', 'Deskripsi', 'Penerima', 'User'];
      const headerSetup = await setupHeader(sheets, sheetName, headers);
      if (!headerSetup) {
        throw new Error('Gagal setup header');
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    const lastNumber = await getLastLetterNumber(sheets, sheetName.toString().toUpperCase());
    const letterNumber = generateLetterNumber(lastNumber, sheetName.toString().toUpperCase());
    const currentDate = new Date().toLocaleString('id-ID');
    const values = [
      [letterNumber, currentDate, ...Object.values(data), `https://t.me/${userData.from.username}`]
    ];
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:${String.fromCharCode(66 + Object.keys(data).length)}`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values
      }
    });
    console.log('Data berhasil disimpan:', response.data);
    return { success: true, letterNumber };
  } catch (error) {
    console.error('Error saat menyimpan data:', error.message);
    return { success: false, error: error.message };
  }
}
async function saveUndanganToSpreadsheet(data, userData) {
  try {
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const sheetName = 'Undangan';
    const sheetExists = await checkSheetExists(sheets, sheetName);
    if (!sheetExists) {
      const created = await createNewSheet(sheets, sheetName);
      if (!created) {
        throw new Error('Gagal membuat sheet baru');
      }
      const headers = [
        'Nomor Surat',
        'Timestamp',
        'Sifat',
        'Tujuan',
        'Lampiran',
        'Perihal',
        'Acara',
        'Hari/Tanggal Pelaksanaan',
        'Waktu Pelaksanaan',
        'Tempat Pelaksanaan',
        'Alamat Pelaksanaan'
      ];
      const headerSetup = await setupHeader(sheets, sheetName, headers);
      if (!headerSetup) {
        throw new Error('Gagal setup header');
      }
    }
    const lastNumber = await getLastLetterNumber(sheets, sheetName.toString().toUpperCase());
    const letterNumber = generateLetterNumber(lastNumber, sheetName.toString().toUpperCase());
    const currentDate = new Date().toLocaleString('id-ID');
    const values = [
      [
        letterNumber,
        currentDate,
        data['Sifat'],
        data['Tujuan'],
        data['Lampiran'],
        data['Perihal'],
        data['Acara'],
        data['Hari/Tanggal Pelaksanaan'],
        data['Waktu Pelaksanaan'],
        data['Tempat Pelaksanaan'],
        data['Alamat Pelaksanaan']
      ]
    ];
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:K`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values
      }
    });
    const backupNomorSurat = {
      'Nomor Surat': letterNumber,
      'Timestamp': currentDate,
      'Tentang': sheetName,
      'User': `https://t.me/${userData.from.username}`
    }
    const backupValues = [
      Object.values(backupNomorSurat)
    ]
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `Sheet1!A:${String.fromCharCode(66 + Object.keys(backupNomorSurat).length)}`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: backupValues
      }
    });

    console.log('Data undangan berhasil disimpan:', response.data);
    return { success: true, letterNumber };
  } catch (error) {
    console.error('Error saat menyimpan undangan:', error.message);
    return { success: false, error: error.message };
  }
}
async function setupHeader(sheets, sheetName, headers) {
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:${String.fromCharCode(65 + headers.length)}1`,
      valueInputOption: 'RAW',
      resource: {
        values: [headers]
      }
    });

    console.log(`Header untuk sheet ${sheetName} berhasil disetup`);
    return true;
  } catch (error) {
    console.error('Error saat setup header undangan:', error);
    return false;
  }
}
async function findLetterData(letterNumber) {
  try {
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // Cari di Sheet1 untuk mendapatkan tipe surat
    const sheet1Response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:D'
    });

    const sheet1Rows = sheet1Response.data.values;
    if (!sheet1Rows) return null;

    let letterType = null;
    let letterDate = null;
    let letterUser = null;

    // Cari di Sheet1
    for (const row of sheet1Rows) {
      if (row[0] === letterNumber) {
        letterType = row[2];
        letterDate = row[1];
        letterUser = row[3];
        break;
      }
    }

    if (!letterType) return null;

    // Cari data lengkap di sheet sesuai tipe surat
    console.log(letterType)
    const letterResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${letterType}!A:Z`
    });

    const letterRows = letterResponse.data.values;
    if (!letterRows) return null;

    // Cari data surat di sheet tipenya
    let letterData = null;
    let rowIndex = null;

    for (let i = 0; i < letterRows.length; i++) {
      if (letterRows[i][0] === letterNumber) {
        rowIndex = i + 1;
        letterData = letterRows[i];
        break;
      }
    }

    if (!letterData) return null;

    // Format data sesuai dengan jenis surat
    const fields = suratFormat[letterType];
    const formattedData = {};

    fields.forEach((field, index) => {
      formattedData[field.field] = letterData[index + 2]; // +2 karena index 0 = nomor surat, 1 = tanggal
    });

    return {
      letterNumber,
      type: letterType,
      date: letterDate,
      user: letterUser,
      index: rowIndex,
      data: formattedData
    };

  } catch (error) {
    console.error('Error finding letter:', error);
    return null;
  }
}
async function deleteLetterData(sheets, sheetName, letterNumber) {
  try {
    // Ambil semua data dari sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:Z`
    });

    const rows = response.data.values;
    if (!rows) return false;

    // Cari indeks baris yang akan dihapus
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === letterNumber) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) return false;

    // Hapus baris dengan menimpa dengan baris kosong
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${sheetName}!A${rowIndex + 1}:Z${rowIndex + 1}`
    });

    return true;
  } catch (error) {
    console.error('Error deleting letter data:', error);
    return false;
  }
}
async function updateLetterData(userState, data, bot, chatId) {
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  // Update di sheet spesifik surat
  const sheetName = userState.letterType;
  const deleteResult = await deleteLetterData(sheets, sheetName, userState.letterNumber);
  if (!deleteResult) {
    throw new Error('Gagal menghapus data lama');
  }
  const values = [[
    userState.letterNumber,
    new Date().toLocaleString('id-ID'),
    ...Object.values(data)
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${userState.letterType}!A:Z`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: { values }
  });

  // Generate dokumen baru
  const docResult = await generateDocument(userState.letterType, {
    ...data,
    NomorSurat: userState.letterNumber,
    TanggalSurat: new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })
  });

  if (docResult.success) {
    await bot.sendMessage(chatId, '✅ Data surat berhasil diperbarui');
    await bot.sendDocument(chatId, docResult.filePath, {
      caption: `Dokumen ${userState.letterType} - ${userState.letterNumber}`
    });
    cleanupTempFile(docResult.filePath);
  }
}

module.exports = {
  saveSuratKeluarToSpreadsheet,
  saveUndanganToSpreadsheet,
  saveSuratMasukToSpreadsheet,
  saveSKToSpreadsheet,
  findLetterData,
  updateLetterData,
  deleteLetterData
};