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
let originalVideoElement = null;

videoUpload.addEventListener('change', (e) => {
    videoFile = e.target.files[0];
    if (videoFile) {
        const videoURL = URL.createObjectURL(videoFile);
        videoContainer.innerHTML = '';
        originalVideoElement = document.createElement('video');
        originalVideoElement.src = videoURL;
        originalVideoElement.muted = true; // Mute preview to allow autoplay for processing
        originalVideoElement.preload = 'auto';
        
        const previewEl = document.createElement('video');
        previewEl.controls = true;
        previewEl.src = videoURL;
        videoContainer.appendChild(previewEl);

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

    // --- Setup UI for processing ---
    loader.classList.remove('hidden');
    loaderMessage.textContent = 'Preparing to process video...';
    progressContainer.classList.remove('hidden');
    progressBar.style.width = '0%';
    resultsContainer.innerHTML = '';
    resultsSection.classList.add('hidden');
    cropButton.disabled = true;

    const rows = parseInt(rowsInput.value);
    const cols = parseInt(colsInput.value);

    // Wait for video to be ready
    if (originalVideoElement.readyState < 3) { // HAVE_FUTURE_DATA
        await new Promise(resolve => {
            originalVideoElement.oncanplaythrough = resolve;
        });
    }
    
    const { videoWidth, videoHeight } = originalVideoElement;
    const cellWidth = Math.floor(videoWidth / cols);
    const cellHeight = Math.floor(videoHeight / rows);
    const totalClips = rows * cols;

    loaderMessage.textContent = `Processing ${totalClips} clips...`;
    resultsContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    const cropJobs = [];

    // --- Create a crop job for each grid cell ---
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            const canvas = document.createElement('canvas');
            canvas.width = cellWidth;
            canvas.height = cellHeight;
            const ctx = canvas.getContext('2d');
            
            const stream = canvas.captureStream(30); // 30 FPS
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
            
            const chunks = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                }
            };
            
            const jobPromise = new Promise(resolve => {
                recorder.onstop = () => {
                    const blob = new Blob(chunks, { type: 'video/webm' });
                    resolve(blob);
                };
            });

            cropJobs.push({
                sx: j * cellWidth,
                sy: i * cellHeight,
                ctx,
                recorder,
                promise: jobPromise,
            });
        }
    }
    
    originalVideoElement.currentTime = 0;
    
    // Start all recorders
    cropJobs.forEach(job => job.recorder.start());

    let animationFrameId;

    const drawFrame = () => {
        if (originalVideoElement.paused || originalVideoElement.ended) {
            return;
        }
        
        cropJobs.forEach(job => {
            job.ctx.drawImage(
                originalVideoElement,
                job.sx, job.sy, cellWidth, cellHeight, // source rect
                0, 0, cellWidth, cellHeight // destination rect
            );
        });
        
        const progress = originalVideoElement.currentTime / originalVideoElement.duration;
        progressBar.style.width = `${progress * 100}%`;
        
        animationFrameId = requestAnimationFrame(drawFrame);
    };

    originalVideoElement.onended = () => {
        cancelAnimationFrame(animationFrameId);
        cropJobs.forEach(job => job.recorder.stop());
    };
    
    await originalVideoElement.play();
    animationFrameId = requestAnimationFrame(drawFrame);

    // --- Wait for all recordings to finish and display results ---
    const allBlobs = await Promise.all(cropJobs.map(job => job.promise));

    allBlobs.forEach(blob => {
        const videoURL = URL.createObjectURL(blob);
        const videoEl = document.createElement('video');
        videoEl.src = videoURL;
        videoEl.controls = true;
        videoEl.muted = true;
        resultsContainer.appendChild(videoEl);
    });

    loader.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    cropButton.disabled = false;
});