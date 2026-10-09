import { google } from 'googleapis';

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
    // AKSI 1: MENCARI TEKS DARI HASIL OCR LIVE
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
      const textToSearch = ocrText.replace(/\s+/g, '').toUpperCase(); // Hapus semua spasi di hasil scan, ubah huruf besar

      for (let i = 1; i < rows.length; i++) {
        const rowData = rows[i];
        const shipmentId = rowData[idIndex];
        
        // Hapus spasi pada ID master data untuk pencocokan yang lebih akurat
        if (shipmentId && textToSearch.includes(shipmentId.replace(/\s+/g, '').toUpperCase())) {
            let rowObj = {};
            headers.forEach((h, idx) => { rowObj[h] = rowData[idx] || ''; });
            matches.push(rowObj);
            break; // Berhenti jika 1 id sudah ditemukan (agar lebih cepat)
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
