package ipfs

import (
	"bytes"
	"io"
	"strings"

	ipfs "github.com/ipfs/go-ipfs-api"
)

type IPFSClient struct {
	sh *ipfs.Shell
}

func NewIPFSClient(apiAddress string) *IPFSClient {
	sh := ipfs.NewShell(apiAddress)
	return &IPFSClient{sh: sh}
}

func (client *IPFSClient) AddData(data string) (string, error) {
	hash, err := client.sh.Add(strings.NewReader(data))
	if err != nil {
		return "", err
	}
	return hash, nil
}

func (client *IPFSClient) ResolveIPNS(name string) (string, error) {
	resolved, err := client.sh.Resolve(name)
	if err != nil {
		return "", err
	}
	return resolved, nil
}

func (client *IPFSClient) GetData(hash string) (string, error) {
	reader, err := client.sh.Cat(hash)
	if err != nil {
		return "", err
	}
	defer reader.Close()

	body, err := io.ReadAll(reader)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func (client *IPFSClient) GetShell() *ipfs.Shell {
	return client.sh
}

func (client *IPFSClient) Publish(data []byte) (string, error) {
	hash, err := client.sh.Add(bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	return hash, nil
}
