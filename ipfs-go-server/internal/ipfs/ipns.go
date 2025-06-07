package ipfs

import (
	"fmt"
	"strings"

	ipfs "github.com/ipfs/go-ipfs-api"
)

type IPNSManager struct {
	ipfsClient *ipfs.Shell
	ipnsName   string
}

func NewIPNSManager(ipfsClient *ipfs.Shell, ipnsName string) *IPNSManager {
	return &IPNSManager{
		ipfsClient: ipfsClient,
		ipnsName:   ipnsName,
	}
}

func (m *IPNSManager) Publish(data string) error {
	hash, err := m.ipfsClient.Add(strings.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to add data to IPFS: %w", err)
	}

	err = m.ipfsClient.Publish(m.ipnsName, hash)
	if err != nil {
		return fmt.Errorf("failed to publish IPNS record: %w", err)
	}

	return nil
}

func (m *IPNSManager) Resolve() (string, error) {
	// Removed unused context

	hash, err := m.ipfsClient.Resolve(m.ipnsName)
	if err != nil {
		return "", fmt.Errorf("failed to resolve IPNS name: %w", err)
	}

	return hash, nil
}
