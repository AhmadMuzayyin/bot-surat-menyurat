const { google } = require('googleapis');
const auth = require('./auth');
const fs = require('fs');
const path = require('path');
require('dotenv').config()

// Map template IDs 
const templateIds = {
  'Keterangan Usaha': process.env.KETERANGAN_USAHA,
  'SKCK': process.env.SKCK,
  'Rekom BBM Solar': process.env.REKOM_BBM_SOLAR,
  'Rekom BBM Pertalite': process.env.REKOM_BBM_PERTALITE,
  'Keterangan Kematian': process.env.KETERANGAN_KEMATIAN,
  'Keterangan Domisili': process.env.KETERANGAN_DOMISILI,
  'Keterangan Domisili Organisasi': process.env.KETERANGAN_DOMISILI_ORGANISASI,
  'Keterangan Tidak Mampu Umum': process.env.KETERANGAN_TIDAK_MAMPU_UMUM,
  'Keterangan Tidak Mampu Dengan Penghasilan Orang Tua': process.env.KETERANGAN_TIDAK_MAMPU_DENGAN_PENGHASILAN_ORANG_TUA,
  'Keterangan Satu Nama Umum': process.env.KETERANGAN_SATU_NAMA_UMUM,
  'Keterangan Satu Nama Khusus': process.env.KETERANGAN_SATU_NAMA_KHUSUS,
  'Keterangan Asal Usul': process.env.KETERANGAN_ASAL_USUL,
  'Keterangan Pindah Domisili': process.env.KETERANGAN_PINDAH_DOMISILI,
  'Keterangan Kuasa': process.env.KETERANGAN_KUASA,
  'Pemberitahuan': process.env.PEMBERITAHUAN,
  'Undangan': process.env.UNDANGAN,
  'Surat Perintah Tugas': process.env.SURAT_PERINTAH_TUGAS,
};

async function generateDocument(templateType, data) {
  try {
    const authClient = await auth.getClient();
    const docs = google.docs({ version: 'v1', auth: authClient });
    const drive = google.drive({ version: 'v3', auth: authClient });

    // Get template ID
    const templateId = templateIds[templateType];
    if (!templateId) {
      throw new Error(`Template tidak ditemukan untuk ${templateType}`);
    }
    // Copy template
    const copyResponse = await drive.files.copy({
      fileId: templateId,
      requestBody: {
        name: `${templateType}_${new Date().toISOString()}`,
      }
    });
    const documentId = copyResponse.data.id;

    // Prepare placeholders replacement
    const requests = [];
    for (const [key, value] of Object.entries(data)) {
      requests.push({
        replaceAllText: {
          containsText: {
            text: `{{${key}}}`,
            matchCase: true
          },
          replaceText: value
        }
      });
    }

    // Replace placeholders
    if (requests.length > 0) {
      await docs.documents.batchUpdate({
        documentId: documentId,
        requestBody: {
          requests: requests
        }
      });
    }

    // Export as PDF
    const pdfResponse = await drive.files.export({
      fileId: documentId,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }, {
      responseType: 'arraybuffer'
    });

    // Save PDF temporarily
    const fileName = `${templateType}_${Date.now()}.docx`;
    const filePath = path.join(__dirname, 'temp', fileName);

    // Ensure temp directory exists
    if (!fs.existsSync(path.join(__dirname, 'temp'))) {
      fs.mkdirSync(path.join(__dirname, 'temp'));
    }

    fs.writeFileSync(filePath, Buffer.from(pdfResponse.data));

    // Delete copied template
    await drive.files.delete({
      fileId: documentId
    });

    return {
      success: true,
      filePath: filePath,
      fileName: fileName
    };

  } catch (error) {
    console.error('Error generating document:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Function to cleanup temporary files
function cleanupTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Temporary file deleted: ${filePath}`);
    }
  } catch (error) {
    console.error('Error cleaning up temp file:', error);
  }
}

module.exports = {
  generateDocument,
  cleanupTempFile
};