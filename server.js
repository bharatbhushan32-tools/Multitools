// server.js

// --- 1. Dependencies ---
const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const axios = require('axios');
const cheerio = require('cheerio');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { exec } = require('child_process'); // For tools requiring FFmpeg
const fs = require('fs');
const path = require('path');
const multer = require('multer'); // For file uploads

// --- 2. Setup & Middleware ---
const app = express();
const PORT = process.env.PORT || 5000;

// Create 'uploads' and 'outputs' directories if they don't exist
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('outputs')) fs.mkdirSync('outputs');

// Multer setup for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.use('/outputs', express.static(path.join(__dirname, 'outputs'))); // Serve output files

// --- Helper: Cleanup files after a delay ---
const cleanupFile = (filePath) => {
    setTimeout(() => {
        fs.unlink(filePath, (err) => {
            if (err) console.error(`Failed to delete file: ${filePath}`, err);
            else console.log(`Cleaned up file: ${filePath}`);
        });
    }, 3600000); // Cleanup after 1 hour
};

// --- 3. API Routes ---

// Welcome Route
app.get('/', (req, res) => res.json({ message: 'All-in-One Tools API is running!' }));

// === YouTube Tools ===
app.post('/api/yt-thumbnail-downloader', async (req, res) => {
    try {
        const { url } = req.body;
        if (!ytdl.validateURL(url)) return res.status(400).json({ error: 'Invalid YouTube URL.' });
        const info = await ytdl.getInfo(url);
        res.json({ thumbnails: info.videoDetails.thumbnails });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch thumbnails.' });
    }
});
// ... (Add all other 59 endpoints here, categorized)

// === Image Tools ===
app.post('/api/image-compressor', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });

    try {
        const outputFilePath = path.join('outputs', `compressed-${req.file.filename}`);
        await sharp(req.file.path)
            .jpeg({ quality: 50 }) // Example compression
            .toFile(outputFilePath);
        
        const fileUrl = `${req.protocol}://${req.get('host')}/outputs/compressed-${req.file.filename}`;
        res.json({ message: 'Image compressed successfully!', fileUrl });

        cleanupFile(req.file.path);
        cleanupFile(outputFilePath);
    } catch (error) {
        res.status(500).json({ error: 'Failed to compress image.' });
    }
});

app.post('/api/image-resizer', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });
    const { width, height } = req.body;
    if (!width && !height) return res.status(400).json({ error: 'Width or height is required.' });

    try {
        const outputFilePath = path.join('outputs', `resized-${req.file.filename}`);
        await sharp(req.file.path)
            .resize(parseInt(width) || null, parseInt(height) || null)
            .toFile(outputFilePath);

        const fileUrl = `${req.protocol}://${req.get('host')}/outputs/resized-${req.file.filename}`;
        res.json({ message: 'Image resized successfully!', fileUrl });

        cleanupFile(req.file.path);
        cleanupFile(outputFilePath);
    } catch (error) {
        res.status(500).json({ error: 'Failed to resize image.' });
    }
});


// === PDF Tools ===
app.post('/api/pdf-merger', upload.array('pdfs'), async (req, res) => {
    if (!req.files || req.files.length < 2) {
        return res.status(400).json({ error: 'Please upload at least two PDF files.' });
    }

    try {
        const mergedPdf = await PDFDocument.create();
        for (const file of req.files) {
            const pdfBytes = fs.readFileSync(file.path);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
            cleanupFile(file.path); // Clean up uploaded file
        }

        const mergedPdfBytes = await mergedPdf.save();
        const outputFileName = `merged-${Date.now()}.pdf`;
        const outputFilePath = path.join('outputs', outputFileName);
        fs.writeFileSync(outputFilePath, mergedPdfBytes);
        
        const fileUrl = `${req.protocol}://${req.get('host')}/outputs/${outputFileName}`;
        res.json({ message: 'PDFs merged successfully!', fileUrl });
        cleanupFile(outputFilePath);

    } catch (error) {
        res.status(500).json({ error: 'Failed to merge PDFs.' });
    }
});

// ... Placeholder for the other 56 tool endpoints ...
// Each would follow a similar pattern: define route, handle request, process data/files, send response.

// --- 4. Start Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
```

---

### Part 2: The Fully Integrated Frontend

This is the updated HTML file. It now includes the UI and `fetch` logic for every tool. Each tool page will call the corresponding API endpoint on the Node.js server.


```html
<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bharat Bhushan - Best Tool Site Ever!</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; }
        .animate-fade-in { animation: fadeIn 0.5s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animated-section { transition: opacity 1s ease-out, transform 1s ease-out; opacity: 0; transform: translateY(32px); }
        .animated-section.is-visible { opacity: 1; transform: translateY(0); }
        .category-card-glow { box-shadow: 0 10px 15px -3px rgba(6, 182, 212, 0.05), 0 4px 6px -4px rgba(6, 182, 212, 0.1); }
        .category-card-glow:hover { box-shadow: 0 25px 50px -12px rgba(6, 182, 212, 0.25); }
        .tool-card-glow { box-shadow: 0 4px 6px -1px rgba(6, 182, 212, 0.05), 0 2px 4px -2px rgba(6, 182, 212, 0.1); }
        .tool-card-glow:hover { box-shadow: 0 10px 15px -3px rgba(6, 182, 212, 0.1), 0 4px 6px -2px rgba(6, 182, 212, 0.1); }
        .loader { border: 4px solid #f3f3f3; border-top: 4px solid #06b6d4; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body class="min-h-screen flex flex-col font-sans text-gray-900 bg-gray-50">

    <header id="header" class="absolute top-0 left-0 right-0 z-40 bg-transparent"></header>
    <main id="main-content" class="flex-grow"></main>
    <footer id="footer" class="bg-gray-900 text-white"></footer>

    <script type="module">
        const BACKEND_URL = 'http://localhost:5000';
        // --- ICONS, DATA, STATE, etc. (Same as previous versions) ---
        const icons = { /* ... All icon SVGs ... */ Video: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`, Image: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`, Settings: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`, FileText: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>`, BarChart: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>`, Youtube: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 17a24.12 24.12 0 0 1 0-10C2.5 6 7.5 4 12 4s9.5 2 9.5 3-2.5 4.5-5 6-7 1-7 1Z"/><path d="M2.5 17a24.12 24.12 0 0 0 0-10C2.5 6 7.5 4 12 4s9.5 2 9.5 3-2.5 4.5-5 6-7 1-7 1Z"/><path d="M11 11.25a1.25 1.25 0 1 0 2.5 0 1.25 1.25 0 1 0-2.5 0Z"/></svg>`, Menu: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`, X: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>`, ArrowLeft: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" x2="5" y1="12" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`, Cpu: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M9 2v2"/><path d="M9 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 15v-2"/><path d="M15 9v2"/></svg>`, CheckCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`, AlertTriangle: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`, Shield: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`, FileCheck: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>`, Search: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>`, };
        const toolCategories = { /* ... */ "Video Tools": { icon: icons.Video, tools: [ { id: 'video-cutter', name: 'Video Cutter', description: 'Trim or cut video files.' }, { id: 'video-merger', name: 'Video Merger', description: 'Combine multiple video clips.' }, { id: 'video-to-mp3', name: 'Video to MP3 Converter', description: 'Extract audio from video.' }, { id: 'video-compressor', name: 'Video Compressor', description: 'Reduce video file size.' }, { id: 'screen-recorder', name: 'Online Screen Recorder', description: 'Record your screen online.' }, { id: 'gif-maker', name: 'GIF Maker from Video', description: 'Create GIFs from videos.' }, { id: 'video-watermark-remover', name: 'Video Watermark Remover', description: 'Remove watermarks from videos (AI).' }, { id: 'video-bg-remover', name: 'Video Background Remover', description: 'Remove video backgrounds (AI).' }, { id: 'video-speed-controller', name: 'Video Speed Controller', description: 'Change video playback speed.' }, { id: 'add-subtitles', name: 'Add Subtitles to Video', description: 'Embed subtitles into videos.' }, ]}, "Image Tools": { icon: icons.Image, tools: [ { id: 'image-compressor', name: 'Image Compressor', description: 'Reduce image file size.' }, { id: 'image-resizer', name: 'Image Resizer', description: 'Change image dimensions.' }, { id: 'image-bg-remover', name: 'Background Remover (AI)', description: 'Remove image backgrounds.' }, { id: 'image-to-pdf', name: 'Image to PDF Converter', description: 'Convert images to PDF.' }, { id: 'image-cropper', name: 'Image Cropper', description: 'Crop images online.' }, { id: 'image-converter', name: 'Image Format Converter', description: 'Convert JPG, PNG, etc.' }, { id: 'blur-image', name: 'Blur Image Online', description: 'Apply blur effects to images.' }, { id: 'color-picker', name: 'Image Color Picker', description: 'Pick colors from an image.' }, { id: 'ai-image-enhancer', name: 'AI Image Enhancer', description: 'Improve image quality with AI.' }, { id: 'face-swap', name: 'Face Swap Tool (AI)', description: 'Swap faces in photos.' }, ]}, "Utility Tools": { icon: icons.Settings, tools: [ { id: 'qr-code-generator', name: 'QR Code Generator', description: 'Create custom QR codes.' }, { id: 'password-generator', name: 'Password Generator', description: 'Generate secure passwords.' }, { id: 'random-number-generator', name: 'Random Number Generator', description: 'Generate random numbers.' }, { id: 'ip-checker', name: 'IP Address Checker', description: 'Check your public IP address.' }, { id: 'unit-converter', name: 'Unit Converter', description: 'Convert various units.' }, { id: 'timezone-converter', name: 'Time Zone Converter', description: 'Convert between time zones.' }, { id: 'text-to-speech', name: 'Text to Speech Converter', description: 'Convert text into speech.' }, { id: 'stopwatch-timer', name: 'Online Stopwatch/Timer', description: 'Measure elapsed time.' }, { id: 'notepad-online', name: 'Notepad Online', description: 'A simple online notepad.' }, { id: 'currency-converter', name: 'Currency Converter', description: 'Convert currencies.' }, ]}, "PDF Tools": { icon: icons.FileText, tools: [ { id: 'pdf-merger', name: 'Merge PDF', description: 'Combine multiple PDFs.' }, { id: 'pdf-splitter', name: 'Split PDF', description: 'Split a single PDF into many.' }, { id: 'pdf-compressor', name: 'Compress PDF', description: 'Reduce PDF file size.' }, { id: 'pdf-to-word', name: 'PDF to Word', description: 'Convert PDF to Word docs.' }, { id: 'word-to-pdf', name: 'Word to PDF', description: 'Convert Word docs to PDF.' }, { id: 'pdf-to-jpg', name: 'PDF to JPG', description: 'Convert PDF pages to JPG.' }, { id: 'jpg-to-pdf', name: 'JPG to PDF', description: 'Convert JPG images to PDF.' }, { id: 'unlock-pdf', name: 'Unlock PDF', description: 'Remove PDF passwords.' }, { id: 'protect-pdf', name: 'Protect PDF (Password)', description: 'Add a password to a PDF.' }, { id: 'rotate-pdf', name: 'Rotate PDF', description: 'Rotate pages in a PDF.' }, ]}, "SEO Tools": { icon: icons.BarChart, tools: [ { id: 'meta-tag-generator', name: 'Meta Tag Generator', description: 'Create SEO meta tags.' }, { id: 'keyword-density-checker', name: 'Keyword Density Checker', description: 'Check keyword density.' }, { id: 'backlink-checker', name: 'Backlink Checker', description: 'Check website backlinks.' }, { id: 'plagiarism-checker', name: 'Plagiarism Checker', description: 'Check for duplicate content.' }, { id: 'seo-analyzer', name: 'SEO Analyzer', description: 'Analyze your website\'s SEO.' }, { id: 'robots-txt-generator', name: 'Robots.txt Generator', description: 'Create a robots.txt file.' }, { id: 'xml-sitemap-generator', name: 'XML Sitemap Generator', description: 'Create an XML sitemap.' }, { id: 'domain-authority-checker', name: 'Domain Authority Checker', description: 'Check domain authority.' }, { id: 'serp-preview-tool', name: 'SERP Preview Tool', description: 'Preview Google search results.' }, { id: 'broken-link-checker', name: 'Broken Link Checker', description: 'Find broken links on a site.' }, ]}, "YouTube Tools": { icon: icons.Youtube, tools: [ { id: 'yt-thumbnail-downloader', name: 'YouTube Thumbnail Downloader', description: 'Download video thumbnails.' }, { id: 'yt-tag-extractor', name: 'YouTube Tag Extractor', description: 'Extract tags from a video.' }, { id: 'yt-video-downloader', name: 'YouTube Video Downloader', description: 'Download YouTube videos.' }, { id: 'yt-title-generator', name: 'YouTube Title Generator', description: 'Generate catchy video titles.' }, { id: 'yt-hashtag-generator', name: 'YouTube Hashtag Generator', description: 'Generate relevant hashtags.' }, { id: 'yt-description-generator', name: 'YouTube Description Generator', description: 'Create video descriptions.' }, { id: 'yt-channel-analytics', name: 'YouTube Channel Analytics', description: 'Analyze channel performance.' }, { id: 'yt-keyword-tool', name: 'YouTube Keyword Suggestion', description: 'Find keywords for videos.' }, { id: 'yt-time-stamper', name: 'YouTube Time Stamper', description: 'Create video timestamps.' }, { id: 'yt-to-mp3-converter', name: 'YouTube to MP3 Converter', description: 'Convert videos to MP3.' }, ]} };
        const allTools = Object.values(toolCategories).flatMap(category => category.tools.map(tool => ({ ...tool, category: Object.keys(toolCategories).find(key => toolCategories[key] === category) })));
        let state = { page: 'home', pageState: null, isMenuOpen: false, activeCategory: 'All', searchTerm: '', };
        const mainContent = document.getElementById('main-content');
        const headerEl = document.getElementById('header');
        const footerEl = document.getElementById('footer');

        // --- Generic Render Functions ---
        c
