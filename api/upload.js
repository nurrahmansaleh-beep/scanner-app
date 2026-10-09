import { google } from 'googleapis';

function cleanText(str) {
  if (!str) return '';
  return str.toString()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') 
    .replace(/O/g, '0');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

  try {
    const { action, ocrText, selectedData } = req.body;

    if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
      return res.status(500).json({ success: false, message: 'Env Variable GOOGLE_SERVICE_ACCOUNT belum dipasang di Vercel!' });
    }

    // Tangani format private_key agar tidak rusak saat dibaca Vercel
    let credentials;
    try {
      const rawCreds = process.env.GOOGLE_SERVICE_ACCOUNT;
      credentials = typeof rawCreds === 'string' ? JSON.parse(rawCreds) : rawCreds;
      if (credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Format teks JSON Kredensial di Vercel salah: ' + e.message });
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
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
      if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'Sheet Master Data Kosong' });

      const headers = rows[0];
      const idIndex = headers.findIndex(h => h.trim() === 'shipment_external_id');
      
      if (idIndex === -1) {
        return res.status(400).json({ success: false, message: 'Header shipment_external_id tidak ditemukan di Master Data.' });
      }

      const matches = [];
      const cleanedOCR = cleanText(ocrText);

      for (let i = 1; i < rows.length; i++) {
        const rowData = rows[i];
        const rawShipmentId = rowData[idIndex];
        
        if (rawShipmentId) {
          const cleanedMasterId = cleanText(rawShipmentId);
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
    // Menampilkan detail error spesifik ke layar HP
    return res.status(500).json({ 
      success: false, 
      message: 'Detail Error Google: ' + (error.message || error.toString()) 
    });
  }
}
