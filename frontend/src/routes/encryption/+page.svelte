<script>
    import { onMount } from 'svelte';
    
    let selectedFile = null;
    let smimeEncryptedFile = null;
    let aesEncryptedFile = null;
    let decryptedAESFile = null;
    let finalDecryptedFile = null;
    
    let loading = false;
    let error = null;
    let success = null;
    
    let publicKeys = null;
    let currentStep = 1;
    
    const API_BASE = 'http://localhost:3002';
    
    onMount(async () => {
        await fetchPublicKeys();
    });
    
    async function fetchPublicKeys() {
        try {
            const response = await fetch(`${API_BASE}/keys`);
            publicKeys = await response.json();
        } catch (err) {
            error = 'Failed to fetch public keys';
        }
    }
    
    function handleFileSelect(event) {
        selectedFile = event.target.files[0];
        resetState();
    }
    
    function resetState() {
        smimeEncryptedFile = null;
        aesEncryptedFile = null;
        decryptedAESFile = null;
        finalDecryptedFile = null;
        currentStep = 1;
        error = null;
        success = null;
    }
    
    // Trigger file input click
    function triggerFileSelect() {
        document.getElementById('file-input').click();
    }
    
    async function encryptWithSMIME() {
        if (!selectedFile) {
            error = 'Please select a file first';
            return;
        }
        
        loading = true;
        error = null;
        
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            
            const response = await fetch(`${API_BASE}/encrypt/smime`, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok) {
                smimeEncryptedFile = result;
                currentStep = 2;
                success = 'File encrypted with S/MIME successfully!';
            } else {
                error = result.error;
            }
        } catch (err) {
            error = 'Failed to encrypt with S/MIME';
        } finally {
            loading = false;
        }
    }
    
    async function encryptWithAES() {
        if (!smimeEncryptedFile) {
            error = 'No S/MIME encrypted file available';
            return;
        }
        
        loading = true;
        error = null;
        
        try {
            // Download the S/MIME encrypted file
            const fileResponse = await fetch(`${API_BASE}/download/${smimeEncryptedFile.encryptedFile}`);
            const fileBlob = await fileResponse.blob();
            
            const formData = new FormData();
            formData.append('file', fileBlob, smimeEncryptedFile.encryptedFile);
            
            const response = await fetch(`${API_BASE}/encrypt/aes`, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok) {
                aesEncryptedFile = result;
                currentStep = 3;
                success = 'File encrypted with AES successfully!';
            } else {
                error = result.error;
            }
        } catch (err) {
            error = 'Failed to encrypt with AES';
        } finally {
            loading = false;
        }
    }
    
    async function decryptAES() {
        if (!aesEncryptedFile) {
            error = 'No AES encrypted file available';
            return;
        }
        
        loading = true;
        error = null;
        
        try {
            // Download the AES encrypted file
            const fileResponse = await fetch(`${API_BASE}/download/${aesEncryptedFile.encryptedFile}`);
            const fileBlob = await fileResponse.blob();
            
            const formData = new FormData();
            formData.append('file', fileBlob, aesEncryptedFile.encryptedFile);
            
            const response = await fetch(`${API_BASE}/decrypt/aes`, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok) {
                decryptedAESFile = result;
                currentStep = 4;
                success = 'File decrypted from AES successfully!';
            } else {
                error = result.error;
            }
        } catch (err) {
            error = 'Failed to decrypt AES';
        } finally {
            loading = false;
        }
    }
    
    async function decryptSMIME() {
        if (!decryptedAESFile) {
            error = 'No AES decrypted file available';
            return;
        }
        
        loading = true;
        error = null;
        
        try {
            // Download the AES decrypted file (S/MIME encrypted)
            const fileResponse = await fetch(`${API_BASE}/download/${decryptedAESFile.decryptedFile}`);
            const fileBlob = await fileResponse.blob();
            
            const formData = new FormData();
            formData.append('file', fileBlob, decryptedAESFile.decryptedFile);
            
            const response = await fetch(`${API_BASE}/decrypt/smime`, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok) {
                finalDecryptedFile = result;
                currentStep = 5;
                success = 'File fully decrypted successfully!';
            } else {
                error = result.error;
            }
        } catch (err) {
            error = 'Failed to decrypt S/MIME';
        } finally {
            loading = false;
        }
    }
    
    async function downloadFile(filename) {
        try {
            const response = await fetch(`${API_BASE}/download/${filename}`);
            const blob = await response.blob();
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            error = 'Failed to download file';
        }
    }
    
    function isImageFile(filename) {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
    }
    
    function getImageUrl(filename) {
        return `${API_BASE}/download/${filename}`;
    }
</script>

<svelte:head>
    <title>TrueTorrent Encryption</title>
</svelte:head>

<div class="container">
    <h1>🔐 TrueTorrent Encryption</h1>
    
    <div class="upload-section">
        <h2>Step 1: Select File</h2>
        
        <!-- Hidden file input -->
        <input 
            id="file-input"
            type="file" 
            on:change={handleFileSelect}
            accept="*/*"
            class="file-input-hidden"
        />
        
        <!-- Custom upload button -->
        <div class="file-upload-area" on:click={triggerFileSelect}>
            <div class="upload-icon">📁</div>
            <div class="upload-text">
                <h3>Click to Select File</h3>
                <p>Choose any file to encrypt and decrypt</p>
                <p class="file-hint">Images will show preview • Max 50MB</p>
            </div>
        </div>
        
        {#if selectedFile}
            <div class="file-info">
                <div class="file-details">
                    <p><strong>📄 Selected:</strong> {selectedFile.name}</p>
                    <p><strong>📊 Size:</strong> {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    <p><strong>📋 Type:</strong> {selectedFile.type || 'Unknown'}</p>
                </div>
                
                {#if isImageFile(selectedFile.name)}
                    <div class="image-preview">
                        <h4>Original Image Preview:</h4>
                        <img src={URL.createObjectURL(selectedFile)} alt="Original" class="preview-image" />
                    </div>
                {/if}
                
                <button on:click={triggerFileSelect} class="btn secondary">
                    🔄 Change File
                </button>
            </div>
        {/if}
    </div>
    
    {#if error}
        <div class="alert error">
            <p>❌ {error}</p>
        </div>
    {/if}
    
    {#if success}
        <div class="alert success">
            <p>✅ {success}</p>
        </div>
    {/if}
    
    <div class="encryption-pipeline">
        <!-- Step 2: S/MIME Encryption -->
        <div class="step" class:active={currentStep >= 2} class:completed={currentStep > 2}>
            <h3>Step 2: S/MIME Encryption</h3>
            <button 
                on:click={encryptWithSMIME}
                disabled={!selectedFile || loading || currentStep > 2}
                class="btn primary"
            >
                {loading && currentStep === 2 ? 'Encrypting...' : 'Encrypt with S/MIME'}
            </button>
            
            {#if smimeEncryptedFile}
                <div class="result">
                    <p><strong>Encrypted File:</strong> {smimeEncryptedFile.encryptedFile}</p>
                    <button on:click={() => downloadFile(smimeEncryptedFile.encryptedFile)} class="btn secondary">
                        Download S/MIME Encrypted File
                    </button>
                </div>
            {/if}
        </div>
        
        <!-- Step 3: AES Encryption -->
        <div class="step" class:active={currentStep >= 3} class:completed={currentStep > 3}>
            <h3>Step 3: AES Encryption</h3>
            <button 
                on:click={encryptWithAES}
                disabled={!smimeEncryptedFile || loading || currentStep > 3}
                class="btn primary"
            >
                {loading && currentStep === 3 ? 'Encrypting...' : 'Encrypt with AES'}
            </button>
            
            {#if aesEncryptedFile}
                <div class="result">
                    <p><strong>Double Encrypted File:</strong> {aesEncryptedFile.encryptedFile}</p>
                    <button on:click={() => downloadFile(aesEncryptedFile.encryptedFile)} class="btn secondary">
                        Download AES Encrypted File
                    </button>
                </div>
            {/if}
        </div>
        
        <!-- Step 4: AES Decryption -->
        <div class="step" class:active={currentStep >= 4} class:completed={currentStep > 4}>
            <h3>Step 4: AES Decryption</h3>
            <button 
                on:click={decryptAES}
                disabled={!aesEncryptedFile || loading || currentStep > 4}
                class="btn warning"
            >
                {loading && currentStep === 4 ? 'Decrypting...' : 'Decrypt AES Layer'}
            </button>
            
            {#if decryptedAESFile}
                <div class="result">
                    <p><strong>AES Decrypted File:</strong> {decryptedAESFile.decryptedFile}</p>
                    <button on:click={() => downloadFile(decryptedAESFile.decryptedFile)} class="btn secondary">
                        Download AES Decrypted File
                    </button>
                </div>
            {/if}
        </div>
        
        <!-- Step 5: S/MIME Decryption -->
        <div class="step" class:active={currentStep >= 5}>
            <h3>Step 5: S/MIME Decryption</h3>
            <button 
                on:click={decryptSMIME}
                disabled={!decryptedAESFile || loading}
                class="btn warning"
            >
                {loading && currentStep === 5 ? 'Decrypting...' : 'Decrypt S/MIME Layer'}
            </button>
            
            {#if finalDecryptedFile}
                <div class="result">
                    <p><strong>Fully Decrypted File:</strong> {finalDecryptedFile.decryptedFile}</p>
                    <div class="final-result">
                        <button on:click={() => downloadFile(finalDecryptedFile.decryptedFile)} class="btn success">
                            Download Original File
                        </button>
                        
                        {#if selectedFile && isImageFile(selectedFile.name)}
                            <div class="image-comparison">
                                <h4>Decrypted Image:</h4>
                                <img src={getImageUrl(finalDecryptedFile.decryptedFile)} alt="Decrypted" class="preview-image" />
                                <p class="comparison-note">Compare with the original image above to verify integrity!</p>
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
    </div>
    
    <!-- Public Keys Display -->
    {#if publicKeys}
        <div class="keys-section">
            <h3>🔑 Public Keys Information</h3>
            <div class="keys-grid">
                <div class="key-item">
                    <h4>S/MIME Certificate</h4>
                    <textarea readonly class="key-display">{publicKeys.smimeCertificate}</textarea>
                </div>
                <div class="key-item">
                    <h4>RSA Public Key</h4>
                    <textarea readonly class="key-display">{publicKeys.rsaPublicKey}</textarea>
                </div>
            </div>
        </div>
    {/if}
    
    <div class="reset-section">
        <button on:click={resetState} class="btn secondary">
            🔄 Reset All
        </button>
    </div>
</div>

<style>
    .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    h1 {
        text-align: center;
        color: #2c3e50;
        margin-bottom: 30px;
    }
    
    .upload-section {
        background: #f8f9fa;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
    }
    
    .file-input-hidden {
        display: none;
    }
    
    .file-upload-area {
        border: 3px dashed #007bff;
        border-radius: 8px;
        padding: 40px 20px;
        text-align: center;
        background: #ffffff;
        cursor: pointer;
        transition: all 0.3s ease;
    }
    
    .file-upload-area:hover {
        border-color: #0056b3;
        background: #f0f8ff;
        transform: translateY(-2px);
    }
    
    .upload-icon {
        font-size: 48px;
        margin-bottom: 15px;
    }
    
    .upload-text h3 {
        margin: 0 0 10px 0;
        color: #007bff;
        font-size: 24px;
    }
    
    .upload-text p {
        margin: 5px 0;
        color: #6c757d;
    }
    
    .file-hint {
        font-size: 12px;
        color: #adb5bd;
    }
    
    .file-info {
        margin-top: 20px;
        padding: 20px;
        background: white;
        border-radius: 8px;
        border: 2px solid #28a745;
    }
    
    .file-details {
        margin-bottom: 15px;
    }
    
    .file-details p {
        margin: 8px 0;
        font-size: 14px;
    }
    
    .image-preview {
        margin: 20px 0;
        text-align: center;
    }
    
    .image-preview h4 {
        margin-bottom: 15px;
        color: #495057;
    }
    
    .preview-image {
        max-width: 400px;
        max-height: 300px;
        border-radius: 8px;
        border: 1px solid #ddd;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    
    .encryption-pipeline {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }
    
    .step {
        padding: 20px;
        border: 2px solid #e9ecef;
        border-radius: 8px;
        background: #ffffff;
        transition: all 0.3s ease;
    }
    
    .step.active {
        border-color: #007bff;
        background: #f0f8ff;
    }
    
    .step.completed {
        border-color: #28a745;
        background: #f0fff0;
    }
    
    .btn {
        padding: 12px 24px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        transition: all 0.2s;
        margin-right: 10px;
        margin-bottom: 10px;
    }
    
    .btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
    
    .btn.primary {
        background: #007bff;
        color: white;
    }
    
    .btn.primary:hover:not(:disabled) {
        background: #0056b3;
    }
    
    .btn.secondary {
        background: #6c757d;
        color: white;
    }
    
    .btn.secondary:hover:not(:disabled) {
        background: #545b62;
    }
    
    .btn.warning {
        background: #ffc107;
        color: #212529;
    }
    
    .btn.warning:hover:not(:disabled) {
        background: #e0a800;
    }
    
    .btn.success {
        background: #28a745;
        color: white;
    }
    
    .btn.success:hover:not(:disabled) {
        background: #1e7e34;
    }
    
    .result {
        margin-top: 15px;
        padding: 15px;
        background: #e9f7ef;
        border-radius: 4px;
        border-left: 4px solid #28a745;
    }
    
    .final-result {
        margin-top: 15px;
    }
    
    .image-comparison {
        margin-top: 20px;
        padding: 15px;
        background: #fff3cd;
        border-radius: 4px;
        text-align: center;
    }
    
    .comparison-note {
        margin-top: 10px;
        font-style: italic;
        color: #856404;
    }
    
    .alert {
        padding: 15px;
        border-radius: 4px;
        margin: 15px 0;
    }
    
    .alert.error {
        background: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
    }
    
    .alert.success {
        background: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
    }
    
    .keys-section {
        margin-top: 40px;
        padding: 20px;
        background: #f8f9fa;
        border-radius: 8px;
    }
    
    .keys-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-top: 15px;
    }
    
    .key-item h4 {
        margin: 0 0 10px 0;
        color: #495057;
    }
    
    .key-display {
        width: 100%;
        height: 150px;
        font-family: monospace;
        font-size: 12px;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        resize: vertical;
    }
    
    .reset-section {
        text-align: center;
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid #dee2e6;
    }
    
    @media (max-width: 768px) {
        .keys-grid {
            grid-template-columns: 1fr;
        }
        
        .preview-image {
            max-width: 100%;
        }
        
        .upload-text h3 {
            font-size: 20px;
        }
        
        .upload-icon {
            font-size: 36px;
        }
    }
</style>