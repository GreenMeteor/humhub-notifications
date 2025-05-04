// background.js
let humhubUrl = '';
let checkInterval = 1; // minutes
let lastNotificationCount = 0;
let authToken = '';
let authMethod = 'session'; // Default to session-based auth
let showNotifications = true;
let playSound = false;
let jwtToken = ''; // Added JWT token storage

// Initialize extension settings
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['humhubUrl', 'checkInterval', 'authToken', 'jwtToken', 'authMethod', 'showNotifications', 'playSound'], (result) => {
    if (result.humhubUrl) humhubUrl = result.humhubUrl;
    if (result.checkInterval) checkInterval = result.checkInterval;
    if (result.authToken) authToken = result.authToken;
    if (result.jwtToken) jwtToken = result.jwtToken; // Load JWT token
    if (result.authMethod) authMethod = result.authMethod;
    if (result.showNotifications !== undefined) showNotifications = result.showNotifications;
    if (result.playSound !== undefined) playSound = result.playSound;

    // Set up periodic alarm to check for notifications
    chrome.alarms.create('checkNotifications', { periodInMinutes: checkInterval });
  });
});

// Listen for alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkNotifications') {
    fetchNotifications();
  }
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.humhubUrl) humhubUrl = changes.humhubUrl.newValue;
  if (changes.checkInterval) {
    checkInterval = changes.checkInterval.newValue;
    // Update alarm interval
    chrome.alarms.create('checkNotifications', { periodInMinutes: checkInterval });
  }
  if (changes.authToken) authToken = changes.authToken.newValue;
  if (changes.jwtToken) jwtToken = changes.jwtToken.newValue; // Update JWT token
  if (changes.authMethod) authMethod = changes.authMethod.newValue;
  if (changes.showNotifications) showNotifications = changes.showNotifications.newValue;
  if (changes.playSound) playSound = changes.playSound.newValue;
});

// Fetch notifications from HumHub
function fetchNotifications() {
  if (!humhubUrl) return;

  // Use different endpoints based on authentication method
  let notificationEndpoint = '';
  let fetchOptions = {};

  if (authMethod === 'token') {
    // Use API with token authentication
    if (!authToken) return;
    notificationEndpoint = `${humhubUrl}/api/v1/notification`;
    fetchOptions = {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    };
  } else if (authMethod === 'jwt') {
    // Use API with JWT authentication
    if (!jwtToken) return;
    notificationEndpoint = `${humhubUrl}/api/v1/notification`;
    fetchOptions = {
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    };
  } else {
    // Use session-based authentication
    notificationEndpoint = `${humhubUrl}/notification`;
    fetchOptions = {
      credentials: 'include'
    };
  }

  fetch(notificationEndpoint, fetchOptions)
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    handleNotifications(data);
  })
  .catch(error => {
    console.error('Error fetching notifications:', error);
    chrome.action.setBadgeText({ text: 'err' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
  });
}

// Process notifications data
function handleNotifications(data) {
  // Handle both API and session-based response formats
  let unreadNotifications = [];

  if ((authMethod === 'token' || authMethod === 'jwt') && data.results) {
    // API token/JWT response format
    unreadNotifications = data.results.filter(notification => !notification.seen);
  } else if (authMethod === 'session') {
    // Session-based response format
    // Adjust this based on actual HumHub session-based JSON structure
    if (Array.isArray(data)) {
      unreadNotifications = data.filter(notification => !notification.seen);
    } else if (data.notifications) {
      unreadNotifications = data.notifications.filter(notification => !notification.seen);
    }
  }

  const count = unreadNotifications.length;

  // Update badge
  chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#4285F4' });

  // Show new notification if count increased
  if (showNotifications && count > lastNotificationCount && unreadNotifications.length > 0) {
    const latestNotification = unreadNotifications[0];

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'images/icon128.png',
      title: 'HumHub Notification',
      message: latestNotification.message || 'You have a new notification',
      contextMessage: humhubUrl
    });

    // Play notification sound if enabled
    if (playSound) {
      const audio = new Audio('sounds/notification.mp3');
      audio.play().catch(error => console.error('Error playing sound:', error));
    }
  }

  lastNotificationCount = count;

  // Store notifications for displaying in popup
  chrome.storage.local.set({
    'notifications': unreadNotifications,
    'lastFetched': new Date().toISOString()
  });
}

// Open HumHub when notification is clicked
chrome.notifications.onClicked.addListener(() => {
  if (humhubUrl) {
    chrome.tabs.create({ url: `${humhubUrl}/notification/overview` });
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchNotifications') {
    fetchNotifications();
    sendResponse({ status: 'fetching' });
  }
  return true;
});
