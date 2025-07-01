// server.js

// --- 1. Dependencies ---
const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const sharp = require('sharp');
const { PDFDocument, degrees } = require('pdf-lib');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const qr = require('qrcode');
const yts = require('yt-search');
const axios = require('axios');
const cheerio = require('cheerio');
const xmlbuilder = require('xmlbuilder');
const puppeteer = require('puppeteer');


// --- 2. Setup & Middleware ---
const app = express();
const PORT = process.env.PORT || 5000;

const uploadsDir = path.join(__dirname, 'uploads');
const outputsDir = path.join(__dirname, 'outputs');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/outputs', express.static(outputsDir));


// --- 3. Helpers ---
const cleanupFile = (filePath) => {
    setTimeout(() => {
        if (fs.existsSync(filePath)) {
            fs.unlink(filePath, (err) => {
                if (err) console.error(`Failed to delete file: ${filePath}`, err);
                else console.log(`Cleaned up file: ${filePath}`);
            });
        }
    }, 3600000); // 1 hour
};

const getFullUrl = (req, filePath) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    return `${protocol}://${req.get('host')}${filePath}`;
};


// --- 4. API Routes ---

// Welcome Route
app.get('/', (req, res) => res.json({ message: 'All-in-One Tools API is running!' }));

// === Video Tools ===

app.post('/api/video-merger', upload.array('files'), (req, res) => {
    if (!req.files || req.files.length < 2) {
        return res.status(400).json({ error: 'Please upload at least two video files.' });
    }
    const fileListPath = path.join(uploadsDir, `merge-list-${Date.now()}.txt`);
    const fileListContent = req.files.map(f => `file '${f.path}'`).join('\n');
    fs.writeFileSync(fileListPath, fileListContent);

    const outputFileName = `merged-${Date.now()}.mp4`;
    const outputFilePath = path.join(outputsDir, outputFileName);

    ffmpeg()
        .input(fileListPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions('-c copy')
        .save(outputFilePath)
        .on('end', () => {
            res.json({ fileUrl: getFullUrl(req, `/outputs/${outputFileName}`) });
            req.files.forEach(f => cleanupFile(f.path));
            cleanupFile(fileListPath);
            cleanupFile(outputFilePath);
        })
        .on('error', (err) => {
            console.error('Video merge error:', err);
            res.status(500).json({ error: 'Failed to merge videos.' });
        });
});

app.post('/api/video-compressor', upload.single('files'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No video file uploaded.' });
    
    const outputFileName = `compressed-${Date.now()}.mp4`;
    const outputFilePath = path.join(outputsDir, outputFileName);

    ffmpeg(req.file.path)
        .outputOptions(['-vcodec libx264', '-crf 28']) // CRF 28 is a good balance for compression
        .save(outputFilePath)
        .on('end', () => {
            res.json({ fileUrl: getFullUrl(req, `/outputs/${outputFileName}`) });
            cleanupFile(req.file.path);
            cleanupFile(outputFilePath);
        })
        .on('error', (err) => {
            console.error('Video compression error:', err);
            res.status(500).json({ error: 'Failed to compress video.' });
        });
});

app.post('/api/gif-maker', upload.single('files'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No video file uploaded.' });

    const outputFileName = `gif-${Date.now()}.gif`;
    const outputFilePath = path.join(outputsDir, outputFileName);

    ffmpeg(req.file.path)
        .outputOptions(['-vf "fps=10,scale=320:-1:flags=lanczos"'])
        .save(outputFilePath)
        .on('end', () => {
            res.json({ fileUrl: getFullUrl(req, `/outputs/${outputFileName}`) });
            cleanupFile(req.file.path);
            cleanupFile(outputFilePath);
        })
        .on('error', (err) => {
            console.error('GIF creation error:', err);
            res.status(500).json({ error: 'Failed to create GIF.' });
        });
});

app.post('/api/video-speed-controller', upload.single('files'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No video file uploaded.' });
    const speed = req.body.speed || 2.0; // Default to 2x speed

    const outputFileName = `speed-${Date.now()}.mp4`;
    const outputFilePath = path.join(outputsDir, outputFileName);

    ffmpeg(req.file.path)
        .videoFilter(`setpts=${1/speed}*PTS`)
        .audioFilter(`atempo=${speed}`)
        .save(outputFilePath)
        .on('end', () => {
            res.json({ fileUrl: getFullUrl(req, `/outputs/${outputFileName}`) });
            cleanupFile(req.file.path);
            cleanupFile(outputFilePath);
        })
        .on('error', (err) => {
            console.error('Video speed error:', err);
            res.status(500).json({ error: 'Failed to change video speed.' });
        });
});

// === Image Tools ===

app.post('/api/image-converter', upload.single('files'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });
    const format = req.body.format ? req.body.format.toLowerCase() : 'png';
    
    const outputFileName = `converted-${Date.now()}.${format}`;
    const outputFilePath = path.join(outputsDir, outputFileName);

    try {
        await sharp(req.file.path)
            .toFormat(format)
            .toFile(outputFilePath);

        res.json({ fileUrl: getFullUrl(req, `/outputs/${outputFileName}`) });
        cleanupFile(req.file.path);
        cleanupFile(outputFilePath);
    } catch (error) {
        console.error('Image conversion error:', error);
        res.status(500).json({ error: 'Failed to convert image. Unsupported format?' });
    }
});

app.post('/api/image-cropper', upload.single('files'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });
    const { width, height, left, top } = req.body;
    if (!width || !height || !left || !top) {
        return res.status(400).json({ error: 'Width, height, left, and top are required for cropping.' });
    }
    
    const outputFileName = `cropped-${Date.now()}.png`;
    const outputFilePath = path.join(outputsDir, outputFileName);

    try {
        await sharp(req.file.path)
            .extract({ 
                width: parseInt(width), 
                height: parseInt(height), 
                left: parseInt(left), 
                top: parseInt(top) 
            })
            .toFile(outputFilePath);

        res.json({ fileUrl: getFullUrl(req, `/outputs/${outputFileName}`) });
        cleanupFile(req.file.path);
        cleanupFile(outputFilePath);
    } catch (error) {
        console.error('Image crop error:', error);
        res.status(500).json({ error: 'Failed to crop image.' });
    }
});

app.post('/api/blur-image', upload.single('files'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });
    const blurAmount = req.body.blur ? parseInt(req.body.blur) : 10; // Default blur amount

    const outputFileName = `blurred-${Date.now()}.png`;
    const outputFilePath = path.join(outputsDir, outputFileName);

    try {
        await sharp(req.file.path)
            .blur(blurAmount)
            .toFile(outputFilePath);

        res.json({ fileUrl: getFullUrl(req, `/outputs/${outputFileName}`) });
        cleanupFile(req.file.path);
        cleanupFile(outputFilePath);
    } catch (error) {
        console.error('Image blur error:', error);
        res.status(500).json({ error: 'Failed to blur image.' });
    }
});

app.post('/api/image-color-picker', upload.single('files'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });

    try {
        const { dominant } = await sharp(req.file.path).stats();
        const hexColor = '#' + 
            ('0' + dominant.r.toString(16)).slice(-2) + 
            ('0' + dominant.g.toString(16)).slice(-2) + 
            ('0' + dominant.b.toString(16)).slice(-2);
            
        res.json({ text: `Dominant color: ${hexColor}` });
        cleanupFile(req.file.path);
    } catch (error) {
        console.error('Color picker error:', error);
        res.status(500).json({ error: 'Failed to pick color from image.' });
    }
});


// === PDF Tools ===

app.post('/api/pdf-splitter', upload.single('files'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded.' });
    // This is a complex operation; for now, we'll just split into single pages
    try {
        const pdfBytes = fs.readFileSync(req.file.path);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pageCount = pdfDoc.getPageCount();

        if (pageCount < 2) return res.status(400).json({ error: 'PDF must have at least 2 pages to split.' });

        // For simplicity, we'll just return the first page as an example.
        // A real implementation would loop and create multiple files, then zip them.
        const newPdfDoc = await PDFDocument.create();
        const [firstPage] = await newPdfDoc.copyPages(pdfDoc, [0]);
        newPdfDoc.addPage(firstPage);
        
        const newPdfBytes = await newPdfDoc.save();
        const outputFileName = `split-page-1-${Date.now()}.pdf`;
        const outputFilePath = path.join(outputsDir, outputFileName);
        fs.writeFileSync(outputFilePath, newPdfBytes);

        res.json({ fileUrl: getFullUrl(req, `/outputs/${outputFileName}`), text: 'Successfully extracted the first page as an example.' });
        cleanupFile(req.file.path);
        cleanupFile(outputFilePath);
    } catch (error) {
        console.error('PDF split error:', error);
        res.status(500).json({ error: 'Failed to split PDF.' });
    }
});

app.post('/api/pdf-to-jpg', upload.single('files'), (req, res) => {
    // This requires a library like pdf-poppler or a third-party API, which is complex.
    // We'll return a placeholder for now.
    res.status(501).json({ error: 'PDF to JPG conversion is a complex operation not yet implemented on this server.' });
});

app.post('/api/rotate-pdf', upload.single('files'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded.' });
    const angle = parseInt(req.body.angle) || 90;

    try {
        const pdfBytes = fs.readFileSync(req.file.path);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        pdfDoc.getPages().forEach(page => {
            page.setRotation(degrees(angle));
        });

        const rotatedPdfBytes = await pdfDoc.save();
        const outputFileName = `rotated-${Date.now()}.pdf`;
        const outputFilePath = path.join(outputsDir, outputFileName);
        fs.writeFileSync(outputFilePath, rotatedPdfBytes);

        res.json({ fileUrl: getFullUrl(req, `/outputs/${outputFileName}`) });
        cleanupFile(req.file.path);
        cleanupFile(outputFilePath);
    } catch (error) {
        console.error('PDF rotate error:', error);
        res.status(500).json({ error: 'Failed to rotate PDF.' });
    }
});

// === SEO Tools ===

app.post('/api/meta-tag-generator', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required.' });
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        const title = $('title').text();
        const description = $('meta[name="description"]').attr('content') || 'No description found.';
        const keywords = $('meta[name="keywords"]').attr('content') || 'No keywords found.';
        
        const tags = `<title>${title}</title>\n<meta name="description" content="${description}">\n<meta name="keywords" content="${keywords}">`;
        res.json({ text: tags });
    } catch (error) {
        res.status(500).json({ error: 'Could not fetch URL. Is it valid and public?' });
    }
});

app.post('/api/robots-txt-generator', (req, res) => {
    const { text } = req.body;
    // This tool is mostly client-side, but we can validate it.
    const robotsTxt = `User-agent: *\n${text}`;
    res.json({ text: robotsTxt });
});

app.post('/api/xml-sitemap-generator', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required.' });

    try {
        // Simple sitemap: just the base URL
        const root = xmlbuilder.create('urlset', { version: '1.0', encoding: 'UTF-8' });
        root.att('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');
        const urlElement = root.ele('url');
        urlElement.ele('loc', url);
        urlElement.ele('lastmod', new Date().toISOString().split('T')[0]);
        urlElement.ele('priority', '1.00');
        
        const xml = root.end({ pretty: true });
        res.json({ text: xml });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate sitemap.' });
    }
});


// === YouTube Tools ===
app.post('/api/yt-video-downloader', async (req, res) => {
    const { url } = req.body;
    if (!url || !ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL.' });
    }
    try {
        const info = await ytdl.getInfo(url);
        // Find a format with video and audio
        const format = ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'videoandaudio' });
        res.json({ fileUrl: format.url, text: `Downloading: ${info.videoDetails.title}` });
    } catch (error) {
        res.status(500).json({ error: 'Could not get video download link.' });
    }
});

app.post('/api/yt-title-generator', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Keyword is required.' });
    const titles = [
        `The Ultimate Guide to ${text}`,
        `Why Everyone is Talking About ${text}`,
        `Top 5 Tips for ${text} in ${new Date().getFullYear()}`,
        `${text}: What You Need to Know`,
        `I Tried ${text} for 30 Days and This Happened`
    ];
    res.json({ text: titles.join('\n') });
});

// === Utility Tools ===
app.post('/api/ip-checker', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    res.json({ text: `Your IP Address is: ${ip}` });
});


// --- ALREADY IMPLEMENTED TOOLS (from previous steps) ---
app.post('/api/yt-thumbnail-downloader', async (req, res) => { /* ... */ });
app.post('/api/yt-to-mp3-converter', (req, res) => { /* ... */ });
app.post('/api/yt-tag-extractor', async (req, res) => { /* ... */ });
app.post('/api/image-compressor', upload.single('files'), async (req, res) => { /* ... */ });
app.post('/api/image-resizer', upload.single('files'), async (req, res) => { /* ... */ });
app.post('/api/image-to-pdf', upload.array('files'), async (req, res) => { /* ... */ });
app.post('/api/pdf-merger', upload.array('files'), async (req, res) => { /* ... */ });
app.post('/api/qr-code-generator', async (req, res) => { /* ... */ });


// --- 5. Fallback for Unimplemented Routes ---
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `The API for '${req.originalUrl.split('/').pop()}' is not implemented yet.` });
});


// --- 6. Start Server ---
app.listen(PORT, async () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
