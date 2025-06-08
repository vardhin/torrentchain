import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTorrent, seedTorrent } from './torrentService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Server configurations
const IPFS_SERVER_URL = 'http://localhost:8081';
const BLOCKCHAIN_SERVER_URL = 'http://localhost:3001'; // Assuming blockchain server runs on different port

// Middleware
app.use(express.json());

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
    cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Helper function to proxy requests to IPFS server
async function proxyToIPFS(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${IPFS_SERVER_URL}${endpoint}`, options);
        const data = await response.text();
        
        return {
            status: response.status,
            data: data ? JSON.parse(data) : null
        };
    } catch (error) {
        console.error(`Error proxying to IPFS server: ${error}`);
        throw error;
    }
}

// Helper function to proxy requests to Blockchain server
async function proxyToBlockchain(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${BLOCKCHAIN_SERVER_URL}${endpoint}`, options);
        const data = await response.text();
        
        return {
            status: response.status,
            data: data ? JSON.parse(data) : null
        };
    } catch (error) {
        console.error(`Error proxying to Blockchain server: ${error}`);
        throw error;
    }
}

// File upload and torrent creation endpoint
app.post('/create-torrent', upload.single('file'), async (req, res) => {
    try {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`Processing file: ${req.file.originalname}`);
    const filePath = req.file.path;
    
    console.log('Creating torrent...');
    const torrent = await createTorrent(filePath);
    
    console.log('Starting to seed the torrent...');
    const magnetLink = await seedTorrent(torrent);

    console.log('Torrent created and seeding started');
    console.log('Magnet Link:', magnetLink);

    res.json({ 
        success: true, 
        originalName: req.file.originalname,
        magnetLink,
        message: 'File successfully converted to torrent and being seeded'
    });
} catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to create torrent' });
    }
});

// IPFS proxy endpoints
// Get all tables
app.get('/ipfs/tables', async (req, res) => {
    try {
        const result = await proxyToIPFS('/tables');
        res.status(result.status).json(result.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tables from IPFS server' });
    }
});

// Create a new table
app.post('/ipfs/tables', async (req, res) => {
    try {
        const result = await proxyToIPFS('/tables', 'POST', req.body);
        res.status(result.status).json(result.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create table on IPFS server' });
    }
});

// Get a specific table
app.get('/ipfs/tables/:id', async (req, res) => {
    try {
        const result = await proxyToIPFS(`/tables/${req.params.id}`);
        res.status(result.status).json(result.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch table from IPFS server' });
    }
});

// Update a table
app.put('/ipfs/tables/:id', async (req, res) => {
    try {
        const result = await proxyToIPFS(`/tables/${req.params.id}`, 'PUT', req.body);
        res.status(result.status).json(result.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update table on IPFS server' });
    }
});

// Delete a table
app.delete('/ipfs/tables/:id', async (req, res) => {
    try {
        const result = await proxyToIPFS(`/tables/${req.params.id}`, 'DELETE');
        res.status(result.status).json(result.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete table from IPFS server' });
    }
});

// Health check endpoint for IPFS server
app.get('/ipfs/health', async (req, res) => {
    try {
        const result = await proxyToIPFS('/');
        res.status(result.status).json({ 
            ipfsServer: 'connected',
            message: result.data || 'IPFS server is running'
        });
    } catch (error) {
        res.status(503).json({ 
            ipfsServer: 'disconnected',
            error: 'Cannot connect to IPFS server'
        });
    }
});

// Blockchain proxy endpoints
// Get contract address
app.get('/blockchain/contract-address', async (req, res) => {
    try {
        const result = await proxyToBlockchain('/contract-address');
        res.status(result.status).json(result.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch contract address from blockchain server' });
    }
});

// Health check endpoint for blockchain server
app.get('/blockchain/health', async (req, res) => {
    try {
        const result = await proxyToBlockchain('/');
        res.status(result.status).json({ 
            blockchainServer: 'connected',
            message: 'Blockchain server is running'
        });
    } catch (error) {
        res.status(503).json({ 
            blockchainServer: 'disconnected',
            error: 'Cannot connect to blockchain server'
        });
    }
});

// Combined health check for all services
app.get('/health', async (req, res) => {
    const services = {
        mainServer: 'running',
        ipfsServer: 'unknown',
        blockchainServer: 'unknown'
    };

    // Check IPFS server
    try {
        await proxyToIPFS('/');
        services.ipfsServer = 'connected';
    } catch (error) {
        services.ipfsServer = 'disconnected';
    }

    // Check blockchain server
    try {
        await proxyToBlockchain('/contract-address');
        services.blockchainServer = 'connected';
    } catch (error) {
        services.blockchainServer = 'disconnected';
    }

    const allHealthy = Object.values(services).every(status => 
        status === 'running' || status === 'connected'
    );

    res.status(allHealthy ? 200 : 503).json({
        status: allHealthy ? 'healthy' : 'degraded',
        services
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Main server is running on http://localhost:${port}`);
    console.log('Available endpoints:');
    console.log('  POST /create-torrent - Create and seed a torrent');
    console.log('  GET  /ipfs/tables - Get all tables');
    console.log('  POST /ipfs/tables - Create a new table');
    console.log('  GET  /ipfs/tables/:id - Get a specific table');
    console.log('  PUT  /ipfs/tables/:id - Update a table');
    console.log('  DELETE /ipfs/tables/:id - Delete a table');
    console.log('  GET  /ipfs/health - Check IPFS server status');
    console.log('  GET  /blockchain/contract-address - Get contract address');
    console.log('  GET  /blockchain/health - Check blockchain server status');
    console.log('  GET  /health - Check all services status');
    console.log('\nExample usage:');
    console.log('curl -X POST -F "file=@/path/to/your/file" http://localhost:3000/create-torrent');
    console.log('curl -X GET http://localhost:3000/ipfs/tables');
    console.log('curl -X GET http://localhost:3000/blockchain/contract-address');
    console.log('\nMake sure to update your blockchain server to run on port 3001');
});