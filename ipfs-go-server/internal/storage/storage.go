package storage

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"

	ipfs "github.com/ipfs/go-ipfs-api"
)

type Table struct {
	Name  string   `json:"name"`
	Items []string `json:"items"`
}

type Storage struct {
	ipfsClient *ipfs.Shell
	ipnsName   string
	keyName    string
	table      Table
	mu         sync.Mutex
}

func NewStorage(ipfsClient *ipfs.Shell, tableName string) *Storage {
	return &Storage{
		ipfsClient: ipfsClient,
		ipnsName:   "",
		keyName:    tableName,
		table:      Table{Name: tableName, Items: []string{}},
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

func (s *Storage) AppendString(item string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.table.Items = append(s.table.Items, item)
	_, err := s.saveTable()
	return err
}

func (s *Storage) RemoveByIndex(index int) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if index < 0 || index >= len(s.table.Items) {
		return "", errors.New("index out of range")
	}

	removed := s.table.Items[index]
	s.table.Items = append(s.table.Items[:index], s.table.Items[index+1:]...)

	_, err := s.saveTable()
	if err != nil {
		return "", err
	}

	return removed, nil
}

func (s *Storage) RemoveByValue(item string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, v := range s.table.Items {
		if v == item {
			s.table.Items = append(s.table.Items[:i], s.table.Items[i+1:]...)
			_, err := s.saveTable()
			if err != nil {
				return "", err
			}
			return item, nil
		}
	}

	return "", errors.New("item not found")
}

func (s *Storage) GetLatestString() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.table.Items) == 0 {
		return "", errors.New("no items in the table")
	}
	return s.table.Items[len(s.table.Items)-1], nil
}

func (s *Storage) GetAllStrings() ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.table.Items, nil
}

func (s *Storage) GetIPNSName() string {
	return s.ipnsName
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

	resolved, err := s.ipfsClient.Resolve(s.ipnsName)
	if err != nil {
		return err
	}

	data, err := s.ipfsClient.Cat(resolved)
	if err != nil {
		return err
	}
	defer data.Close()

	var buf bytes.Buffer
	_, err = io.Copy(&buf, data)
	if err != nil {
		return err
	}

	return json.Unmarshal(buf.Bytes(), &s.table)
}
