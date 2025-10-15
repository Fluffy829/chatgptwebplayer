const CLIENT_ID = 'YOUR_SPOTIFY_CLIENT_ID'; // Replace with your own
const REDIRECT_URI = 'https://yourusername.github.io/spotify-csv-player/'; 
// Change to your GitHub Pages URL
const SCOPES = ''; // No scopes needed for public data, adjust if you want 
more
const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';

let accessToken = '';
let expiresAt = 0;

const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const csvFileInput = document.getElementById('csv-file');
const tracksContainer = document.getElementById('tracks-container');
const searchInput = document.getElementById('search');
const searchSection = document.getElementById('search-section');

let allTracks = [];

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1);

  const data = rows.map(line => {
    // Handle quoted commas in CSV (basic)
    const regex = /("([^"]|"")*"|[^,]*)(,|$)/g;
    const row = [];
    let match;
    while ((match = regex.exec(line)) !== null) {
      let val = match[1];
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"');
      }
      row.push(val);
      if (match.index + match[0].length >= line.length) break;
    }
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] || '');
    return obj;
  });
  return data;
}

function msToTime(duration) {
  let seconds = Math.floor((duration / 1000) % 60);
  let minutes = Math.floor((duration / (1000 * 60)) % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

async function fetchTrackData(trackUri) {
  if (!accessToken) return null;
  const trackId = trackUri.split(':').pop();
  try {
    const res = await 
fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (res.status === 401) {
      // Token expired
      accessToken = '';
      expiresAt = 0;
      alert('Session expired. Please log in again.');
      toggleLogin(false);
      return null;
    }
    if (!res.ok) {
      console.error('Failed to fetch track:', res.status, await 
res.text());
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('Fetch error:', e);
    return null;
  }
}

function renderTrack(trackCsv, trackApi) {
  const div = document.createElement('div');
  div.className = 'track';

  // Album art or placeholder
  const img = document.createElement('img');
  img.src = trackApi?.album?.images?.[1]?.url || 
'https://via.placeholder.com/64?text=No+Art';
  img.alt = trackCsv['Track Name'];
  div.appendChild(img);

  // Info container
  const info = document.createElement('div');
  info.className = 'track-info';

  // Track name and artist(s)
  const title = document.createElement('h3');
  title.textContent = trackCsv['Track Name'];
  info.appendChild(title);

  const artist = document.createElement('p');
  artist.textContent = `Artist: ${trackCsv['Artist Name(s)']}`;
  info.appendChild(artist);

  // Album name
  const album = document.createElement('p');
  album.textContent = `Album: ${trackCsv['Album Name']}`;
  info.appendChild(album);

  // Release Date
  if (trackCsv['Release Date']) {
    const release = document.createElement('p');
    release.textContent = `Released: ${trackCsv['Release Date']}`;
    info.appendChild(release);
  }

  // Duration
  const duration = document.createElement('p');
  duration.textContent = `Duration: ${msToTime(parseInt(trackCsv['Duration 
(ms)'] || '0'))}`;
  info.appendChild(duration);

  // Popularity (if available from API)
  if (trackApi && typeof trackApi.popularity === 'number') {
    const pop = document.createElement('p');
    pop.textContent = `Popularity: ${trackApi.popularity}`;
    info.appendChild(pop);
  }

  div.appendChild(info);

  // Spotify embed iframe
  const iframe = document.createElement('iframe');
  iframe.className = 'spotify-embed';
  iframe.src = `https://open.spotify.com/embed/track/${trackCsv['Track 
URI'].split(':').pop()}`;
  iframe.frameBorder = '0';
  iframe.allow = 'encrypted-media';
  div.appendChild(iframe);

  return div;
}

async function renderTracks(tracks) {
  tracksContainer.innerHTML = '';
  for (const trackCsv of tracks) {
    const trackApi = await fetchTrackData(trackCsv['Track URI']);
    const trackEl = renderTrack(trackCsv, trackApi);
    tracksContainer.appendChild(trackEl);
  }
}

function toggleLogin(isLoggedIn) {
  loginBtn.hidden = isLoggedIn;
  logoutBtn.hidden = !isLoggedIn;
  csvFileInput.disabled = !isLoggedIn;
  if (!isLoggedIn) {
    tracksContainer.innerHTML = '';
    searchSection.hidden = true;
    allTracks = [];
  } else {
    searchSection.hidden = false;
  }
}

// OAuth login flow (Implicit Grant)

function getTokenFromUrl() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  return {
    access_token: params.get('access_token'),
    expires_in: params.get('expires_in')
  };
}

function login() {
  const authUrl = 
`${AUTH_ENDPOINT}?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=token&show_dialog=true&scope=${encodeURIComponent(SCOPES)}`;
  window.location = authUrl;
}

function logout() {
  accessToken = '';
  expiresAt = 0;
  window.history.pushState({}, null, '/'); // clear token from URL
  toggleLogin(false);
}

function checkToken() {
  const tokenData = getTokenFromUrl();
  if (tokenData.access_token) {
    accessToken = tokenData.access_token;
    expiresAt = Date.now() + parseInt(tokenData.expires_in) * 1000;
    window.history.pushState({}, null, '/'); // clean URL
    toggleLogin(true);
  } else if (accessToken && Date.now() < expiresAt) {
    toggleLogin(true);
  } else {
    toggleLogin(false);
  }
}

function filterTracks(term) {
  const filtered = allTracks.filter(t =>
    t['Track Name'].toLowerCase().includes(term) ||
    t['Artist Name(s)'].toLowerCase().includes(term) ||
    t['Album Name'].toLowerCase().includes(term)
  );
  renderTracks(filtered);
}

// Event listeners

loginBtn.addEventListener('click', () => login());
logoutBtn.addEventListener('click', () => logout());

csvFileInput.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  allTracks = parseCSV(text);
  if (!accessToken) {
    alert('Please login to Spotify first.');
    return;
  }
  renderTracks(allTracks);
});

searchInput.addEventListener('input', e => {
  filterTracks(e.target.value.toLowerCase());
});

// On load

checkToken();

