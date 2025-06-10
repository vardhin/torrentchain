const fs = require('fs').promises;
const path = require('path');

let WebTorrent;
let client;
let createTorrentFile;

// Initialize WebTorrent and create-torrent using dynamic import
async function initWebTorrent() {
  if (!WebTorrent) {
    const webTorrentModule = await import('webtorrent');
    WebTorrent = webTorrentModule.default;
    client = new WebTorrent();
    
    // Add error handling for the client
    client.on('error', (err) => {
      console.error('WebTorrent client error:', err);
    });
  }
  return client;
}

async function initCreateTorrent() {
  if (!createTorrentFile) {
    const createTorrentModule = await import('create-torrent');
    createTorrentFile = createTorrentModule.default;
  }
  return createTorrentFile;
}

// Create a torrent from a file
async function createTorrent(filePath) {
  const createTorrentFn = await initCreateTorrent();
  
  return new Promise((resolve, reject) => {
    createTorrentFn(filePath, {
      name: path.basename(filePath),
      announceList: [
        // Original trackers
        ['udp://tracker.opentrackr.org:1337'],
        ['udp://tracker.leechers-paradise.org:6969'],
        ['udp://tracker.coppersurfer.tk:6969'],
        ['udp://open.demonii.si:1337'],
        ['udp://denis.stalker.upeer.me:6969'],
        
        // New trackers
        ['udp://wambo.club:1337/announce'],
        ['udp://tracker.dutchtracking.com:6969/announce'],
        ['udp://tc.animereactor.ru:8082/announce'],
        ['https://tracker.nitrix.me:443/announce'],
        ['http://novaopcj.icu:10325/announce'],
        ['udp://aaa.army:8866/announce'],
        ['https://tracker.imgoingto.icu:443/announce'],
        ['udp://tracker.shkinev.me:6969/announce'],
        ['udp://blokas.io:6969/announce'],
        ['udp://api.bitumconference.ru:6969/announce'],
        ['udp://ln.mtahost.co:6969/announce']
      ]
    }, async (err, torrent) => {
      if (err) return reject(err);

      const torrentPath = path.join(process.cwd(), 'torrents', `${path.basename(filePath)}.torrent`);
      
      // Ensure torrents directory exists
      try {
        await fs.mkdir(path.join(process.cwd(), 'torrents'), { recursive: true });
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }

      // Save the torrent file
      await fs.writeFile(torrentPath, torrent);
      resolve({ torrentBuffer: torrent, filePath });
    });
  });
}

// Seed a torrent and return its magnet link
async function seedTorrent(torrentData) {
  const webTorrentClient = await initWebTorrent();
  
  return new Promise((resolve, reject) => {
    // Seed the actual file, not just the torrent buffer
    webTorrentClient.add(torrentData.torrentBuffer, { path: path.dirname(torrentData.filePath) }, (torrent) => {
      console.log('Client is seeding:', torrent.magnetURI);
      console.log('Torrent info hash:', torrent.infoHash);
      console.log('Number of files:', torrent.files.length);
      console.log('Torrent name:', torrent.name);
      
      torrent.on('wire', (wire) => {
        console.log('New peer connected:', wire.remoteAddress);
      });
      
      torrent.on('upload', (bytes) => {
        console.log('Uploaded bytes:', bytes);
      });
      
      torrent.on('done', () => {
        console.log('Torrent download completed (seeding)');
      });
      
      torrent.on('error', (err) => {
        console.error('Torrent error:', err);
        reject(err);
      });
      
      resolve(torrent.magnetURI);
    });
  });
}

// Export functions using CommonJS  
module.exports = {
  createTorrent,
  seedTorrent,
  initWebTorrent
};