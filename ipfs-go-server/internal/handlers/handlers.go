package handlers

import (
	"encoding/json"
	"net/http"

	"ipfs-go-server/internal/ipfs"
	"ipfs-go-server/internal/storage"

	"github.com/gorilla/mux"
)

var tableStorage = make(map[string]*storage.Storage)

func RegisterTableRoutes(router *mux.Router, ipfsClient *ipfs.IPFSClient) {
	// Table CRUD operations
	router.HandleFunc("/table/create", createTableHandler(ipfsClient)).Methods("POST")
	router.HandleFunc("/table/{ipnsName}/view", viewTableHandler()).Methods("GET")
	router.HandleFunc("/table/{ipnsName}/latest", getLatestByIPNSHandler()).Methods("GET")
	router.HandleFunc("/table/{ipnsName}/append", appendByIPNSHandler()).Methods("POST")
	router.HandleFunc("/table/{ipnsName}/remove", removeFromTableHandler()).Methods("DELETE")

	// Legacy endpoints (keeping for backward compatibility)
	tableStorageInstance := storage.NewStorage(ipfsClient.GetShell(), "my-table")
	router.HandleFunc("/table/append", appendHandler(tableStorageInstance)).Methods("POST")
	router.HandleFunc("/table/latest", getLatestHandler(tableStorageInstance)).Methods("GET")
	router.HandleFunc("/table/all", getAllHandler(tableStorageInstance)).Methods("GET")
}

func createTableHandler(ipfsClient *ipfs.IPFSClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			TableName string `json:"table_name"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
			return
		}

		if req.TableName == "" {
			http.Error(w, "table_name is required", http.StatusBadRequest)
			return
		}

		// Check if table already exists
		if _, exists := tableStorage[req.TableName]; exists {
			http.Error(w, "Table with this name already exists", http.StatusConflict)
			return
		}

		// Create new storage instance
		storage := storage.NewStorage(ipfsClient.GetShell(), req.TableName)

		// Save initial empty table to get hash
		hash, err := storage.SaveInitialTable()
		if err != nil {
			http.Error(w, "Failed to create table: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// Store in memory
		tableStorage[req.TableName] = storage

		response := map[string]interface{}{
			"table_name": req.TableName,
			"ipns_name":  storage.GetIPNSName(),
			"key_name":   req.TableName,
			"hash":       hash,
			"contents":   []string{},
			"status":     "created",
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

func viewTableHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		ipnsName := vars["ipnsName"]

		storage, exists := tableStorage[ipnsName]
		if !exists {
			http.Error(w, "Table not found", http.StatusNotFound)
			return
		}

		// Load latest data from IPFS
		if err := storage.LoadTable(); err != nil {
			// If load fails, use current in-memory data
		}

		items, err := storage.GetAllStrings()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		response := map[string]interface{}{
			"table_name": ipnsName,
			"ipns_name":  ipnsName,
			"contents":   items,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

func getLatestByIPNSHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		ipnsName := vars["ipnsName"]

		storage, exists := tableStorage[ipnsName]
		if !exists {
			http.Error(w, "Table not found", http.StatusNotFound)
			return
		}

		// Load latest data from IPFS
		if err := storage.LoadTable(); err != nil {
			// If load fails, use current in-memory data
		}

		item, err := storage.GetLatestString()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		response := map[string]string{
			"ipns_name": ipnsName,
			"latest":    item,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

func appendByIPNSHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		ipnsName := vars["ipnsName"]

		storage, exists := tableStorage[ipnsName]
		if !exists {
			http.Error(w, "Table not found", http.StatusNotFound)
			return
		}

		var req struct {
			Item string `json:"item"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
			return
		}

		if req.Item == "" {
			http.Error(w, "item is required", http.StatusBadRequest)
			return
		}

		if err := storage.AppendString(req.Item); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		response := map[string]string{
			"ipns_name": ipnsName,
			"status":    "appended",
			"item":      req.Item,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

func removeFromTableHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		ipnsName := vars["ipnsName"]

		storage, exists := tableStorage[ipnsName]
		if !exists {
			http.Error(w, "Table not found", http.StatusNotFound)
			return
		}

		var req struct {
			Index *int    `json:"index,omitempty"`
			Item  *string `json:"item,omitempty"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
			return
		}

		var removed string
		var err error

		if req.Index != nil {
			removed, err = storage.RemoveByIndex(*req.Index)
		} else if req.Item != nil {
			removed, err = storage.RemoveByValue(*req.Item)
		} else {
			http.Error(w, "Either 'index' or 'item' must be provided", http.StatusBadRequest)
			return
		}

		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		response := map[string]string{
			"ipns_name":    ipnsName,
			"status":       "removed",
			"removed_item": removed,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

// Legacy handlers (keeping for backward compatibility)
func appendHandler(storage *storage.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Item string `json:"item"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if err := storage.AppendString(req.Item); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

func getLatestHandler(storage *storage.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		item, err := storage.GetLatestString()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(map[string]string{"latest": item})
	}
}

func getAllHandler(storage *storage.Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		items, err := storage.GetAllStrings()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(map[string][]string{"items": items})
	}
}
