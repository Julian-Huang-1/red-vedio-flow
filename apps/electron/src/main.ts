import { app, BrowserWindow, Menu, shell } from 'electron'
import { delimiter, join } from 'node:path'
import type { LocalServerHandle } from '@red-video-flow/local-server'

let mainWindow: BrowserWindow | null = null
let localServer: LocalServerHandle | null = null
let backendClosed = false
let backendClosing = false

function devUrl() {
  return app.isPackaged ? null : process.env.RED_VIDEO_FLOW_ELECTRON_DEV_URL ?? null
}

function webDistDir() {
  return app.isPackaged
    ? join(process.resourcesPath, 'web-dist')
    : join(app.getAppPath(), '../red-vedio-flow/dist')
}

async function startBackend() {
  const userDataDir = app.getPath('userData')
  if (app.isPackaged) {
    process.env.RED_VIDEO_FLOW_PLUGIN_DIRS = [
      join(app.getPath('userData'), 'plugins'),
      join(process.resourcesPath, 'builtin-plugins'),
    ].join(delimiter)
  }

  const { startLocalServer } = await import('@red-video-flow/local-server')
  return startLocalServer({
    preferredPort: 0,
    dataDir: join(userDataDir, 'data'),
    webDistDir: webDistDir(),
    runtimeFilePath: join(userDataDir, 'runtime.json'),
    rvfCliCommand: app.isPackaged ? bundledRvfCommand() : developmentRvfCommand(),
    webMode: app.isPackaged ? 'static' : 'vite',
    viteRoot: join(app.getAppPath(), '../red-vedio-flow'),
    distribution: app.isPackaged ? 'electron' : 'source',
  })
}

function bundledRvfCommand() {
  return shellQuote(join(process.resourcesPath, process.platform === 'win32' ? 'bin/rvf.cmd' : 'bin/rvf'))
}

function developmentRvfCommand() {
  const nodePath = process.env.RED_VIDEO_FLOW_DEV_NODE
  if (!nodePath) return undefined
  return [
    nodePath,
    join(app.getAppPath(), '../local-server/node_modules/tsx/dist/cli.mjs'),
    join(app.getAppPath(), '../../packages/workflow-cli/src/index.ts'),
  ].map(shellQuote).join(' ')
}

function shellQuote(value: string) {
  if (process.platform === 'win32') return `"${value.replaceAll('"', '""')}"`
  return `'${value.replaceAll("'", "'\\''")}'`
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
  const appUrl = url ?? localServer?.runtime.baseUrl
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

app.on('before-quit', (event) => {
  if (!localServer || backendClosed) return
  event.preventDefault()
  if (backendClosing) return
  backendClosing = true
  void localServer.close()
    .catch((error) => {
      console.error('[red-video-flow] failed to stop local server', error)
    })
    .finally(() => {
      backendClosed = true
      localServer = null
      app.quit()
    })
})
