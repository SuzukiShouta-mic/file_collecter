const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('get-modified-files', async (event, folderPath, hours = 24, excludeFolders = [], customDate = null) => {
  try {
    const modifiedFiles = [];
    let cutoffTime;
    
    if (customDate) {
      cutoffTime = new Date(customDate);
    } else {
      cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));
    }
    
    await scanDirectory(folderPath, modifiedFiles, cutoffTime, excludeFolders, folderPath);
    
    return modifiedFiles;
  } catch (error) {
    console.error('Error scanning directory:', error);
    return [];
  }
});

async function scanDirectory(dirPath, modifiedFiles, cutoffTime, excludeFolders = [], rootPath = null) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      // .DS_Storeファイルを除外
      if (entry.name === '.DS_Store') {
        continue;
      }
      
      // 隠しファイル・フォルダを除外（オプション）
      if (entry.name.startsWith('.') && entry.name !== '.gitignore' && entry.name !== '.env') {
        continue;
      }
      
      if (entry.isDirectory()) {
        // 除外フォルダをチェック
        const shouldExclude = excludeFolders.some(excludePattern => {
          if (excludePattern.includes('*')) {
            // ワイルドカードパターンマッチング
            const regex = new RegExp(excludePattern.replace(/\*/g, '.*'));
            return regex.test(entry.name);
          } else {
            // 完全一致または部分一致
            return entry.name === excludePattern || fullPath.includes(excludePattern);
          }
        });
        
        if (!shouldExclude) {
          await scanDirectory(fullPath, modifiedFiles, cutoffTime, excludeFolders, rootPath || dirPath);
        }
      } else if (entry.isFile()) {
        // 一般的な不要ファイルを除外
        const unwantedExtensions = ['.tmp', '.log', '.cache'];
        const unwantedFiles = ['Thumbs.db', 'desktop.ini', '.localized'];
        
        if (unwantedExtensions.some(ext => entry.name.endsWith(ext)) || 
            unwantedFiles.includes(entry.name)) {
          continue;
        }
        
        const stats = await fs.stat(fullPath);
        if (stats.mtime > cutoffTime) {
          // 相対パスを計算
          const relativePath = rootPath ? path.relative(rootPath, fullPath) : fullPath;
          modifiedFiles.push({
            path: fullPath,
            name: entry.name,
            relativePath: relativePath,
            modified: stats.mtime,
            size: stats.size
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }
}

ipcMain.handle('collect-files', async (event, files, destinationPath, preserveStructure = false) => {
  try {
    const results = [];
    
    if (!fsSync.existsSync(destinationPath)) {
      await fs.mkdir(destinationPath, { recursive: true });
    }
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progress = {
        current: i + 1,
        total: files.length,
        percentage: Math.round(((i + 1) / files.length) * 100),
        fileName: file.name,
        filePath: file.path
      };
      
      // プログレス情報を送信
      event.sender.send('collect-progress', progress);
      
      try {
        let finalDestPath;
        
        if (preserveStructure && file.relativePath) {
          // フォルダ階層を保持
          const relativeDirPath = path.dirname(file.relativePath);
          const destDirPath = path.join(destinationPath, relativeDirPath);
          
          // ディレクトリを作成
          if (!fsSync.existsSync(destDirPath)) {
            await fs.mkdir(destDirPath, { recursive: true });
          }
          
          finalDestPath = path.join(destinationPath, file.relativePath);
          
          // 同名ファイルが存在する場合の処理
          let counter = 1;
          let originalPath = finalDestPath;
          while (fsSync.existsSync(finalDestPath)) {
            const ext = path.extname(file.relativePath);
            const nameWithoutExt = file.relativePath.substring(0, file.relativePath.lastIndexOf(ext));
            finalDestPath = path.join(destinationPath, `${nameWithoutExt}_${counter}${ext}`);
            counter++;
          }
        } else {
          // フラットにコピー（従来の動作）
          const fileName = path.basename(file.path);
          finalDestPath = path.join(destinationPath, fileName);
          
          let counter = 1;
          while (fsSync.existsSync(finalDestPath)) {
            const ext = path.extname(fileName);
            const name = path.basename(fileName, ext);
            finalDestPath = path.join(destinationPath, `${name}_${counter}${ext}`);
            counter++;
          }
        }
        
        await fs.copyFile(file.path, finalDestPath);
        results.push({ success: true, file: file.path, destination: finalDestPath });
      } catch (error) {
        results.push({ success: false, file: file.path, error: error.message });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error collecting files:', error);
    return [];
  }
});