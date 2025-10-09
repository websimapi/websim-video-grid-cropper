import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

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
const loadProgressBar = document.getElementById('load-progress-bar');
const cropProgressContainer = document.getElementById('crop-progress-container');
const cropProgressBar = document.getElementById('crop-progress-bar');

let videoFile = null;
let ffmpegInstance = null;
let originalVideoElement = null;
let ffmpegLoadPromise = null;

async function loadFFmpeg() {
    if (ffmpegInstance) return ffmpegInstance;
    
    loader.classList.remove('hidden');
    loaderMessage.textContent = 'Loading FFmpeg...';
    progressContainer.classList.remove('hidden');
    cropProgressContainer.classList.add('hidden');
    loadProgressBar.style.width = '0%';

    const ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => {
        console.log(message);
    });

    ffmpeg.on('progress', ({ progress }) => {
        if (progress >= 0 && progress <= 1) {
            loadProgressBar.style.width = `${progress * 100}%`;
        }
    });
    
    const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm';

    try {
        await ffmpeg.load({
            coreURL: `${baseURL}/ffmpeg-core.js`,
            wasmURL: `${baseURL}/ffmpeg-core.wasm`,
            workerURL: `${baseURL}/ffmpeg-core.worker.js`,
        });
    } catch (e) {
        console.error('FFmpeg load failed', e);
        loaderMessage.textContent = 'Failed to load FFmpeg. Please try again.';
        progressContainer.classList.add('hidden');
        throw e; // re-throw to be caught by the promise
    }
    
    ffmpegInstance = ffmpeg;
    progressContainer.classList.add('hidden');
    loader.classList.add('hidden');
    return ffmpegInstance;
}

// Pre-load FFmpeg on page load
ffmpegLoadPromise = loadFFmpeg().catch(err => {
    console.error('Failed to load FFmpeg', err);
    // Error message is already set in loadFFmpeg
    return null; // Ensure promise resolves to null on failure
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
    progressContainer.classList.add('hidden');
    cropProgressContainer.classList.add('hidden');

    const ffmpeg = await ffmpegLoadPromise;
    if (!ffmpeg) {
         loaderMessage.textContent = 'FFmpeg failed to load. Cannot process video.';
         return; // Exit if ffmpeg isn't available
    }
    
    resultsContainer.innerHTML = '';
    resultsSection.classList.add('hidden');
    cropProgressContainer.classList.remove('hidden');
    cropProgressBar.style.width = '0%';

    const rows = parseInt(rowsInput.value);
    const cols = parseInt(colsInput.value);
    
    const { videoWidth, videoHeight } = originalVideoElement;
    const cellWidth = Math.floor(videoWidth / cols);
    const cellHeight = Math.floor(videoHeight / rows);
    
    loaderMessage.textContent = 'Preparing video...';
    const inputFileName = 'input.mp4';
    await ffmpeg.writeFile(inputFileName, await fetchFile(videoFile));

    resultsContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            const x = j * cellWidth;
            const y = i * cellHeight;
            const outputFileName = `output_${i}_${j}.mp4`;
            
            const totalClips = rows * cols;
            const currentClip = i * cols + j + 1;
            loaderMessage.textContent = `Processing clip ${currentClip} of ${totalClips}...`;

            await ffmpeg.exec([
                '-i', inputFileName,
                '-vf', `crop=${cellWidth}:${cellHeight}:${x}:${y}`,
                '-c:a', 'copy',
                outputFileName
            ]);
            
            const progress = currentClip / totalClips;
            cropProgressBar.style.width = `${progress * 100}%`;

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