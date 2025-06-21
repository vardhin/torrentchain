const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs').promises;
const forge = require('node-forge');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

// Configure multer for file uploads
const upload = multer({ 
    dest: 'uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Generate S/MIME certificate and key pair
function generateSMIMEKeyPair() {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    
    const attrs = [{
        name: 'commonName',
        value: 'TrueTorrent'
    }, {
        name: 'organizationName',
        value: 'TrueTorrent Inc.'
    }];
    
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey);
    
    return {
        certificate: forge.pki.certificateToPem(cert),
        privateKey: forge.pki.privateKeyToPem(keys.privateKey),
        publicKey: forge.pki.publicKeyToPem(keys.publicKey)
    };
}

// Generate AES key and RSA key pair for asymmetric encryption
function generateAESKeyPair() {
    const aesKey = crypto.randomBytes(32); // 256-bit key
    const iv = crypto.randomBytes(16); // 128-bit IV
    
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });
    
    return {
        aesKey,
        iv,
        rsaPublicKey: publicKey,
        rsaPrivateKey: privateKey
    };
}

// Initialize key pairs
const smimeKeys = generateSMIMEKeyPair();
const aesKeys = generateAESKeyPair();

// S/MIME Encryption
function encryptWithSMIME(data, certificate) {
    try {
        const cert = forge.pki.certificateFromPem(certificate);
        const p7 = forge.pkcs7.createEnvelopedData();
        
        p7.addRecipient(cert);
        p7.content = forge.util.createBuffer(data);
        p7.encrypt();
        
        return forge.pkcs7.messageToPem(p7);
    } catch (error) {
        throw new Error(`S/MIME encryption failed: ${error.message}`);
    }
}

// S/MIME Decryption
function decryptWithSMIME(encryptedData, privateKey) {
    try {
        const p7 = forge.pkcs7.messageFromPem(encryptedData);
        const key = forge.pki.privateKeyFromPem(privateKey);
        
        p7.decrypt(p7.recipients[0], key);
        return p7.content.getBytes();
    } catch (error) {
        throw new Error(`S/MIME decryption failed: ${error.message}`);
    }
}

// AES Encryption with RSA-encrypted key
function encryptWithAES(data, aesKey, iv, rsaPublicKey) {
    try {
        // Encrypt data with AES
        const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
        
        let encrypted = cipher.update(data, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        // Encrypt AES key with RSA
        const encryptedAESKey = crypto.publicEncrypt(rsaPublicKey, aesKey);
        const encryptedIV = crypto.publicEncrypt(rsaPublicKey, iv);
        
        return {
            encryptedData: encrypted,
            encryptedKey: encryptedAESKey.toString('base64'),
            encryptedIV: encryptedIV.toString('base64')
        };
    } catch (error) {
        throw new Error(`AES encryption failed: ${error.message}`);
    }
}

// AES Decryption with RSA-decrypted key
function decryptWithAES(encryptedPackage, rsaPrivateKey) {
    try {
        // Decrypt AES key and IV with RSA
        const aesKey = crypto.privateDecrypt(rsaPrivateKey, Buffer.from(encryptedPackage.encryptedKey, 'base64'));
        const iv = crypto.privateDecrypt(rsaPrivateKey, Buffer.from(encryptedPackage.encryptedIV, 'base64'));
        
        // Decrypt data with AES
        const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
        
        let decrypted = decipher.update(encryptedPackage.encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        throw new Error(`AES decryption failed: ${error.message}`);
    }
}

// Routes

// Get public keys
app.get('/keys', (req, res) => {
    res.json({
        smimeCertificate: smimeKeys.certificate,
        smimePublicKey: smimeKeys.publicKey,
        rsaPublicKey: aesKeys.rsaPublicKey
    });
});

// Upload and encrypt file with S/MIME
app.post('/encrypt/smime', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const fileContent = await fs.readFile(req.file.path);
        const encryptedContent = encryptWithSMIME(fileContent.toString('base64'), smimeKeys.certificate);
        
        const outputPath = `encrypted_smime_${Date.now()}.pem`;
        await fs.writeFile(path.join('uploads', outputPath), encryptedContent);
        
        // Clean up original file
        await fs.unlink(req.file.path);
        
        res.json({
            message: 'File encrypted with S/MIME successfully',
            encryptedFile: outputPath,
            originalName: req.file.originalname
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Further encrypt S/MIME encrypted file with AES
app.post('/encrypt/aes', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const fileContent = await fs.readFile(req.file.path, 'utf8');
        const encryptedPackage = encryptWithAES(fileContent, aesKeys.aesKey, aesKeys.iv, aesKeys.rsaPublicKey);
        
        const outputPath = `encrypted_aes_${Date.now()}.json`;
        await fs.writeFile(path.join('uploads', outputPath), JSON.stringify(encryptedPackage, null, 2));
        
        // Clean up original file
        await fs.unlink(req.file.path);
        
        res.json({
            message: 'File encrypted with AES successfully',
            encryptedFile: outputPath,
            originalName: req.file.originalname
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Decrypt S/MIME encrypted file
app.post('/decrypt/smime', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No encrypted file uploaded' });
        }
        
        const encryptedContent = await fs.readFile(req.file.path, 'utf8');
        const decryptedContent = decryptWithSMIME(encryptedContent, smimeKeys.privateKey);
        
        const outputPath = `decrypted_smime_${Date.now()}.bin`;
        const decodedContent = Buffer.from(decryptedContent, 'base64');
        await fs.writeFile(path.join('uploads', outputPath), decodedContent);
        
        // Clean up encrypted file
        await fs.unlink(req.file.path);
        
        res.json({
            message: 'File decrypted from S/MIME successfully',
            decryptedFile: outputPath,
            originalName: req.file.originalname
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Decrypt AES encrypted file
app.post('/decrypt/aes', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No encrypted file uploaded' });
        }
        
        const encryptedPackage = JSON.parse(await fs.readFile(req.file.path, 'utf8'));
        const decryptedContent = decryptWithAES(encryptedPackage, aesKeys.rsaPrivateKey);
        
        const outputPath = `decrypted_aes_${Date.now()}.pem`;
        await fs.writeFile(path.join('uploads', outputPath), decryptedContent);
        
        // Clean up encrypted file
        await fs.unlink(req.file.path);
        
        res.json({
            message: 'File decrypted from AES successfully',
            decryptedFile: outputPath,
            originalName: req.file.originalname
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Download decrypted/encrypted files
app.get('/download/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join('uploads', filename);
        
        // Check if file exists
        await fs.access(filePath);
        
        res.download(filePath, filename, (err) => {
            if (err) {
                res.status(500).json({ error: 'Error downloading file' });
            }
        });
    } catch (error) {
        res.status(404).json({ error: 'File not found' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large' });
        }
    }
    res.status(500).json({ error: 'Internal server error' });
});

// Create uploads directory if it doesn't exist
fs.mkdir('uploads', { recursive: true }).catch(console.error);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Encryption endpoints available:`);
    console.log(`- POST /encrypt/smime - S/MIME encryption`);
    console.log(`- POST /encrypt/aes - AES encryption`);
    console.log(`- POST /decrypt/smime - S/MIME decryption`);
    console.log(`- POST /decrypt/aes - AES decryption`);
    console.log(`- GET /keys - Get public keys`);
    console.log(`- GET /download/:filename - Download files`);
});

module.exports = app;