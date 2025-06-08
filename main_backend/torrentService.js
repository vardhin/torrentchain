import WebTorrent from 'webtorrent';
import createTorrentFile from 'create-torrent';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new WebTorrent();

// Create a torrent from a file
export function createTorrent(filePath) {
  return new Promise((resolve, reject) => {
    createTorrentFile(filePath, {
      name: path.basename(filePath),
      announceList: [
        ['udp://tracker.opentrackr.org:1337'],
        ['udp://tracker.leechers-paradise.org:6969'],
        ['udp://tracker.coppersurfer.tk:6969']
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
      resolve(torrent);
    });
  });
}

// Seed a torrent and return its magnet link
export function seedTorrent(torrentBuffer) {
  return new Promise((resolve, reject) => {
    client.seed(torrentBuffer, (torrent) => {
      console.log('Client is seeding:', torrent.magnetURI);
      resolve(torrent.magnetURI);
    }).on('error', reject);
  });
} 