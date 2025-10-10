const DeviceModel = require('./server/database/models/Device.js');

async function checkDevices() {
  try {
    const devices = await DeviceModel.findAll();
    console.log('=== DISPOSITIVOS NO BANCO ===');
    devices.forEach(device => {
      console.log('DeviceId:', device.device_id);
      console.log('Name:', device.name);
      console.log('Allowed Apps:', device.allowed_apps ? JSON.parse(device.allowed_apps).length : 0);
      if (device.allowed_apps) {
        const apps = JSON.parse(device.allowed_apps);
        console.log('Apps permitidos:', apps);
      }
      console.log('---');
    });
  } catch (error) {
    console.error('Erro:', error);
  }
  process.exit(0);
}

checkDevices();
