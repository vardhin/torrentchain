import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTorrent, seedTorrent } from '../Torrent/src/torrentService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
    cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// File upload and torrent creation endpoint
app.post('/create-torrent', upload.single('file'), async (req, res) => {
    try {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`Processing file: ${req.file.originalname}`);
    const filePath = req.file.path;
    
    console.log('Creating torrent...');
    const torrent = await createTorrent(filePath);
    
    console.log('Starting to seed the torrent...');
    const magnetLink = await seedTorrent(torrent);

    console.log('Torrent created and seeding started');
    console.log('Magnet Link:', magnetLink);

    res.json({ 
        success: true, 
        originalName: req.file.originalname,
        magnetLink,
        message: 'File successfully converted to torrent and being seeded'
    });
} catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to create torrent' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Torrent creation service is running on http://localhost:${port}`);
    console.log('To create a torrent, send a POST request to /create-torrent with a file in form-data');
    console.log('Example using curl:');
    console.log('curl -X POST -F "file=@/path/to/your/file" http://localhost:3000/create-torrent');
}); 