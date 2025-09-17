// Service Worker para notificações push
const CACHE_NAME = 'mdm-launcher-v1';
const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa40HI5B5FQpP8z3hJ7ZqF8z8n5K4j3L2M1N0O9P8Q7R6S5T4U3V2W1X0Y9Z8A7B6C5D4E3F2G1H0I9J8K7L6M5N4O3P2Q1R0S9T8U7V6W5X4Y3Z2A1B0C9D8E7F6G5H4I3J2K1L0M9N8O7P6Q5R4S3T2U1V0W9X8Y7Z6A5B4C3D2E1F0G9H8I7J6K5L4M3N2O1P0Q9R8S7T6U5V4W3X2Y1Z0';

// Evento de instalação
self.addEventListener('install', (event) => {
  console.log('Service Worker instalado');
  self.skipWaiting();
});

// Evento de ativação
self.addEventListener('activate', (event) => {
  console.log('Service Worker ativado');
  event.waitUntil(self.clients.claim());
});

// Evento de notificação push
self.addEventListener('push', (event) => {
  console.log('Notificação push recebida:', event);
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = {
        title: 'MDM Launcher',
        body: event.data.text() || 'Nova notificação',
        icon: '/icon-192.png',
        badge: '/badge-72.png'
      };
    }
  }

  const options = {
    title: data.title || 'MDM Launcher',
    body: data.body || 'Nova notificação do dispositivo',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    tag: data.tag || 'mdm-notification',
    data: data.data || {},
    actions: data.actions || [
      {
        action: 'view',
        title: 'Ver Detalhes',
        icon: '/icon-192.png'
      },
      {
        action: 'dismiss',
        title: 'Dispensar',
        icon: '/icon-192.png'
      }
    ],
    requireInteraction: data.requireInteraction || false,
    silent: data.silent || false,
    vibrate: data.vibrate || [200, 100, 200],
    timestamp: Date.now()
  };

  event.waitUntil(
    self.registration.showNotification(options.title, options)
  );
});

// Evento de clique na notificação
self.addEventListener('notificationclick', (event) => {
  console.log('Notificação clicada:', event);
  
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Abrir ou focar na janela da aplicação
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se já existe uma janela aberta, focar nela
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Se não existe janela aberta, abrir uma nova
      if (clients.openWindow) {
        const url = event.notification.data?.url || '/';
        return clients.openWindow(url);
      }
    })
  );
});

// Evento de fechamento da notificação
self.addEventListener('notificationclose', (event) => {
  console.log('Notificação fechada:', event);
});

// Evento de sincronização em background
self.addEventListener('sync', (event) => {
  console.log('Sincronização em background:', event.tag);
  
  if (event.tag === 'mdm-sync') {
    event.waitUntil(
      // Aqui você pode implementar sincronização de dados
      Promise.resolve()
    );
  }
});

// Evento de mensagem do cliente
self.addEventListener('message', (event) => {
  console.log('Mensagem recebida no Service Worker:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
