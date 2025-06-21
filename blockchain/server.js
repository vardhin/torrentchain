const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const Web3 = require('web3');

const app = express();

// Add CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

app.use(express.json());
app.use(express.static('public'));

// Initialize Web3 connection to Ganache
const web3 = new Web3('http://localhost:7545');

// Track connection status
let ganacheConnected = false;
let latestBlockNumber = null;

// Test connection
async function testGanacheConnection() {
    try {
        latestBlockNumber = await web3.eth.getBlockNumber();
        ganacheConnected = true;
        console.log('Connected to Ganache. Latest block:', latestBlockNumber);
        return true;
    } catch (error) {
        ganacheConnected = false;
        console.error('Failed to connect to Ganache:', error.message);
        console.log('Make sure Ganache is running on port 7545');
        return false;
    }
}

// Initial connection test
testGanacheConnection();

// Periodically check connection
setInterval(testGanacheConnection, 30000); // Check every 30 seconds

// Health check endpoint
app.get('/health', async (req, res) => {
    // Test current connection
    await testGanacheConnection();
    
    res.json({ 
        status: 'running',
        ganacheConnected: ganacheConnected,
        latestBlock: latestBlockNumber,
        timestamp: new Date().toISOString(),
        ganacheUrl: 'http://localhost:7545',
        services: {
            blockchainServer: ganacheConnected ? 'connected' : 'disconnected',
            web3: ganacheConnected ? 'connected' : 'disconnected',
            ganache: ganacheConnected ? 'connected' : 'disconnected'
        }
    });
});

// Middleware to check Ganache connection for blockchain operations
function requireGanache(req, res, next) {
    if (!ganacheConnected) {
        return res.status(503).json({ 
            error: 'Ganache not connected',
            message: 'Please ensure Ganache is running on port 7545'
        });
    }
    next();
}

// Endpoint to get contract address
app.get('/contract-address', requireGanache, async (req, res) => {
    try {
        const buildPath = path.join(__dirname, 'build', 'contracts', 'IPNSRegistry.json');
        
        // Check if contract file exists
        try {
            await fs.access(buildPath);
        } catch {
            throw new Error('Contract not found. Please deploy the smart contract first.');
        }
        
        const contractJson = JSON.parse(await fs.readFile(buildPath));
        
        // Use network ID 1337 (Ganache)
        const networkId = '1337';
        if (!contractJson.networks[networkId]) {
            throw new Error('Contract not deployed to network 1337 (Ganache). Please run truffle migrate.');
        }
        
        const address = contractJson.networks[networkId].address;
        if (!address) {
            throw new Error('Contract address not found for network 1337');
        }
        
        console.log('Serving contract address:', address, 'for network:', networkId);
        res.json({ 
            address, 
            networkId,
            ganacheConnected: ganacheConnected,
            latestBlock: latestBlockNumber
        });
    } catch (error) {
        console.error('Error reading contract address:', error);
        res.status(500).json({ error: error.message || 'Could not get contract address' });
    }
});

// Endpoint to get available accounts
app.get('/accounts', requireGanache, async (req, res) => {
    try {
        const accounts = await web3.eth.getAccounts();
        
        if (accounts.length === 0) {
            return res.status(404).json({ 
                error: 'No accounts found',
                message: 'Ganache might not be properly configured'
            });
        }
        
        const accountsWithBalance = await Promise.all(
            accounts.map(async (account) => {
                const balance = await web3.eth.getBalance(account);
                return {
                    address: account,
                    balance: web3.utils.fromWei(balance, 'ether'),
                    shortAddress: `${account.slice(0, 6)}...${account.slice(-4)}`
                };
            })
        );
        
        console.log(`Found ${accounts.length} accounts`);
        res.json({ 
            accounts: accountsWithBalance,
            ganacheConnected: ganacheConnected,
            totalAccounts: accounts.length
        });
    } catch (error) {
        console.error('Error fetching accounts:', error);
        res.status(500).json({ 
            error: 'Could not fetch accounts',
            message: error.message
        });
    }
});

// Endpoint to make a transaction
app.post('/transaction', requireGanache, async (req, res) => {
    try {
        const { fromAccount, toAccount, amount, reason, torrentInfo } = req.body;
        
        console.log('Transaction request:', { 
            fromAccount: fromAccount?.slice(0, 10) + '...', 
            toAccount: toAccount?.slice(0, 10) + '...', 
            amount, 
            reason 
        });
        
        if (!fromAccount || !toAccount || !amount) {
            return res.status(400).json({ error: 'Missing required fields: fromAccount, toAccount, amount' });
        }

        // Validate amount
        if (isNaN(amount) || parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        // Convert amount to Wei
        const amountWei = web3.utils.toWei(amount.toString(), 'ether');
        
        // Check sender balance
        const senderBalance = await web3.eth.getBalance(fromAccount);
        const senderBalanceEth = parseFloat(web3.utils.fromWei(senderBalance, 'ether'));
        
        if (senderBalanceEth < parseFloat(amount)) {
            return res.status(400).json({ 
                error: 'Insufficient balance',
                currentBalance: senderBalanceEth,
                requestedAmount: parseFloat(amount)
            });
        }
        
        // Get gas price
        const gasPrice = await web3.eth.getGasPrice();
        
        // Estimate gas
        const gasEstimate = await web3.eth.estimateGas({
            from: fromAccount,
            to: toAccount,
            value: amountWei
        });

        console.log('Gas estimate:', gasEstimate, 'Gas price:', gasPrice);

        // Send transaction
        const transaction = await web3.eth.sendTransaction({
            from: fromAccount,
            to: toAccount,
            value: amountWei,
            gas: gasEstimate,
            gasPrice: gasPrice
        });

        console.log('Transaction sent:', transaction.transactionHash);
        
        res.json({
            success: true,
            transactionHash: transaction.transactionHash,
            gasUsed: transaction.gasUsed,
            blockNumber: transaction.blockNumber,
            message: `Successfully sent ${amount} ETH to ${toAccount.slice(0, 6)}...${toAccount.slice(-4)}`,
            details: {
                from: fromAccount,
                to: toAccount,
                amount: amount,
                reason: reason,
                torrentInfo: torrentInfo,
                gasUsed: transaction.gasUsed,
                gasPrice: gasPrice
            }
        });
    } catch (error) {
        console.error('Transaction error:', error);
        res.status(500).json({ 
            error: 'Transaction failed', 
            message: error.message 
        });
    }
});

// Endpoint to get transaction history
app.get('/transactions/:address', requireGanache, async (req, res) => {
    try {
        const { address } = req.params;
        
        // Validate address
        if (!web3.utils.isAddress(address)) {
            return res.status(400).json({ error: 'Invalid Ethereum address' });
        }
        
        const latestBlock = await web3.eth.getBlockNumber();
        const transactions = [];
        
        console.log(`Fetching transactions for ${address}, latest block: ${latestBlock}`);
        
        // Get last 50 blocks to find transactions (increased for better history)
        const startBlock = Math.max(0, Number(latestBlock) - 50);
        
        for (let i = startBlock; i <= latestBlock; i++) {
            try {
                const block = await web3.eth.getBlock(i, true);
                if (block && block.transactions) {
                    block.transactions.forEach(tx => {
                        if (tx.from.toLowerCase() === address.toLowerCase() || 
                            tx.to?.toLowerCase() === address.toLowerCase()) {
                            transactions.push({
                                hash: tx.hash,
                                from: tx.from,
                                to: tx.to,
                                value: web3.utils.fromWei(tx.value, 'ether'),
                                blockNumber: tx.blockNumber,
                                gasUsed: tx.gas,
                                timestamp: block.timestamp,
                                blockHash: block.hash
                            });
                        }
                    });
                }
            } catch (blockError) {
                // Silently skip blocks that can't be fetched
                console.log(`Could not fetch block ${i}:`, blockError.message);
            }
        }
        
        console.log(`Found ${transactions.length} transactions for ${address}`);
        res.json({ 
            transactions: transactions.reverse(), // Most recent first
            address: address,
            blocksScanned: latestBlock - startBlock + 1,
            latestBlock: latestBlock
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ 
            error: 'Could not fetch transactions',
            message: error.message
        });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Blockchain server running on http://localhost:${PORT}`);
    console.log('1. Make sure Ganache is running on port 7545');
    console.log('2. Make sure you have MetaMask installed');
    console.log('3. Connect MetaMask to Ganache (http://localhost:7545)');
    console.log('');
    console.log('Available endpoints:');
    console.log('  GET  /health');
    console.log('  GET  /accounts');
    console.log('  GET  /contract-address');
    console.log('  POST /transaction');
    console.log('  GET  /transactions/:address');
    console.log('');
    console.log('Testing Ganache connection...');
    testGanacheConnection();
});