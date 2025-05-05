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

      // Check content type to ensure we're getting JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Response is not JSON. Got: " + contentType);
      }

      return response.json();
    })
    .then(data => {
      if (!data) {
        throw new Error("Received empty data");
      }
      handleNotifications(data);
    })
    .catch(error => {
      console.error('Error fetching notifications:', error);
      chrome.action.setBadgeText({ text: 'err' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });

      // Store error information for popup display
      chrome.storage.local.set({
        'fetchError': error.message,
        'lastErrorTime': new Date().toISOString()
      });
    });
}

// Process notifications data
function handleNotifications(data) {
  // Handle both API and session-based response formats
  let unreadNotifications = [];
  let allNotifications = [];

  try {
    if ((authMethod === 'token' || authMethod === 'jwt') && data.results) {
      // API token/JWT response format
      allNotifications = data.results || [];
      unreadNotifications = allNotifications.filter(notification => !notification.seen);
    } else if (authMethod === 'session') {
      // Session-based response format
      if (Array.isArray(data)) {
        allNotifications = data;
      } else if (data.notifications) {
        allNotifications = data.notifications;
      }
      unreadNotifications = allNotifications.filter(notification => !notification.seen);
    }

    // Normalize date formats for all notifications
    allNotifications = allNotifications.map(notification => {
      // Ensure created_at is properly formatted for storage
      if (notification.created_at) {
        // If it's a unix timestamp (number), convert to milliseconds
        if (typeof notification.created_at === 'number') {
          // Check if it's seconds (common for unix timestamps) or milliseconds
          // Unix timestamps in seconds are typically 10 digits or less
          if (notification.created_at.toString().length <= 10) {
            notification.created_at = notification.created_at * 1000; // Convert to milliseconds
          }
        }
      } else if (notification.createdAt) {
        // Copy alternate property name to standard name
        notification.created_at = notification.createdAt;
      }
      return notification;
    });

    const count = unreadNotifications.length;

    // Update badge
    chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#4285F4' });

    // Show new notification if count increased
    if (showNotifications && count > lastNotificationCount && unreadNotifications.length > 0) {
      const latestNotification = unreadNotifications[0];

      chrome.notifications.create({
        type: 'basic',
        iconUrl: '../images/icon128.png',
        title: 'HumHub Notification',
        message: latestNotification.message || 'You have a new notification',
        contextMessage: humhubUrl
      });

      // Store the flag that we should play sound on next badge click
      if (playSound) {
        chrome.storage.local.set({ 'playNotificationSound': true });
      }
    }

    lastNotificationCount = count;

    // Store notifications for displaying in popup with proper timestamp
    chrome.storage.local.set({
      'notifications': allNotifications,
      'lastFetched': new Date().toISOString() // Use ISO string format for consistent date storage
    });
  } catch (error) {
    console.error('Error processing notifications:', error);
    // Set an error state to inform the user
    chrome.storage.local.set({
      'notificationError': error.message,
      'lastFetched': new Date().toISOString()
    });
  }
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
