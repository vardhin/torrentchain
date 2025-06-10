<script>
    import '../style.css';
    import { onMount } from 'svelte';
    import { writable } from 'svelte/store';
    import { 
        CheckCircle, 
        Upload, 
        Copy, 
        Plus, 
        Search, 
        X, 
        ArrowUpDown, 
        ArrowUp, 
        ArrowDown, 
        Grid3X3, 
        List, 
        Eye, 
        Edit, 
        Copy as Duplicate, 
        Download, 
        Trash2, 
        MoreVertical,
        AlertCircle,
        Info,
        Loader2,
        Activity,
        Users,
        Zap,
        HardDrive,
        RefreshCw,
        Tag
    } from 'lucide-svelte';

    // Stores
    const tables = writable([]);
    const services = writable({});
    const contractAddress = writable('');
    const activeTorrents = writable([]);
    
    // Component state
    let activeTab = 'torrent';
    let loading = false;
    let notification = { show: false, message: '', type: 'info' };
    
    // Torrent creation state
    let selectedFile = null;
    let torrentResult = null;
    let dragOver = false;
    let torrentName = ''; // New field for torrent name
    
    // Enhanced table management state
    let newTable = { name: '', description: '', data: '' };
    let editingTable = null;
    let showCreateModal = false;
    let showViewModal = false;
    let viewingTable = null;
    let searchQuery = '';
    let sortBy = 'name';
    let sortOrder = 'asc';
    let viewMode = 'grid'; // 'grid' or 'list'

    // Active torrents state
    let torrentsLoading = false;
    let autoRefresh = false;
    let refreshInterval;

    const API_BASE = 'http://localhost:3000';

    // Utility functions
    function showNotification(message, type = 'info') {
        notification = { show: true, message, type };
        setTimeout(() => notification.show = false, 5000);
    }

    function formatFileSize(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    function formatSpeed(bytesPerSecond) {
        if (bytesPerSecond === 0) return '0 B/s';
        const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        const i = Math.floor(Math.log(bytesPerSecond) / Math.log(1024));
        return Math.round(bytesPerSecond / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    function formatProgress(progress) {
        return (progress * 100).toFixed(1) + '%';
    }

    // API functions
    async function checkHealth() {
        try {
            const response = await fetch(`${API_BASE}/health`);
            const data = await response.json();
            services.set(data.services);
        } catch (error) {
            console.error('Health check failed:', error);
            showNotification('Failed to check service health', 'error');
        }
    }

    async function fetchContractAddress() {
        try {
            const response = await fetch(`${API_BASE}/blockchain/contract-address`);
            if (response.ok) {
                const data = await response.json();
                contractAddress.set(data.address || 'Not available');
            }
        } catch (error) {
            console.error('Failed to fetch contract address:', error);
        }
    }

    async function fetchTables() {
        try {
            loading = true;
            const response = await fetch(`${API_BASE}/ipfs/tables`);
            
            if (response.ok) {
                const data = await response.json();
                
                // Handle different response formats
                let tablesArray = [];
                if (Array.isArray(data)) {
                    tablesArray = data;
                } else if (data && data.tables && Array.isArray(data.tables)) {
                    tablesArray = data.tables;
                } else if (data && typeof data === 'object') {
                    // If it's an object, try to find an array property
                    const possibleArrays = Object.values(data).filter(val => Array.isArray(val));
                    if (possibleArrays.length > 0) {
                        tablesArray = possibleArrays[0];
                    }
                }
                
                // Normalize table objects to ensure required properties exist
                const normalizedTables = tablesArray.map(table => ({
                    id: table.id || table.name || 'unknown',
                    name: table.name || 'Untitled',
                    description: table.description || (table.status ? `Status: ${table.status}` : 'No description available'),
                    data: table.data || '',
                    createdAt: table.createdAt || table.created_at || new Date().toISOString(),
                    status: table.status || 'unknown',
                    ipns_name: table.ipns_name || null,
                    // Add any other properties from the original table
                    ...table
                }));
                
                tables.set(normalizedTables);
            } else {
                console.error('Failed to fetch tables, status:', response.status);
                showNotification('Failed to fetch tables', 'error');
            }
        } catch (error) {
            console.error('Failed to fetch tables:', error);
            showNotification('Error connecting to server', 'error');
        } finally {
            loading = false;
        }
    }

    async function fetchActiveTorrents() {
        try {
            torrentsLoading = true;
            const response = await fetch(`${API_BASE}/torrents/active`);
            
            if (response.ok) {
                const data = await response.json();
                activeTorrents.set(data.torrents || []);
            } else {
                console.error('Failed to fetch active torrents, status:', response.status);
                showNotification('Failed to fetch active torrents', 'error');
            }
        } catch (error) {
            console.error('Failed to fetch active torrents:', error);
            showNotification('Error fetching torrents', 'error');
        } finally {
            torrentsLoading = false;
        }
    }

    function toggleAutoRefresh() {
        autoRefresh = !autoRefresh;
        
        if (autoRefresh) {
            refreshInterval = setInterval(() => {
                if (activeTab === 'torrents') {
                    fetchActiveTorrents();
                }
            }, 5000); // Refresh every 5 seconds
            showNotification('Auto-refresh enabled', 'info');
        } else {
            if (refreshInterval) {
                clearInterval(refreshInterval);
                refreshInterval = null;
            }
            showNotification('Auto-refresh disabled', 'info');
        }
    }

    async function createTorrent() {
        if (!selectedFile) {
            showNotification('Please select a file first', 'warning');
            return;
        }

        if (!torrentName.trim()) {
            showNotification('Please enter a torrent name', 'warning');
            return;
        }

        try {
            loading = true;
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('torrentName', torrentName.trim());

            const response = await fetch(`${API_BASE}/create-torrent-with-versioning`, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                torrentResult = data;
                
                showNotification(data.message, 'success');
                
                // Refresh tables to show the updated data
                await fetchTables();
                
                // Refresh active torrents if on that tab
                if (activeTab === 'torrents') {
                    setTimeout(() => fetchActiveTorrents(), 1000);
                }
            } else {
                const error = await response.json();
                showNotification(error.error || 'Failed to create torrent', 'error');
            }
        } catch (error) {
            console.error('Failed to create torrent:', error);
            showNotification('Error creating torrent', 'error');
        } finally {
            loading = false;
        }
    }

    // Reset form function
    function resetTorrentForm() {
        selectedFile = null;
        torrentName = '';
        torrentResult = null;
    }

    async function createTable() {
        if (!newTable.name || !newTable.description) {
            showNotification('Name and description are required', 'warning');
            return;
        }

        try {
            loading = true;
            const response = await fetch(`${API_BASE}/ipfs/tables`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newTable)
            });

            if (response.ok) {
                showNotification('Table created successfully!', 'success');
                newTable = { name: '', description: '', data: '' };
                showCreateModal = false;
                await fetchTables();
            } else {
                showNotification('Failed to create table', 'error');
            }
        } catch (error) {
            console.error('Failed to create table:', error);
            showNotification('Error creating table', 'error');
        } finally {
            loading = false;
        }
    }

    async function updateTable(id, tableData) {
        try {
            loading = true;
            const response = await fetch(`${API_BASE}/ipfs/tables/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tableData)
            });

            if (response.ok) {
                showNotification('Table updated successfully!', 'success');
                editingTable = null;
                await fetchTables();
            } else {
                showNotification('Failed to update table', 'error');
            }
        } catch (error) {
            console.error('Failed to update table:', error);
            showNotification('Error updating table', 'error');
        } finally {
            loading = false;
        }
    }

    async function deleteTable(id) {
        if (!confirm('Are you sure you want to delete this table?')) return;

        try {
            loading = true;
            const response = await fetch(`${API_BASE}/ipfs/tables/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                showNotification('Table deleted successfully!', 'success');
                await fetchTables();
            } else {
                showNotification('Failed to delete table', 'error');
            }
        } catch (error) {
            console.error('Failed to delete table:', error);
            showNotification('Error deleting table', 'error');
        } finally {
            loading = false;
        }
    }

    // File handling
    function handleFileSelect(event) {
        selectedFile = event.target.files[0];
        torrentResult = null;
    }

    function handleDrop(event) {
        event.preventDefault();
        dragOver = false;
        selectedFile = event.dataTransfer.files[0];
        torrentResult = null;
    }

    function handleDragOver(event) {
        event.preventDefault();
        dragOver = true;
    }

    function handleDragLeave() {
        dragOver = false;
    }

    // Enhanced table functions
    $: filteredTables = $tables.filter(table => {
        const query = searchQuery.toLowerCase();
        return table.name.toLowerCase().includes(query) || 
               table.description.toLowerCase().includes(query);
    }).sort((a, b) => {
        let aValue = a[sortBy];
        let bValue = b[sortBy];
        
        if (sortBy === 'createdAt') {
            aValue = new Date(aValue);
            bValue = new Date(bValue);
        } else if (typeof aValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
        }
        
        if (sortOrder === 'asc') {
            return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        } else {
            return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
        }
    });

    async function fetchTableDetails(tableId) {
        try {
            const response = await fetch(`${API_BASE}/ipfs/tables/${tableId}`);
            
            if (response.ok) {
                const tableData = await response.json();
                return {
                    id: tableData.id || tableId,
                    name: tableData.name || 'Untitled',
                    description: tableData.description || 'No description available',
                    data: tableData.data || tableData.contents || '',
                    createdAt: tableData.createdAt || tableData.created_at || new Date().toISOString(),
                    status: tableData.status || 'unknown',
                    ipns_name: tableData.ipns_name || null,
                    hash: tableData.hash || null,
                    ...tableData
                };
            } else {
                throw new Error(`Failed to fetch table details: ${response.status}`);
            }
        } catch (error) {
            console.error('Failed to fetch table details:', error);
            return null;
        }
    }

    // Update the viewTable function to fetch full details
    async function viewTable(table) {
        const fullTableData = await fetchTableDetails(table.id);
        if (fullTableData) {
            viewingTable = fullTableData;
            showViewModal = true;
        } else {
            showNotification('Failed to load table details', 'error');
        }
    }

    function duplicateTable(table) {
        newTable = {
            name: `${table.name} (Copy)`,
            description: table.description,
            data: table.data
        };
        showCreateModal = true;
    }

    function exportTable(table) {
        const dataStr = JSON.stringify(table, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `${table.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        showNotification('Table exported successfully!', 'success');
    }

    function formatDate(dateString) {
        if (!dateString) return 'Unknown';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function getTableSummary(table) {
        if (!table.data) {
            // If no data but has status, show status info
            if (table.status) {
                return `Status: ${table.status}`;
            }
            return 'No data';
        }
        
        try {
            const data = JSON.parse(table.data);
            if (Array.isArray(data)) {
                // Check if it's a torrent versions table
                if (data.length > 0 && data[0].hash && data[0].version) {
                    return `${data.length} version${data.length === 1 ? '' : 's'}`;
                }
                return `${data.length} items`;
            } else if (typeof data === 'object') {
                return `${Object.keys(data).length} properties`;
            }
            return 'Has data';
        } catch {
            return `${table.data.length} characters`;
        }
    }

    function isTorrentTable(table) {
        try {
            const data = JSON.parse(table.data || '[]');
            return Array.isArray(data) && data.length > 0 && data[0].hash && data[0].version;
        } catch {
            return false;
        }
    }

    // Watch for tab changes to load appropriate data
    $: if (activeTab === 'torrents') {
        fetchActiveTorrents();
    }

    // Initialize
    onMount(() => {
        checkHealth();
        fetchContractAddress();
        fetchTables();
        
        // Cleanup interval on unmount
        return () => {
            if (refreshInterval) {
                clearInterval(refreshInterval);
            }
        };
    });
</script>

<main class="main-container">
    <!-- Header -->
    <header class="header">
        <div class="header-content">
            <div class="header-title">
                <div class="title-section">
                    <h1 class="main-title">TorrentChain</h1>
                    <span class="subtitle-badge">Decentralized File Sharing</span>
                </div>
                
                <!-- Service Status -->
                <div class="service-status">
                    {#each Object.entries($services) as [service, status]}
                        <div class="service-item">
                            <div class="status-dot {status === 'running' || status === 'connected' ? 'connected' : 'disconnected'}"></div>
                            <span class="service-name">{service.replace('Server', '')}</span>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    </header>

    <!-- Navigation Tabs -->
    <nav class="nav-tabs">
        <div class="nav-content">
            <div class="tab-list">
                <button 
                    class="tab-button {activeTab === 'torrent' ? 'active' : ''}"
                    on:click={() => activeTab = 'torrent'}
                >
                    Create Torrent
                </button>
                <button 
                    class="tab-button {activeTab === 'torrents' ? 'active' : ''}"
                    on:click={() => activeTab = 'torrents'}
                >
                    Active Torrents
                </button>
                <button 
                    class="tab-button {activeTab === 'tables' ? 'active' : ''}"
                    on:click={() => activeTab = 'tables'}
                >
                    IPFS Tables
                </button>
                <button 
                    class="tab-button {activeTab === 'blockchain' ? 'active' : ''}"
                    on:click={() => activeTab = 'blockchain'}
                >
                    Blockchain Info
                </button>
            </div>
        </div>
    </nav>

    <!-- Main Content -->
    <div class="content-container">
        {#if activeTab === 'torrent'}
            <!-- Torrent Creation Section -->
            <div class="section-card">
                <div class="section-header">
                    <h2 class="section-title">Create Torrent</h2>
                    <p class="section-description">Upload a file and create a versioned torrent entry</p>
                </div>
                
                <div class="section-content">
                    <!-- Torrent Name Input -->
                    <div class="form-group">
                        <label for="torrent-name" class="form-label">
                            <Tag class="label-icon" size={16} />
                            Torrent Name
                        </label>
                        <input 
                            id="torrent-name"
                            type="text" 
                            bind:value={torrentName}
                            class="form-input"
                            placeholder="Enter torrent name (e.g., MyProject, Documentation, etc.)"
                            disabled={loading}
                        >
                        <p class="form-help">
                            This name will be used to group torrent versions. If a torrent with this name exists, 
                            a new version will be created.
                        </p>
                    </div>

                    <!-- File Upload Area -->
                    <div 
                        class="file-upload-area {dragOver ? 'drag-over' : ''} {selectedFile ? 'file-selected' : ''}"
                        on:drop={handleDrop}
                        on:dragover={handleDragOver}
                        on:dragleave={handleDragLeave}
                        role="region"
                        aria-label="File upload area"
                    >
                        <div class="upload-content">
                            {#if selectedFile}
                                <CheckCircle class="upload-icon success" size={48} />
                                <div class="file-info">
                                    <p class="file-name">{selectedFile.name}</p>
                                    <p class="file-size">{formatFileSize(selectedFile.size)}</p>
                                </div>
                            {:else}
                                <Upload class="upload-icon" size={48} />
                                <div class="upload-text">
                                    <label for="file-upload" class="upload-label">
                                        <span>Upload a file</span>
                                        <input id="file-upload" name="file-upload" type="file" class="file-input" on:change={handleFileSelect} disabled={loading}>
                                    </label>
                                    <p>or drag and drop</p>
                                </div>
                            {/if}
                        </div>
                    </div>

                    <!-- Create Torrent Button -->
                    <div class="button-section">
                        <button 
                            on:click={createTorrent}
                            disabled={!selectedFile || !torrentName.trim() || loading}
                            class="primary-button {loading ? 'loading' : ''}"
                        >
                            {#if loading}
                                <Loader2 class="loading-spinner" size={20} />
                                Creating Torrent...
                            {:else}
                                Create Torrent
                            {/if}
                        </button>
                        
                        {#if selectedFile || torrentName || torrentResult}
                            <button 
                                on:click={resetTorrentForm}
                                disabled={loading}
                                class="secondary-button"
                            >
                                Reset
                            </button>
                        {/if}
                    </div>

                    <!-- Torrent Result -->
                    {#if torrentResult}
                        <div class="success-result">
                            <div class="result-content">
                                <div class="result-icon">
                                    <CheckCircle class="success-icon" size={20} />
                                </div>
                                <div class="result-details">
                                    <h3 class="result-title">Torrent Created Successfully!</h3>
                                    <div class="result-info">
                                        <p><strong>Torrent Name:</strong> {torrentName}</p>
                                        <p><strong>File:</strong> {torrentResult.originalName}</p>
                                        <p><strong>Hash:</strong> <code>{torrentResult.infoHash}</code></p>
                                        <p class="magnet-label"><strong>Magnet Link:</strong></p>
                                        <div class="magnet-link">
                                            {torrentResult.magnetLink}
                                        </div>
                                        <button 
                                            class="copy-button"
                                            on:click={() => navigator.clipboard.writeText(torrentResult.magnetLink)}
                                        >
                                            <Copy size={16} />
                                            Copy Magnet Link
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>
            </div>

        {:else if activeTab === 'torrents'}
            <!-- Active Torrents Section -->
            <div class="section-card">
                <div class="section-header with-button">
                    <div class="header-text">
                        <h2 class="section-title">Active Torrents</h2>
                        <p class="section-description">Monitor your seeding torrents</p>
                    </div>
                    <div class="header-actions">
                        <button 
                            on:click={toggleAutoRefresh}
                            class="secondary-button {autoRefresh ? 'active' : ''}"
                            title="Toggle auto-refresh"
                        >
                            <Activity class="button-icon {autoRefresh ? 'spinning' : ''}" size={16} />
                            Auto Refresh {autoRefresh ? 'On' : 'Off'}
                        </button>
                        <button 
                            on:click={fetchActiveTorrents}
                            disabled={torrentsLoading}
                            class="secondary-button"
                        >
                            <RefreshCw class="button-icon {torrentsLoading ? 'spinning' : ''}" size={16} />
                            Refresh
                        </button>
                    </div>
                </div>

                <div class="section-content">
                    {#if torrentsLoading}
                        <div class="loading-container">
                            <Loader2 class="loading-spinner large" size={48} />
                        </div>
                    {:else if $activeTorrents.length === 0}
                        <div class="empty-state">
                            <Activity class="empty-icon" size={48} />
                            <h3 class="empty-title">No Active Torrents</h3>
                            <p class="empty-description">Create a torrent to start seeding files.</p>
                            <button 
                                on:click={() => activeTab = 'torrent'}
                                class="primary-button"
                            >
                                Create Your First Torrent
                            </button>
                        </div>
                    {:else}
                        <!-- Torrents Summary -->
                        <div class="torrents-summary">
                            <div class="summary-stats">
                                <div class="stat-item">
                                    <div class="stat-icon">
                                        <Activity class="icon" size={20} />
                                    </div>
                                    <div class="stat-content">
                                        <span class="stat-value">{$activeTorrents.length}</span>
                                        <span class="stat-label">Active Torrents</span>
                                    </div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-icon">
                                        <Users class="icon" size={20} />
                                    </div>
                                    <div class="stat-content">
                                        <span class="stat-value">{$activeTorrents.reduce((sum, t) => sum + t.numPeers, 0)}</span>
                                        <span class="stat-label">Total Peers</span>
                                    </div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-icon">
                                        <Zap class="icon" size={20} />
                                    </div>
                                    <div class="stat-content">
                                        <span class="stat-value">{formatSpeed($activeTorrents.reduce((sum, t) => sum + t.uploadSpeed, 0))}</span>
                                        <span class="stat-label">Total Upload Speed</span>
                                    </div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-icon">
                                        <HardDrive class="icon" size={20} />
                                    </div>
                                    <div class="stat-content">
                                        <span class="stat-value">{formatFileSize($activeTorrents.reduce((sum, t) => sum + t.uploaded, 0))}</span>
                                        <span class="stat-label">Total Uploaded</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Torrents List -->
                        <div class="torrents-list">
                            {#each $activeTorrents as torrent}
                                <div class="torrent-card">
                                    <div class="torrent-header">
                                        <div class="torrent-info">
                                            <h3 class="torrent-name">{torrent.name || 'Unknown'}</h3>
                                            <div class="torrent-hash">
                                                <span class="hash-label">Hash:</span>
                                                <code class="hash-value">{torrent.infoHash}</code>
                                                <button 
                                                    class="copy-hash-button"
                                                    on:click={() => navigator.clipboard.writeText(torrent.infoHash)}
                                                    title="Copy hash"
                                                >
                                                    <Copy size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <div class="torrent-status">
                                            <span class="status-badge seeding">Seeding</span>
                                        </div>
                                    </div>

                                    <div class="torrent-progress">
                                        <div class="progress-bar">
                                            <div 
                                                class="progress-fill" 
                                                style="width: {formatProgress(torrent.progress)}"
                                            ></div>
                                        </div>
                                        <span class="progress-text">{formatProgress(torrent.progress)}</span>
                                    </div>

                                    <div class="torrent-stats">
                                        <div class="stat-group">
                                            <div class="stat">
                                                <span class="stat-label">Peers</span>
                                                <span class="stat-value">{torrent.numPeers}</span>
                                            </div>
                                            <div class="stat">
                                                <span class="stat-label">Download Speed</span>
                                                <span class="stat-value">{formatSpeed(torrent.downloadSpeed)}</span>
                                            </div>
                                            <div class="stat">
                                                <span class="stat-label">Upload Speed</span>
                                                <span class="stat-value">{formatSpeed(torrent.uploadSpeed)}</span>
                                            </div>
                                        </div>
                                        <div class="stat-group">
                                            <div class="stat">
                                                <span class="stat-label">Downloaded</span>
                                                <span class="stat-value">{formatFileSize(torrent.downloaded)}</span>
                                            </div>
                                            <div class="stat">
                                                <span class="stat-label">Uploaded</span>
                                                <span class="stat-value">{formatFileSize(torrent.uploaded)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="torrent-actions">
                                        <button 
                                            class="action-button secondary"
                                            on:click={() => navigator.clipboard.writeText(torrent.magnetURI)}
                                        >
                                            <Copy size={16} />
                                            Copy Magnet Link
                                        </button>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>

        {:else if activeTab === 'tables'}
            <!-- Enhanced IPFS Tables Section -->
            <div class="section-card">
                <div class="section-header with-button">
                    <div class="header-text">
                        <h2 class="section-title">IPFS Tables</h2>
                        <p class="section-description">Manage your decentralized data tables and torrent versions</p>
                    </div>
                    <button 
                        on:click={() => showCreateModal = true}
                        class="primary-button"
                    >
                        <Plus class="button-icon" size={16} />
                        Create Table
                    </button>
                </div>

                <div class="section-content">
                    <!-- Table Controls -->
                    <div class="table-controls">
                        <div class="search-container">
                            <div class="search-input-container">
                                <Search class="search-icon" size={20} />
                                <input 
                                    type="text" 
                                    placeholder="Search tables..." 
                                    bind:value={searchQuery}
                                    class="search-input"
                                >
                                {#if searchQuery}
                                    <button 
                                        on:click={() => searchQuery = ''}
                                        class="clear-search"
                                    >
                                        <X class="clear-icon" size={16} />
                                    </button>
                                {/if}
                            </div>
                        </div>

                        <div class="controls-right">
                            <div class="sort-container">
                                <select bind:value={sortBy} class="sort-select">
                                    <option value="name">Sort by Name</option>
                                    <option value="createdAt">Sort by Date</option>
                                    <option value="description">Sort by Description</option>
                                </select>
                                <button 
                                    on:click={() => sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'}
                                    class="sort-order-button"
                                    title="Toggle sort order"
                                >
                                    {#if sortOrder === 'asc'}
                                        <ArrowUp class="sort-icon" size={16} />
                                    {:else}
                                        <ArrowDown class="sort-icon" size={16} />
                                    {/if}
                                </button>
                            </div>

                            <div class="view-toggle">
                                <button 
                                    on:click={() => viewMode = 'grid'}
                                    class="view-button {viewMode === 'grid' ? 'active' : ''}"
                                    title="Grid view"
                                >
                                    <Grid3X3 class="view-icon" size={16} />
                                </button>
                                <button 
                                    on:click={() => viewMode = 'list'}
                                    class="view-button {viewMode === 'list' ? 'active' : ''}"
                                    title="List view"
                                >
                                    <List class="view-icon" size={16} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Table Count -->
                    <div class="table-count">
                        {#if searchQuery}
                            Showing {filteredTables.length} of {$tables.length} tables
                        {:else}
                            {$tables.length} {$tables.length === 1 ? 'table' : 'tables'}
                        {/if}
                    </div>

                    {#if loading}
                        <div class="loading-container">
                            <Loader2 class="loading-spinner large" size={48} />
                        </div>
                    {:else if filteredTables.length === 0}
                        <div class="empty-state">
                            {#if searchQuery}
                                <Search class="empty-icon" size={48} />
                                <h3 class="empty-title">No tables found</h3>
                                <p class="empty-description">Try adjusting your search criteria.</p>
                                <button 
                                    on:click={() => searchQuery = ''}
                                    class="secondary-button"
                                >
                                    Clear Search
                                </button>
                            {:else}
                                <Upload class="empty-icon" size={48} />
                                <h3 class="empty-title">No tables</h3>
                                <p class="empty-description">Get started by creating your first table or torrent.</p>
                                <div class="empty-actions">
                                    <button 
                                        on:click={() => activeTab = 'torrent'}
                                        class="primary-button"
                                    >
                                        Create Your First Torrent
                                    </button>
                                    <button 
                                        on:click={() => showCreateModal = true}
                                        class="secondary-button"
                                    >
                                        Create Table
                                    </button>
                                </div>
                            {/if}
                        </div>
                    {:else}
                        <!-- Tables Display -->
                        <div class="tables-container {viewMode}">
                            {#if viewMode === 'grid'}
                                <div class="tables-grid">
                                    {#each filteredTables as table}
                                        <div class="table-card {isTorrentTable(table) ? 'torrent-table' : ''}">
                                            <div class="table-card-header">
                                                <div class="table-title-section">
                                                    <h3 class="table-name">{table.name}</h3>
                                                    {#if isTorrentTable(table)}
                                                        <span class="table-type-badge torrent">
                                                            <Tag class="badge-icon" size={12} />
                                                            Torrent
                                                        </span>
                                                    {/if}
                                                </div>
                                                <div class="table-menu">
                                                    <button class="menu-trigger" title="More options">
                                                        <MoreVertical class="menu-icon" size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                            <p class="table-description">{table.description}</p>
                                            <div class="table-meta">
                                                <span class="table-data-summary">{getTableSummary(table)}</span>
                                                <span class="table-date">{formatDate(table.createdAt)}</span>
                                            </div>
                                            <div class="table-actions">
                                                <button 
                                                    on:click={() => viewTable(table)}
                                                    class="action-button primary"
                                                >
                                                    <Eye class="action-icon" size={16} />
                                                    View
                                                </button>
                                                <button 
                                                    on:click={() => editingTable = {...table}}
                                                    class="action-button secondary"
                                                >
                                                    <Edit class="action-icon" size={16} />
                                                    Edit
                                                </button>
                                                <button 
                                                    on:click={() => duplicateTable(table)}
                                                    class="action-button secondary"
                                                >
                                                    <Duplicate class="action-icon" size={16} />
                                                    Duplicate
                                                </button>
                                                <button 
                                                    on:click={() => exportTable(table)}
                                                    class="action-button secondary"
                                                >
                                                    <Download class="action-icon" size={16} />
                                                    Export
                                                </button>
                                                <button 
                                                    on:click={() => deleteTable(table.id)}
                                                    class="action-button danger"
                                                >
                                                    <Trash2 class="action-icon" size={16} />
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {:else}
                                <div class="tables-list">
                                    {#each filteredTables as table}
                                        <div class="table-list-item {isTorrentTable(table) ? 'torrent-table' : ''}">
                                            <div class="table-list-content">
                                                <div class="table-list-main">
                                                    <div class="table-list-title">
                                                        <h3 class="table-list-name">{table.name}</h3>
                                                        {#if isTorrentTable(table)}
                                                            <span class="table-type-badge torrent">
                                                                <Tag class="badge-icon" size={12} />
                                                                Torrent
                                                            </span>
                                                        {/if}
                                                    </div>
                                                    <p class="table-list-description">{table.description}</p>
                                                </div>
                                                <div class="table-list-meta">
                                                    <span class="table-list-data">{getTableSummary(table)}</span>
                                                    <span class="table-list-date">{formatDate(table.createdAt)}</span>
                                                </div>
                                            </div>
                                            <div class="table-list-actions">
                                                <button 
                                                    on:click={() => viewTable(table)}
                                                    class="list-action-button primary"
                                                    title="View table"
                                                >
                                                    <Eye class="action-icon" size={16} />
                                                </button>
                                                <button 
                                                    on:click={() => editingTable = {...table}}
                                                    class="list-action-button secondary"
                                                    title="Edit table"
                                                >
                                                    <Edit class="action-icon" size={16} />
                                                </button>
                                                <button 
                                                    on:click={() => duplicateTable(table)}
                                                    class="list-action-button secondary"
                                                    title="Duplicate table"
                                                >
                                                    <Duplicate class="action-icon" size={16} />
                                                </button>
                                                <button 
                                                    on:click={() => deleteTable(table.id)}
                                                    class="list-action-button danger"
                                                    title="Delete table"
                                                >
                                                    <Trash2 class="action-icon" size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>
            </div>

        {:else if activeTab === 'blockchain'}
            <!-- Blockchain Info Section -->
            <div class="section-card">
                <div class="section-header">
                    <h2 class="section-title">Blockchain Information</h2>
                    <p class="section-description">Smart contract and blockchain details</p>
                </div>
                
                <div class="section-content">
                    <div class="info-grid">
                        <div class="info-item">
                            <dt class="info-label">Contract Address</dt>
                            <dd class="info-value contract-address">
                                {$contractAddress || 'Loading...'}
                            </dd>
                        </div>
                        <div class="info-item">
                            <dt class="info-label">Network Status</dt>
                            <dd class="info-value">
                                <span class="status-badge {$services.blockchainServer === 'connected' ? 'connected' : 'disconnected'}">
                                    {$services.blockchainServer === 'connected' ? 'Connected' : 'Disconnected'}
                                </span>
                            </dd>
                        </div>
                    </div>
                </div>
            </div>
        {/if}
    </div>

    <!-- Create Table Modal -->
    {#if showCreateModal}
        <div class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Create New Table</h3>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="new-table-name" class="form-label">Name</label>
                        <input 
                            id="new-table-name"
                            type="text" 
                            bind:value={newTable.name}
                            class="form-input"
                            placeholder="Table name"
                        >
                    </div>
                    <div class="form-group">
                        <label for="new-table-description" class="form-label">Description</label>
                        <textarea 
                            id="new-table-description"
                            bind:value={newTable.description}
                            rows="3"
                            class="form-textarea"
                            placeholder="Table description"
                        ></textarea>
                    </div>
                    <div class="form-group">
                        <label for="new-table-data" class="form-label">Data (Optional)</label>
                        <textarea 
                            id="new-table-data"
                            bind:value={newTable.data}
                            rows="4"
                            class="form-textarea"
                            placeholder="JSON data or any text content"
                        ></textarea>
                    </div>
                </div>
                <div class="modal-actions">
                    <button 
                        on:click={createTable}
                        disabled={loading}
                        class="primary-button {loading ? 'loading' : ''}"
                    >
                        {loading ? 'Creating...' : 'Create'}
                    </button>
                    <button 
                        on:click={() => showCreateModal = false}
                        class="secondary-button"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Edit Table Modal -->
    {#if editingTable}
        <div class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Edit Table</h3>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="edit-table-name" class="form-label">Name</label>
                        <input 
                            id="edit-table-name"
                            type="text" 
                            bind:value={editingTable.name}
                            class="form-input"
                        >
                    </div>
                    <div class="form-group">
                        <label for="edit-table-description" class="form-label">Description</label>
                        <textarea 
                            id="edit-table-description"
                            bind:value={editingTable.description}
                            rows="3"
                            class="form-textarea"
                        ></textarea>
                    </div>
                    <div class="form-group">
                        <label for="edit-table-data" class="form-label">Data</label>
                        <textarea 
                            id="edit-table-data"
                            bind:value={editingTable.data}
                            rows="4"
                            class="form-textarea"
                        ></textarea>
                    </div>
                </div>
                <div class="modal-actions">
                    <button 
                        on:click={() => updateTable(editingTable.id, editingTable)}
                        disabled={loading}
                        class="primary-button {loading ? 'loading' : ''}"
                    >
                        {loading ? 'Updating...' : 'Update'}
                    </button>
                    <button 
                        on:click={() => editingTable = null}
                        class="secondary-button"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- View Table Modal -->
    {#if showViewModal && viewingTable}
        <div
            class="modal-overlay"
            role="dialog"
            aria-modal="true"
        >
            <div
                class="modal-overlay-bg"
                role="button"
                tabindex="0"
                aria-label="Close modal"
                on:click={() => showViewModal = false}
                on:keydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') showViewModal = false; }}
                style="position: fixed; inset: 0; background: transparent; z-index: 51;"
            ></div>
            <div class="modal-content large" on:click|stopPropagation style="position: relative; z-index: 52;">
                <div class="modal-header">
                    <div class="modal-title-section">
                        <h3 class="modal-title">{viewingTable.name}</h3>
                        {#if isTorrentTable(viewingTable)}
                            <span class="table-type-badge torrent">
                                <Tag class="badge-icon" size={12} />
                                Torrent Versions
                            </span>
                        {/if}
                    </div>
                    <button 
                        on:click={() => showViewModal = false}
                        class="modal-close"
                        aria-label="Close modal"
                    >
                        <X class="close-icon" size={20} />
                    </button>
                </div>
                <div class="modal-body">
                    <div class="table-details">
                        <div class="detail-section">
                            <h4 class="detail-title">Description</h4>
                            <p class="detail-content">{viewingTable.description}</p>
                        </div>
                        <div class="detail-section">
                            <h4 class="detail-title">Metadata</h4>
                            <div class="metadata-grid">
                                <div class="metadata-item">
                                    <span class="metadata-label">Created:</span>
                                    <span class="metadata-value">{formatDate(viewingTable.createdAt)}</span>
                                </div>
                                <div class="metadata-item">
                                    <span class="metadata-label">Data Size:</span>
                                    <span class="metadata-value">{getTableSummary(viewingTable)}</span>
                                </div>
                                {#if viewingTable.id}
                                    <div class="metadata-item">
                                        <span class="metadata-label">ID:</span>
                                        <span class="metadata-value">{viewingTable.id}</span>
                                    </div>
                                {/if}
                            </div>
                        </div>
                        {#if viewingTable.data}
                            <div class="detail-section">
                                <h4 class="detail-title">
                                    {isTorrentTable(viewingTable) ? 'Torrent Versions' : 'Data'}
                                </h4>
                                <div class="data-viewer">
                                    {#if isTorrentTable(viewingTable)}
                                        <!-- Special rendering for torrent versions -->
                                        {#each JSON.parse(viewingTable.data) as version, index}
                                            <div class="version-item">
                                                <div class="version-header">
                                                    <h5 class="version-title">Version {version.version}</h5>
                                                    <span class="version-date">{formatDate(version.createdAt)}</span>
                                                </div>
                                                <div class="version-details">
                                                    <p><strong>File:</strong> {version.fileName}</p>
                                                    <p><strong>Size:</strong> {formatFileSize(version.fileSize)}</p>
                                                    <p><strong>Hash:</strong> <code>{version.hash}</code></p>
                                                    <div class="version-actions">
                                                        <button 
                                                            class="copy-button small"
                                                            on:click={() => navigator.clipboard.writeText(version.magnetLink)}
                                                        >
                                                            <Copy size={14} />
                                                            Copy Magnet Link
                                                        </button>
                                                        <button 
                                                            class="copy-button small"
                                                            on:click={() => navigator.clipboard.writeText(version.hash)}
                                                        >
                                                            <Copy size={14} />
                                                            Copy Hash
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        {/each}
                                    {:else}
                                        <pre class="data-content">{viewingTable.data}</pre>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
                <div class="modal-actions">
                    <button 
                        on:click={() => exportTable(viewingTable)}
                        class="secondary-button"
                    >
                        <Download class="button-icon" size={16} />
                        Export
                    </button>
                    <button 
                        on:click={() => {
                            editingTable = {...viewingTable};
                            showViewModal = false;
                        }}
                        class="primary-button"
                    >
                        <Edit class="button-icon" size={16} />
                        Edit
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Notification -->
    {#if notification.show}
        <div class="notification-container">
            <div class="notification {notification.type}">
                <div class="notification-content">
                    <div class="notification-icon">
                        {#if notification.type === 'success'}
                            <CheckCircle class="icon" size={20} />
                        {:else if notification.type === 'error'}
                            <AlertCircle class="icon" size={20} />
                        {:else}
                            <Info class="icon" size={20} />
                        {/if}
                    </div>
                    <div class="notification-message">
                        <p>{notification.message}</p>
                    </div>
                    <div class="notification-close">
                        <button 
                            on:click={() => notification.show = false}
                            class="close-button"
                            aria-label="Close notification"
                        >
                            <X class="close-icon" size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {/if}
</main>