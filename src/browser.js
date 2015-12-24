import {app, screen} from 'electron';
import BrowserWindow from 'browser-window';

import MainMenu from './main-menu';
import Library from './library';
import Usb from './usb';

require('crash-reporter').start();

var mainWindow = null;

app.on('window-all-closed', () => {
  if (process.platform != 'darwin')
    app.quit();
});

app.on('ready', () => {
  let workAreaSize = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({ width: 1356, height: 768 });

  if (workAreaSize.width <= 1366 && workAreaSize.height <= 768)
    mainWindow.maximize();

  mainWindow.loadURL('file://' + __dirname + '/../static/index.html');

  let library = new Library(mainWindow, app.getAppPath());

  new MainMenu(mainWindow, library);

  let usb = new Usb();

  usb.scan((err, drives) => {
    console.log('drives list', drives);
    mainWindow.webContents.send('scanned-devices', drives);
  });

  usb.watch((err, action, drive) => {
    console.log('new drive', action, drive);

    if (action == 'add')
      mainWindow.webContents.send('add-device', drive);
    else
      mainWindow.webContents.send('remove-device', drive);
  });

  library.watch();

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
});
