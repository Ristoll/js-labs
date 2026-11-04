/**
 * Lobby DOM rendering module.
 *
 * Listens to Lobby EventTarget events and updates the #lobby-screen DOM.
 * Completely separated from the Lobby data layer — knows nothing about fetch
 * or AbortController; it only reacts to events and dispatches user actions
 * back via the Lobby's join() method.
 *
 * @param {import('./lobby.js').Lobby} lobby
 * @returns {{ show: () => void, hide: () => void }}
 */
export function setupLobbyUI(lobby) {
  const screen = document.getElementById('lobby-screen');
  const roomList = document.getElementById('lobby-room-list');
  const playerNameInput = document.getElementById('lobby-player-name');
  const errorBanner = document.getElementById('lobby-error');
  const refreshIndicator = document.getElementById('lobby-refresh-indicator');

  if (!screen || !roomList || !playerNameInput) {
    console.warn('[LobbyUI] Required DOM elements not found — lobby UI skipped.');
    return { show: () => {}, hide: () => {} };
  }

  // ── Event listeners from Lobby data layer ──────────────────────────────────

  lobby.addEventListener('roomsChanged', (e) => {
    const { rooms } = e.detail;
    renderRoomList(rooms);
    hideError();
    flashRefreshIndicator();
  });

  lobby.addEventListener('error', (e) => {
    showError(e.detail.message);
    flashRefreshIndicator();
  });

  // ── Internal rendering helpers ─────────────────────────────────────────────

  function renderRoomList(rooms) {
    if (!rooms || rooms.length === 0) {
      roomList.innerHTML =
        '<li class="lobby-empty">No rooms available. Waiting for refresh…</li>';
      return;
    }

    roomList.innerHTML = rooms
      .map(
        (room) => `
        <li class="lobby-room ${room.status === 'full' ? 'lobby-room--full' : ''}"
            data-room-id="${room.id}">
          <div class="lobby-room-info">
            <span class="lobby-room-name">${escapeHtml(room.name)}</span>
            <span class="lobby-room-players">${room.players}/${room.maxPlayers} players</span>
          </div>
          <button
            class="lobby-join-btn"
            data-room-id="${room.id}"
            ${room.status === 'full' ? 'disabled' : ''}
          >${room.status === 'full' ? 'Full' : 'Join'}</button>
        </li>`
      )
      .join('');

    // Attach join-button click handlers
    roomList.querySelectorAll('.lobby-join-btn:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', () => {
        const roomId = btn.dataset.roomId;
        const playerName = playerNameInput.value.trim() || 'Pilot';
        lobby.join(roomId, playerName);
      });
    });
  }

  function showError(message) {
    if (errorBanner) {
      errorBanner.textContent = `⚠ ${message}`;
      errorBanner.classList.remove('hidden');
    }
  }

  function hideError() {
    if (errorBanner) {
      errorBanner.classList.add('hidden');
    }
  }

  function flashRefreshIndicator() {
    if (!refreshIndicator) return;
    refreshIndicator.classList.add('lobby-refresh--active');
    setTimeout(() => refreshIndicator.classList.remove('lobby-refresh--active'), 600);
  }

  /** Minimal HTML escape to prevent XSS from room names. */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function show() {
    screen.classList.remove('hidden');
  }

  function hide() {
    screen.classList.add('hidden');
  }

  return { show, hide };
}

