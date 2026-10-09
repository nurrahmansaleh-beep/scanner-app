import { google } from 'googleapis';
import { Readable } from 'stream';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const { filename, base64 } = req.body;

    // Menghubungkan kredensial dari Vercel
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file'
      ],
    });

    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    const mimeType = base64.substring(5, base64.indexOf(';'));
    const buffer = Buffer.from(base64.split(',')[1], 'base64');

    // 1. Upload Gambar ke Google Drive "robot"
    const driveRes = await drive.files.create({
      requestBody: { name: `${filename}_${Date.now()}.jpg` },
      media: { mimeType, body: Readable.from(buffer) },
      fields: 'id, webViewLink',
    });

    // 2. Ubah Izin Akses Foto agar bisa dilihat siapa saja dari link
    await drive.permissions.create({
      fileId: driveRes.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    // 3. Catat ke Google Sheet Anda
    const spreadsheetId = '1oebQAuME9hLlulSIEr-PY1Wj9VuWKfDCOpkDQehXorE';
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:C', // Pastikan nama sheet Anda adalah "Sheet1"
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[new Date().toLocaleString('id-ID'), filename, driveRes.data.webViewLink]]
      }
    });

    return res.status(200).json({ success: true, message: 'Dokumen berhasil tersimpan!' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
