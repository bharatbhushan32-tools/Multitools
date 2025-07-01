// server.js

// --- 0. Global Error Handler (Catches crashes) ---
process.on('uncaughtException', (error, origin) => {
    console.error('🔴 UNCAUGHT EXCEPTION! The server has crashed.');
    console.error('🔴 Error:', error);
    console.error('🔴 Origin:', origin);
    process.exit(1); // Mandatory exit after a crash
});


// --- 1. Dependencies ---
const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const axios = require('axios');
const cheerio = require('cheerio');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');

// --- 2. Setup & Middleware ---
const app = express();
const PORT = process.env.PORT || 5000;

// Create 'uploads' and 'outputs' directories if they don't exist
const uploadsDir = path.join(__dirname, 'uploads');
const outputsDir = path.join(__dirname, 'outputs');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir);

// Multer setup for file storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.use('/outputs', express.static(outputsDir)); // Serve output files

// --- Helper: Cleanup files after a delay ---
const cleanupFile = (filePath) => {
    setTimeout(() => {
        fs.unlink(filePath, (err) => {
            if (err) {
                if (err.code !== 'ENOENT') {
                    console.error(`Failed to delete file: ${filePath}`, err);
                }
            } else {
                console.log(`Cleaned up file: ${filePath}`);
            }
        });
    }, 3600000); // Cleanup after 1 hour
};

// --- Helper: Check for FFmpeg on startup ---
const checkFfmpeg = () => {
    return new Promise((resolve) => {
        exec('ffmpeg -version', (error) => {
            if (error) {
                console.warn('\n--- 🔴 WARNING: FFmpeg NOT FOUND 🔴 ---');
                console.warn('Video and audio conversion tools will NOT work.');
                console.warn('Please install FFmpeg from: https://ffmpeg.org/download.html');
                console.warn('-------------------------------------------\n');
            } else {
                console.log('✅ FFmpeg installation found. Video/audio tools should work.');
            }
            resolve();
        });
    });
};


// --- 3. API Routes ---

// Welcome Route
app.get('/', (req, res) => res.json({ message: 'All-in-One Tools API is running!' }));

// Helper function to build the full URL
const getFullUrl = (req, filePath) => {
    // Render.com sets the 'x-forwarded-proto' header to 'https'
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    return `${protocol}://${req.get('host')}${filePath}`;
};

// === YouTube Tools ===
app.post('/api/yt-thumbnail-downloader', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url || !ytdl.validateURL(url)) {
            return res.status(400).json({ error: 'Invalid or missing YouTube URL.' });
        }
        const info = await ytdl.getInfo(url);
        res.json({ thumbnails: info.videoDetails.thumbnails });
    } catch (error) {
        console.error('Thumbnail downloader error:', error);
        res.status(500).json({ error: 'Failed to fetch thumbnails. The URL might be invalid or the video is private.' });
    }
});

app.post('/api/yt-to-mp3-converter', (req, res) => {
    try {
        const { url } = req.body;
        if (!url || !ytdl.validateURL(url)) {
            return res.status(400).json({ error: 'Invalid or missing YouTube URL.' });
        }

        const outputFileName = `audio-${Date.now()}.mp3`;
        const outputFilePath = path.join(outputsDir, outputFileName);

        ffmpeg(ytdl(url, { quality: 'highestaudio' }))
            .audioBitrate(128)
            .save(outputFilePath)
            .on('end', () => {
                const fileUrl = getFullUrl(req, `/outputs/${outputFileName}`);
                res.json({ message: 'Conversion successful!', fileUrl });
                cleanupFile(outputFilePath);
            })
            .on('error', (err) => {
                console.error('FFmpeg error during YT to MP3 conversion:', err);
                res.status(500).json({ error: 'Failed to convert video to MP3.' });
                cleanupFile(outputFilePath);
            });

    } catch (error) {
        console.error('YT to MP3 error:', error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});


// === Image Tools ===
app.post('/api/image-compressor', upload.single('files'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });

    try {
        const quality = parseInt(req.body.quality) || 80;
        const outputFileName = `compressed-${req.file.filename}`;
        const outputFilePath = path.join(outputsDir, outputFileName);
        
        await sharp(req.file.path)
            .jpeg({ quality: quality, progressive: true, optimizeScans: true })
            .toFile(outputFilePath);
        
        // *** THE FIX IS HERE ***
        const fileUrl = getFullUrl(req, `/outputs/${outputFileName}`);
        res.json({ message: 'Image compressed successfully!', fileUrl });

        cleanupFile(req.file.path);
        cleanupFile(outputFilePath);
    } catch (error) {
        console.error('Image compression error:', error);
        res.status(500).json({ error: 'Failed to compress image.' });
    }
});

app.post('/api/image-resizer', upload.single('files'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });
    const { width, height } = req.body;
    if (!width && !height) return res.status(400).json({ error: 'Width or height is required.' });

    try {
        const outputFileName = `resized-${req.file.filename}`;
        const outputFilePath = path.join(outputsDir, outputFileName);
        
        await sharp(req.file.path)
            .resize({
                width: width ? parseInt(width) : undefined,
                height: height ? parseInt(height) : undefined,
                fit: 'inside',
                withoutEnlargement: true
            })
            .toFile(outputFilePath);

        // *** THE FIX IS HERE ***
        const fileUrl = getFullUrl(req, `/outputs/${outputFileName}`);
        res.json({ message: 'Image resized successfully!', fileUrl });

        cleanupFile(req.file.path);
        cleanupFile(outputFilePath);
    } catch (error) {
        console.error('Image resize error:', error);
        res.status(500).json({ error: 'Failed to resize image.' });
    }
});


// === PDF Tools ===
app.post('/api/pdf-merger', upload.array('files'), async (req, res) => {
    if (!req.files || req.files.length < 2) {
        return res.status(400).json({ error: 'Please upload at least two PDF files to merge.' });
    }

    try {
        const mergedPdf = await PDFDocument.create();
        for (const file of req.files) {
            const pdfBytes = fs.readFileSync(file.path);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
            cleanupFile(file.path);
        }

        const mergedPdfBytes = await mergedPdf.save();
        const outputFileName = `merged-${Date.now()}.pdf`;
        const outputFilePath = path.join(outputsDir, outputFileName);
        fs.writeFileSync(outputFilePath, mergedPdfBytes);
        
        // *** THE FIX IS HERE ***
        const fileUrl = getFullUrl(req, `/outputs/${outputFileName}`);
        res.json({ message: 'PDFs merged successfully!', fileUrl });
        cleanupFile(outputFilePath);

    } catch (error) {
        console.error('PDF merge error:', error);
        res.status(500).json({ error: 'Failed to merge PDFs. One of the files may be corrupt or password-protected.' });
    }
});

// ... Placeholder for the other 55 tool endpoints ...
// Remember to use getFullUrl(req, '/outputs/filename') for all routes that return a file.

// --- 4. Start Server ---
app.listen(PORT, async () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    await checkFfmpeg();
});
