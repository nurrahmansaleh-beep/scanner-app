const { JWT } = require('google-auth-library');

function cleanText(str) {
  if (!str) return '';
  return str.toString()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') 
    .replace(/O/g, '0');
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const { action, ocrText, items } = req.body;

    if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
      return res.status(500).json({ success: false, message: 'Variabel GOOGLE_SERVICE_ACCOUNT belum dipasang di Vercel.' });
    }

    let creds;
    try {
      const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
      creds = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (creds.private_key) {
        creds.private_key = creds.private_key.replace(/\\n/g, '\n');
      }
    } catch (e) {
      return res.status(500).json({ success: false, message: 'Format JSON salah: ' + e.message });
    }

    const client = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const spreadsheetId = '1oebQAuME9hLlulSIEr-PY1Wj9VuWKfDCOpkDQehXorE';

    if (action === 'liveTextScan') {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Master%20Data!A:Z`;
      const googleRes = await client.request({ url });
      
      const rows = googleRes.data.values;
      if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'Sheet Master Data Kosong' });

      const headers = rows[0];
      const idIndex = headers.findIndex(h => h && h.toString().trim() === 'shipment_external_id');
      
      if (idIndex === -1) return res.status(400).json({ success: false, message: 'Header shipment_external_id tidak ditemukan.' });

      const matches = [];
      const cleanedOCR = cleanText(ocrText);

      for (let i = 1; i < rows.length; i++) {
        const rawShipmentId = rows[i][idIndex];
        if (rawShipmentId) {
          const cleanedMasterId = cleanText(rawShipmentId);
          if (cleanedMasterId.length >= 4 && (cleanedOCR.includes(cleanedMasterId) || cleanedMasterId.includes(cleanedOCR))) {
            let rowObj = {};
            headers.forEach((h, idx) => { rowObj[h] = rows[i][idx] || ''; });
            matches.push(rowObj);
            break; 
          }
        }
      }
      return res.status(200).json({ success: true, matches });
    }

    if (action === 'saveBulk') {
      if (!items || items.length === 0) return res.status(400).json({ success: false, message: 'Tidak ada data untuk disimpan.' });

      const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      
      const values = items.map(item => {
        const rowValues = Object.values(item.selectedData);
        rowValues.push(item.tanggalSerahTerima || '-');     
        rowValues.push(item.vendor || '-');                 
        rowValues.push(timestamp);                          
        return rowValues;
      });

      // PERUBAHAN: Sheet Tujuan diganti menjadi "Serah Terima Vendor"
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Serah%20Terima%20Vendor!A:Z:append?valueInputOption=USER_ENTERED`;
      await client.request({
        url,
        method: 'POST',
        data: { values }
      });

      return res.status(200).json({ success: true });
    }

  } catch (error) {
    return res.status(500).json({ success: false, message: 'Gagal Google API: ' + (error.message || error.toString()) });
  }
};
