const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

const videoElements = [
  document.getElementById('frontVideo'),
  document.getElementById('backVideo'),
  document.getElementById('leftVideo'),
  document.getElementById('rightVideo')
];

let videoFiles = [];
let currentSetIndex = 0;  
let frontTimestamp = null; 

function extractStartTime(filePath) {
  const fileName = path.basename(filePath);
  const match = fileName.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  if (match) {
    const [_, year, month, day, hour, minute, second] = match.map(Number);
    return new Date(year, month - 1, day, hour, minute, second);
  }
  console.error('Failed to extract start time from:', fileName);
  return null;
}

function updateTimestamp(cameraId, timestamp) {
  document.getElementById(cameraId + 'Timestamp').textContent = timestamp;
}

document.getElementById('selectFolderButton').addEventListener('click', async () => {
  const folderPath = await ipcRenderer.invoke('dialog:openDirectory');
  if (folderPath) {
    processFilesInFolder(folderPath);
  }
});

document.getElementById('setSelect').addEventListener('change', () => {
  currentSetIndex = parseInt(document.getElementById('setSelect').value);
  loadAndPlayNextVideos(path.dirname(videoElements[0].src));
});

function processFilesInFolder(folderPath) {
  fs.readdir(folderPath, (err, files) => {
    if (err) {
      console.error('Error reading folder:', err);
      return;
    }

    videoFiles = files.filter(file => file.endsWith('.mp4'))
      .sort((a, b) => a.localeCompare(b));

    if (videoFiles.length >= 4) {
      populateSetSelect();
      loadAndPlayNextVideos(folderPath);
    } else {
      console.log('Not enough video files found in folder.');
    }
  });
}

function populateSetSelect() {
  const setSelect = document.getElementById('setSelect');
  setSelect.innerHTML = '';
  const numSets = Math.floor(videoFiles.length / 4);
  for (let i = 0; i < numSets; i++) {
    const timestamp = extractTimestampFromFilename(videoFiles[i * 4]);
    const formattedTimestamp = formatTimestamp(timestamp);
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `Set ${i + 1} - ${formattedTimestamp}`;
    setSelect.appendChild(option);
  }
  setSelect.disabled = numSets === 0;
}

function loadAndPlayNextVideos(folderPath) {
  if (currentSetIndex * 4 >= videoFiles.length) {
    console.log('All video sets have been played.');
    return;
  }

  const videoPaths = [
    path.join(folderPath, videoFiles[currentSetIndex * 4 + 1]),
    path.join(folderPath, videoFiles[currentSetIndex * 4]),
    path.join(folderPath, videoFiles[currentSetIndex * 4 + 2]),
    path.join(folderPath, videoFiles[currentSetIndex * 4 + 3])
  ];

  videoElements.forEach((videoElement, index) => {
    const cameraId = ['front', 'back', 'left', 'right'][index];
    videoElement.src = videoPaths[index];
    videoElement.load();
    videoElement.play().catch(error => {
      console.error('Video playback failed:', error);
    });

    if (cameraId === 'front') {
      const timestamp = extractTimestampFromFilename(videoFiles[currentSetIndex * 4 + index]);
      frontTimestamp = timestamp;
      updateTimestamp(cameraId, formatTimestamp(frontTimestamp));
    } else {
      updateTimestamp(cameraId, formatTimestamp(frontTimestamp));
    }
  });

  synchronizeVideos();
  currentSetIndex++;

  const setSelect = document.getElementById('setSelect');
  setSelect.value = currentSetIndex - 1; // Update the selected set
  setSelect.options[currentSetIndex - 1].textContent = `Set ${currentSetIndex} - ${formatTimestamp(frontTimestamp)}`;
}

function synchronizeVideos() {
  videoElements.forEach((videoElement, index) => {
    const cameraId = ['front', 'back', 'left', 'right'][index];
    videoElement.addEventListener('play', () => {
      if (cameraId === 'front' && frontTimestamp === null) {
        frontTimestamp = new Date();
      }
      videoElements.forEach((otherVideo, otherIndex) => {
        if (otherIndex !== index) {
          otherVideo.currentTime = videoElement.currentTime;
        }
      });
    });

    videoElement.addEventListener('ended', () => {
      let allVideosEnded = true;
      videoElements.forEach((otherVideo) => {
        if (!otherVideo.ended) {
          allVideosEnded = false;
        }
      });

      if (allVideosEnded) {
        loadAndPlayNextVideos(path.dirname(videoElement.src));
      }
    });

    videoElement.addEventListener('timeupdate', () => {
      if (frontTimestamp !== null) {
        const timestamp = calculateTimestamp(frontTimestamp, videoElement.currentTime);
        updateTimestamp(cameraId, formatTimestamp(timestamp));
      }
    });

    videoElement.addEventListener('seeked', () => {
      if (frontTimestamp !== null) {
        const timestamp = calculateTimestamp(frontTimestamp, videoElement.currentTime);
        updateTimestamp(cameraId, formatTimestamp(timestamp));
      }
    });
  });
}

function extractTimestampFromFilename(filename) {
  const regex = /(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/;
  const match = filename.match(regex);
  if (match) {
    const year = match[1];
    const month = match[2] - 1;
    const day = match[3];
    const hour = match[4];
    const minute = match[5];
    const second = match[6];
    return new Date(year, month, day, hour, minute, second);
  }
  return new Date();
}

function calculateTimestamp(initialTimestamp, currentTime) {
  const updatedTimestamp = new Date(initialTimestamp.getTime() + currentTime * 1000);
  return updatedTimestamp;
}

function formatTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

const playPauseButton = document.getElementById('playPauseButton');
let isPlaying = false;

playPauseButton.addEventListener('click', () => {
  const areVideosPlaying = videoElements.some(video => !video.paused && !video.ended && video.readyState > 2);

  if (areVideosPlaying) {
    videoElements.forEach(video => video.pause());
    playPauseButton.textContent = 'Play';
    isPlaying = false;
  } else {
    videoElements.forEach(video => video.play().catch(error => {
      console.error('Video playback failed:', error);
    }));
    playPauseButton.textContent = 'Pause';
    isPlaying = true;
  }
});

document.querySelectorAll('video').forEach(video => {
  video.addEventListener('timeupdate', () => {
    let totalDuration = 0;
    let totalCurrentTime = 0;

    document.querySelectorAll('video').forEach(v => {
      if (!v.paused) {
        totalCurrentTime += v.currentTime;
        totalDuration += v.duration;
      }
    });

    const progress = (totalCurrentTime / totalDuration) * 100;
    document.getElementById('progressBar').style.width = `${progress}%`;
  });
});

document.getElementById('progressBarContainer').addEventListener('click', (e) => {
  const rect = document.getElementById('progressBarContainer').getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  document.querySelectorAll('video').forEach(video => {
    const duration = video.duration;
    video.currentTime = (offsetX / rect.width) * duration;
  });
});
