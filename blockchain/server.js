const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
app.use(express.static('public'));

// Endpoint to get contract address
app.get('/contract-address', async (req, res) => {
    try {
        const buildPath = path.join(__dirname, 'build', 'contracts', 'IPNSRegistry.json');
        const contractJson = JSON.parse(await fs.readFile(buildPath));
        
        // Use network ID 1337 (Ganache)
        const networkId = '1337';
        if (!contractJson.networks[networkId]) {
            throw new Error('Contract not deployed to network 1337 (Ganache)');
        }
        
        const address = contractJson.networks[networkId].address;
        if (!address) {
            throw new Error('Contract address not found for network 1337');
        }
        
        console.log('Serving contract address:', address, 'for network:', networkId);
        res.json({ address, networkId });
    } catch (error) {
        console.error('Error reading contract address:', error);
        res.status(500).json({ error: error.message || 'Could not get contract address' });
    }
});

const PORT = process.env.PORT || 3001; // Changed from 3000 to 3001
app.listen(PORT, () => {
    console.log(`Blockchain server running on http://localhost:${PORT}`);
    console.log('1. Make sure Ganache is running on port 7545');
    console.log('2. Make sure you have MetaMask installed');
    console.log('3. Connect MetaMask to Ganache (http://localhost:7545)');
});