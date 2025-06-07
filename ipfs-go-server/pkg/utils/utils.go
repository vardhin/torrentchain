package utils

import (
	"crypto/rand"
	"encoding/hex"
)

// GenerateUniqueID generates a unique identifier for use in the application.
func GenerateUniqueID() (string, error) {
	bytes := make([]byte, 16)
	_, err := rand.Read(bytes)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}