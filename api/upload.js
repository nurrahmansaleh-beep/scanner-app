import { google } from 'googleapis';

// Fungsi Normalisasi Teks untuk Pencocokan Fleksibel
function cleanText(str) {
  if (!str) return '';
  return str.toString()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') // Hapus strip (-), spasi, titik, koma
    .replace(/O/g, '0');        // Ubah semua huruf 'O' menjadi angka '0'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const { action, ocrText, selectedData } = req.body;

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1oebQAuME9hLlulSIEr-PY1Wj9VuWKfDCOpkDQehXorE';

    // ==========================================
    // AKSI 1: MENCARI TEKS DENGAN NORMALISASI
    // ==========================================
    if (action === 'liveTextScan') {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Master Data', 
      });
      
      const rows = response.data.values;
      if (!rows || rows.length === 0) return res.status(200).json({ success: false });

      const headers = rows[0];
      const idIndex = headers.findIndex(h => h === 'shipment_external_id');
      
      if (idIndex === -1) {
        return res.status(500).json({ success: false, message: 'Kolom shipment_external_id tidak ditemukan' });
      }

      const matches = [];
      const cleanedOCR = cleanText(ocrText); // Hasil bacaan kamera yang sudah dibersihkan

      for (let i = 1; i < rows.length; i++) {
        const rowData = rows[i];
        const rawShipmentId = rowData[idIndex];
        
        if (rawShipmentId) {
          const cleanedMasterId = cleanText(rawShipmentId);
          
          // Cocokkan ID yang sudah dibersihkan dari simbol & beda huruf/angka
          if (cleanedMasterId.length >= 4 && cleanedOCR.includes(cleanedMasterId)) {
              let rowObj = {};
              headers.forEach((h, idx) => { rowObj[h] = rowData[idx] || ''; });
              matches.push(rowObj);
              break; 
          }
        }
      }
      
      return res.status(200).json({ success: true, matches });
    }

    // ==========================================
    // AKSI 2: SIMPAN KE SHEET PAXEL
    // ==========================================
    if (action === 'save') {
       const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
       const values = [
         [timestamp, selectedData.shipment_external_id, JSON.stringify(selectedData)]
       ];
       
       await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Paxel',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values }
       });
       
       return res.status(200).json({ success: true });
    }

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
