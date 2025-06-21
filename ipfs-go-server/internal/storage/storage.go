package storage

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"strings"
	"sync"
	"time"

	"ipfs-go-server/internal/models"

	ipfs "github.com/ipfs/go-ipfs-api"
)

type Storage struct {
	ipfsClient *ipfs.Shell
	ipnsName   string
	keyName    string
	table      *models.Table
	mu         sync.Mutex
}

func NewStorage(ipfsClient *ipfs.Shell, tableID, tableName, description string) *Storage {
	return &Storage{
		ipfsClient: ipfsClient,
		ipnsName:   "",
		keyName:    tableID,
		table:      models.NewTable(tableID, tableName, description),
	}
}

func NewStorageWithIPNS(ipfsClient *ipfs.Shell, tableID, tableName, description, keyName, ipnsName string) *Storage {
	return &Storage{
		ipfsClient: ipfsClient,
		ipnsName:   ipnsName,
		keyName:    keyName,
		table:      models.NewTable(tableID, tableName, description),
	}
}

func (s *Storage) SaveInitialTable() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Generate a key for this table if it doesn't exist
	if err := s.ensureKey(); err != nil {
		return "", fmt.Errorf("failed to ensure IPNS key: %w", err)
	}

	return s.saveTable()
}

func (s *Storage) AddTorrentVersion(hash, magnetLink, fileName, description string, fileSize int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	version := models.TorrentVersion{
		Hash:        hash,
		MagnetLink:  magnetLink,
		FileName:    fileName,
		FileSize:    fileSize,
		Description: description,
	}

	s.table.AddVersion(version)
	_, err := s.saveTable()
	return err
}

func (s *Storage) UpdateTableData(name, description, data string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if name != "" {
		s.table.Name = name
	}
	if description != "" {
		s.table.Description = description
	}
	if data != "" {
		s.table.Data = data
		// Try to parse the data back into versions
		if err := s.table.LoadVersionsFromData(); err != nil {
			return fmt.Errorf("failed to parse data into versions: %w", err)
		}

		// Update description to reflect actual version count
		versions := s.table.GetAllVersions()
		versionCount := len(versions)
		if versionCount > 1 {
			// Extract base name from existing description
			baseName := s.table.Name
			if strings.Contains(s.table.Description, "Torrent versions for") {
				// Extract the quoted name from description like: Torrent versions for "bibi" - Version 1
				start := strings.Index(s.table.Description, `"`) + 1
				end := strings.Index(s.table.Description[start:], `"`)
				if end > 0 {
					baseName = s.table.Description[start : start+end]
				}
			}
			s.table.Description = fmt.Sprintf("Torrent versions for \"%s\" - %d version(s)", baseName, versionCount)
		}
	}

	s.table.UpdatedAt = time.Now()
	_, err := s.saveTable()
	return err
}

// FastUpdateData updates only the in-memory data without waiting for IPFS
func (s *Storage) FastUpdateData(data string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Update the in-memory table data
	s.table.Data = data
	s.table.UpdatedAt = time.Now()

	// Update description to reflect new count
	var items []interface{}
	if err := json.Unmarshal([]byte(data), &items); err == nil {
		s.table.Description = fmt.Sprintf("Torrent versions for \"%s\" - %d version(s)",
			s.table.Name, len(items))
	}

	log.Printf("[STORAGE] Fast update completed for table %s", s.table.ID)
	return nil
}

// BackgroundSaveToIPFS saves to IPFS/IPNS in the background
func (s *Storage) BackgroundSaveToIPFS() error {
	s.mu.Lock()
	data := s.table.Data
	s.mu.Unlock()

	// Add to IPFS
	hash, err := s.ipfsClient.Add(strings.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to add to IPFS: %w", err)
	}

	// Update IPNS to point to new hash (this is the only slow operation)
	if err := s.ipfsClient.Publish(s.keyName, hash); err != nil {
		return fmt.Errorf("failed to update IPNS: %w", err)
	}

	log.Printf("[STORAGE] Background save completed - IPNS %s now points to %s", s.ipnsName, hash)
	return nil
}

func (s *Storage) GetLatestVersion() *models.TorrentVersion {
	return s.table.GetLatestVersion()
}

func (s *Storage) GetAllVersions() []models.TorrentVersion {
	return s.table.GetAllVersions()
}

func (s *Storage) GetTable() *models.Table {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Return the pointer directly; callers must not modify the returned table.
	return s.table
}

func (s *Storage) GetIPNSName() string {
	return s.ipnsName
}

func (s *Storage) GetKeyName() string {
	return s.keyName
}

func (s *Storage) ensureKey() error {
	ctx := context.Background()

	// Check if key already exists
	keys, err := s.ipfsClient.KeyList(ctx)
	if err != nil {
		return fmt.Errorf("failed to list keys: %w", err)
	}

	for _, key := range keys {
		if key.Name == s.keyName {
			s.ipnsName = key.Id
			return nil
		}
	}

	// Generate new key
	key, err := s.ipfsClient.KeyGen(ctx, s.keyName)
	if err != nil {
		return fmt.Errorf("failed to generate key: %w", err)
	}

	s.ipnsName = key.Id
	return nil
}

func (s *Storage) saveTable() (string, error) {
	data, err := json.Marshal(s.table)
	if err != nil {
		return "", err
	}

	hash, err := s.ipfsClient.Add(strings.NewReader(string(data)))
	if err != nil {
		return "", err
	}

	// Publish to IPNS using the key name
	if s.keyName != "" {
		if err := s.publishIPNS(hash); err != nil {
			// If IPNS publish fails, still return the hash
			fmt.Printf("Warning: IPNS publish failed: %v\n", err)
		}
	}

	return hash, nil
}

func (s *Storage) publishIPNS(hash string) error {
	// Use key name for publishing
	_, err := s.ipfsClient.PublishWithDetails(hash, s.keyName, 0, 0, false)
	return err
}

func (s *Storage) LoadTable() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.ipnsName == "" {
		return errors.New("no IPNS name available")
	}

	// Add timeout context for IPNS resolution
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resolved, err := s.ipfsClient.Request("name/resolve", s.ipnsName).Option("timeout", "10s").Send(ctx)
	if err != nil {
		return fmt.Errorf("failed to resolve IPNS %s: %w", s.ipnsName, err)
	}
	defer resolved.Close()

	// Add nil check for resolved.Output
	if resolved.Output == nil {
		return fmt.Errorf("IPNS resolution returned nil output for %s", s.ipnsName)
	}

	var resolveResp struct {
		Path string `json:"Path"`
	}
	if err := json.NewDecoder(resolved.Output).Decode(&resolveResp); err != nil {
		return fmt.Errorf("failed to decode resolve response: %w", err)
	}

	// Extract hash from path like /ipfs/QmHash
	hash := strings.TrimPrefix(resolveResp.Path, "/ipfs/")

	data, err := s.ipfsClient.Cat(hash)
	if err != nil {
		return fmt.Errorf("failed to cat %s: %w", hash, err)
	}
	defer data.Close()

	var buf bytes.Buffer
	_, err = io.Copy(&buf, data)
	if err != nil {
		return fmt.Errorf("failed to read data: %w", err)
	}

	var loadedTable models.Table
	if err := json.Unmarshal(buf.Bytes(), &loadedTable); err != nil {
		return fmt.Errorf("failed to unmarshal table: %w", err)
	}

	// Load versions from data field
	if err := loadedTable.LoadVersionsFromData(); err != nil {
		return fmt.Errorf("failed to load versions from data: %w", err)
	}

	s.table = &loadedTable
	return nil
}
