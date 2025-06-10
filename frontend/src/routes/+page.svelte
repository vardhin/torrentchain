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
        Loader2
    } from 'lucide-svelte';

    // Stores
    const tables = writable([]);
    const services = writable({});
    const contractAddress = writable('');
    
    // Component state
    let activeTab = 'torrent';
    let loading = false;
    let notification = { show: false, message: '', type: 'info' };
    
    // Torrent creation state
    let selectedFile = null;
    let torrentResult = null;
    let dragOver = false;
    
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
                
                tables.set(tablesArray);
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

    async function createTorrent() {
        if (!selectedFile) {
            showNotification('Please select a file first', 'warning');
            return;
        }

        try {
            loading = true;
            const formData = new FormData();
            formData.append('file', selectedFile);

            const response = await fetch(`${API_BASE}/create-torrent`, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                torrentResult = data;
                showNotification('Torrent created successfully!', 'success');
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

    function viewTable(table) {
        viewingTable = table;
        showViewModal = true;
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
        if (!table.data) return 'No data';
        
        try {
            const data = JSON.parse(table.data);
            if (Array.isArray(data)) {
                return `${data.length} items`;
            } else if (typeof data === 'object') {
                return `${Object.keys(data).length} properties`;
            }
            return 'Has data';
        } catch {
            return `${table.data.length} characters`;
        }
    }

    // Initialize
    onMount(() => {
        checkHealth();
        fetchContractAddress();
        fetchTables();
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
                    <p class="section-description">Upload a file to create and seed a torrent</p>
                </div>
                
                <div class="section-content">
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
                                        <input id="file-upload" name="file-upload" type="file" class="file-input" on:change={handleFileSelect}>
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
                            disabled={!selectedFile || loading}
                            class="primary-button {loading ? 'loading' : ''}"
                        >
                            {#if loading}
                                <Loader2 class="loading-spinner" size={20} />
                                Creating Torrent...
                            {:else}
                                Create Torrent
                            {/if}
                        </button>
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
                                        <p><strong>File:</strong> {torrentResult.originalName}</p>
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

        {:else if activeTab === 'tables'}
            <!-- Enhanced IPFS Tables Section -->
            <div class="section-card">
                <div class="section-header with-button">
                    <div class="header-text">
                        <h2 class="section-title">IPFS Tables</h2>
                        <p class="section-description">Manage your decentralized data tables</p>
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
                                <p class="empty-description">Get started by creating your first table.</p>
                                <button 
                                    on:click={() => showCreateModal = true}
                                    class="primary-button"
                                >
                                    Create Your First Table
                                </button>
                            {/if}
                        </div>
                    {:else}
                        <!-- Tables Display -->
                        <div class="tables-container {viewMode}">
                            {#if viewMode === 'grid'}
                                <div class="tables-grid">
                                    {#each filteredTables as table}
                                        <div class="table-card">
                                            <div class="table-card-header">
                                                <h3 class="table-name">{table.name}</h3>
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
                                        <div class="table-list-item">
                                            <div class="table-list-content">
                                                <div class="table-list-main">
                                                    <h3 class="table-list-name">{table.name}</h3>
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
                    <h3 class="modal-title">{viewingTable.name}</h3>
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
                                <h4 class="detail-title">Data</h4>
                                <div class="data-viewer">
                                    <pre class="data-content">{viewingTable.data}</pre>
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

