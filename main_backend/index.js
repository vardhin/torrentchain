const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createTorrent, seedTorrent, initWebTorrent } = require('./torrentService.js');

const app = express();
const port = 3000;

// Server configurations
const IPFS_SERVER_URL = 'http://localhost:8081';
const BLOCKCHAIN_SERVER_URL = 'http://localhost:3001';

// Middleware
app.use(express.json());

// Add CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

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
    console.log(`[PROXY] Starting request to IPFS server`);
    console.log(`[PROXY] URL: ${IPFS_SERVER_URL}${endpoint}`);
    console.log(`[PROXY] Method: ${method}`);
    console.log(`[PROXY] Body:`, body);
    
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        
        if (body) {
            options.body = JSON.stringify(body);
            console.log(`[PROXY] Serialized body:`, options.body);
        }

        console.log(`[PROXY] Making fetch request with options:`, options);
        const response = await fetch(`${IPFS_SERVER_URL}${endpoint}`, options);
        
        console.log(`[PROXY] Response status: ${response.status}`);
        console.log(`[PROXY] Response ok: ${response.ok}`);
        console.log(`[PROXY] Response headers:`, Object.fromEntries(response.headers.entries()));
        
        // Handle different content types
        const contentType = response.headers.get('content-type');
        console.log(`[PROXY] Content-Type: ${contentType}`);
        
        let data;
        
        if (contentType && contentType.includes('application/json')) {
            console.log(`[PROXY] Parsing as JSON`);
            data = await response.json();
        } else {
            console.log(`[PROXY] Reading as text first`);
            const textData = await response.text();
            console.log(`[PROXY] Raw text data:`, textData);
            
            // Try to parse as JSON, fallback to text
            try {
                data = JSON.parse(textData);
                console.log(`[PROXY] Successfully parsed text as JSON`);
            } catch (parseError) {
                console.log(`[PROXY] Failed to parse as JSON, using text:`, parseError.message);
                data = textData;
            }
        }
        
        console.log(`[PROXY] Final parsed data:`, data);
        
        const result = {
            status: response.status,
            data: data,
            ok: response.ok
        };
        
        console.log(`[PROXY] Returning result:`, result);
        return result;
    } catch (error) {
        console.error(`[PROXY] Error proxying to IPFS server (${endpoint}):`, error);
        console.error(`[PROXY] Error stack:`, error.stack);
        return {
            status: 500,
            data: { error: error.message },
            ok: false
        };
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
        const torrentData = await createTorrent(filePath);
        
        console.log('Starting to seed the torrent...');
        const magnetLink = await seedTorrent(torrentData);

        console.log('Torrent created and seeding started');
        console.log('Magnet Link:', magnetLink);

        // Extract infoHash from torrent data or magnet link
        let infoHash = '';
        if (torrentData && torrentData.infoHash) {
            infoHash = torrentData.infoHash;
        } else {
            // Extract from magnet link as fallback
            const match = magnetLink.match(/xt=urn:btih:([a-fA-F0-9]+)/);
            if (match) {
                infoHash = match[1];
            }
        }

        res.json({ 
            success: true, 
            originalName: req.file.originalname,
            infoHash: infoHash,
            magnetLink: magnetLink,
            message: 'File successfully converted to torrent and being seeded'
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to create torrent' });
    }
});

// IPFS proxy endpoints
// Get all tables - Enhanced with better error handling
app.get('/ipfs/tables', async (req, res) => {
    console.log(`[ENDPOINT] GET /ipfs/tables called`);
    try {
        console.log(`[ENDPOINT] Calling proxyToIPFS for /tables`);
        const result = await proxyToIPFS('/tables');
        console.log(`[ENDPOINT] ProxyToIPFS result:`, result);
        
        if (!result.ok) {
            console.log(`[ENDPOINT] IPFS server returned error, status: ${result.status}`);
            // If IPFS server is down, return empty array instead of error
            if (result.status >= 500) {
                console.log(`[ENDPOINT] IPFS server appears down, returning empty array`);
                return res.status(200).json([]);
            }
            return res.status(result.status).json({ 
                error: 'IPFS server error', 
                details: result.data 
            });
        }
        
        // Handle the response structure - extract tables array from the response
        let tables = [];
        if (result.data && result.data.tables && Array.isArray(result.data.tables)) {
            tables = result.data.tables;
        } else if (Array.isArray(result.data)) {
            tables = result.data;
        }
        
        // Normalize table structure to include required fields for frontend
        const normalizedTables = tables.map(table => ({
            id: table.id || table.name || 'unknown',
            name: table.name || 'Untitled',
            description: table.description || (table.status ? `Status: ${table.status}` : 'No description available'),
            data: table.data || '',
            createdAt: table.createdAt || table.created_at || new Date().toISOString(),
            updatedAt: table.updatedAt || table.updated_at || new Date().toISOString(),
            status: table.status || 'unknown',
            ipns_name: table.ipns_name || null,
            ...table
        }));
        
        console.log(`[ENDPOINT] Extracted and normalized tables array:`, normalizedTables);
        console.log(`[ENDPOINT] Sending successful response with ${normalizedTables.length} tables`);
        res.status(200).json(normalizedTables);
    } catch (error) {
        console.error('[ENDPOINT] Error fetching tables:', error);
        console.error('[ENDPOINT] Error stack:', error.stack);
        // Return empty array instead of error to prevent frontend crash
        res.status(200).json([]);
    }
});

// Create a new table
app.post('/ipfs/tables', async (req, res) => {
    console.log(`[ENDPOINT] POST /ipfs/tables called`);
    console.log(`[ENDPOINT] Request body:`, req.body);
    
    try {
        // Validate required fields
        if (!req.body.name) {
            return res.status(400).json({ error: 'Table name is required' });
        }

        // Prepare the request body for the Go server
        const tableData = {
            name: req.body.name,
            description: req.body.description || '',
            data: req.body.data || '[]'
        };

        console.log('[ENDPOINT] Creating table with data:', tableData);
        const result = await proxyToIPFS('/tables', 'POST', tableData);
        console.log(`[ENDPOINT] ProxyToIPFS result:`, result);
        
        if (!result.ok) {
            console.log(`[ENDPOINT] IPFS server returned error, status: ${result.status}`);
            return res.status(result.status).json({ 
                error: 'IPFS server error', 
                details: result.data 
            });
        }
        
        // Normalize the response to match frontend expectations
        const normalizedResponse = {
            id: result.data.id || result.data.name,
            name: result.data.name,
            description: result.data.description,
            data: result.data.data || '',
            createdAt: result.data.createdAt || new Date().toISOString(),
            updatedAt: result.data.updatedAt || new Date().toISOString(),
            ipns_name: result.data.ipns_name,
            hash: result.data.hash,
            status: result.data.status || 'created',
            success: result.data.success || true
        };
        
        console.log(`[ENDPOINT] Sending successful response with data:`, normalizedResponse);
        res.status(result.status).json(normalizedResponse);
    } catch (error) {
        console.error('[ENDPOINT] Error creating table:', error);
        console.error('[ENDPOINT] Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to create table on IPFS server' });
    }
});

// Get a specific table
app.get('/ipfs/tables/:id', async (req, res) => {
    console.log(`[ENDPOINT] GET /ipfs/tables/${req.params.id} called`);
    
    try {
        console.log(`[ENDPOINT] Calling proxyToIPFS for /tables/${req.params.id}`);
        const result = await proxyToIPFS(`/tables/${req.params.id}`);
        console.log(`[ENDPOINT] ProxyToIPFS result:`, result);
        
        if (!result.ok) {
            console.log(`[ENDPOINT] IPFS server returned error, status: ${result.status}`);
            return res.status(result.status).json({ 
                error: 'IPFS server error', 
                details: result.data 
            });
        }
        
        // Normalize the response
        const normalizedTable = {
            id: result.data.id || req.params.id,
            name: result.data.name || 'Untitled',
            description: result.data.description || 'No description available',
            data: result.data.data || '',
            createdAt: result.data.createdAt || new Date().toISOString(),
            updatedAt: result.data.updatedAt || new Date().toISOString(),
            ipns_name: result.data.ipns_name,
            status: result.data.status || 'active',
            ...result.data
        };
        
        console.log(`[ENDPOINT] Sending successful response with data:`, normalizedTable);
        res.status(result.status).json(normalizedTable);
    } catch (error) {
        console.error('[ENDPOINT] Error fetching table:', error);
        console.error('[ENDPOINT] Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to fetch table from IPFS server' });
    }
});

// Update a table
app.put('/ipfs/tables/:id', async (req, res) => {
    console.log(`[ENDPOINT] PUT /ipfs/tables/${req.params.id} called`);
    console.log(`[ENDPOINT] Request body:`, req.body);
    
    try {
        // Prepare the request body for the Go server
        const updateData = {
            name: req.body.name || '',
            description: req.body.description || '',
            data: req.body.data || ''
        };

        console.log('[ENDPOINT] Updating table with data:', updateData);
        const result = await proxyToIPFS(`/tables/${req.params.id}`, 'PUT', updateData);
        console.log(`[ENDPOINT] ProxyToIPFS result:`, result);
        
        if (!result.ok) {
            console.log(`[ENDPOINT] IPFS server returned error, status: ${result.status}`);
            return res.status(result.status).json({ 
                error: 'IPFS server error', 
                details: result.data 
            });
        }
        
        // Normalize the response
        const normalizedResponse = {
            success: result.data.success || true,
            message: result.data.message || 'Table updated successfully',
            id: result.data.id || req.params.id,
            name: result.data.name,
            description: result.data.description,
            data: result.data.data || '',
            updatedAt: result.data.updatedAt || new Date().toISOString(),
            ...result.data
        };
        
        console.log(`[ENDPOINT] Sending successful response with data:`, normalizedResponse);
        res.status(result.status).json(normalizedResponse);
    } catch (error) {
        console.error('[ENDPOINT] Error updating table:', error);
        console.error('[ENDPOINT] Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to update table on IPFS server' });
    }
});

// Delete a table
app.delete('/ipfs/tables/:id', async (req, res) => {
    console.log(`[ENDPOINT] DELETE /ipfs/tables/${req.params.id} called`);
    
    try {
        const result = await proxyToIPFS(`/tables/${req.params.id}`, 'DELETE');
        console.log(`[ENDPOINT] ProxyToIPFS result:`, result);
        
        if (!result.ok) {
            console.log(`[ENDPOINT] IPFS server returned error, status: ${result.status}`);
            return res.status(result.status).json({ 
                error: 'IPFS server error', 
                details: result.data 
            });
        }
        
        console.log(`[ENDPOINT] Sending successful response with data:`, result.data);
        res.status(result.status).json(result.data);
    } catch (error) {
        console.error('[ENDPOINT] Error deleting table:', error);
        console.error('[ENDPOINT] Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to delete table from IPFS server' });
    }
});

// Health check endpoint for IPFS server
app.get('/ipfs/health', async (req, res) => {
    console.log(`[HEALTH] Checking IPFS server health`);
    
    try {
        const result = await proxyToIPFS('/');
        console.log(`[HEALTH] IPFS health check result:`, result);
        
        res.status(result.status).json({ 
            ipfsServer: 'connected',
            message: result.data || 'IPFS server is running'
        });
    } catch (error) {
        console.error('[HEALTH] IPFS server health check failed:', error);
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

// Get active torrents info
app.get('/torrents/active', async (req, res) => {
    try {
        const webTorrentClient = await initWebTorrent();
        const torrents = webTorrentClient.torrents.map(torrent => ({
            infoHash: torrent.infoHash,
            name: torrent.name,
            magnetURI: torrent.magnetURI,
            numPeers: torrent.numPeers,
            downloaded: torrent.downloaded,
            uploaded: torrent.uploaded,
            downloadSpeed: torrent.downloadSpeed,
            uploadSpeed: torrent.uploadSpeed,
            progress: torrent.progress
        }));
        
        res.json({ torrents });
    } catch (error) {
        console.error('Error fetching active torrents:', error);
        res.status(500).json({ error: 'Failed to fetch active torrents' });
    }
});

// Add this new endpoint for appending to IPFS tables
app.post('/ipfs/tables/:id/append', async (req, res) => {
    console.log(`[ENDPOINT] POST /ipfs/tables/${req.params.id}/append called`);
    console.log(`[ENDPOINT] Request body:`, req.body);
    
    try {
        const result = await proxyToIPFS(`/tables/${req.params.id}/append`, 'POST', req.body);
        console.log(`[ENDPOINT] ProxyToIPFS result:`, result);
        
        if (!result.ok) {
            console.log(`[ENDPOINT] IPFS server returned error, status: ${result.status}`);
            return res.status(result.status).json({ 
                error: 'IPFS server error', 
                details: result.data 
            });
        }
        
        console.log(`[ENDPOINT] Sending successful response with data:`, result.data);
        res.status(result.status).json(result.data);
    } catch (error) {
        console.error('[ENDPOINT] Error appending to table:', error);
        console.error('[ENDPOINT] Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to append to table on IPFS server' });
    }
});

// Replace the existing create-torrent-with-versioning endpoint with this simplified version
app.post('/create-torrent-with-versioning', upload.single('file'), async (req, res) => {
    try {
        const { torrentName } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!torrentName || !torrentName.trim()) {
            return res.status(400).json({ error: 'Torrent name is required' });
        }

        console.log('Creating torrent with versioning for:', torrentName);

        // Create the torrent first
        const torrentPath = req.file.path;
        
        // Use the existing createTorrent function from torrentService
        const torrentData = await createTorrent(torrentPath);
        
        // Start seeding using the existing seedTorrent function
        const magnetLink = await seedTorrent(torrentData);

        // Extract infoHash from torrent data or magnet link
        let infoHash = '';
        if (torrentData && torrentData.infoHash) {
            infoHash = torrentData.infoHash;
        } else {
            // Extract from magnet link as fallback
            const match = magnetLink.match(/xt=urn:btih:([a-fA-F0-9]+)/);
            if (match) {
                infoHash = match[1];
            }
        }

        // Create the new version entry
        const versionEntry = {
            hash: infoHash,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            magnetLink: magnetLink,
            createdAt: new Date().toISOString(),
            version: 1 // Will be updated automatically by the Go server
        };

        console.log('Created version entry:', versionEntry);

        // Use table name as ID (same as Go server logic)
        const tableId = torrentName.trim();
        
        try {
            // Try to append to existing table first
            console.log(`Attempting to append to existing table: ${tableId}`);
            const appendResult = await proxyToIPFS(`/tables/${tableId}/append`, 'POST', versionEntry);
            
            if (appendResult.ok) {
                console.log('Successfully appended to existing table');
                
                // Parse the response to get version info
                let totalVersions = 1;
                let currentVersion = 1;
                
                try {
                    if (appendResult.data && appendResult.data.data) {
                        const versions = JSON.parse(appendResult.data.data);
                        if (Array.isArray(versions)) {
                            totalVersions = versions.length;
                            currentVersion = versions[versions.length - 1]?.version || totalVersions;
                        }
                    }
                } catch (parseError) {
                    console.log('Could not parse version info from response:', parseError);
                }
                
                // Clean up uploaded file
                try {
                    if (fs.existsSync(torrentPath)) {
                        fs.unlinkSync(torrentPath);
                        console.log('Successfully cleaned up uploaded file:', torrentPath);
                    }
                } catch (cleanupError) {
                    console.error('Failed to clean up uploaded file:', cleanupError);
                }

                return res.json({
                    success: true,
                    infoHash: infoHash,
                    magnetLink: magnetLink,
                    originalName: req.file.originalname,
                    torrentName: torrentName.trim(),
                    version: currentVersion,
                    totalVersions: totalVersions,
                    message: `Added version ${currentVersion} to torrent "${torrentName}" (${totalVersions} total versions)`,
                    tableExists: true
                });
            } else if (appendResult.status === 404) {
                // Table doesn't exist, create it
                console.log('Table does not exist, creating new table');
                
                const createData = {
                    name: torrentName.trim(),
                    description: `Torrent versions for "${torrentName}" - Version 1`,
                    data: JSON.stringify([versionEntry], null, 2)
                };
                
                console.log('Creating new table with data:', createData);
                const createResult = await proxyToIPFS('/tables', 'POST', createData);

                if (createResult.ok) {
                    console.log('Successfully created new table');
                    
                    // Clean up uploaded file
                    try {
                        if (fs.existsSync(torrentPath)) {
                            fs.unlinkSync(torrentPath);
                            console.log('Successfully cleaned up uploaded file:', torrentPath);
                        }
                    } catch (cleanupError) {
                        console.error('Failed to clean up uploaded file:', cleanupError);
                    }

                    return res.json({
                        success: true,
                        infoHash: infoHash,
                        magnetLink: magnetLink,
                        originalName: req.file.originalname,
                        torrentName: torrentName.trim(),
                        version: 1,
                        totalVersions: 1,
                        message: `Created new torrent table "${torrentName}" with version 1`,
                        tableExists: false
                    });
                } else {
                    console.error('Failed to create new table:', createResult);
                    throw new Error('Failed to create new table');
                }
            } else {
                // Some other error occurred
                console.error('Unexpected error during append:', appendResult);
                throw new Error(`Failed to append to table: ${appendResult.data?.error || 'Unknown error'}`);
            }
        } catch (ipfsError) {
            console.error('IPFS operation failed:', ipfsError);
            throw new Error(`IPFS operation failed: ${ipfsError.message}`);
        }

    } catch (error) {
        console.error('Error creating torrent with versioning:', error);
        
        // Clean up uploaded file if it exists
        if (req.file && req.file.path) {
            try {
                if (fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                    console.log('Successfully cleaned up uploaded file after error:', req.file.path);
                }
            } catch (cleanupError) {
                console.error('Failed to clean up uploaded file:', cleanupError);
            }
        }
        
        res.status(500).json({ 
            error: 'Failed to create torrent with versioning',
            details: error.message 
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Main server is running on http://localhost:${port}`);
    console.log('Available endpoints:');
    console.log('  POST /create-torrent - Create and seed a torrent');
    console.log('  POST /create-torrent-with-versioning - Create torrent with versioning and IPFS table management');
    console.log('  GET  /ipfs/tables - Get all tables');
    console.log('  POST /ipfs/tables - Create a new table');
    console.log('  GET  /ipfs/tables/:id - Get a specific table');
    console.log('  PUT  /ipfs/tables/:id - Update a table');
    console.log('  DELETE /ipfs/tables/:id - Delete a table');
    console.log('  GET  /ipfs/health - Check IPFS server status');
    console.log('  GET  /blockchain/contract-address - Get contract address');
    console.log('  GET  /blockchain/health - Check blockchain server status');
    console.log('  GET  /health - Check all services status');
    console.log('  GET  /torrents/active - Get active torrents info');
    console.log('\nExample usage:');
    console.log('curl -X POST -F "file=@/path/to/your/file" http://localhost:3000/create-torrent');
    console.log('curl -X POST -F "file=@/path/to/your/file" -d "torrentName=MyTorrent" http://localhost:3000/create-torrent-with-versioning');
    console.log('curl -X GET http://localhost:3000/ipfs/tables');
    console.log('curl -X GET http://localhost:3000/blockchain/contract-address');
    console.log('curl -X GET http://localhost:3000/torrents/active');
    console.log('\nMake sure to update your blockchain server to run on port 3001');
});