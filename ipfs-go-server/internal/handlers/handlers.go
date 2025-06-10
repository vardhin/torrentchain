package handlers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"ipfs-go-server/internal/ipfs"
	"ipfs-go-server/internal/storage"

	"github.com/gorilla/mux"
)

const (
	persistenceFile = "tables_registry.json"
)

var tableStorage = make(map[string]*storage.Storage)

type TableRegistry struct {
	Tables map[string]TableInfo `json:"tables"`
}

type TableInfo struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	KeyName  string `json:"keyName"`
	IPNSName string `json:"ipnsName"`
}

// InitializeStorage loads existing tables from persistence
func InitializeStorage(ipfsClient *ipfs.IPFSClient) error {
	log.Println("[PERSISTENCE] Loading existing tables...")

	// Try to load from persistence file
	if _, err := os.Stat(persistenceFile); os.IsNotExist(err) {
		log.Println("[PERSISTENCE] No persistence file found, starting fresh")
		return nil
	}

	data, err := os.ReadFile(persistenceFile)
	if err != nil {
		return err
	}

	var registry TableRegistry
	if err := json.Unmarshal(data, &registry); err != nil {
		return err
	}

	// Restore tables from IPFS
	for id, info := range registry.Tables {
		log.Printf("[PERSISTENCE] Restoring table: %s (%s)", info.Name, id)

		// Create storage instance
		stor := storage.NewStorageWithIPNS(ipfsClient.GetShell(), info.ID, info.Name, "", info.KeyName, info.IPNSName)

		// Try to load table data from IPFS
		if err := stor.LoadTable(); err != nil {
			log.Printf("[PERSISTENCE] Warning: Failed to load table %s from IPFS: %v", id, err)
			continue
		}

		tableStorage[id] = stor
		log.Printf("[PERSISTENCE] Successfully restored table: %s", info.Name)
	}

	log.Printf("[PERSISTENCE] Loaded %d tables from persistence", len(tableStorage))
	return nil
}

// saveRegistry saves the current table registry to disk
func saveRegistry() error {
	registry := TableRegistry{
		Tables: make(map[string]TableInfo),
	}

	for id, stor := range tableStorage {
		table := stor.GetTable()
		registry.Tables[id] = TableInfo{
			ID:       table.ID,
			Name:     table.Name,
			KeyName:  stor.GetKeyName(),
			IPNSName: stor.GetIPNSName(),
		}
	}

	data, err := json.Marshal(registry)
	if err != nil {
		return err
	}

	// Create directory if it doesn't exist
	dir := filepath.Dir(persistenceFile)
	if dir != "." {
		os.MkdirAll(dir, 0755)
	}

	return os.WriteFile(persistenceFile, data, 0644)
}

func RegisterTableRoutes(router *mux.Router, ipfsClient *ipfs.IPFSClient) {
	log.Println("[HANDLERS] Registering table routes...")

	// Main CRUD endpoints
	router.HandleFunc("/tables", getAllTablesHandler()).Methods("GET")
	router.HandleFunc("/tables", createTableHandlerNew(ipfsClient)).Methods("POST")
	router.HandleFunc("/tables/{id}", getTableHandler()).Methods("GET")
	router.HandleFunc("/tables/{id}", updateTableHandler()).Methods("PUT")
	router.HandleFunc("/tables/{id}", deleteTableHandler()).Methods("DELETE")
	router.HandleFunc("/tables/{id}/append", AppendToTable(ipfsClient)).Methods("POST")

	log.Println("[HANDLERS] Table routes registered successfully")
}

func getAllTablesHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[GET_ALL_TABLES] Handler called")

		w.Header().Set("Content-Type", "application/json")

		// Check for force refresh parameter
		forceRefresh := r.URL.Query().Get("refresh") == "true"

		// Get all tables from storage
		tables := make([]map[string]interface{}, 0)
		for _, storage := range tableStorage {
			// Only reload from IPFS if explicitly requested
			if forceRefresh {
				log.Printf("[GET_ALL_TABLES] Force refresh requested, reloading table %s from IPFS", storage.GetTable().ID)
				if err := storage.LoadTable(); err != nil {
					log.Printf("[GET_ALL_TABLES] Warning: Failed to load table %s from IPFS: %v", storage.GetTable().ID, err)
					// Continue with cached data
				} else {
					log.Printf("[GET_ALL_TABLES] Successfully reloaded table %s", storage.GetTable().ID)
				}
			} else {
				log.Printf("[GET_ALL_TABLES] Using cached data for table %s", storage.GetTable().ID)
			}

			table := storage.GetTable()
			tableInfo := map[string]interface{}{
				"id":          table.ID,
				"name":        table.Name,
				"description": table.Description,
				"createdAt":   table.CreatedAt,
				"updatedAt":   table.UpdatedAt,
				"ipns_name":   storage.GetIPNSName(),
				"status":      "active",
				"cached":      !forceRefresh,
			}
			tables = append(tables, tableInfo)
		}

		response := map[string]interface{}{
			"tables": tables,
			"count":  len(tables),
		}

		responseJSON, _ := json.Marshal(response)
		log.Printf("[GET_ALL_TABLES] Sending response: %s", string(responseJSON))

		w.WriteHeader(http.StatusOK)
		w.Write(responseJSON)
	}
}

func createTableHandlerNew(ipfsClient *ipfs.IPFSClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[CREATE_TABLE_NEW] Handler called")

		// Read the request body
		body, err := io.ReadAll(r.Body)
		if err != nil {
			log.Printf("[CREATE_TABLE_NEW] Error reading body: %v", err)
			http.Error(w, "Error reading request body", http.StatusBadRequest)
			return
		}
		defer r.Body.Close()

		log.Printf("[CREATE_TABLE_NEW] Raw body: %s", string(body))

		// Parse JSON
		var req map[string]interface{}
		if err := json.Unmarshal(body, &req); err != nil {
			log.Printf("[CREATE_TABLE_NEW] Error parsing JSON: %v", err)
			http.Error(w, "Invalid JSON format", http.StatusBadRequest)
			return
		}

		log.Printf("[CREATE_TABLE_NEW] Parsed data: %+v", req)

		// Extract table info
		tableName := getStringField(req, "name", "default_table")
		description := getStringField(req, "description", "")
		data := getStringField(req, "data", "[]")

		log.Printf("[CREATE_TABLE_NEW] Using table name: %s", tableName)

		// Check if table already exists by name
		for _, stor := range tableStorage {
			if stor.GetTable().Name == tableName {
				log.Printf("[CREATE_TABLE_NEW] Table already exists: %s", tableName)
				http.Error(w, "Table with this name already exists", http.StatusConflict)
				return
			}
		}

		// Create new storage instance with unique ID
		tableID := tableName // Use name as ID for now, but could generate UUID
		storage := storage.NewStorage(ipfsClient.GetShell(), tableID, tableName, description)

		// If data is provided, try to parse and add it
		if data != "" && data != "[]" {
			if err := storage.UpdateTableData("", "", data); err != nil {
				log.Printf("[CREATE_TABLE_NEW] Warning: Failed to parse initial data: %v", err)
			}
		}

		// Save initial table to get hash
		hash, err := storage.SaveInitialTable()
		if err != nil {
			log.Printf("[CREATE_TABLE_NEW] Error creating table: %v", err)
			http.Error(w, "Failed to create table: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// Store in memory using table ID as key
		tableStorage[tableID] = storage

		// Save registry to disk
		if err := saveRegistry(); err != nil {
			log.Printf("[CREATE_TABLE_NEW] Warning: Failed to save registry: %v", err)
		}

		table := storage.GetTable()
		response := map[string]interface{}{
			"id":          table.ID,
			"name":        table.Name,
			"description": table.Description,
			"data":        table.Data,
			"createdAt":   table.CreatedAt,
			"updatedAt":   table.UpdatedAt,
			"ipns_name":   storage.GetIPNSName(),
			"hash":        hash,
			"status":      "created",
			"success":     true,
		}

		w.Header().Set("Content-Type", "application/json")
		responseJSON, _ := json.Marshal(response)
		log.Printf("[CREATE_TABLE_NEW] Sending response: %s", string(responseJSON))

		w.WriteHeader(http.StatusCreated)
		w.Write(responseJSON)
	}
}

func getTableHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]
		log.Printf("[GET_TABLE] Handler called for ID: %s", id)

		w.Header().Set("Content-Type", "application/json")

		storage, exists := tableStorage[id]
		if !exists {
			log.Printf("[GET_TABLE] Table not found: %s", id)
			response := map[string]interface{}{
				"error":   "Table not found",
				"id":      id,
				"message": "Table with this ID does not exist",
			}

			responseJSON, _ := json.Marshal(response)
			w.WriteHeader(http.StatusNotFound)
			w.Write(responseJSON)
			return
		}

		// Always use cached data for fast response
		log.Printf("[GET_TABLE] Using cached data for table: %s", id)

		table := storage.GetTable()
		response := map[string]interface{}{
			"id":          table.ID,
			"name":        table.Name,
			"description": table.Description,
			"data":        table.Data,
			"createdAt":   table.CreatedAt,
			"updatedAt":   table.UpdatedAt,
			"ipns_name":   storage.GetIPNSName(),
			"status":      "active",
		}

		responseJSON, _ := json.Marshal(response)
		w.WriteHeader(http.StatusOK)
		w.Write(responseJSON)
	}
}

func updateTableHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]
		log.Printf("[UPDATE_TABLE] Handler called for ID: %s", id)

		// Read the request body
		body, err := io.ReadAll(r.Body)
		if err != nil {
			log.Printf("[UPDATE_TABLE] Error reading body: %v", err)
			http.Error(w, "Error reading request body", http.StatusBadRequest)
			return
		}
		defer r.Body.Close()

		var req map[string]interface{}
		if err := json.Unmarshal(body, &req); err != nil {
			log.Printf("[UPDATE_TABLE] Error parsing JSON: %v", err)
			http.Error(w, "Invalid JSON format", http.StatusBadRequest)
			return
		}

		storage := tableStorage[id]
		if storage == nil {
			log.Printf("[UPDATE_TABLE] Table not found: %s", id)
			http.Error(w, "Table not found", http.StatusNotFound)
			return
		}

		// Extract update fields
		name := getStringField(req, "name", "")
		description := getStringField(req, "description", "")
		data := getStringField(req, "data", "")

		log.Printf("[UPDATE_TABLE] Updating table %s with data length: %d", id, len(data))

		// Update the table - this will save to IPFS
		if err := storage.UpdateTableData(name, description, data); err != nil {
			log.Printf("[UPDATE_TABLE] Error updating table: %v", err)
			http.Error(w, "Failed to update table: "+err.Error(), http.StatusInternalServerError)
			return
		}

		log.Printf("[UPDATE_TABLE] Table %s updated successfully", id)

		// Save registry to disk
		if err := saveRegistry(); err != nil {
			log.Printf("[UPDATE_TABLE] Warning: Failed to save registry: %v", err)
		}

		// Get fresh table data after update
		table := storage.GetTable()
		response := map[string]interface{}{
			"success":     true,
			"message":     "Table updated successfully",
			"id":          table.ID,
			"name":        table.Name,
			"description": table.Description,
			"data":        table.Data,
			"updatedAt":   table.UpdatedAt,
		}

		w.Header().Set("Content-Type", "application/json")
		responseJSON, _ := json.Marshal(response)
		log.Printf("[UPDATE_TABLE] Sending response: %s", string(responseJSON))

		w.WriteHeader(http.StatusOK)
		w.Write(responseJSON)
	}
}

func deleteTableHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id := vars["id"]
		log.Printf("[DELETE_TABLE] Handler called for ID: %s", id)

		_, exists := tableStorage[id]
		if !exists {
			log.Printf("[DELETE_TABLE] Table not found: %s", id)
			http.Error(w, "Table not found", http.StatusNotFound)
			return
		}

		// Remove from storage
		delete(tableStorage, id)
		log.Printf("[DELETE_TABLE] Table deleted from memory: %s", id)

		// Save registry to disk
		if err := saveRegistry(); err != nil {
			log.Printf("[DELETE_TABLE] Warning: Failed to save registry: %v", err)
		}

		w.Header().Set("Content-Type", "application/json")

		response := map[string]interface{}{
			"success": true,
			"message": "Table deleted successfully",
			"id":      id,
		}

		responseJSON, _ := json.Marshal(response)
		w.WriteHeader(http.StatusOK)
		w.Write(responseJSON)
	}
}

// Fixed AppendToTable function - Fast version
func AppendToTable(ipfsClient *ipfs.IPFSClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		tableID := vars["id"]

		log.Printf("[APPEND] === Starting FAST append operation for table: %s ===", tableID)

		// Get existing table storage
		stor, exists := tableStorage[tableID]
		if !exists {
			log.Printf("[APPEND] Table not found: %s", tableID)
			http.Error(w, "Table not found", http.StatusNotFound)
			return
		}

		// Parse new item from request body
		var newItem interface{}
		if err := json.NewDecoder(r.Body).Decode(&newItem); err != nil {
			log.Printf("[APPEND] Error parsing JSON: %v", err)
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		log.Printf("[APPEND] Parsed new item: %+v", newItem)

		// Get current table data
		table := stor.GetTable()
		log.Printf("[APPEND] Current data count before append")

		// Parse existing data
		var existingData []interface{}
		if err := json.Unmarshal([]byte(table.Data), &existingData); err != nil {
			log.Printf("[APPEND] Error parsing existing data: %v", err)
			existingData = []interface{}{} // Initialize empty if parsing fails
		}

		// Append new item
		existingData = append(existingData, newItem)
		log.Printf("[APPEND] New data count after append: %d", len(existingData))

		// Convert back to JSON string
		updatedDataBytes, err := json.MarshalIndent(existingData, "", "  ")
		if err != nil {
			log.Printf("[APPEND] Error marshaling data: %v", err)
			http.Error(w, "Failed to serialize data", http.StatusInternalServerError)
			return
		}

		// FAST UPDATE: Only update in-memory data and create new IPFS hash
		// Don't wait for IPNS propagation
		log.Printf("[APPEND] Performing fast in-memory update...")
		if err := stor.FastUpdateData(string(updatedDataBytes)); err != nil {
			log.Printf("[APPEND] ERROR: Failed to update table: %v", err)
			http.Error(w, "Failed to save table", http.StatusInternalServerError)
			return
		}

		log.Printf("[APPEND] Successfully appended item to table %s", tableID)

		// Save registry to disk (fast operation)
		if err := saveRegistry(); err != nil {
			log.Printf("[APPEND] Warning: Failed to save registry: %v", err)
		}

		// Get updated table data for response
		updatedTable := stor.GetTable()
		response := map[string]interface{}{
			"success":     true,
			"message":     "Item appended successfully",
			"id":          updatedTable.ID,
			"name":        updatedTable.Name,
			"description": updatedTable.Description,
			"data":        updatedTable.Data,
			"updatedAt":   updatedTable.UpdatedAt,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)

		log.Printf("[APPEND] === Fast append operation completed ===")

		// OPTIONAL: Trigger background IPFS/IPNS update (don't wait for it)
		go func() {
			log.Printf("[APPEND] Background: Starting IPFS/IPNS update for table %s", tableID)
			if err := stor.BackgroundSaveToIPFS(); err != nil {
				log.Printf("[APPEND] Background: Failed to save to IPFS: %v", err)
			} else {
				log.Printf("[APPEND] Background: Successfully saved to IPFS")
			}
		}()
	}
}

// Helper function to safely extract string fields from request
func getStringField(req map[string]interface{}, field string, defaultValue string) string {
	if value, ok := req[field].(string); ok {
		return value
	}
	return defaultValue
}
