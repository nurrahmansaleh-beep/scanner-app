const { JWT } = require('google-auth-library');
const url = require('url');

function cleanText(str) {
  if (!str) return '';
  return str.toString().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0');
}

module.exports = async function handler(req, res) {
  // Ambil parameter untuk deteksi aksi
  const queryObject = url.parse(req.url, true).query;
  const action = req.method === 'POST' ? req.body.action : queryObject.action;

  // =====================================================================
  // FITUR BARU: JALUR UNDUH KHUSUS UNTUK APLIKASI (GET METHOD)
  // =====================================================================
  if (req.method === 'GET' && action === 'downloadCSV') {
    try {
      const { ids, vendor, date } = queryObject;
      if (!ids) return res.status(400).send("Tidak ada data ID");

      if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
        return res.status(500).send("Variabel GOOGLE_SERVICE_ACCOUNT belum dipasang.");
      }

      let creds = process.env.GOOGLE_SERVICE_ACCOUNT;
      if (typeof creds === 'string') creds = JSON.parse(creds);
      creds.private_key = creds.private_key.replace(/\\n/g, '\n');

      const client = new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const spreadsheetId = '1oebQAuME9hLlulSIEr-PY1Wj9VuWKfDCOpkDQehXorE';
      const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Master%20Data!A:Z`;
      const googleRes = await client.request({ url: sheetUrl });
      const rows = googleRes.data.values;
      
      if (!rows || rows.length === 0) return res.status(404).send('Data kosong');
      
      const headers = rows[0];
      const idIndex = headers.findIndex(h => h && h.toString().trim() === 'shipment_external_id');
      const idArray = ids.split(',');

      // Susun Header CSV
      let csvContent = '"No","ID Pengiriman","Tanggal Serah Terima","Vendor"';
      headers.forEach((h, i) => {
        if (i !== idIndex) csvContent += `,"${h || ''}"`;
      });
      csvContent += "\n";

      // Susun Baris Data
      let counter = 1;
      for (let i = 1; i < rows.length; i++) {
        const rawId = rows[i][idIndex];
        if (rawId && idArray.includes(rawId.toString().trim())) {
          let rowString = `"${counter}","${rawId}","${date}","${vendor}"`;
          headers.forEach((h, idx) => {
            if (idx !== idIndex) {
              let val = rows[i][idx] || '';
              val = val.toString().replace(/"/g, '""'); // Format aman Excel
              rowString += `,"${val}"`;
            }
          });
          csvContent += rowString + "\n";
          counter++;
        }
      }

      // Berikan perintah unduh resmi ke Browser / AppGeyser
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Bukti_Serah_Terima_${date}.csv"`);
      return res.status(200).send('\uFEFF' + csvContent); // uFEFF agar rapi di Excel
    } catch (error) {
      return res.status(500).send("Error pembuatan file: " + error.message);
    }
  }

  // =====================================================================
  // LOGIKA PEMINDAIAN DAN PENYIMPANAN SEPERTI BIASA (POST METHOD)
  // =====================================================================
  if (req.method !== 'POST') {
    res.setHeader('Content-Type', 'application/json');
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  res.setHeader('Content-Type', 'application/json');
  try {
    const { ocrText, items } = req.body;
    
    let creds = process.env.GOOGLE_SERVICE_ACCOUNT;
    if (typeof creds === 'string') creds = JSON.parse(creds);
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');

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

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Serah%20Terima%20Vendor!A:Z:append?valueInputOption=USER_ENTERED`;
      await client.request({ url, method: 'POST', data: { values } });
      return res.status(200).json({ success: true });
    }

  } catch (error) {
    return res.status(500).json({ success: false, message: 'Gagal Google API: ' + (error.message || error.toString()) });
  }
};
