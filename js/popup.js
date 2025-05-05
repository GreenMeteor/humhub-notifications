document.addEventListener('DOMContentLoaded', function() {
  // Elements
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  const notificationList = document.getElementById('notificationList');
  const lastUpdated = document.getElementById('lastUpdated');
  const refreshBtn = document.getElementById('refreshBtn');
  const markAllReadBtn = document.getElementById('markAllReadBtn');
  const openHumHubBtn = document.getElementById('openHumHubBtn');
  const humhubUrlInput = document.getElementById('humhubUrlInput');
  const authTokenInput = document.getElementById('authTokenInput');
  const jwtTokenInput = document.getElementById('jwtTokenInput');
  const checkIntervalInput = document.getElementById('checkIntervalInput');
  const showNotificationsCheckbox = document.getElementById('showNotificationsCheckbox');
  const playSoundCheckbox = document.getElementById('playSoundCheckbox');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const testConnectionBtn = document.getElementById('testConnectionBtn');

  function checkResourcesExist() {
    // Check if notification sound exists and is accessible
    fetch('../sounds/notification.mp3')
      .then(response => {
        if (!response.ok) {
          console.warn('Notification sound file not found. Using fallback sound.');
          // Update the path in the audio player to use a fallback sound
          chrome.storage.local.set({ 'notificationSoundPath': '../sounds/fallback-notification.mp3' });
        }
      })
      .catch(error => {
        console.error('Error checking notification sound:', error);
        // Set a flag to use browser's default notification sound
        chrome.storage.local.set({ 'useDefaultSound': true });
      });
  }

  // Tab navigation
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and content
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      // Add active class to clicked tab and corresponding content
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
    });
  });

  // Elements for auth method
  const authMethodSelect = document.getElementById('authMethodSelect');
  const tokenSettingGroup = document.getElementById('tokenSettingGroup');
  const jwtSettingGroup = document.getElementById('jwtSettingGroup');
  const sessionAuthInfo = document.querySelector('.session-auth-info');
  const tokenAuthInfo = document.querySelector('.token-auth-info');
  const jwtAuthInfo = document.querySelector('.jwt-auth-info');

  // Play notification sound if flag is set
  chrome.storage.local.get(['playNotificationSound', 'notificationSoundPath', 'useDefaultSound'], (result) => {
    if (result.playNotificationSound) {
      // Play the sound
      try {
        let audioPath = '../sounds/notification.mp3'; // Default path

        if (result.useDefaultSound) {
          // Use a simple beep sound that's built into browsers
          const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU...'); // Base64 encoded short beep
          audio.play();
        } else if (result.notificationSoundPath) {
          // Use custom path if available
          audioPath = result.notificationSoundPath;
          const audio = new Audio(audioPath);
          audio.play().catch(e => {
            console.error('Error playing sound:', e);
            // Fallback to default browser notification sound
            new Notification('HumHub', { silent: false });
          });
        } else {
          // Try default path
          const audio = new Audio(audioPath);
          audio.play().catch(e => {
            // Fallback to default browser notification sound
            new Notification('HumHub', { silent: false });
          });
        }
      } catch (error) {
        console.error('Error initializing audio:', error);
      }
      // Clear the flag
      chrome.storage.local.remove('playNotificationSound');
    }
  });

  // Load settings
  loadSettings();

  // Load notifications
  loadNotifications();

  // Event listeners
  refreshBtn.addEventListener('click', () => {
    notificationList.innerHTML = '<div class="loading">Refreshing notifications...</div>';
    chrome.runtime.sendMessage({ action: 'fetchNotifications' }, () => {
      setTimeout(loadNotifications, 1000); // Give background script time to fetch
    });
  });

  // Toggle auth method visibility
  authMethodSelect.addEventListener('change', () => {
    // Hide all auth inputs and info sections
    document.querySelectorAll('.auth-setting').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.auth-info').forEach(el => el.style.display = 'none');

    // Show only the selected auth method
    if (authMethodSelect.value === 'token') {
      tokenSettingGroup.style.display = 'block';
      tokenAuthInfo.style.display = 'block';
    } else if (authMethodSelect.value === 'jwt') {
      jwtSettingGroup.style.display = 'block';
      jwtAuthInfo.style.display = 'block';
    } else {
      sessionAuthInfo.style.display = 'block';
    }
  });

  markAllReadBtn.addEventListener('click', markAllNotificationsAsRead);
  openHumHubBtn.addEventListener('click', openHumHub);
  saveSettingsBtn.addEventListener('click', saveSettings);
  testConnectionBtn.addEventListener('click', testConnection);

  // Functions
  function loadSettings() {
    chrome.storage.sync.get(['humhubUrl', 'checkInterval', 'authToken', 'jwtToken', 'authMethod', 'showNotifications', 'playSound'], (result) => {
      if (result.humhubUrl) humhubUrlInput.value = result.humhubUrl;
      if (result.checkInterval) checkIntervalInput.value = result.checkInterval;
      if (result.authToken) authTokenInput.value = result.authToken;
      if (result.jwtToken) jwtTokenInput.value = result.jwtToken;
      if (result.authMethod) {
        authMethodSelect.value = result.authMethod;
        // Hide all auth inputs and info sections
        document.querySelectorAll('.auth-setting').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.auth-info').forEach(el => el.style.display = 'none');

        // Show only the selected auth method
        if (result.authMethod === 'token') {
          tokenSettingGroup.style.display = 'block';
          tokenAuthInfo.style.display = 'block';
        } else if (result.authMethod === 'jwt') {
          jwtSettingGroup.style.display = 'block';
          jwtAuthInfo.style.display = 'block';
        } else {
          sessionAuthInfo.style.display = 'block';
        }
      }
      if (result.showNotifications !== undefined) showNotificationsCheckbox.checked = result.showNotifications;
      if (result.playSound !== undefined) playSoundCheckbox.checked = result.playSound;
    });
  }

  function saveSettings() {
    const settings = {
      humhubUrl: humhubUrlInput.value.trim(),
      checkInterval: parseInt(checkIntervalInput.value, 10) || 1,
      authMethod: authMethodSelect.value,
      authToken: authTokenInput.value.trim(),
      jwtToken: jwtTokenInput.value.trim(),
      showNotifications: showNotificationsCheckbox.checked,
      playSound: playSoundCheckbox.checked
    };

    chrome.storage.sync.set(settings, () => {
      const statusDiv = document.createElement('div');
      statusDiv.className = 'success-message';
      statusDiv.textContent = 'Settings saved!';

      const settingsTab = document.getElementById('settings-tab');
      settingsTab.appendChild(statusDiv);

      setTimeout(() => {
        settingsTab.removeChild(statusDiv);
      }, 3000);
    });
  }

  function loadNotifications() {
    chrome.storage.local.get(['notifications', 'lastFetched'], (result) => {
      const notifications = result.notifications || [];
      const lastFetchedTime = result.lastFetched;

      // Update last fetched time with better error handling
      if (lastFetchedTime) {
        try {
          const date = new Date(lastFetchedTime);
          // Check if date is valid
          if (!isNaN(date.getTime())) {
            lastUpdated.textContent = `Last updated: ${date.toLocaleTimeString()}`;
          } else {
            lastUpdated.textContent = 'Last updated: Unknown';
            console.error('Invalid date format received:', lastFetchedTime);
          }
        } catch (error) {
          console.error('Error formatting date:', error);
          lastUpdated.textContent = 'Last updated: Error';
        }
      }

      // Clear loading message
      notificationList.innerHTML = '';

      // Display notifications or empty state message
      if (!notifications || notifications.length === 0) {
        notificationList.innerHTML = '<div class="empty-state">No notifications</div>';
        return;
      }

      // Add notifications to list with improved date handling
      notifications.forEach(notification => {
        const notificationItem = document.createElement('div');
        notificationItem.className = `notification-item ${notification.seen ? '' : 'unread'}`;
        notificationItem.dataset.id = notification.id;

        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = notification.originator ? notification.originator.displayName : 'HumHub';

        const message = document.createElement('div');
        message.className = 'message';
        message.textContent = notification.message || 'New notification';

        const time = document.createElement('div');
        time.className = 'time';

        // Improved date handling
        try {
          let notificationDate;
          // Handle different timestamp formats
          if (typeof notification.created_at === 'number') {
            // Unix timestamp (seconds)
            notificationDate = new Date(notification.created_at * 1000);
          } else if (notification.created_at) {
            // ISO string or other format
            notificationDate = new Date(notification.created_at);
          } else if (notification.createdAt) {
            // Alternative property name
            notificationDate = new Date(notification.createdAt);
          } else {
            // No date available
            notificationDate = null;
          }

          time.textContent = notificationDate && !isNaN(notificationDate.getTime()) ?
            notificationDate.toLocaleString() : 'Unknown date';
        } catch (e) {
          console.error('Error formatting notification date:', e);
          time.textContent = 'Date error';
        }

        notificationItem.appendChild(title);
        notificationItem.appendChild(message);
        notificationItem.appendChild(time);

        notificationItem.addEventListener('click', () => {
          markNotificationAsRead(notification.id);
          openNotification(notification);
        });

        notificationList.appendChild(notificationItem);
      });
    });
  }

  function markNotificationAsRead(notificationId) {
    chrome.storage.sync.get(['humhubUrl', 'authToken', 'jwtToken', 'authMethod'], (result) => {
      if (!result.humhubUrl) return;

      let markAsReadEndpoint = '';
      let fetchOptions = {};

      if (result.authMethod === 'token') {
        if (!result.authToken) return;
        // API token authentication
        markAsReadEndpoint = `${result.humhubUrl}/api/v1/notification/mark-as-seen`;
        fetchOptions = {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${result.authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            notificationIds: [notificationId]
          }),
          credentials: 'include'
        };
      } else if (result.authMethod === 'jwt') {
        if (!result.jwtToken) return;
        // JWT authentication
        markAsReadEndpoint = `${result.humhubUrl}/api/v1/notification/mark-as-seen`;
        fetchOptions = {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${result.jwtToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            notificationIds: [notificationId]
          }),
          credentials: 'include'
        };
      } else {
        // Session-based authentication
        markAsReadEndpoint = `${result.humhubUrl}/notification/seen?id=${notificationId}`;
        fetchOptions = {
          method: 'GET',
          credentials: 'include'
        };
      }

      fetch(markAsReadEndpoint, fetchOptions)
      .then(response => {
        if (response.ok) {
          // Update local notification state
          const notificationElement = document.querySelector(`.notification-item[data-id="${notificationId}"]`);
          if (notificationElement) {
            notificationElement.classList.remove('unread');
          }

          // Update stored notifications
          chrome.storage.local.get(['notifications'], (result) => {
            const notifications = result.notifications || [];
            const updatedNotifications = notifications.map(notification => {
              if (notification.id === notificationId) {
                return { ...notification, seen: true };
              }
              return notification;
            });

            chrome.storage.local.set({ 'notifications': updatedNotifications });
          });
        }
      })
      .catch(error => console.error('Error marking notification as read:', error));
    });
  }

  function markAllNotificationsAsRead() {
    chrome.storage.local.get(['notifications'], (localResult) => {
      const notifications = localResult.notifications || [];
      // Get all unread notification IDs
      const unreadNotificationIds = notifications
          .filter(notification => !notification.seen)
          .map(notification => notification.id);

      if (unreadNotificationIds.length === 0) {
        // No unread notifications, nothing to do
        return;
      }

      chrome.storage.sync.get(['humhubUrl', 'authToken', 'jwtToken', 'authMethod'], (result) => {
        if (!result.humhubUrl) return;

        let markAllReadEndpoint = '';
        let fetchOptions = {};

        if (result.authMethod === 'token') {
          if (!result.authToken) return;
          // API token authentication
          markAllReadEndpoint = `${result.humhubUrl}/api/v1/notification/mark-as-seen`;
          fetchOptions = {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${result.authToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              notificationIds: unreadNotificationIds
            }),
            credentials: 'include'
          };
        } else if (result.authMethod === 'jwt') {
          if (!result.jwtToken) return;
          // JWT authentication
          markAllReadEndpoint = `${result.humhubUrl}/api/v1/notification/mark-as-seen`;
          fetchOptions = {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${result.jwtToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              notificationIds: unreadNotificationIds
            }),
            credentials: 'include'
          };
        } else {
          // Session-based authentication
          markAllReadEndpoint = `${result.humhubUrl}/notification/seen-all`;
          fetchOptions = {
            method: 'GET',
            credentials: 'include'
          };
        }

        fetch(markAllReadEndpoint, fetchOptions)
        .then(response => {
          if (response.ok) {
            // Update UI
            document.querySelectorAll('.notification-item.unread').forEach(item => {
              item.classList.remove('unread');
            });

            // Update stored notifications
            chrome.storage.local.get(['notifications'], (result) => {
              const notifications = result.notifications || [];
              const updatedNotifications = notifications.map(notification => {
                return { ...notification, seen: true };
              });

              chrome.storage.local.set({ 'notifications': updatedNotifications });
            });

            // Update badge
            chrome.action.setBadgeText({ text: '' });
          }
        })
        .catch(error => console.error('Error marking all notifications as read:', error));
      });
    });
  }

  function openNotification(notification) {
    chrome.storage.sync.get(['humhubUrl'], (result) => {
      if (!result.humhubUrl) return;

      let url = `${result.humhubUrl}/notification/overview`;

      // If notification has a source URL, use it
      if (notification.source && notification.source.url) {
        url = notification.source.url;
      }

      chrome.tabs.create({ url });
    });
  }

  function openHumHub() {
    chrome.storage.sync.get(['humhubUrl'], (result) => {
      if (result.humhubUrl) {
        chrome.tabs.create({ url: result.humhubUrl });
      }
    });
  }

  function testConnection() {
    const url = humhubUrlInput.value.trim();
    const authMethod = authMethodSelect.value;
    const token = authTokenInput.value.trim();
    const jwtToken = jwtTokenInput.value.trim();

    if (!url) {
      showConnectionStatus(false, 'Please enter HumHub URL');
      return;
    }

    if (authMethod === 'token' && !token) {
      showConnectionStatus(false, 'Please enter an auth token for token-based authentication');
      return;
    }

    if (authMethod === 'jwt' && !jwtToken) {
      showConnectionStatus(false, 'Please enter a JWT token for JWT authentication');
      return;
    }

    // Remove previous status message if exists
    const existingStatus = document.querySelector('.connection-status');
    if (existingStatus) existingStatus.remove();

    // Add loading message
    const loadingStatus = document.createElement('div');
    loadingStatus.className = 'connection-status';
    loadingStatus.textContent = 'Testing connection...';
    document.getElementById('settings-tab').appendChild(loadingStatus);

    let testEndpoint = '';
    let fetchOptions = {};

    if (authMethod === 'token') {
      // API token authentication test
      testEndpoint = `${url}/api/v1/notification`;
      fetchOptions = {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      };
    } else if (authMethod === 'jwt') {
      // JWT authentication test
      testEndpoint = `${url}/api/v1/notification`;
      fetchOptions = {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      };
    } else {
      // Session-based authentication test
      testEndpoint = `${url}/notification`;
      fetchOptions = {
        credentials: 'include'
      };
    }

    fetch(testEndpoint, fetchOptions)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      showConnectionStatus(true, 'Connection successful!');
    })
    .catch(error => {
      showConnectionStatus(false, `Connection failed: ${error.message}`);
    });
  }

  function showConnectionStatus(success, message) {
    const existingStatus = document.querySelector('.connection-status');
    if (existingStatus) existingStatus.remove();

    const statusDiv = document.createElement('div');
    statusDiv.className = `connection-status ${success ? 'success' : 'error'}`;
    statusDiv.textContent = message;

    document.getElementById('settings-tab').appendChild(statusDiv);

    // Remove after 5 seconds
    setTimeout(() => {
      statusDiv.remove();
    }, 5000);
  }
});
