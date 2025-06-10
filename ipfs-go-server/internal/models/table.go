package models

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

type TorrentVersion struct {
	Version     int       `json:"version"`
	Hash        string    `json:"hash"`
	MagnetLink  string    `json:"magnetLink"`
	FileName    string    `json:"fileName"`
	FileSize    int64     `json:"fileSize"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Table struct {
	ID          string           `json:"id"`
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Data        string           `json:"data"` // JSON string of TorrentVersion array
	CreatedAt   time.Time        `json:"createdAt"`
	UpdatedAt   time.Time        `json:"updatedAt"`
	Versions    []TorrentVersion `json:"-"` // Internal field, not serialized
	mu          sync.Mutex       `json:"-"`
}

func NewTable(id, name, description string) *Table {
	now := time.Now()
	return &Table{
		ID:          id,
		Name:        name,
		Description: description,
		Data:        "[]", // Empty JSON array
		CreatedAt:   now,
		UpdatedAt:   now,
		Versions:    []TorrentVersion{},
	}
}

func (t *Table) AddVersion(version TorrentVersion) {
	t.mu.Lock()
	defer t.mu.Unlock()

	version.Version = len(t.Versions) + 1
	version.CreatedAt = time.Now()
	t.Versions = append(t.Versions, version)
	t.UpdatedAt = time.Now()

	// Update JSON data
	t.updateDataField()
}

func (t *Table) GetLatestVersion() *TorrentVersion {
	t.mu.Lock()
	defer t.mu.Unlock()

	if len(t.Versions) == 0 {
		return nil
	}
	return &t.Versions[len(t.Versions)-1]
}

func (t *Table) GetAllVersions() []TorrentVersion {
	t.mu.Lock()
	defer t.mu.Unlock()

	return t.Versions
}

func (t *Table) LoadVersionsFromData() error {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.Data == "" || t.Data == "[]" {
		t.Versions = []TorrentVersion{}
		return nil
	}

	var versions []TorrentVersion
	if err := json.Unmarshal([]byte(t.Data), &versions); err != nil {
		return fmt.Errorf("failed to unmarshal versions data: %w", err)
	}

	t.Versions = versions
	return nil
}

func (t *Table) updateDataField() {
	// This method should be called while holding the mutex
	data, err := json.MarshalIndent(t.Versions, "", "  ")
	if err != nil {
		// Fallback to compact JSON if indentation fails
		data, _ = json.Marshal(t.Versions)
	}
	t.Data = string(data)
}
