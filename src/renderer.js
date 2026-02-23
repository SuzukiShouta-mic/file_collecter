let sourceFolder = null;
let destFolder = null;
let modifiedFiles = [];
let selectedFiles = new Set();

const elements = {
    selectSourceFolder: document.getElementById('selectSourceFolder'),
    selectDestFolder: document.getElementById('selectDestFolder'),
    scanFiles: document.getElementById('scanFiles'),
    collectFiles: document.getElementById('collectFiles'),
    timeRange: document.getElementById('timeRange'),
    excludeFolders: document.getElementById('excludeFolders'),
    useCustomDate: document.getElementById('useCustomDate'),
    customDate: document.getElementById('customDate'),
    dateInputs: document.getElementById('dateInputs'),
    setNow: document.getElementById('setNow'),
    preserveStructure: document.getElementById('preserveStructure'),
    sourcePath: document.getElementById('sourcePath'),
    destPath: document.getElementById('destPath'),
    fileList: document.getElementById('fileList'),
    fileCount: document.getElementById('fileCount'),
    status: document.getElementById('status'),
    progressContainer: document.getElementById('progressContainer'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    completedCount: document.getElementById('completedCount'),
    totalCount: document.getElementById('totalCount'),
    errorCount: document.getElementById('errorCount'),
    currentFile: document.getElementById('currentFile')
};

elements.selectSourceFolder.addEventListener('click', async () => {
    try {
        const folder = await window.electronAPI.selectFolder();
        if (folder) {
            sourceFolder = folder;
            elements.sourcePath.textContent = folder;
            elements.sourcePath.style.display = 'block';
            elements.scanFiles.disabled = false;
            showStatus('監視フォルダが選択されました', 'success');
        }
    } catch (error) {
        showStatus('フォルダ選択中にエラーが発生しました: ' + error.message, 'error');
    }
});

elements.selectDestFolder.addEventListener('click', async () => {
    try {
        const folder = await window.electronAPI.selectFolder();
        if (folder) {
            destFolder = folder;
            elements.destPath.textContent = folder;
            elements.destPath.style.display = 'block';
            updateCollectButton();
            showStatus('収集先フォルダが選択されました', 'success');
        }
    } catch (error) {
        showStatus('フォルダ選択中にエラーが発生しました: ' + error.message, 'error');
    }
});

elements.scanFiles.addEventListener('click', async () => {
    if (!sourceFolder) return;
    
    try {
        showStatus('ファイルをスキャン中...', 'info');
        elements.scanFiles.disabled = true;
        
        const hours = parseInt(elements.timeRange.value);
        const excludeFolders = elements.excludeFolders.value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        let customDate = null;
        if (elements.useCustomDate.checked && elements.customDate.value) {
            customDate = elements.customDate.value;
        }
        
        modifiedFiles = await window.electronAPI.getModifiedFiles(sourceFolder, hours, excludeFolders, customDate);
        
        displayFiles(modifiedFiles);
        updateCollectButton();
        
        showStatus(`${modifiedFiles.length}個の更新されたファイルが見つかりました`, 'success');
        elements.scanFiles.disabled = false;
    } catch (error) {
        showStatus('ファイルスキャン中にエラーが発生しました: ' + error.message, 'error');
        elements.scanFiles.disabled = false;
    }
});

elements.collectFiles.addEventListener('click', async () => {
    if (!destFolder || selectedFiles.size === 0) return;
    
    try {
        elements.collectFiles.disabled = true;
        
        const filesToCollect = modifiedFiles.filter(file => selectedFiles.has(file.path));
        
        // プログレス表示を初期化して表示
        showProgressContainer(true);
        initializeProgress(filesToCollect.length);
        
        const preserveStructure = elements.preserveStructure.checked;
        const results = await window.electronAPI.collectFiles(filesToCollect, destFolder, preserveStructure);
        
        const successCount = results.filter(r => r.success).length;
        const errorCount = results.filter(r => !r.success).length;
        
        // プログレス表示を隠す
        showProgressContainer(false);
        
        let message = `${successCount}個のファイルが正常に収集されました`;
        if (errorCount > 0) {
            message += `。${errorCount}個のファイルでエラーが発生しました。`;
        }
        
        showStatus(message, errorCount > 0 ? 'error' : 'success');
        
        elements.collectFiles.disabled = false;
    } catch (error) {
        showProgressContainer(false);
        showStatus('ファイル収集中にエラーが発生しました: ' + error.message, 'error');
        elements.collectFiles.disabled = false;
    }
});

function displayFiles(files) {
    elements.fileList.innerHTML = '';
    selectedFiles.clear();
    
    if (files.length === 0) {
        elements.fileList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">更新されたファイルはありません</div>';
        elements.fileCount.textContent = '';
        return;
    }
    
    elements.fileCount.textContent = `${files.length}個のファイルが見つかりました`;
    
    files.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        selectedFiles.add(file.path);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedFiles.add(file.path);
            } else {
                selectedFiles.delete(file.path);
            }
            updateCollectButton();
        });
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        
        const fileName = document.createElement('div');
        fileName.className = 'file-name';
        fileName.textContent = file.name;
        
        const filePath = document.createElement('div');
        filePath.className = 'file-path';
        filePath.textContent = file.path;
        
        const fileMeta = document.createElement('div');
        fileMeta.className = 'file-meta';
        const modifiedDate = new Date(file.modified).toLocaleString('ja-JP');
        const fileSize = formatFileSize(file.size);
        fileMeta.textContent = `更新日時: ${modifiedDate} | サイズ: ${fileSize}`;
        
        fileInfo.appendChild(fileName);
        fileInfo.appendChild(filePath);
        fileInfo.appendChild(fileMeta);
        
        fileItem.appendChild(checkbox);
        fileItem.appendChild(fileInfo);
        
        elements.fileList.appendChild(fileItem);
    });
}

function updateCollectButton() {
    elements.collectFiles.disabled = !destFolder || selectedFiles.size === 0;
}

function showStatus(message, type = 'info') {
    elements.status.className = `status ${type}`;
    elements.status.textContent = message;
    elements.status.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => {
            elements.status.style.display = 'none';
        }, 3000);
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// カスタム日時の表示/非表示切り替え
elements.useCustomDate.addEventListener('change', () => {
    if (elements.useCustomDate.checked) {
        elements.dateInputs.classList.add('active');
        elements.timeRange.disabled = true;
    } else {
        elements.dateInputs.classList.remove('active');
        elements.timeRange.disabled = false;
    }
});

// 現在時刻設定ボタン
elements.setNow.addEventListener('click', () => {
    const now = new Date();
    const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    elements.customDate.value = localDateTime;
});

// プログレス表示関連の関数
function showProgressContainer(show) {
    if (show) {
        elements.progressContainer.classList.add('active');
    } else {
        elements.progressContainer.classList.remove('active');
    }
}

function initializeProgress(totalFiles) {
    elements.totalCount.textContent = totalFiles;
    elements.completedCount.textContent = '0';
    elements.errorCount.textContent = '0';
    elements.progressFill.style.width = '0%';
    elements.progressFill.textContent = '0%';
    elements.currentFile.textContent = '準備中...';
    elements.progressText.textContent = 'ファイルを収集中...';
}

function updateProgress(progress, errors = 0) {
    elements.completedCount.textContent = progress.current;
    elements.errorCount.textContent = errors;
    elements.progressFill.style.width = `${progress.percentage}%`;
    elements.progressFill.textContent = `${progress.percentage}%`;
    elements.currentFile.textContent = `処理中: ${progress.fileName}`;
    
    if (progress.current === progress.total) {
        elements.currentFile.textContent = '完了しました！';
        elements.progressText.textContent = '収集完了';
    }
}

// IPCプログレス受信
window.electronAPI.onCollectProgress = (callback) => {
    window.electronAPI.ipcRenderer.on('collect-progress', (event, progress) => {
        callback(progress);
    });
};

// プログレス更新のリスナー設定
let errorCount = 0;
window.addEventListener('DOMContentLoaded', () => {
    if (window.electronAPI.ipcRenderer) {
        window.electronAPI.ipcRenderer.on('collect-progress', (event, progress) => {
            updateProgress(progress, errorCount);
        });
    }
});

showStatus('アプリケーションが準備完了しました', 'success');