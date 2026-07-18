import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'node:path'
import type { LocalServerHandle } from '@red-video-flow/local-server'

let mainWindow: BrowserWindow | null = null
let localServer: LocalServerHandle | null = null

function devUrl() {
  return app.isPackaged ? null : process.env.RED_VIDEO_FLOW_ELECTRON_DEV_URL ?? 'http://127.0.0.1:5175'
}

function webDistDir() {
  return app.isPackaged
    ? join(process.resourcesPath, 'web-dist')
    : join(app.getAppPath(), '../web/dist')
}

async function startBackend() {
  process.env.RED_VIDEO_FLOW_DATA_DIR = join(app.getPath('userData'), 'data')
  process.env.RED_VIDEO_FLOW_WEB_DIST_DIR = webDistDir()

  const { startLocalServer } = await import('@red-video-flow/local-server')
  return startLocalServer()
}

function installMenu(url: string) {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{ role: 'appMenu' as const }]
      : []),
    {
      label: '文件',
      submenu: [
        {
          label: '在浏览器中打开',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => void shell.openExternal(url),
        },
        { type: 'separator' },
        process.platform === 'darwin'
          ? { role: 'close' as const }
          : { role: 'quit' as const },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function createWindow() {
  const url = devUrl()

  if (!url && !localServer) localServer = await startBackend()
  const appUrl = url ?? localServer?.url
  if (!appUrl) throw new Error('Unable to resolve application URL')

  installMenu(appUrl)

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Red Video Flow',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  await mainWindow.loadURL(appUrl)
}

app.whenReady().then(createWindow).catch((error) => {
  console.error('[red-video-flow] failed to start', error)
  app.quit()
})

app.on('activate', () => {
  if (!mainWindow) void createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (localServer) void localServer.close()
})
