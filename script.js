import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const videoUpload = document.getElementById('video-upload');
const rowsInput = document.getElementById('rows');
const colsInput = document.getElementById('cols');
const cropButton = document.getElementById('crop-button');
const videoContainer = document.getElementById('video-container');
const resultsContainer = document.getElementById('results-container');
const previewSection = document.getElementById('preview-section');
const resultsSection = document.getElementById('results-section');
const loader = document.getElementById('loader');
const loaderMessage = document.getElementById('loader-message');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');

let videoFile = null;
let ffmpegInstance = null;
let originalVideoElement = null;
let ffmpegLoadPromise = null;

async function loadFFmpeg() {
    if (ffmpegInstance) return ffmpegInstance;
    
    loader.classList.remove('hidden');
    loaderMessage.textContent = 'Loading FFmpeg...';
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';

    const ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => {
        console.log(message);
    });
    
    const coreURL = await toBlobURL('https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js', 'application/javascript');
    
    await ffmpeg.load({
        coreURL,
        wasmURL: await toBlobURL('https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm', 'application/wasm'),
        workerURL: await toBlobURL('https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.worker.js', 'application/javascript'),
    });
    
    ffmpegInstance = ffmpeg;
    progressContainer.style.display = 'none';
    loader.classList.add('hidden');
    return ffmpegInstance;
}

// Pre-load FFmpeg on page load
ffmpegLoadPromise = loadFFmpeg();
ffmpegLoadPromise.catch(err => {
    console.error('Failed to load FFmpeg', err);
    loaderMessage.textContent = 'Failed to load FFmpeg. Please refresh the page.';
    progressContainer.style.display = 'none';
    // Don't hide loader, show error message
});

videoUpload.addEventListener('change', (e) => {
    videoFile = e.target.files[0];
    if (videoFile) {
        const videoURL = URL.createObjectURL(videoFile);
        videoContainer.innerHTML = '';
        originalVideoElement = document.createElement('video');
        originalVideoElement.controls = true;
        originalVideoElement.src = videoURL;
        videoContainer.appendChild(originalVideoElement);
        
        originalVideoElement.addEventListener('loadedmetadata', () => {
            cropButton.disabled = false;
            cropButton.textContent = 'Crop Video';
            previewSection.classList.remove('hidden');
        });
    } else {
        cropButton.disabled = true;
        cropButton.textContent = 'Select a video first';
        previewSection.classList.add('hidden');
    }
});

cropButton.addEventListener('click', async () => {
    if (!videoFile || !originalVideoElement) return;

    loader.classList.remove('hidden');
    loaderMessage.textContent = 'Waiting for FFmpeg to finish loading...';

    const ffmpeg = await ffmpegLoadPromise;
    if (!ffmpeg) {
         loaderMessage.textContent = 'FFmpeg failed to load. Cannot process video.';
         return; // Exit if ffmpeg isn't available
    }
    
    resultsContainer.innerHTML = '';
    resultsSection.classList.add('hidden');

    const rows = parseInt(rowsInput.value);
    const cols = parseInt(colsInput.value);
    
    const { videoWidth, videoHeight } = originalVideoElement;
    const cellWidth = Math.floor(videoWidth / cols);
    const cellHeight = Math.floor(videoHeight / rows);
    
    const inputFileName = 'input.mp4';
    await ffmpeg.writeFile(inputFileName, await fetchFile(videoFile));

    resultsContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            const x = j * cellWidth;
            const y = i * cellHeight;
            const outputFileName = `output_${i}_${j}.mp4`;
            
            const progress = (i * cols + j + 1) / (rows * cols);
            loaderMessage.textContent = `Processing clip ${i * cols + j + 1} of ${rows * cols}... (${Math.round(progress * 100)}%)`;

            await ffmpeg.exec([
                '-i', inputFileName,
                '-vf', `crop=${cellWidth}:${cellHeight}:${x}:${y}`,
                '-c:a', 'copy',
                outputFileName
            ]);

            const data = await ffmpeg.readFile(outputFileName);
            const videoBlob = new Blob([data.buffer], { type: 'video/mp4' });
            const videoURL = URL.createObjectURL(videoBlob);

            const videoEl = document.createElement('video');
            videoEl.src = videoURL;
            videoEl.controls = true;
            videoEl.muted = true;
            resultsContainer.appendChild(videoEl);
            
            await ffmpeg.deleteFile(outputFileName);
        }
    }
    
    await ffmpeg.deleteFile(inputFileName);
    loader.classList.add('hidden');
    resultsSection.classList.remove('hidden');
});