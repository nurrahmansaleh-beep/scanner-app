import { google } from 'googleapis';

// Normalisasi karakter yang sering tertukar pada sistem OCR
function cleanText(str) {
  if (!str) return '';
  return str.toString()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') // Hapus strip (-), spasi, dsb
    .replace(/O/g, '0')        // Huruf O disamakan dengan Angka 0
    .replace(/G/g, '6')        // Huruf G disamakan dengan Angka 6
    .replace(/Z/g, '2')        // Huruf Z disamakan dengan Angka 2
    .replace(/B/g, '8')        // Huruf B disamakan dengan Angka 8
    .replace(/[IL]/g, '1');     // Huruf I / L disamakan dengan Angka 1
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
      const cleanedOCR = cleanText(ocrText);

      for (let i = 1; i < rows.length; i++) {
        const rowData = rows[i];
        const rawShipmentId = rowData[idIndex];
        
        if (rawShipmentId) {
          const cleanedMasterId = cleanText(rawShipmentId);
          
          // Cocokkan jika ID master berada di dalam teks hasil scan
          if (cleanedMasterId.length >= 4 && (cleanedOCR.includes(cleanedMasterId) || cleanedMasterId.includes(cleanedOCR))) {
              let rowObj = {};
              headers.forEach((h, idx) => { rowObj[h] = rowData[idx] || ''; });
              matches.push(rowObj);
              break; 
          }
        }
      }
      
      return res.status(200).json({ success: true, matches });
    }

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
